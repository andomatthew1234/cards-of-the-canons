/**
 * Pure commerce invariants (Batch B — S2/S3/S4/S5/S9).
 *
 * Everything in this module is side-effect free so the rules can be exercised
 * directly by unit tests: no Firestore, no Stripe, no clock reads. `checkout.ts`
 * is only allowed to *apply* what these functions decide.
 */

export type InventoryState = 'reserved' | 'committed' | 'released'
export type InventoryScope = 'operational' | 'sandbox'
export type PaymentState = 'unpaid' | 'failed' | 'paid' | 'disputed' | 'refunded'
export type FulfilmentState = 'unfulfilled' | 'fulfilled' | 'cancelled'
export type RefundState = 'none' | 'partial' | 'full'
export type OrderStatusValue =
  | 'pending'
  | 'paid'
  | 'payment_failed'
  | 'payment_review'
  | 'checkout_failed'
  | 'cancelled'
  | 'fulfilled'

/** A product line captured on the order at reservation time. */
export interface StoredOrderItem {
  productId: string
  name: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
  inventoryTracked: boolean
  treasuryCardsPerUnit: number
  treasuryEligibleCodeCount: number
  /** Firestore create time of the product document — identity, not version. */
  productCreateTimeMillis?: number | null
}

const refundRank: Record<RefundState, number> = { none: 0, partial: 1, full: 2 }

/**
 * Payment transitions are forward-only with two explicit escapes: a failed
 * payment can still be recovered by a late confirmation, and a dispute can be
 * resolved either way. Nothing ever walks back from `refunded`.
 */
const paymentNext: Record<PaymentState, ReadonlyArray<PaymentState>> = {
  unpaid: ['unpaid', 'failed', 'paid', 'disputed'],
  failed: ['failed', 'paid', 'disputed', 'refunded'],
  paid: ['paid', 'disputed', 'refunded'],
  disputed: ['disputed', 'paid', 'refunded'],
  refunded: ['refunded'],
}

const fulfilmentNext: Record<FulfilmentState, ReadonlyArray<FulfilmentState>> = {
  unfulfilled: ['unfulfilled', 'fulfilled', 'cancelled'],
  // Shipped/captured fulfilment is terminal for machine-driven transitions.
  fulfilled: ['fulfilled'],
  cancelled: ['cancelled'],
}

const inventoryNext: Record<InventoryState, ReadonlyArray<InventoryState>> = {
  // Stock is either still held, consumed exactly once, or returned exactly once.
  reserved: ['reserved', 'committed', 'released'],
  // A captured-but-never-shipped order may be refunded and return its stock.
  committed: ['committed', 'released'],
  released: ['released'],
}

/**
 * Statuses a payment/webhook transition may move the order to. `fulfilled` and
 * `cancelled` are deliberately absent from the source list so a late or
 * reordered Stripe event can never resurrect an order an operator already
 * closed out, nor downgrade a shipped order back to `paid`.
 */
const statusNext: Record<OrderStatusValue, ReadonlyArray<OrderStatusValue>> = {
  pending: ['pending', 'paid', 'payment_failed', 'payment_review', 'checkout_failed', 'cancelled'],
  payment_review: ['payment_review', 'paid', 'payment_failed', 'cancelled'],
  paid: ['paid', 'payment_review'],
  payment_failed: ['payment_failed', 'payment_review', 'paid'],
  checkout_failed: ['checkout_failed', 'payment_review', 'cancelled', 'paid'],
  cancelled: ['cancelled', 'payment_review'],
  fulfilled: ['fulfilled'],
}

export function normalizePaymentState(raw: unknown): PaymentState {
  if (raw === 'paid' || raw === 'no_payment_required' || raw === 'refunded' || raw === 'disputed' || raw === 'failed') {
    return raw as PaymentState
  }
  return 'unpaid'
}

export function normalizeFulfilmentState(raw: unknown): FulfilmentState {
  if (raw === 'fulfilled' || raw === 'cancelled') return raw
  return 'unfulfilled'
}

export function normalizeRefundState(raw: unknown): RefundState {
  if (raw === 'partial' || raw === 'full') return raw
  return 'none'
}

export function normalizeInventoryState(raw: unknown): InventoryState {
  if (raw === 'committed' || raw === 'released') return raw
  return 'reserved'
}

export function normalizeOrderStatus(raw: unknown): OrderStatusValue {
  const value = String(raw ?? '')
  switch (value) {
    case 'paid':
    case 'payment_failed':
    case 'payment_review':
    case 'checkout_failed':
    case 'cancelled':
    case 'fulfilled':
      return value
    default:
      return 'pending'
  }
}

export function isStatusTransitionAllowed(from: OrderStatusValue, to: OrderStatusValue) {
  return statusNext[from].includes(to)
}

/**
 * Operator-driven fulfilment transitions. Deliberately narrower than the
 * payment path: `fulfilled` and `cancelled` can only be left through the exact
 * reversals administrators already rely on, never through a webhook.
 */
export function isAllowedAdminStatusTransition(from: OrderStatusValue, to: OrderStatusValue) {
  if (from === to) return true
  if (from === 'paid' && (to === 'fulfilled' || to === 'cancelled')) return true
  if (from === 'fulfilled' && to === 'paid') return true
  return false
}

export interface OrderStateSnapshot {
  status: OrderStatusValue
  paymentState: PaymentState
  fulfilmentStatus: FulfilmentState
  refundStatus: RefundState
  inventoryState: InventoryState
}

export interface OrderStatePatch {
  status?: unknown
  paymentState?: unknown
  fulfilmentStatus?: unknown
  refundStatus?: unknown
  inventoryState?: unknown
}

/**
 * Applies an incoming patch under monotonic rules. Fields that would violate a
 * monotonicity or terminal-state invariant are dropped rather than written, so
 * out-of-order or replayed events converge on the same durable state.
 */
export function reconcileOrderState(current: OrderStateSnapshot, patch: OrderStatePatch): OrderStateSnapshot {
  const currentPayment = normalizePaymentState(current.paymentState)
  const currentFulfilment = normalizeFulfilmentState(current.fulfilmentStatus)
  const currentRefund = normalizeRefundState(current.refundStatus)
  const currentInventory = normalizeInventoryState(current.inventoryState)
  const currentStatus = normalizeOrderStatus(current.status)

  const wantedPayment = patch.paymentState === undefined ? currentPayment : normalizePaymentState(patch.paymentState)
  const paymentState = paymentNext[currentPayment].includes(wantedPayment) ? wantedPayment : currentPayment

  const wantedFulfilment = patch.fulfilmentStatus === undefined ? currentFulfilment : normalizeFulfilmentState(patch.fulfilmentStatus)
  const fulfilmentStatus = fulfilmentNext[currentFulfilment].includes(wantedFulfilment) ? wantedFulfilment : currentFulfilment

  const wantedRefund = patch.refundStatus === undefined ? currentRefund : normalizeRefundState(patch.refundStatus)
  const refundStatus = refundRank[wantedRefund] >= refundRank[currentRefund] ? wantedRefund : currentRefund

  const wantedInventory = patch.inventoryState === undefined ? currentInventory : normalizeInventoryState(patch.inventoryState)
  const inventoryState = inventoryNext[currentInventory].includes(wantedInventory) ? wantedInventory : currentInventory

  let status = currentStatus
  if (patch.status !== undefined) {
    const wantedStatus = normalizeOrderStatus(patch.status)
    if (wantedStatus !== currentStatus && isStatusTransitionAllowed(currentStatus, wantedStatus)) status = wantedStatus
  }

  let finalFulfilment = fulfilmentStatus
  // A cancellation must be accompanied by a cancelled-ish status, otherwise a
  // late or reordered event could mark a paid, still-held order as cancelled.
  if (finalFulfilment === 'cancelled' && (status === 'pending' || status === 'paid' || status === 'fulfilled')) {
    finalFulfilment = currentFulfilment
  }
  // Fulfilment must never disagree with the status operators act on.
  if (status === 'fulfilled') finalFulfilment = 'fulfilled'
  if (status === 'cancelled' && finalFulfilment === 'fulfilled') {
    return { status: currentStatus, paymentState, fulfilmentStatus, refundStatus, inventoryState }
  }

  return { status, paymentState, fulfilmentStatus: finalFulfilment, refundStatus, inventoryState }
}

/**
 * Purchase activity is business-idempotent state: it is created at most once,
 * and an already-existing record must never make the surrounding payment
 * transaction throw (which would abort legitimate event replay).
 */
export function shouldRecordPurchaseActivity(input: {
  currentStatus: OrderStatusValue
  nextStatus: OrderStatusValue
  activityExists: boolean
}): boolean {
  if (input.activityExists) return false
  if (input.nextStatus !== 'paid') return false
  return input.currentStatus !== 'paid' && input.currentStatus !== 'fulfilled'
}

export interface SessionBindingInput {
  sessionId: string
  clientReferenceId: string | null
  metadataOrderId: string | null
  metadataUid: string | null
  metadataPaymentEnvironment: string | null
  stripeKeyIsLive: boolean
  amountTotalCents: number | null
  currency: string | null
  mode: string | null
}

export interface OrderBindingSnapshot {
  orderId: string
  userId: string
  totalCents: number
  currency: string
  paymentEnvironment: 'test' | 'live'
  stripeCheckoutSessionId: string | null
}

/**
 * Immutable payment/order binding. Any mismatch means we cannot prove the money
 * belongs to this order, so the caller must quarantine instead of mutating.
 */
export function validateSessionBinding(session: SessionBindingInput, order: OrderBindingSnapshot): { ok: true } | { ok: false; reason: string } {
  if (session.mode !== null && session.mode !== 'payment') return { ok: false, reason: 'session_mode' }
  if (!session.metadataOrderId || session.metadataOrderId !== order.orderId) return { ok: false, reason: 'metadata_order' }
  if (session.clientReferenceId !== order.orderId) return { ok: false, reason: 'client_reference' }
  if (!session.metadataUid || session.metadataUid !== order.userId) return { ok: false, reason: 'metadata_uid' }
  if (order.stripeCheckoutSessionId && order.stripeCheckoutSessionId !== session.sessionId) {
    return { ok: false, reason: 'session_id_conflict' }
  }
  if (session.amountTotalCents !== null && session.amountTotalCents !== order.totalCents) {
    return { ok: false, reason: 'amount_mismatch' }
  }
  if (session.currency !== null && (session.currency ?? '').toLowerCase() !== order.currency.toLowerCase()) {
    return { ok: false, reason: 'currency_mismatch' }
  }
  const expectedEnvironment = order.paymentEnvironment
  // Older sessions may lack the environment tag; the Stripe account context
  // check below still proves live/test separation.
  if (session.metadataPaymentEnvironment !== null && session.metadataPaymentEnvironment !== expectedEnvironment) {
    return { ok: false, reason: 'environment_mismatch' }
  }
  if (session.stripeKeyIsLive !== (expectedEnvironment === 'live')) return { ok: false, reason: 'account_context_mismatch' }
  return { ok: true }
}

export type CreationLeaseDecision =
  | { action: 'reuse_existing_session'; sessionId: string }
  | { action: 'wait_for_creation'; retryAfterMs: number }
  | { action: 'claim_lease' }
  | { action: 'reject'; reason: string }

export interface CreationLeaseView {
  stripeCheckoutSessionId?: string | null
  stripeCheckoutStatus?: string | null
  creationLeaseUntilMs?: number | null
  status?: string | null
  inventoryState?: InventoryState | null
  paymentState?: PaymentState | null
}

/**
 * Decides who is allowed to talk to Stripe for a given order. Concurrent
 * retries must never both create a session nor both release the reservation.
 */
export function decideCreationLease(view: CreationLeaseView, nowMs: number, leaseMs: number): CreationLeaseDecision {
  if (view.stripeCheckoutSessionId) return { action: 'reuse_existing_session', sessionId: view.stripeCheckoutSessionId }
  const status = normalizeOrderStatus(view.status)
  if (status === 'cancelled' || status === 'checkout_failed') return { action: 'reject', reason: 'order_closed' }
  if (view.inventoryState === 'committed' || view.inventoryState === 'released') {
    return { action: 'reject', reason: 'reservation_not_held' }
  }
  if (normalizePaymentState(view.paymentState) === 'paid') return { action: 'reject', reason: 'already_paid' }
  const leaseUntil = Number(view.creationLeaseUntilMs ?? 0)
  if (Number.isFinite(leaseUntil) && leaseUntil > nowMs) return { action: 'wait_for_creation', retryAfterMs: leaseUntil - nowMs }
  return { action: 'claim_lease' }
}

export interface CreationOutcomeInput {
  sessions: Array<{ id: string; status?: string | null; payment_status?: string | null }>
  orderStillOpen: boolean
}

export type CreationOutcome =
  | { action: 'release' }
  | { action: 'adopt'; sessionId: string }
  | { action: 'defer' }

/**
 * Stripe create() failures are *uncertain*: the request may have been accepted
 * before the connection dropped. We only ever release stock after proving no
 * payable session exists.
 */
export function resolveCreationOutcome(input: CreationOutcomeInput): CreationOutcome {
  if (!input.orderStillOpen) return { action: 'defer' }
  if (input.sessions.length === 0) return { action: 'release' }
  for (const session of input.sessions) {
    if (session.status === 'open' || session.status === 'complete') return { action: 'adopt', sessionId: session.id }
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      return { action: 'adopt', sessionId: session.id }
    }
  }
  const onlyExpired = input.sessions.every((session) => session.status === 'expired')
  return onlyExpired ? { action: 'release' } : { action: 'defer' }
}

export interface TestCheckoutPolicy {
  enabled: boolean
  testerUids: string[]
  perUserQuota: number
  globalQuota: number
}

/**
 * Fail-closed gate for sandbox checkout: no configured testers, no checkout.
 */
export function checkTestCheckoutPolicy(policy: TestCheckoutPolicy, uid: string): { allowed: true } | { allowed: false; reason: string } {
  if (!policy.enabled) return { allowed: false, reason: 'sandbox_disabled' }
  if (policy.testerUids.length === 0) return { allowed: false, reason: 'no_testers_configured' }
  if (!policy.testerUids.includes(uid)) return { allowed: false, reason: 'not_a_tester' }
  return { allowed: true }
}

export function checkSandboxQuota(policy: TestCheckoutPolicy, counts: { userActive: number; globalActive: number }) {
  if (counts.userActive >= policy.perUserQuota) return { allowed: false, reason: 'per_user_quota' }
  if (counts.globalActive >= policy.globalQuota) return { allowed: false, reason: 'global_quota' }
  return { allowed: true }
}

export interface StockReturnDecision {
  apply: boolean
  delta: number
  reason: string
}

export const MAX_TRACKED_STOCK = 1_000_000

/**
 * Reservation bookkeeping: stock may only be returned to the exact product
 * document that was debited. A deleted-then-recreated or de-tracked product
 * gets no automatic increment; the caller records the reason in the ledger.
 */
export function resolveStockReturn(
  item: Pick<StoredOrderItem, 'quantity' | 'inventoryTracked' | 'productCreateTimeMillis'>,
  product: { exists: boolean; createTimeMillis: number | null; stock: number | null } | null,
): StockReturnDecision {
  if (!item.inventoryTracked) return { apply: false, delta: 0, reason: 'line_untracked' }
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100) {
    return { apply: false, delta: 0, reason: 'invalid_quantity' }
  }
  if (!product || !product.exists) return { apply: false, delta: 0, reason: 'product_missing' }
  if (product.stock === null) return { apply: false, delta: 0, reason: 'product_now_untracked' }
  if (!Number.isSafeInteger(product.stock) || product.stock < 0) return { apply: false, delta: 0, reason: 'invalid_stock' }
  const expectedIdentity = item.productCreateTimeMillis ?? null
  if (expectedIdentity !== null && product.createTimeMillis !== expectedIdentity) {
    return { apply: false, delta: 0, reason: 'product_identity_changed' }
  }
  if (product.stock + item.quantity > MAX_TRACKED_STOCK) return { apply: false, delta: 0, reason: 'exceeds_max_stock' }
  return { apply: true, delta: item.quantity, reason: 'restored' }
}

export interface RefundTransitionInput {
  refundScope: 'partial' | 'full'
  fulfilmentStatus: FulfilmentState
  inventoryState: InventoryState
  inventoryScope: InventoryScope
}

export interface RefundTransition {
  paymentState: PaymentState | null
  refundStatus: RefundState
  releaseStock: boolean
  status: OrderStatusValue | null
  reason: string
}

/**
 * Refund/dispute semantics: stock comes back only when the order was never
 * shipped, and only for operational inventory. Shipped stock is never restored
 * unconditionally — that decision belongs to an operator.
 */
export function resolveRefundTransition(input: RefundTransitionInput): RefundTransition {
  if (input.refundScope === 'partial') {
    return {
      paymentState: null,
      refundStatus: 'partial',
      releaseStock: false,
      status: null,
      reason: 'partial_refund_keeps_reservation',
    }
  }
  const shipped = input.fulfilmentStatus === 'fulfilled'
  const canRestore = !shipped && input.inventoryState === 'committed' && input.inventoryScope === 'operational'
  return {
    paymentState: 'refunded',
    refundStatus: 'full',
    releaseStock: canRestore,
    status: shipped ? null : 'payment_review',
    reason: shipped ? 'shipped_stock_not_restored' : canRestore ? 'unfulfilled_stock_restored' : 'no_stock_held',
  }
}

export interface DisputeTransitionInput {
  fulfilmentStatus: FulfilmentState
}

export function resolveDisputeTransition(input: DisputeTransitionInput) {
  return {
    paymentState: 'disputed' as PaymentState,
    refundStatus: 'none' as RefundState,
    status: input.fulfilmentStatus === 'fulfilled' ? null : ('payment_review' as OrderStatusValue),
    releaseStock: false,
    reason: 'dispute_open_stock_unchanged',
  }
}

export interface CleanupPage<T> {
  docs: T[]
  cursor: unknown
}

/**
 * Bounded, resumable backlog scan (S3). Terminal orders are filtered by the
 * query itself so they can never consume the page budget and starve cleanup.
 */
export async function collectCleanupBatch<T>(
  fetchPage: (cursor: unknown) => Promise<CleanupPage<T>>,
  options: { pageSize: number; maxPages: number; isActionable: (doc: T) => boolean },
): Promise<T[]> {
  const collected: T[] = []
  let cursor: unknown = null
  for (let page = 0; page < options.maxPages; page += 1) {
    const result = await fetchPage(cursor)
    collected.push(...result.docs.filter(options.isActionable))
    if (!result.cursor || result.docs.length === 0) break
    cursor = result.cursor
  }
  return collected
}

export function isActionableReservation(data: {
  inventoryState?: unknown
  status?: unknown
  stripeCheckoutStatus?: unknown
  cancelRequested?: unknown
}): boolean {
  if (data.inventoryState !== 'reserved') return false
  const status = String(data.status ?? '')
  // A closed order must never hold a reservation that cleanup skips over.
  if (status === 'fulfilled' || status === 'cancelled' || status === 'checkout_failed') return false
  if (data.cancelRequested === true) return true
  return ['creating', 'open', 'pending'].includes(String(data.stripeCheckoutStatus ?? ''))
}

export function paymentEnvironmentMatches(expected: 'test' | 'live', actual: 'test' | 'live') {
  return expected === actual
}

export function canCreateLiveCheckout(input: {
  liveKey: boolean
  webhookSecretConfigured: boolean
  webhookEvidenceCurrent: boolean
  livePaymentsEnabled: boolean
}) {
  return input.liveKey
    && input.webhookSecretConfigured
    && input.webhookEvidenceCurrent
    && input.livePaymentsEnabled
}
