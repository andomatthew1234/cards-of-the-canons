import { describe, expect, it } from 'vitest'
import {
  checkSandboxQuota,
  checkTestCheckoutPolicy,
  canCreateLiveCheckout,
  collectCleanupBatch,
  decideCreationLease,
  isActionableReservation,
  isAllowedAdminStatusTransition,
  paymentEnvironmentMatches,
  reconcileOrderState,
  resolveCreationOutcome,
  resolveDisputeTransition,
  resolveRefundTransition,
  resolveStockReturn,
  shouldRecordPurchaseActivity,
  validateSessionBinding,
  type OrderStateSnapshot,
  type TestCheckoutPolicy,
} from './commerceInvariants'

describe('checkout launch boundary', () => {
  it('requires the client and server payment environments to agree', () => {
    expect(paymentEnvironmentMatches('test', 'test')).toBe(true)
    expect(paymentEnvironmentMatches('live', 'live')).toBe(true)
    expect(paymentEnvironmentMatches('test', 'live')).toBe(false)
    expect(paymentEnvironmentMatches('live', 'test')).toBe(false)
  })

  it('fails closed unless every live-payment prerequisite is current', () => {
    const ready = { liveKey: true, webhookSecretConfigured: true, webhookEvidenceCurrent: true, livePaymentsEnabled: true }
    expect(canCreateLiveCheckout(ready)).toBe(true)
    for (const key of Object.keys(ready) as Array<keyof typeof ready>) {
      expect(canCreateLiveCheckout({ ...ready, [key]: false }), key).toBe(false)
    }
  })
})

const baseState = (overrides: Partial<OrderStateSnapshot> = {}): OrderStateSnapshot => ({
  status: 'pending',
  paymentState: 'unpaid',
  fulfilmentStatus: 'unfulfilled',
  refundStatus: 'none',
  inventoryState: 'reserved',
  ...overrides,
})

describe('monotonic order state (S4)', () => {
  it('never downgrades a paid order when an out-of-order unpaid event arrives', () => {
    const next = reconcileOrderState(baseState({ status: 'paid', paymentState: 'paid', inventoryState: 'committed' }), {
      status: 'payment_failed',
      paymentState: 'failed',
      inventoryState: 'reserved',
      fulfilmentStatus: 'cancelled',
    })
    expect(next).toEqual({
      status: 'paid',
      paymentState: 'paid',
      fulfilmentStatus: 'unfulfilled',
      refundStatus: 'none',
      inventoryState: 'committed',
    })
  })

  it('preserves a fulfilled order against reordered payment events', () => {
    const current = baseState({ status: 'fulfilled', paymentState: 'paid', fulfilmentStatus: 'fulfilled', inventoryState: 'committed' })
    expect(reconcileOrderState(current, { status: 'paid', paymentState: 'paid' }).status).toBe('fulfilled')
    expect(reconcileOrderState(current, { status: 'cancelled', fulfilmentStatus: 'cancelled' })).toEqual(current)
    expect(reconcileOrderState(current, { status: 'payment_failed', paymentState: 'failed' }).status).toBe('fulfilled')
  })

  it('preserves a cancelled order while still accepting late-payment review', () => {
    const cancelled = baseState({ status: 'cancelled', fulfilmentStatus: 'cancelled', inventoryState: 'released' })
    expect(reconcileOrderState(cancelled, { status: 'cancelled' }).status).toBe('cancelled')
    expect(reconcileOrderState(cancelled, { status: 'payment_review', paymentState: 'paid' }).status).toBe('payment_review')
    expect(reconcileOrderState(cancelled, { status: 'paid', paymentState: 'paid' }).status).toBe('cancelled')
  })

  it('returns committed stock only once and never re-opens released inventory', () => {
    const committed = baseState({ inventoryState: 'committed', paymentState: 'paid', status: 'paid' })
    expect(reconcileOrderState(committed, { inventoryState: 'released' }).inventoryState).toBe('released')
    const released = baseState({ inventoryState: 'released', paymentState: 'refunded', status: 'payment_review' })
    expect(reconcileOrderState(released, { inventoryState: 'committed' }).inventoryState).toBe('released')
  })

  it('converges when the same payment event is applied twice', () => {
    const once = reconcileOrderState(baseState(), { status: 'paid', paymentState: 'paid', inventoryState: 'committed' })
    const twice = reconcileOrderState(once, { status: 'paid', paymentState: 'paid', inventoryState: 'committed' })
    expect(twice).toEqual(once)
  })

  it('lets dispute resolution move forward and refund stay terminal', () => {
    const disputed = baseState({ paymentState: 'disputed', status: 'payment_review', inventoryState: 'committed' })
    expect(reconcileOrderState(disputed, { paymentState: 'paid' }).paymentState).toBe('paid')
    expect(reconcileOrderState(disputed, { paymentState: 'refunded', refundStatus: 'full' }).paymentState).toBe('refunded')
    const refunded = baseState({ paymentState: 'refunded', refundStatus: 'full', status: 'payment_review', inventoryState: 'released' })
    expect(reconcileOrderState(refunded, { paymentState: 'paid' }).paymentState).toBe('refunded')
    expect(reconcileOrderState(refunded, { paymentState: 'disputed' }).paymentState).toBe('refunded')
  })
})

describe('operator transitions (S4)', () => {
  it('only allows the reversals administrators already rely on', () => {
    expect(isAllowedAdminStatusTransition('paid', 'fulfilled')).toBe(true)
    expect(isAllowedAdminStatusTransition('paid', 'cancelled')).toBe(true)
    expect(isAllowedAdminStatusTransition('fulfilled', 'paid')).toBe(true)
    expect(isAllowedAdminStatusTransition('fulfilled', 'cancelled')).toBe(false)
    expect(isAllowedAdminStatusTransition('pending', 'paid')).toBe(false)
    expect(isAllowedAdminStatusTransition('cancelled', 'paid')).toBe(false)
  })
})

const validSession = {
  sessionId: 'cs_test_123',
  clientReferenceId: 'co_abc',
  metadataOrderId: 'co_abc',
  metadataUid: 'uid-1',
  metadataPaymentEnvironment: 'test',
  stripeKeyIsLive: false,
  amountTotalCents: 2500,
  currency: 'aud',
  mode: 'payment',
}

const validOrder = {
  orderId: 'co_abc',
  userId: 'uid-1',
  totalCents: 2500,
  currency: 'AUD',
  paymentEnvironment: 'test' as const,
  stripeCheckoutSessionId: null,
}

describe('immutable payment/order binding (S4)', () => {
  it('accepts a correctly bound session, including one that arrived before we persisted the id', () => {
    expect(validateSessionBinding(validSession, validOrder).ok).toBe(true)
    expect(validateSessionBinding(validSession, { ...validOrder, stripeCheckoutSessionId: 'cs_test_123' }).ok).toBe(true)
  })

  it('rejects every mismatch class so the caller can quarantine', () => {
    expect(validateSessionBinding({ ...validSession, metadataUid: 'uid-2' }, validOrder)).toEqual({ ok: false, reason: 'metadata_uid' })
    expect(validateSessionBinding({ ...validSession, metadataOrderId: 'co_other' }, validOrder)).toEqual({ ok: false, reason: 'metadata_order' })
    expect(validateSessionBinding({ ...validSession, clientReferenceId: 'co_other' }, validOrder)).toEqual({ ok: false, reason: 'client_reference' })
    expect(validateSessionBinding({ ...validSession, amountTotalCents: 1 }, validOrder)).toEqual({ ok: false, reason: 'amount_mismatch' })
    expect(validateSessionBinding({ ...validSession, currency: 'usd' }, validOrder)).toEqual({ ok: false, reason: 'currency_mismatch' })
    expect(validateSessionBinding({ ...validSession, stripeKeyIsLive: true }, validOrder)).toEqual({ ok: false, reason: 'account_context_mismatch' })
    expect(validateSessionBinding({ ...validSession, metadataPaymentEnvironment: 'live' }, validOrder)).toEqual({ ok: false, reason: 'environment_mismatch' })
    expect(validateSessionBinding(validSession, { ...validOrder, stripeCheckoutSessionId: 'cs_other' })).toEqual({ ok: false, reason: 'session_id_conflict' })
    expect(validateSessionBinding({ ...validSession, mode: 'subscription' }, validOrder)).toEqual({ ok: false, reason: 'session_mode' })
  })

  it('keeps live sessions out of sandbox orders and vice versa', () => {
    const liveOrder = { ...validOrder, paymentEnvironment: 'live' as const }
    expect(validateSessionBinding(validSession, liveOrder)).toEqual({ ok: false, reason: 'environment_mismatch' })
    expect(validateSessionBinding({ ...validSession, stripeKeyIsLive: true, metadataPaymentEnvironment: 'live' }, liveOrder).ok).toBe(true)
  })
})

describe('creation lease (S2)', () => {
  const now = 1_700_000_000_000

  it('hands the lease to exactly one invocation', () => {
    const fresh = { stripeCheckoutStatus: 'creating', creationLeaseUntilMs: now + 30_000, inventoryState: 'reserved' as const, status: 'pending' as const, paymentState: 'unpaid' as const, stripeCheckoutSessionId: null }
    expect(decideCreationLease(fresh, now, 60_000)).toEqual({ action: 'wait_for_creation', retryAfterMs: 30_000 })
    expect(decideCreationLease({ ...fresh, creationLeaseUntilMs: now - 1 }, now, 60_000)).toEqual({ action: 'claim_lease' })
  })

  it('reuses an existing session instead of creating a second one', () => {
    expect(decideCreationLease({ stripeCheckoutSessionId: 'cs_1', inventoryState: 'reserved', status: 'pending' }, now, 60_000))
      .toEqual({ action: 'reuse_existing_session', sessionId: 'cs_1' })
  })

  it('refuses to create for closed, paid or non-held reservations', () => {
    expect(decideCreationLease({ status: 'cancelled', inventoryState: 'reserved' }, now, 60_000)).toEqual({ action: 'reject', reason: 'order_closed' })
    expect(decideCreationLease({ status: 'pending', inventoryState: 'released' }, now, 60_000)).toEqual({ action: 'reject', reason: 'reservation_not_held' })
    expect(decideCreationLease({ status: 'pending', inventoryState: 'committed' }, now, 60_000)).toEqual({ action: 'reject', reason: 'reservation_not_held' })
    expect(decideCreationLease({ status: 'pending', inventoryState: 'reserved', paymentState: 'paid' }, now, 60_000)).toEqual({ action: 'reject', reason: 'already_paid' })
  })
})

describe('uncertain Stripe creation outcome (S2/S9)', () => {
  it('never releases payable stock when a session might still exist', () => {
    expect(resolveCreationOutcome({ sessions: [], orderStillOpen: true })).toEqual({ action: 'release' })
    expect(resolveCreationOutcome({ sessions: [{ id: 'cs_1', status: 'open', payment_status: 'unpaid' }], orderStillOpen: true }))
      .toEqual({ action: 'adopt', sessionId: 'cs_1' })
    expect(resolveCreationOutcome({ sessions: [{ id: 'cs_1', status: 'complete', payment_status: 'paid' }], orderStillOpen: true }))
      .toEqual({ action: 'adopt', sessionId: 'cs_1' })
    expect(resolveCreationOutcome({ sessions: [{ id: 'cs_1', status: 'expired', payment_status: 'unpaid' }], orderStillOpen: true }))
      .toEqual({ action: 'release' })
    expect(resolveCreationOutcome({ sessions: [{ id: 'cs_1', status: null, payment_status: null }], orderStillOpen: true }))
      .toEqual({ action: 'defer' })
  })

  it('defers instead of touching an order that already left the reservation', () => {
    expect(resolveCreationOutcome({ sessions: [], orderStillOpen: false })).toEqual({ action: 'defer' })
  })
})

describe('sandbox checkout gating and quotas (S5)', () => {
  const policy = (overrides: Partial<TestCheckoutPolicy> = {}): TestCheckoutPolicy => ({
    enabled: true,
    testerUids: ['tester-1'],
    perUserQuota: 2,
    globalQuota: 5,
    ...overrides,
  })

  it('fails closed when no testers are configured', () => {
    expect(checkTestCheckoutPolicy(policy({ testerUids: [] }), 'tester-1')).toEqual({ allowed: false, reason: 'no_testers_configured' })
    expect(checkTestCheckoutPolicy(policy({ enabled: false }), 'tester-1')).toEqual({ allowed: false, reason: 'sandbox_disabled' })
    expect(checkTestCheckoutPolicy(policy(), 'stranger')).toEqual({ allowed: false, reason: 'not_a_tester' })
    expect(checkTestCheckoutPolicy(policy(), 'tester-1')).toEqual({ allowed: true })
  })

  it('bounds active sandbox reservations per user and globally', () => {
    expect(checkSandboxQuota(policy(), { userActive: 1, globalActive: 4 })).toEqual({ allowed: true })
    expect(checkSandboxQuota(policy(), { userActive: 2, globalActive: 0 })).toEqual({ allowed: false, reason: 'per_user_quota' })
    expect(checkSandboxQuota(policy(), { userActive: 0, globalActive: 5 })).toEqual({ allowed: false, reason: 'global_quota' })
  })
})

describe('stock return identity bookkeeping (S5/ledger)', () => {
  const item = { quantity: 2, inventoryTracked: true, productCreateTimeMillis: 1_700_000_000_000 }
  const product = { exists: true, createTimeMillis: 1_700_000_000_000, stock: 8 }

  it('restores the exact product document that was debited', () => {
    expect(resolveStockReturn(item, product)).toEqual({ apply: true, delta: 2, reason: 'restored' })
  })

  it('refuses to increment a deleted or recreated product', () => {
    expect(resolveStockReturn(item, null)).toEqual({ apply: false, delta: 0, reason: 'product_missing' })
    expect(resolveStockReturn(item, { exists: false, createTimeMillis: null, stock: null })).toEqual({ apply: false, delta: 0, reason: 'product_missing' })
    expect(resolveStockReturn(item, { ...product, createTimeMillis: 1_800_000_000_000 })).toEqual({ apply: false, delta: 0, reason: 'product_identity_changed' })
  })

  it('refuses untracked, invalid or out-of-range stock', () => {
    expect(resolveStockReturn({ ...item, inventoryTracked: false }, product)).toEqual({ apply: false, delta: 0, reason: 'line_untracked' })
    expect(resolveStockReturn(item, { ...product, stock: null })).toEqual({ apply: false, delta: 0, reason: 'product_now_untracked' })
    expect(resolveStockReturn(item, { ...product, stock: -1 })).toEqual({ apply: false, delta: 0, reason: 'invalid_stock' })
    expect(resolveStockReturn(item, { ...product, stock: 1_000_000 })).toEqual({ apply: false, delta: 0, reason: 'exceeds_max_stock' })
    expect(resolveStockReturn({ ...item, quantity: 0 }, product)).toEqual({ apply: false, delta: 0, reason: 'invalid_quantity' })
    expect(resolveStockReturn({ ...item, productCreateTimeMillis: null }, { ...product, createTimeMillis: 99 })).toEqual({ apply: true, delta: 2, reason: 'restored' })
  })
})

describe('refund and dispute semantics (S9)', () => {
  it('restores unshipped operational stock on a full refund', () => {
    const decision = resolveRefundTransition({
      refundScope: 'full',
      fulfilmentStatus: 'unfulfilled',
      inventoryState: 'committed',
      inventoryScope: 'operational',
    })
    expect(decision.releaseStock).toBe(true)
    expect(decision.paymentState).toBe('refunded')
    expect(decision.refundStatus).toBe('full')
  })

  it('never restores shipped stock unconditionally', () => {
    const shipped = resolveRefundTransition({
      refundScope: 'full',
      fulfilmentStatus: 'fulfilled',
      inventoryState: 'committed',
      inventoryScope: 'operational',
    })
    expect(shipped.releaseStock).toBe(false)
    expect(shipped.status).toBeNull()
    expect(shipped.reason).toBe('shipped_stock_not_restored')
  })

  it('leaves sandbox and already-released reservations alone', () => {
    expect(resolveRefundTransition({ refundScope: 'full', fulfilmentStatus: 'unfulfilled', inventoryState: 'committed', inventoryScope: 'sandbox' }).releaseStock).toBe(false)
    expect(resolveRefundTransition({ refundScope: 'full', fulfilmentStatus: 'unfulfilled', inventoryState: 'released', inventoryScope: 'operational' }).releaseStock).toBe(false)
  })

  it('keeps the order alive for partial refunds', () => {
    const partial = resolveRefundTransition({ refundScope: 'partial', fulfilmentStatus: 'unfulfilled', inventoryState: 'committed', inventoryScope: 'operational' })
    expect(partial).toMatchObject({ paymentState: null, refundStatus: 'partial', releaseStock: false })
  })

  it('holds stock through a dispute instead of guessing', () => {
    expect(resolveDisputeTransition({ fulfilmentStatus: 'unfulfilled' })).toMatchObject({ paymentState: 'disputed', releaseStock: false })
    expect(resolveDisputeTransition({ fulfilmentStatus: 'fulfilled' }).status).toBeNull()
  })
})

describe('purchase activity idempotency (S4)', () => {
  it('creates activity once and never aborts replay of an existing record', () => {
    expect(shouldRecordPurchaseActivity({ currentStatus: 'pending', nextStatus: 'paid', activityExists: false })).toBe(true)
    expect(shouldRecordPurchaseActivity({ currentStatus: 'pending', nextStatus: 'paid', activityExists: true })).toBe(false)
    expect(shouldRecordPurchaseActivity({ currentStatus: 'paid', nextStatus: 'paid', activityExists: false })).toBe(false)
    expect(shouldRecordPurchaseActivity({ currentStatus: 'fulfilled', nextStatus: 'paid', activityExists: false })).toBe(false)
    expect(shouldRecordPurchaseActivity({ currentStatus: 'cancelled', nextStatus: 'payment_review', activityExists: false })).toBe(false)
  })
})

describe('bounded expiry backlog (S3)', () => {
  const terminal = [
    { id: 'released', data: { inventoryState: 'released', status: 'cancelled', stripeCheckoutStatus: 'expired' } },
    { id: 'committed', data: { inventoryState: 'committed', status: 'fulfilled', stripeCheckoutStatus: 'complete' } },
    { id: 'shipped-reserved', data: { inventoryState: 'reserved', status: 'fulfilled', stripeCheckoutStatus: 'open' } },
  ]

  it('skips terminal orders so they cannot starve cleanup', () => {
    expect(terminal.filter((doc) => isActionableReservation(doc.data)).map((doc) => doc.id)).toEqual([])
    expect(isActionableReservation({ inventoryState: 'reserved', status: 'pending', stripeCheckoutStatus: 'creating' })).toBe(true)
    expect(isActionableReservation({ inventoryState: 'reserved', status: 'pending', stripeCheckoutStatus: 'open' })).toBe(true)
    expect(isActionableReservation({ inventoryState: 'reserved', status: 'pending', cancelRequested: true })).toBe(true)
    expect(isActionableReservation({ inventoryState: 'reserved', status: 'payment_review', stripeCheckoutStatus: 'complete' })).toBe(false)
  })

  it('walks more than one page of reservations with a bounded cursor', async () => {
    const backlog = Array.from({ length: 250 }, (_, index) => ({
      id: `order-${index}`,
      data: {
        inventoryState: index % 5 === 0 ? 'released' : 'reserved',
        status: 'pending',
        stripeCheckoutStatus: 'open',
      },
    }))
    const seenCursors: unknown[] = []
    const collected = await collectCleanupBatch<{ id: string; data: Record<string, unknown> }>(async (cursor) => {
      seenCursors.push(cursor)
      const start = typeof cursor === 'number' ? cursor : 0
      const docs = backlog.slice(start, start + 100)
      return { docs, cursor: docs.length === 100 ? start + 100 : null }
    }, { pageSize: 100, maxPages: 5, isActionable: (doc) => isActionableReservation(doc.data) })

    expect(backlog).toHaveLength(250)
    expect(collected).toHaveLength(200)
    expect(collected.every((doc) => doc.data.inventoryState === 'reserved')).toBe(true)
    expect(seenCursors).toHaveLength(3)
  })

  it('stops at the invocation page budget', async () => {
    const fetchPage = async (cursor: unknown) => {
      const start = typeof cursor === 'number' ? cursor : 0
      return { docs: [{ id: `o-${start}`, data: { inventoryState: 'reserved', status: 'pending', stripeCheckoutStatus: 'open' } }], cursor: start + 1 }
    }
    const collected = await collectCleanupBatch(fetchPage, { pageSize: 1, maxPages: 4, isActionable: () => true })
    expect(collected).toHaveLength(4)
  })
})
