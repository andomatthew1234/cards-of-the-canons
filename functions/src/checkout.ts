import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp, type DocumentData, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret, defineString } from 'firebase-functions/params'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import Stripe from 'stripe'
import { ADMIN_RECENT_AUTH_SECONDS, authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import {
  checkSandboxQuota,
  checkTestCheckoutPolicy,
  canCreateLiveCheckout,
  collectCleanupBatch,
  decideCreationLease,
  isActionableReservation,
  normalizeFulfilmentState,
  normalizeInventoryState,
  normalizeOrderStatus,
  normalizePaymentState,
  normalizeRefundState,
  paymentEnvironmentMatches,
  reconcileOrderState,
  resolveCreationOutcome,
  resolveDisputeTransition,
  resolveRefundTransition,
  resolveStockReturn,
  shouldRecordPurchaseActivity,
  validateSessionBinding,
  type InventoryScope,
  type OrderStateSnapshot,
  type StoredOrderItem,
  type TestCheckoutPolicy,
} from './commerceInvariants'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'
import { cancelCheckoutSchema, checkoutSchema, launchPrerequisitesSchema, bootstrapUidList } from './validation'
import { activityCopy, activityDocument, activityEventRef } from './accountActivity'

const region = 'australia-southeast1'
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY')
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET')
// S5: sandbox checkout is fail-closed until an operator records an explicit,
// bounded list of approved tester UIDs. Mailboxes are never consulted.
const testCheckoutTesterUids = defineString('TEST_CHECKOUT_TESTER_UIDS', { default: '' })
const testCheckoutPerUserQuota = defineString('TEST_CHECKOUT_PER_USER_QUOTA', { default: '3' })
const testCheckoutGlobalQuota = defineString('TEST_CHECKOUT_GLOBAL_QUOTA', { default: '25' })
const checkoutExpirySeconds = 30 * 60
const creationLeaseMs = 60 * 1000
const publicOrigins = new Set([
  'https://doxatreasury.com',
  'https://cards-of-canons-au-260930.web.app',
  'https://cards-of-canons-au-260930.firebaseapp.com',
])

type InventoryState = 'reserved' | 'committed' | 'released'
type CheckoutEventType =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded'
  | 'checkout.session.async_payment_failed'
  | 'checkout.session.expired'

type StoredOrder = StoredOrderItem[]

interface PersistedCreationParams {
  clientReferenceId: string
  customerEmail: string
  origin: string
  integrationIdentifier: string
  expiresAtSec: number
  lineItems: Array<{ quantity: number; unitAmountCents: number; name: string }>
  metadata: { orderId: string; firebaseUid: string; paymentEnvironment: string }
}

export function isLiveStripeKey(key: string) {
  return /^(sk|rk|rkcs)_live_/.test(key)
}

export function resolveCheckoutTransition(eventType: CheckoutEventType, paymentStatus: Stripe.Checkout.Session.PaymentStatus, inventoryState: InventoryState) {
  const paid = paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
  if ((eventType === 'checkout.session.completed' && paid) || eventType === 'checkout.session.async_payment_succeeded') {
    return inventoryState === 'released'
      ? { action: 'ignore' as const, orderStatus: 'payment_review' as const, inventoryState }
      : { action: 'commit' as const, orderStatus: 'paid' as const, inventoryState: 'committed' as const }
  }
  if (eventType === 'checkout.session.async_payment_failed') {
    return inventoryState === 'committed'
      ? { action: 'ignore' as const, orderStatus: 'paid' as const, inventoryState }
      : { action: 'release' as const, orderStatus: 'payment_failed' as const, inventoryState: 'released' as const }
  }
  if (eventType === 'checkout.session.expired') {
    return inventoryState === 'committed'
      ? { action: 'ignore' as const, orderStatus: 'paid' as const, inventoryState }
      : { action: 'release' as const, orderStatus: 'cancelled' as const, inventoryState: 'released' as const }
  }
  return { action: 'hold' as const, orderStatus: 'pending' as const, inventoryState }
}

function stripeClient() {
  return new Stripe(stripeSecretKey.value(), {
    apiVersion: '2026-09-30.endive',
    maxNetworkRetries: 2,
    typescript: true,
  })
}

function safeOrigin(rawOrigin: string | undefined) {
  if (!rawOrigin) return 'https://doxatreasury.com'
  try {
    const origin = new URL(rawOrigin)
    if (publicOrigins.has(origin.origin)) return origin.origin
    if (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)) return origin.origin
  } catch {
    // The fixed production origin below is safer than reflecting malformed input.
  }
  return 'https://doxatreasury.com'
}

function integrationIdentifier() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const bytes = randomBytes(8)
  return `cards_of_canons_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')}`
}

function orderIdForAttempt(uid: string, attemptId: string) {
  return `co_${createHash('sha256').update(`${uid}:${attemptId}`).digest('hex').slice(0, 32)}`
}

function clampInt(raw: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function testCheckoutPolicy(): TestCheckoutPolicy {
  return {
    enabled: true,
    testerUids: bootstrapUidList(testCheckoutTesterUids.value()),
    perUserQuota: clampInt(testCheckoutPerUserQuota.value(), 1, 20, 3),
    globalQuota: clampInt(testCheckoutGlobalQuota.value(), 1, 200, 25),
  }
}

// Invocation-level coalescing (S9): a single instance never runs two Stripe
// creations/cancellations/reconciliations for the same order at once, and the
// bounded map doubles as an invocation-level concurrency limit.
const inFlight = new Map<string, Promise<unknown>>()
const MAX_IN_FLIGHT_OPERATIONS = 64
type TerminalCancelResult = { cancelled: boolean; paid?: boolean; processing?: boolean }
const terminalCancelResults = new Map<string, { value: TerminalCancelResult; at: number }>()
const TERMINAL_CACHE_MS = 60 * 1000

// Exported for regression tests: these three helpers are the whole of the S9
// invocation-level limit/coalescing behaviour.
export async function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  if (inFlight.size >= MAX_IN_FLIGHT_OPERATIONS) {
    throw new HttpsError('resource-exhausted', 'Too many checkout operations are running. Please try again in a moment.')
  }
  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key)
  })
  inFlight.set(key, promise)
  return promise
}

export function readTerminalCancel(orderId: string): TerminalCancelResult | undefined {
  const cached = terminalCancelResults.get(orderId)
  if (!cached) return undefined
  if (Date.now() - cached.at > TERMINAL_CACHE_MS) {
    terminalCancelResults.delete(orderId)
    return undefined
  }
  return cached.value
}

export function writeTerminalCancel(orderId: string, value: TerminalCancelResult) {
  if (terminalCancelResults.size > 256) terminalCancelResults.clear()
  terminalCancelResults.set(orderId, { value, at: Date.now() })
}

// Checkout shares the single current-user authorization guard with every
// other authenticated endpoint: revocation, disabled accounts, account-control
// tombstones and current roles are checked centrally in authorization.ts.
async function requireCheckoutIdentity(request: CallableRequestLike) {
  const caller = await authorizeRequest(request, { requireVerifiedEmail: true })
  const email = (caller.email ?? '').trim().toLowerCase()
  if (!email) throw new HttpsError('failed-precondition', 'Your account needs an email address before checkout.')
  return { uid: caller.uid, email }
}

async function requireAdministrator(request: CallableRequestLike) {
  await requireAdminContext(request)
}

async function assertPaymentMode(key: string, webhookSecret: string) {
  const live = isLiveStripeKey(key)
  if (!live) return 'test' as const
  const prerequisites = await loadLaunchPrerequisites(webhookSecretFingerprint(webhookSecret))
  const settings = await db.collection('commerceConfig').doc('main').get()
  if (!canCreateLiveCheckout({
    liveKey: live,
    webhookSecretConfigured: webhookSecretLooksConfigured(webhookSecret),
    webhookEvidenceCurrent: prerequisites.webhookValidated,
    livePaymentsEnabled: settings.data()?.livePaymentsEnabled === true,
  })) {
    throw new HttpsError('failed-precondition', 'Live payments are locked. An administrator must complete the launch review first.')
  }
  return 'live' as const
}

function orderStateSnapshot(data: DocumentData): OrderStateSnapshot {
  return {
    status: normalizeOrderStatus(data.status),
    paymentState: normalizePaymentState(data.paymentState ?? data.paymentStatus),
    fulfilmentStatus: normalizeFulfilmentState(data.fulfilmentStatus),
    refundStatus: normalizeRefundState(data.refundStatus),
    inventoryState: normalizeInventoryState(data.inventoryState),
  }
}

function stockIdentity(product: QueryDocumentSnapshot<DocumentData>) {
  const data = product.data() ?? {}
  return {
    exists: product.exists,
    createTimeMillis: product.createTime ? product.createTime.toMillis() : null,
    stock: typeof data.stock === 'number' ? data.stock : null,
  }
}

interface ReleaseOutcome {
  restored: number
  skipped: Array<{ productId: string; reason: string }>
}

/**
 * Returns reserved operational stock exactly once, with identity bookkeeping.
 * Sandbox orders never touch operational inventory (S5).
 */
async function restoreReservedStock(
  transaction: Transaction,
  orderId: string,
  data: DocumentData,
): Promise<ReleaseOutcome> {
  const scope: InventoryScope = data.inventoryScope === 'sandbox' ? 'sandbox' : 'operational'
  const outcome: ReleaseOutcome = { restored: 0, skipped: [] }
  if (scope !== 'operational') return outcome
  const items: StoredOrder = Array.isArray(data.items) ? data.items as StoredOrder : []
  const tracked = items.filter((item) => item && item.inventoryTracked === true)
  const productRefs = tracked.map((item) => db.collection('products').doc(item.productId))
  const products = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
  tracked.forEach((item, index) => {
    const snapshot = products[index] as QueryDocumentSnapshot<DocumentData>
    const decision = resolveStockReturn(item, snapshot ? stockIdentity(snapshot) : null)
    if (decision.apply && snapshot) {
      transaction.update(productRefs[index], { stock: FieldValue.increment(decision.delta), updatedAt: FieldValue.serverTimestamp() })
      outcome.restored += decision.delta
    } else {
      outcome.skipped.push({ productId: String(item.productId), reason: decision.reason })
    }
    // Append-only stock ledger: every return attempt is auditable, including
    // the ones we deliberately refused to apply.
    transaction.set(db.collection('_stockLedger').doc(`${orderId}_${String(item.productId)}`), {
      orderId,
      productId: item.productId,
      delta: decision.apply ? decision.delta : 0,
      reason: decision.reason,
      scope,
      recordedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  })
  return outcome
}

async function reserveOrder(
  uid: string,
  email: string,
  orderId: string,
  items: Array<{ productId: string; quantity: number }>,
  paymentEnvironment: 'test' | 'live',
  origin: string,
) {
  const orderRef = db.collection('orders').doc(orderId)
  const productRefs = items.map((item) => db.collection('products').doc(item.productId))
  const expiresAt = Timestamp.fromMillis(Date.now() + checkoutExpirySeconds * 1000)
  const now = Date.now()
  return db.runTransaction(async (transaction: Transaction): Promise<{
    orderId: string
    items: StoredOrder
    subtotalCents: number
    expiresAt: Timestamp
    scope: InventoryScope
    reused?: boolean
    sessionId?: string
    leaseClaimed: boolean
    waitMs?: number
    cancelRequested?: boolean
    creationParams?: PersistedCreationParams
  }> => {
    const existing = await transaction.get(orderRef)
    if (existing.exists) {
      const data = existing.data() ?? {}
      if (data.userId !== uid) throw new HttpsError('permission-denied', 'This checkout attempt is not available.')
      if (String(data.paymentEnvironment ?? '') !== paymentEnvironment) {
        throw new HttpsError('failed-precondition', 'This checkout attempt belongs to a different payment mode.')
      }
      const scope: InventoryScope = data.inventoryScope === 'sandbox' ? 'sandbox' : 'operational'
      const decision = decideCreationLease({
        stripeCheckoutSessionId: typeof data.stripeCheckoutSessionId === 'string' ? data.stripeCheckoutSessionId : null,
        stripeCheckoutStatus: typeof data.stripeCheckoutStatus === 'string' ? data.stripeCheckoutStatus : null,
        creationLeaseUntilMs: data.creationLeaseUntil instanceof Timestamp ? data.creationLeaseUntil.toMillis() : null,
        status: data.status,
        inventoryState: data.inventoryState,
        paymentState: data.paymentState ?? data.paymentStatus,
      }, now, creationLeaseMs)
      if (decision.action === 'reject') {
        throw new HttpsError('failed-precondition', 'This checkout attempt has ended. Return to your cart and try again.')
      }
      const base = {
        orderId,
        items: (Array.isArray(data.items) ? data.items : []) as StoredOrder,
        subtotalCents: Number(data.subtotalCents),
        expiresAt: data.expiresAt as Timestamp,
        scope,
        reused: true as const,
        leaseClaimed: false as const,
        cancelRequested: data.cancelRequested === true,
        creationParams: (data.stripeCreationParams ?? undefined) as PersistedCreationParams | undefined,
      }
      if (decision.action === 'reuse_existing_session') return { ...base, sessionId: decision.sessionId }
      if (decision.action === 'wait_for_creation') return { ...base, waitMs: decision.retryAfterMs }
      // claim_lease: exactly one invocation may talk to Stripe.
      const leaseUntil = Timestamp.fromMillis(now + creationLeaseMs)
      transaction.update(orderRef, {
        stripeCheckoutStatus: 'creating',
        creationLeaseUntil: leaseUntil,
        cancelRequested: data.cancelRequested === true ? true : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return { ...base, leaseClaimed: true }
    }

    const productSnapshots = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
    const snapshots: StoredOrder = productSnapshots.map((snapshot, index) => {
      if (!snapshot.exists) throw new HttpsError('not-found', 'A product in your cart is no longer available.')
      const product = snapshot.data() as DocumentData
      const quantity = items[index].quantity
      if (product.status !== 'published') throw new HttpsError('failed-precondition', `${String(product.name || 'A product')} is not currently available.`)
      const priceCents = Number(product.priceCents)
      if (!Number.isSafeInteger(priceCents) || priceCents < 1 || product.currency !== 'AUD') {
        throw new HttpsError('failed-precondition', `${String(product.name || 'A product')} does not have a valid price.`)
      }
      const inventoryTracked = product.stock !== null
      if (inventoryTracked && (!Number.isSafeInteger(product.stock) || Number(product.stock) < quantity)) {
        throw new HttpsError('failed-precondition', `${String(product.name || 'A product')} does not have enough stock for that quantity.`)
      }
      return {
        productId: snapshot.id,
        name: String(product.name).slice(0, 120),
        unitPriceCents: priceCents,
        quantity,
        lineTotalCents: priceCents * quantity,
        inventoryTracked,
        productCreateTimeMillis: snapshot.createTime ? snapshot.createTime.toMillis() : null,
      }
    })
    const subtotalCents = snapshots.reduce((total, item) => total + item.lineTotalCents, 0)
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 1 || subtotalCents > 100_000_000) {
      throw new HttpsError('failed-precondition', 'The cart total is outside the supported range.')
    }

    const scope: InventoryScope = paymentEnvironment === 'test' ? 'sandbox' : 'operational'
    // S5: sandbox checkout must never consume operational stock. Availability
    // is still checked read-only above, but nothing is debited here.
    if (scope === 'operational') {
      snapshots.forEach((item, index) => {
        if (item.inventoryTracked) {
          const product = productSnapshots[index].data() as DocumentData
          transaction.update(productRefs[index], { stock: Number(product.stock) - item.quantity, updatedAt: FieldValue.serverTimestamp() })
        }
      })
    }
    const creationParams: PersistedCreationParams = {
      clientReferenceId: orderId,
      customerEmail: email,
      origin,
      integrationIdentifier: integrationIdentifier(),
      expiresAtSec: Math.floor(expiresAt.toMillis() / 1000),
      lineItems: snapshots.map((item) => ({ quantity: item.quantity, unitAmountCents: item.unitPriceCents, name: item.name })),
      metadata: { orderId, firebaseUid: uid, paymentEnvironment },
    }
    transaction.create(orderRef, {
      userId: uid,
      customerEmail: email,
      status: 'pending',
      paymentStatus: 'unpaid',
      paymentState: 'unpaid',
      fulfilmentStatus: 'unfulfilled',
      refundStatus: 'none',
      paymentEnvironment,
      inventoryScope: scope,
      inventoryState: 'reserved',
      stripeCheckoutStatus: 'creating',
      creationLeaseUntil: Timestamp.fromMillis(now + creationLeaseMs),
      stripeCreationParams: creationParams,
      currency: 'AUD',
      subtotalCents,
      shippingCents: 0,
      totalCents: subtotalCents,
      items: snapshots,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { orderId, items: snapshots, subtotalCents, expiresAt, scope, leaseClaimed: true, creationParams }
  })
}

async function releaseOrder(orderId: string, status: 'cancelled' | 'checkout_failed', reason: string) {
  const orderRef = db.collection('orders').doc(orderId)
  await db.runTransaction(async (transaction) => {
    const order = await transaction.get(orderRef)
    if (!order.exists) return
    const data = order.data() as DocumentData
    if (data.inventoryState !== 'reserved') return
    // Shipped stock is never restored by a reservation cleanup path.
    if (data.fulfilmentStatus === 'fulfilled' || data.status === 'fulfilled') return
    await restoreReservedStock(transaction, orderId, data)
    const next = reconcileOrderState(orderStateSnapshot(data), {
      status,
      fulfilmentStatus: 'cancelled',
      inventoryState: 'released',
    })
    transaction.update(orderRef, {
      ...next,
      stripeCheckoutStatus: status === 'cancelled' ? 'expired' : 'failed',
      failureReason: reason.slice(0, 160),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}

function sessionBindingInput(session: Stripe.Checkout.Session) {
  const stripeKeyIsLive = isLiveStripeKey(stripeSecretKey.value())
  return {
    sessionId: session.id,
    clientReferenceId: session.client_reference_id ?? null,
    metadataOrderId: session.metadata?.orderId ?? null,
    metadataUid: session.metadata?.firebaseUid ?? null,
    metadataPaymentEnvironment: session.metadata?.paymentEnvironment ?? null,
    stripeKeyIsLive,
    amountTotalCents: session.amount_total ?? null,
    currency: session.currency ?? null,
    mode: session.mode ?? null,
  }
}

function orderBindingSnapshot(orderId: string, data: DocumentData) {
  return {
    orderId,
    userId: String(data.userId ?? ''),
    totalCents: Number(data.totalCents),
    currency: String(data.currency ?? 'AUD'),
    paymentEnvironment: (data.paymentEnvironment === 'live' ? 'live' : 'test') as 'test' | 'live',
    stripeCheckoutSessionId: typeof data.stripeCheckoutSessionId === 'string' ? data.stripeCheckoutSessionId : null,
  }
}

type CreationReplay =
  | { outcome: 'session'; session: Stripe.Checkout.Session }
  | { outcome: 'failed' }
  | { outcome: 'unknown' }

/**
 * Reconciles an uncertain Stripe creation by replaying the identical request
 * under the same idempotency key (S2/S9). Stripe returns the original session
 * when one was already accepted, so we can prove a payable session exists and
 * adopt it, prove none exists and release safely, or report the outcome as
 * unknowable and defer instead of touching stock.
 */
async function reconcileCreationByReplay(client: Stripe, orderId: string, data: DocumentData): Promise<CreationReplay> {
  // Never replay creation against an order that no longer holds its reservation.
  if (data.inventoryState !== 'reserved') return { outcome: 'unknown' }
  const params = replaySessionParams(orderId, data)
  if (!params) return { outcome: 'unknown' }
  try {
    const session = await client.checkout.sessions.create(params, { idempotencyKey: `checkout_${orderId}` })
    return { outcome: 'session', session }
  } catch (error) {
    const stripeType = typeof error === 'object' && error !== null && 'type' in error ? String((error as { type: unknown }).type) : ''
    // A validation/parameter rejection is definitive: no session exists.
    if (stripeType === 'StripeInvalidRequestError') return { outcome: 'failed' }
    logger.error('Stripe Checkout reconciliation stayed uncertain.', {
      orderId,
      errorType: error instanceof Error ? error.name : typeof error,
      stripeType,
    })
    return { outcome: 'unknown' }
  }
}

async function applyCheckoutEvent(
  eventId: string,
  eventType: CheckoutEventType,
  session: Stripe.Checkout.Session,
  verifiedWebhookFingerprint?: string,
) {
  const eventRef = db.collection('_stripeEvents').doc(eventId)
  const orderId = session.metadata?.orderId ?? session.client_reference_id ?? null
  await db.runTransaction(async (transaction) => {
    // Event-ID dedupe: a redelivered webhook is a no-op.
    const recorded = await transaction.get(eventRef)
    if (recorded.exists) return
    if (!orderId) {
      transaction.create(eventRef, { type: eventType, outcome: 'ignored_missing_order', createdAt: FieldValue.serverTimestamp() })
      return
    }
    const orderRef = db.collection('orders').doc(orderId)
    const order = await transaction.get(orderRef)
    if (!order.exists) {
      // Webhook arrived before the order document was visible. Keep the event
      // so reconciliation can replay it instead of silently dropping payment.
      transaction.create(eventRef, {
        type: eventType,
        orderId,
        sessionId: session.id,
        outcome: 'deferred_unknown_order',
        pending: true,
        createdAt: FieldValue.serverTimestamp(),
      })
      return
    }
    const data = order.data() as DocumentData

    const binding = validateSessionBinding(sessionBindingInput(session), orderBindingSnapshot(orderId, data))
    if (!binding.ok) {
      transaction.create(db.collection('_stripeQuarantine').doc(eventId), {
        type: eventType,
        orderId,
        sessionId: session.id,
        reason: binding.reason,
        createdAt: FieldValue.serverTimestamp(),
      })
      transaction.create(eventRef, { type: eventType, orderId, outcome: 'quarantined', reason: binding.reason, createdAt: FieldValue.serverTimestamp() })
      return
    }

    const current = orderStateSnapshot(data)
    const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
    const transition = resolveCheckoutTransition(eventType, session.payment_status, current.inventoryState)
    const patch = {
      status: transition.orderStatus,
      paymentState: paid ? 'paid' : eventType === 'checkout.session.async_payment_failed' ? 'failed' : undefined,
      inventoryState: transition.inventoryState,
      fulfilmentStatus: transition.action === 'release' ? 'cancelled' : undefined,
    }
    const next = reconcileOrderState(current, patch)

    let stockRestored = 0
    if (transition.action === 'release' && current.inventoryState === 'reserved') {
      const outcome = await restoreReservedStock(transaction, orderId, data)
      stockRestored = outcome.restored
    }

    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
    const adoption = typeof data.stripeCheckoutSessionId === 'string' ? {} : { stripeCheckoutSessionId: session.id }
    transaction.update(orderRef, {
      ...next,
      paymentStatus: session.payment_status,
      stripeCheckoutStatus: session.status,
      // A webhook can legitimately beat our own persistence of the session id.
      ...adoption,
      creationLeaseUntil: FieldValue.delete(),
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      ...(next.status === 'paid' && current.status !== 'paid' ? { paidAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })

    if (next.status === 'paid' && current.status !== 'paid' && current.status !== 'fulfilled') {
      const activityRef = activityEventRef(String(data.userId), `order_${orderId}`)
      const existingActivity = await transaction.get(activityRef)
      // Purchase activity is idempotent business state: an already-recorded
      // activity must never abort replay of a legitimate payment event, and
      // the event itself must still be durably recorded either way.
      if (shouldRecordPurchaseActivity({
        currentStatus: current.status,
        nextStatus: next.status,
        activityExists: existingActivity.exists,
      })) {
        const copy = activityCopy('order_purchased', `Order #${orderId} was completed.`)
        transaction.create(activityRef, activityDocument({
          type: 'order_purchased',
          // Server-side evidence from a verified Stripe event, never a
          // client-reported claim.
          verification: 'server',
          ...copy,
          metadata: {
            orderId,
            totalCents: Number(data.totalCents),
            currency: String(data.currency || 'AUD').slice(0, 3),
            itemCount: Array.isArray(data.items) ? data.items.length : 0,
          },
        }))
      }
    }

    transaction.create(eventRef, {
      type: eventType,
      orderId,
      sessionId: session.id,
      outcome: transition.action,
      stockRestored,
      // Only the signed HTTP webhook path supplies this value. Manual and
      // scheduled reconciliation can settle orders, but can never be used as
      // proof that the currently installed webhook secret receives events.
      ...(verifiedWebhookFingerprint ? { webhookSecretFingerprint: verifiedWebhookFingerprint } : {}),
      createdAt: FieldValue.serverTimestamp(),
    })
  })
}

async function applyChargeEvent(event: Stripe.Event) {
  const object = event.data.object as {
    payment_intent?: unknown
    amount?: number
    amount_refunded?: number
    status?: string
    result?: string
  }
  const rawIntent = object.payment_intent
  const paymentIntentId = typeof rawIntent === 'string'
    ? rawIntent
    : rawIntent && typeof rawIntent === 'object' && 'id' in rawIntent
      ? String((rawIntent as { id: unknown }).id)
      : undefined
  const eventRef = db.collection('_stripeEvents').doc(event.id)
  await db.runTransaction(async (transaction) => {
    // Event-ID dedupe plus monotonic business state makes replays harmless.
    const recorded = await transaction.get(eventRef)
    if (recorded.exists) return
    if (!paymentIntentId) {
      transaction.create(eventRef, { type: event.type, outcome: 'ignored_missing_payment_intent', createdAt: FieldValue.serverTimestamp() })
      return
    }
    const matches = await transaction.get(db.collection('orders').where('stripePaymentIntentId', '==', paymentIntentId).limit(1))
    const document = matches.docs[0]
    if (!document) {
      transaction.create(eventRef, { type: event.type, paymentIntentId, outcome: 'deferred_unknown_order', pending: true, createdAt: FieldValue.serverTimestamp() })
      return
    }
    const orderId = document.id
    const data = document.data() as DocumentData
    const current = orderStateSnapshot(data)
    const scope: InventoryScope = data.inventoryScope === 'sandbox' ? 'sandbox' : 'operational'

    let patch: Parameters<typeof reconcileOrderState>[1]
    let releaseStock = false
    let outcome = 'applied'
    if (event.type === 'charge.refunded') {
      const amount = Number(object.amount ?? 0)
      const refunded = Number(object.amount_refunded ?? 0)
      const full = amount > 0 && refunded >= amount
      const decision = resolveRefundTransition({
        refundScope: full ? 'full' : 'partial',
        fulfilmentStatus: current.fulfilmentStatus,
        inventoryState: current.inventoryState,
        inventoryScope: scope,
      })
      patch = { paymentState: decision.paymentState ?? undefined, refundStatus: decision.refundStatus, status: decision.status ?? undefined }
      releaseStock = decision.releaseStock
      outcome = decision.reason
    } else if (event.type === 'charge.dispute.created') {
      // A dispute never moves stock: the outcome is still unknown.
      const decision = resolveDisputeTransition({ fulfilmentStatus: current.fulfilmentStatus })
      patch = { paymentState: decision.paymentState, status: decision.status ?? undefined }
      outcome = decision.reason
    } else {
      // charge.dispute.closed: explicit resolution, still never restoring
      // shipped stock automatically.
      const resolved = object.status === 'won' || object.result === 'won'
      if (resolved) {
        patch = { paymentState: 'paid' }
        outcome = 'dispute_won'
      } else {
        const decision = resolveRefundTransition({
          refundScope: 'full',
          fulfilmentStatus: current.fulfilmentStatus,
          inventoryState: current.inventoryState,
          inventoryScope: scope,
        })
        patch = { paymentState: 'refunded', refundStatus: decision.refundStatus, status: decision.status ?? undefined }
        releaseStock = decision.releaseStock
        outcome = 'dispute_lost'
      }
    }

    if (releaseStock && current.inventoryState === 'committed') {
      await restoreReservedStock(transaction, orderId, data)
      patch = { ...patch, inventoryState: 'released' }
    }

    const next = reconcileOrderState(current, patch)
    transaction.update(document.ref, { ...next, updatedAt: FieldValue.serverTimestamp() })
    transaction.create(eventRef, { type: event.type, orderId, outcome, stockRestored: releaseStock, createdAt: FieldValue.serverTimestamp() })
  })
}

async function pollForCreatedSession(orderId: string, waitMs: number) {
  const deadline = Date.now() + Math.min(Math.max(waitMs, 0), creationLeaseMs)
  const orderRef = db.collection('orders').doc(orderId)
  while (Date.now() < deadline) {
    const snapshot = await orderRef.get()
    const sessionId = snapshot.exists ? snapshot.data()?.stripeCheckoutSessionId : undefined
    if (typeof sessionId === 'string') return sessionId
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return null
}

async function assertSessionStillReturnable(orderId: string, uid: string, session: Stripe.Checkout.Session) {
  const snapshot = await db.collection('orders').doc(orderId).get()
  if (!snapshot.exists) return false
  const data = snapshot.data() as DocumentData
  if (data.userId !== uid) return false
  if (data.inventoryState !== 'reserved') return false
  if (data.cancelRequested === true) return false
  if (typeof data.stripeCheckoutSessionId === 'string' && data.stripeCheckoutSessionId !== session.id) return false
  if (session.status !== 'open' || !session.url) return false
  const binding = validateSessionBinding(sessionBindingInput(session), orderBindingSnapshot(orderId, data))
  return binding.ok
}

export const createCheckoutSession = onCall({
  region,
  secrets: [stripeSecretKey, stripeWebhookSecret],
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 20,
}, async (request) => {
  const identity = await requireCheckoutIdentity(request)
  const parsed = checkoutSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'The cart contains invalid items or quantities.')
  const key = stripeSecretKey.value()
  const paymentEnvironment = await assertPaymentMode(key, stripeWebhookSecret.value())
  if (!paymentEnvironmentMatches(parsed.data.expectedPaymentEnvironment, paymentEnvironment)) {
    throw new HttpsError('failed-precondition', 'Checkout configuration changed. Refresh the page before trying again.')
  }
  const orderId = orderIdForAttempt(identity.uid, parsed.data.attemptId)
  const orderDoc = await db.collection('orders').doc(orderId).get()
  if (!orderDoc.exists) await checkRateLimit(`checkout:${identity.uid}`, 6, 15)

  if (paymentEnvironment === 'test') {
    const policy = testCheckoutPolicy()
    const gate = checkTestCheckoutPolicy(policy, identity.uid)
    if (!gate.allowed) {
      throw new HttpsError('permission-denied', 'Sandbox checkout is restricted to approved test accounts.')
    }
    if (!orderDoc.exists) {
      const quota = await checkSandboxQuotaFor(identity.uid, policy)
      if (!quota.allowed) throw new HttpsError('resource-exhausted', 'The sandbox checkout quota has been reached. Please finish or cancel your open checkout first.')
    }
  }

  const origin = safeOrigin(request.rawRequest.get('origin'))
  return coalesce(`create:${orderId}`, async () => {
    const reserved = await reserveOrder(identity.uid, identity.email, orderId, parsed.data.items, paymentEnvironment, origin)
    const client = stripeClient()

    if (reserved.cancelRequested) {
      await releaseOrder(orderId, 'cancelled', 'Customer cancelled during Checkout start')
      throw new HttpsError('cancelled', 'This checkout attempt was cancelled.')
    }

    if (!reserved.leaseClaimed && reserved.waitMs !== undefined) {
      const sessionId = await pollForCreatedSession(orderId, reserved.waitMs)
      if (!sessionId) throw new HttpsError('failed-precondition', 'Checkout is still starting. Please try again in a moment.')
      const session = await client.checkout.sessions.retrieve(sessionId)
      if (await assertSessionStillReturnable(orderId, identity.uid, session) && session.url) {
        return { orderId, url: session.url, mode: paymentEnvironment }
      }
      throw new HttpsError('failed-precondition', 'This checkout attempt has ended. Return to your cart and try again.')
    }

    if (reserved.sessionId) {
      const existing = await client.checkout.sessions.retrieve(reserved.sessionId)
      if (existing.status === 'open' && existing.url && await assertSessionStillReturnable(orderId, identity.uid, existing)) {
        return { orderId, url: existing.url, mode: paymentEnvironment }
      }
      throw new HttpsError('failed-precondition', 'This checkout attempt has ended. Return to your cart and try again.')
    }

    // Strict state recheck before we spend a Stripe call: the reservation may
    // have been cancelled or consumed while this invocation was queued.
    const beforeCreate = await db.collection('orders').doc(orderId).get()
    const beforeData = beforeCreate.exists ? beforeCreate.data() as DocumentData : null
    if (!beforeData || beforeData.userId !== identity.uid || beforeData.inventoryState !== 'reserved' || beforeData.cancelRequested === true) {
      if (beforeData?.inventoryState === 'reserved') await releaseOrder(orderId, 'cancelled', 'Customer cancelled during Checkout start')
      throw new HttpsError('failed-precondition', 'This checkout attempt has ended. Return to your cart and try again.')
    }

    const params = replaySessionParams(orderId, beforeData)
    if (!params) throw new HttpsError('failed-precondition', 'This checkout attempt has ended. Return to your cart and try again.')
    try {
      const session = await client.checkout.sessions.create(params, { idempotencyKey: `checkout_${orderId}` })
      if (!session.url) throw new Error('Stripe did not return a Checkout URL.')
      const persisted = await persistSessionId(orderId, identity.uid, session)
      if (!persisted) {
        await safeExpireSession(client, session.id)
        await releaseOrder(orderId, 'cancelled', 'Checkout was cancelled while the session was starting')
        throw new HttpsError('failed-precondition', 'This checkout attempt has ended. Return to your cart and try again.')
      }
      return { orderId, url: session.url, mode: paymentEnvironment }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      logger.error('Stripe Checkout Session creation failed.', {
        orderId,
        errorType: error instanceof Error ? error.name : typeof error,
      })
      // The create() outcome is uncertain: reconcile before releasing anything.
      const snapshot = await db.collection('orders').doc(orderId).get()
      const data = snapshot.exists ? snapshot.data() as DocumentData : null
      const stillOpen = Boolean(data && data.inventoryState === 'reserved' && data.userId === identity.uid)
      if (!data || !stillOpen) {
        throw new HttpsError('internal', 'Secure checkout could not be started. Your cart has not been charged.')
      }
      const replay = await reconcileCreationByReplay(client, orderId, data)
      const outcome = replay.outcome === 'unknown'
        ? ({ action: 'defer' } as const)
        : resolveCreationOutcome({
          sessions: replay.outcome === 'session'
            ? [{ id: replay.session.id, status: replay.session.status, payment_status: replay.session.payment_status }]
            : [],
          orderStillOpen: true,
        })
      if (outcome.action === 'adopt' && replay.outcome === 'session') {
        const adopted = replay.session
        if (adopted.url && await persistSessionId(orderId, identity.uid, adopted) && await assertSessionStillReturnable(orderId, identity.uid, adopted)) {
          return { orderId, url: adopted.url, mode: paymentEnvironment }
        }
        await safeExpireSession(client, adopted.id)
      }
      if (outcome.action === 'release') {
        await releaseOrder(orderId, 'checkout_failed', 'Checkout Session creation failed')
      }
      // 'unknown' keeps the reservation: the expiry sweep reconciles it later.
      throw new HttpsError('internal', 'Secure checkout could not be started. Your cart has not been charged.')
    }
  })
})

/**
 * Rebuilds the exact Stripe creation request for an order. Everything that is
 * request-dependent (origin, integration id, expiry, line items, metadata) is
 * persisted on the order at reservation time, so a retry or reconciliation is
 * byte-identical and therefore idempotent on Stripe's side.
 */
function replaySessionParams(orderId: string, data: DocumentData): Stripe.Checkout.SessionCreateParams | null {
  const persisted = data.stripeCreationParams as PersistedCreationParams | undefined
  const items: StoredOrder = Array.isArray(data.items) ? data.items as StoredOrder : []
  const rawItems = persisted?.lineItems ?? items.map((item) => ({
    quantity: item.quantity,
    unitAmountCents: item.unitPriceCents,
    name: item.name,
  }))
  if (rawItems.length === 0) return null
  const expiresAtSec = persisted?.expiresAtSec
    ?? (data.expiresAt instanceof Timestamp ? Math.floor(data.expiresAt.toMillis() / 1000) : NaN)
  if (!Number.isFinite(expiresAtSec)) return null
  const origin = persisted?.origin ?? safeOrigin(undefined)
  const userId = String(data.userId ?? '')
  const metadata = persisted?.metadata ?? {
    orderId,
    firebaseUid: userId,
    paymentEnvironment: String(data.paymentEnvironment ?? 'test'),
  }
  return {
    mode: 'payment',
    client_reference_id: orderId,
    customer_email: persisted?.customerEmail || String(data.customerEmail ?? '') || undefined,
    integration_identifier: persisted?.integrationIdentifier ?? integrationIdentifier(),
    line_items: rawItems.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: 'aud',
        unit_amount: line.unitAmountCents,
        product_data: { name: line.name },
      },
    })),
    metadata: { ...metadata },
    payment_intent_data: { metadata: { orderId, firebaseUid: metadata.firebaseUid || userId } },
    success_url: `${origin}/checkout/success?order=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/cancelled?order=${encodeURIComponent(orderId)}`,
    expires_at: expiresAtSec,
  }
}

async function persistSessionId(orderId: string, uid: string, session: Stripe.Checkout.Session) {
  const orderRef = db.collection('orders').doc(orderId)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists) return false
    const data = snapshot.data() as DocumentData
    if (data.userId !== uid) return false
    if (data.inventoryState !== 'reserved') return false
    if (data.cancelRequested === true) return false
    if (typeof data.stripeCheckoutSessionId === 'string' && data.stripeCheckoutSessionId !== session.id) return false
    const binding = validateSessionBinding(sessionBindingInput(session), orderBindingSnapshot(orderId, data))
    if (!binding.ok) return false
    transaction.update(orderRef, {
      stripeCheckoutSessionId: session.id,
      stripeCheckoutStatus: session.status,
      creationLeaseUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return true
  })
}

async function safeExpireSession(client: Stripe, sessionId: string) {
  try {
    const session = await client.checkout.sessions.retrieve(sessionId)
    if (session.status === 'open') await client.checkout.sessions.expire(sessionId)
  } catch (error) {
    logger.warn('Could not expire an orphaned Checkout Session.', {
      sessionId,
      errorType: error instanceof Error ? error.name : typeof error,
    })
  }
}

async function checkSandboxQuotaFor(uid: string, policy: TestCheckoutPolicy) {
  const base = db.collection('orders').where('inventoryScope', '==', 'sandbox').where('inventoryState', '==', 'reserved')
  const userDocs = await base.where('userId', '==', uid).limit(policy.perUserQuota + 1).get()
  if (userDocs.docs.length >= policy.perUserQuota + 1) return { allowed: false, reason: 'per_user_quota' }
  const globalDocs = await base.limit(policy.globalQuota + 1).get()
  return checkSandboxQuota(policy, { userActive: userDocs.docs.length, globalActive: globalDocs.docs.length })
}

export const cancelCheckoutSession = onCall({
  region,
  secrets: [stripeSecretKey],
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 20,
}, async (request) => {
  const identity = await requireCheckoutIdentity(request)
  const parsed = cancelCheckoutSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A valid order is required.')
  const orderId = parsed.data.orderId
  const cached = readTerminalCancel(orderId)
  if (cached) return cached
  return coalesce(`cancel:${orderId}`, async () => {
    const order = await db.collection('orders').doc(orderId).get()
    if (!order.exists || order.data()?.userId !== identity.uid) throw new HttpsError('not-found', 'Checkout was not found.')
    const data = order.data() as DocumentData
    const sessionId = data.stripeCheckoutSessionId
    const client = stripeClient()

    if (typeof sessionId !== 'string') {
      const leaseUntil = data.creationLeaseUntil instanceof Timestamp ? data.creationLeaseUntil.toMillis() : 0
      const creating = String(data.stripeCheckoutStatus ?? '') === 'creating' && leaseUntil > Date.now()
      if (creating) {
        // Cancellation during creation only *requests* cancellation; releasing
        // now could hand stock back while a payable session is being created.
        await db.collection('orders').doc(orderId).update({
          cancelRequested: true,
          updatedAt: FieldValue.serverTimestamp(),
        })
        return { cancelled: false, processing: true }
      }
      // No session and no live lease: reconcile before releasing anything.
      const replay = await reconcileCreationByReplay(client, orderId, data)
      if (replay.outcome === 'unknown') return { cancelled: false, processing: true }
      if (replay.outcome === 'session') {
        const session = replay.session
        const paid = session.payment_status === 'paid'
          || session.payment_status === 'no_payment_required'
          || session.status === 'complete'
        if (paid) {
          // Money was taken: cancelling must never hand stock back.
          await applyCheckoutEvent(`manual_${session.id}_paid`, 'checkout.session.completed', session)
          const terminal = { cancelled: false, paid: true }
          writeTerminalCancel(orderId, terminal)
          return terminal
        }
        if (session.status === 'open') await client.checkout.sessions.expire(session.id)
      }
      await releaseOrder(orderId, 'cancelled', 'Customer cancelled before redirect')
      const terminal = { cancelled: true }
      writeTerminalCancel(orderId, terminal)
      return terminal
    }

    const session = await client.checkout.sessions.retrieve(sessionId)
    if (session.status === 'open') {
      const binding = validateSessionBinding(sessionBindingInput(session), orderBindingSnapshot(orderId, data))
      if (!binding.ok) return { cancelled: false, processing: true }
      await client.checkout.sessions.expire(sessionId)
      await releaseOrder(orderId, 'cancelled', 'Customer cancelled Checkout')
      const terminal = { cancelled: true }
      writeTerminalCancel(orderId, terminal)
      return terminal
    }
    if (session.status === 'expired') {
      await releaseOrder(orderId, 'cancelled', 'Checkout expired')
      const terminal = { cancelled: true }
      writeTerminalCancel(orderId, terminal)
      return terminal
    }
    if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      await applyCheckoutEvent(`manual_${session.id}_paid`, 'checkout.session.completed', session)
      const terminal = { cancelled: false, paid: true }
      writeTerminalCancel(orderId, terminal)
      return terminal
    }
    return { cancelled: false, processing: true }
  })
})

interface LaunchPrerequisites {
  webhookValidated: boolean
  evidence?: { webhookDeliveryId?: string; webhookEventType?: string; webhookReceivedAt?: string; testOrderRef?: string }
  validatedBy?: string
  validatedAt?: unknown
}

function webhookSecretFingerprint(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

async function loadLaunchPrerequisites(expectedWebhookFingerprint?: string): Promise<LaunchPrerequisites> {
  const snapshot = await db.collection('commerceConfig').doc('launchPrerequisites').get()
  const data = snapshot.exists ? (snapshot.data() as DocumentData) : undefined
  if (!data || data.webhookValidated !== true || typeof data.evidence !== 'object' || data.evidence === null) {
    return { webhookValidated: false }
  }
  const evidence = data.evidence as DocumentData
  const complete = ['webhookDeliveryId', 'webhookEventType', 'webhookReceivedAt', 'testOrderRef']
    .every((key) => typeof evidence[key] === 'string' && String(evidence[key]).trim().length > 0)
  const fingerprintMatches = !expectedWebhookFingerprint
    || (typeof data.webhookSecretFingerprint === 'string' && data.webhookSecretFingerprint === expectedWebhookFingerprint)
  if (!complete || !fingerprintMatches) return { webhookValidated: false, evidence: evidence as LaunchPrerequisites['evidence'] }
  return {
    webhookValidated: true,
    evidence: evidence as LaunchPrerequisites['evidence'],
    validatedBy: typeof data.validatedBy === 'string' ? data.validatedBy : undefined,
    validatedAt: data.validatedAt,
  }
}

function webhookSecretLooksConfigured(secret: string) {
  return secret.startsWith('whsec_') && !secret.startsWith('whsec_placeholder_') && secret.length > 12
}

export const getCommerceStatus = onCall({
  region,
  secrets: [stripeSecretKey, stripeWebhookSecret],
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  await requireAdministrator(request)
  const keyIsLive = isLiveStripeKey(stripeSecretKey.value())
  const secretConfigured = webhookSecretLooksConfigured(stripeWebhookSecret.value())
  const settings = await db.collection('commerceConfig').doc('main').get()
  const prerequisites = await loadLaunchPrerequisites(webhookSecretFingerprint(stripeWebhookSecret.value()))
  const livePaymentsEnabled = settings.data()?.livePaymentsEnabled === true
  return {
    paymentEnvironment: keyIsLive ? 'live' as const : 'test' as const,
    livePaymentsEnabled,
    // A whsec_ prefix alone is not evidence that a webhook was validated.
    webhookSecretConfigured: secretConfigured,
    webhookValidated: prerequisites.webhookValidated,
    launchEvidence: prerequisites.evidence ?? null,
    readyForLiveActivation: keyIsLive && secretConfigured && prerequisites.webhookValidated,
    livePaymentsActuallyAllowed: keyIsLive && secretConfigured && prerequisites.webhookValidated && livePaymentsEnabled,
  }
})

export const recordLaunchPrerequisites = onCall({
  region,
  secrets: [stripeSecretKey, stripeWebhookSecret],
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  // Production-affecting configuration: administrator plus the shared
  // dashboard reauthentication window, recorded against the operator's UID.
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS,
    loadRole: true,
  })
  if (!caller.admin && caller.role !== 'owner') throw new HttpsError('permission-denied', 'Administrator access is required.')
  const parsed = launchPrerequisitesSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'The launch evidence is incomplete.')
  if (!isLiveStripeKey(stripeSecretKey.value())) {
    throw new HttpsError('failed-precondition', 'A live Stripe key must be installed before launch evidence can be recorded.')
  }
  if (!webhookSecretLooksConfigured(stripeWebhookSecret.value())) {
    throw new HttpsError('failed-precondition', 'The Stripe webhook signing secret is not installed on this deployment.')
  }
  const [eventSnapshot, orderSnapshot] = await Promise.all([
    db.collection('_stripeEvents').doc(parsed.data.webhookDeliveryId).get(),
    db.collection('orders').doc(parsed.data.testOrderRef).get(),
  ])
  if (!eventSnapshot.exists || !orderSnapshot.exists) {
    throw new HttpsError('failed-precondition', 'The launch evidence does not match a recorded Stripe event and order.')
  }
  const eventData = eventSnapshot.data() as DocumentData
  const orderData = orderSnapshot.data() as DocumentData
  const eventTimestamp = eventData.createdAt instanceof Timestamp ? eventData.createdAt : null
  const claimedTimestamp = Date.parse(parsed.data.webhookReceivedAt)
  const timestampMatches = eventTimestamp !== null
    && Number.isFinite(claimedTimestamp)
    && Math.abs(eventTimestamp.toMillis() - claimedTimestamp) <= 5 * 60 * 1000
  const eventMatches = eventData.type === parsed.data.webhookEventType
    && eventData.orderId === parsed.data.testOrderRef
    && eventData.outcome === 'commit'
    && eventData.webhookSecretFingerprint === webhookSecretFingerprint(stripeWebhookSecret.value())
    && typeof eventData.sessionId === 'string'
    && eventData.sessionId === orderData.stripeCheckoutSessionId
  const paidOrderMatches = orderData.paymentEnvironment === 'live'
    && ['paid', 'fulfilled'].includes(String(orderData.status ?? ''))
    && String(orderData.paymentState ?? orderData.paymentStatus ?? '') === 'paid'
  if (eventTimestamp === null || !timestampMatches || !eventMatches || !paidOrderMatches) {
    throw new HttpsError('failed-precondition', 'The launch evidence is not a verified live payment handled by this webhook deployment.')
  }
  await db.collection('commerceConfig').doc('launchPrerequisites').set({
    webhookValidated: true,
    evidence: {
      webhookDeliveryId: parsed.data.webhookDeliveryId,
      webhookEventType: parsed.data.webhookEventType,
      webhookReceivedAt: eventTimestamp.toDate().toISOString(),
      testOrderRef: parsed.data.testOrderRef,
    },
    validatedBy: caller.uid,
    // Bind launch evidence to the installed signing secret without storing it.
    // Rotating the secret safely invalidates approval until it is re-tested.
    webhookSecretFingerprint: webhookSecretFingerprint(stripeWebhookSecret.value()),
    validatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { recorded: true }
})

export const setLivePaymentsEnabled = onCall({
  region,
  secrets: [stripeSecretKey, stripeWebhookSecret],
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  await requireAdministrator(request)
  const enabled = request.data?.enabled
  const confirmation = request.data?.confirmation
  if (typeof enabled !== 'boolean' || (enabled && confirmation !== 'ENABLE LIVE PAYMENTS')) {
    throw new HttpsError('invalid-argument', 'The live-payment confirmation is invalid.')
  }
  if (enabled) {
    const keyIsLive = isLiveStripeKey(stripeSecretKey.value())
    const secretConfigured = webhookSecretLooksConfigured(stripeWebhookSecret.value())
    const prerequisites = await loadLaunchPrerequisites(webhookSecretFingerprint(stripeWebhookSecret.value()))
    // Fail closed: a webhook secret prefix is never treated as validation.
    if (!keyIsLive || !secretConfigured || !prerequisites.webhookValidated) {
      throw new HttpsError('failed-precondition', 'Live Stripe credentials plus recorded, operator-verified webhook evidence are required before activation.')
    }
  }
  await db.collection('commerceConfig').doc('main').set({
    livePaymentsEnabled: enabled,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth?.uid,
  }, { merge: true })
  return { livePaymentsEnabled: enabled }
})

const sessionEvents = new Set<CheckoutEventType>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
])

export const stripeWebhook = onRequest({
  region,
  secrets: [stripeSecretKey, stripeWebhookSecret],
  invoker: 'public',
  maxInstances: 20,
}, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).send('Method not allowed')
    return
  }
  const signature = request.get('stripe-signature')
  if (!signature) {
    response.status(400).send('Missing Stripe signature')
    return
  }
  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value())
  } catch {
    response.status(400).send('Invalid Stripe signature')
    return
  }
  try {
    if (sessionEvents.has(event.type as CheckoutEventType)) {
      await applyCheckoutEvent(
        event.id,
        event.type as CheckoutEventType,
        event.data.object as Stripe.Checkout.Session,
        webhookSecretFingerprint(stripeWebhookSecret.value()),
      )
    } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
      await applyChargeEvent(event)
    }
  } catch (error) {
    // Never acknowledge an event we failed to persist: Stripe will retry.
    logger.error('Stripe webhook handling failed.', {
      eventId: event.id,
      type: event.type,
      errorType: error instanceof Error ? error.name : typeof error,
    })
    response.status(500).send('Webhook handling failed')
    return
  }
  response.status(200).json({ received: true })
})

async function reconcileExpiredReservation(client: Stripe, orderId: string, data: DocumentData): Promise<string> {
  const sessionId = typeof data.stripeCheckoutSessionId === 'string' ? data.stripeCheckoutSessionId : null
  if (!sessionId) {
    // Uncertain creation: reconcile before touching stock. The replay only
    // adopts an existing session or proves none exists; an unknowable outcome
    // defers the order to the next sweep instead of releasing blindly.
    const replay = await reconcileCreationByReplay(client, orderId, data)
    if (replay.outcome === 'unknown') return 'deferred'
    if (replay.outcome === 'session') return settleExpiredSession(client, orderId, replay.session)
    await releaseOrder(orderId, 'cancelled', 'Checkout reservation expired')
    return 'released'
  }
  const session = await client.checkout.sessions.retrieve(sessionId)
  return settleExpiredSession(client, orderId, session)
}

async function settleExpiredSession(client: Stripe, orderId: string, session: Stripe.Checkout.Session): Promise<string> {
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    // Delayed/async payment must win over the expiry sweep.
    await applyCheckoutEvent(`reconcile_${session.id}`, 'checkout.session.completed', session)
    return 'settled'
  }
  if (session.status === 'open') {
    try {
      await client.checkout.sessions.expire(session.id)
    } catch (error) {
      logger.warn('Could not expire an open Checkout Session.', { orderId, errorType: error instanceof Error ? error.name : typeof error })
      return 'deferred'
    }
    await releaseOrder(orderId, 'cancelled', 'Checkout reservation expired')
    return 'released'
  }
  if (session.status === 'expired') {
    await releaseOrder(orderId, 'cancelled', 'Checkout reservation expired')
    return 'released'
  }
  // complete-but-unpaid or unknown: leave the reservation for the next sweep.
  return 'deferred'
}

export const releaseExpiredCheckoutReservations = onSchedule({
  region,
  schedule: 'every 10 minutes',
  timeZone: 'Australia/Sydney',
  secrets: [stripeSecretKey],
}, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000)
  const pageSize = 100
  const actionable = await collectCleanupBatch<QueryDocumentSnapshot<DocumentData>>(async (cursor) => {
    let query = db.collection('orders')
      .where('inventoryState', '==', 'reserved')
      .where('expiresAt', '<=', cutoff)
      .orderBy('expiresAt', 'asc')
      .limit(pageSize)
    if (cursor) query = query.startAfter(cursor as QueryDocumentSnapshot<DocumentData>)
    const page = await query.get()
    const last = page.docs[page.docs.length - 1]
    return { docs: page.docs, cursor: page.docs.length === pageSize ? last : null }
  }, { pageSize, maxPages: 5, isActionable: (document) => isActionableReservation(document.data()) })

  if (!actionable.length) return
  const client = stripeClient()
  const settled = await Promise.all(actionable.map(async (document) => {
    try {
      return await reconcileExpiredReservation(client, document.id, document.data())
    } catch (error) {
      logger.warn('Deferred an unverifiable expired reservation.', {
        orderId: document.id,
        errorType: error instanceof Error ? error.name : typeof error,
      })
      return 'deferred'
    }
  }))
  const counts = settled.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1
    return accumulator
  }, {})
  logger.info('Reconciled expired Checkout reservations.', { total: actionable.length, ...counts })
})
