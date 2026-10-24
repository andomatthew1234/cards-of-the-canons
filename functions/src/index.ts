import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore'
import { defineString } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defaultDeletionEnvironment, runAccountDeletion } from './accountDeletion'
import { accountRole, assertAccountActionAllowed, authorizeRequest, countOwnerAccounts, requireAdminContext, type CallableRequestLike } from './authorization'
import { analyticsAccepts, analyticsEnabledParam, analyticsRetentionDaysParam, prepareAnalyticsEvent, resolveRetentionDays } from './analyticsPipeline'
import { isAllowedAdminStatusTransition, normalizeOrderStatus, resolveStockReturn } from './commerceInvariants'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'
import { isSandboxOrder, shouldRestoreDismissedOrderInventory } from './orderAdmin'
import { normaliseSecurityPolicy, securityCapabilities } from './securityPolicy'
import { accountAdminActionSchema, bootstrapUidList, dismissTestOrderSchema, enquirySchema, listAccountsSchema, orderFulfilmentSchema } from './validation'

export { cancelCheckoutSession, createCheckoutSession, getCommerceStatus, recordLaunchPrerequisites, releaseExpiredCheckoutReservations, setLivePaymentsEnabled, stripeWebhook } from './checkout'
export { removeExpiredAnalyticsEvents } from './analyticsPipeline'
export { recordLoginActivity, recordProfileActivity, recordSecurityActivity, removeExpiredAccountActivity } from './accountActivity'
export {
  confirmNewsletterSubscription, getMyMailingListStatus, joinAccountMailingList,
  leaveAccountMailingList, removeExpiredNewsletterRecords, subscribeNewsletter, unsubscribeNewsletter,
} from './newsletter'
export {
  deleteNewsletterCampaign, listNewsletterCampaigns, resendNewsletterWebhook,
  saveNewsletterCampaign, sendNewsletterCampaign, sendNewsletterTest,
  suppressNewsletterSubscriber,
} from './newsletterCampaigns'
export { publishStagedImage } from './images'
export { deleteJournalArticle, listJournalArticlesAdmin, publishJournalArticle, retryJournalNotification, saveJournalArticle } from './journal'
export {
  cancelScheduledEmailCampaign, deleteEmailCampaign, listEmailCampaignWorkspace,
  processScheduledEmailCampaigns, queueEmailCampaign, retryEmailCampaign,
  saveEmailCampaign, sendEmailCampaignTest,
} from './emailCampaigns'
export {
  deleteWebsiteMedia, getWebsiteContentEditorState, listWebsiteContentVersions,
  listWebsiteMedia, publishWebsiteContent, restoreWebsiteContentVersion,
  saveWebsiteContentDraft,
} from './websiteContent'
export { resumeAccountDeletions } from './accountDeletion'
export { updateMyProfile } from './profile'
export { beginAccountOnboarding, completeAccountOnboarding } from './onboarding'
export { deleteCommunitySurvey, saveCommunitySurvey, submitCommunityResponse } from './community'
export {
  generateTreasuryCodeBatch, getMyTreasury, getTreasuryAdminState, redeemTreasuryCode,
  revokeTreasuryCodeBatch, saveTreasuryCard, saveTreasuryEdition,
} from './treasury'

const region = 'australia-southeast1'

// Explicit, bounded, UID-based administrator provisioning. Empty by default so
// the path fails closed until an operator configures specific UIDs. Mailbox
// addresses are never consulted anywhere in this codebase.
const administratorBootstrapUids = defineString('ADMIN_BOOTSTRAP_UIDS', { default: '' })

function clientKey(rawIp: string | undefined) {
  return rawIp?.slice(0, 80) || 'unknown-client'
}

export const submitEnquiry = onCall({ region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async (request) => {
  const parsed = enquirySchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Please check the enquiry fields.')
  await checkRateLimit(`enquiry:${clientKey(request.rawRequest.ip)}`, 8)
  await db.collection('enquiries').add({ ...parsed.data, status: 'new', createdAt: FieldValue.serverTimestamp() })
  return { accepted: true }
})

// Newsletter consent is handled entirely by ./newsletter: pending/double
// opt-in with hashed, single-use, expiring mailbox tokens, append-only consent
// evidence and token-based unsubscribe. No endpoint assumes a mail sender.

export const recordAnalyticsEvent = onCall({
  region,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 20,
}, async (request) => {
  // Fail closed: with analytics unconfigured (the default) nothing is stored,
  // and the caller is told plainly instead of events quietly accumulating.
  if (!analyticsAccepts(analyticsEnabledParam.value())) {
    throw new HttpsError('failed-precondition', 'Analytics is disabled on this site.')
  }
  const raw = typeof request.data === 'object' && request.data !== null ? request.data as Record<string, unknown> : {}
  // Server-owned normalisation: route-template allowlist, identifier shape
  // checks and a real-product existence check before anything is persisted.
  const normalised = await prepareAnalyticsEvent(raw, {
    productExists: async (productId) => (await db.collection('products').doc(productId).get()).exists,
  })
  await checkRateLimit(`analytics:${clientKey(request.rawRequest.ip)}`, 500, 60)
  const nowMillis = Date.now()
  await db.collection('analyticsEvents').add({
    ...normalised,
    createdAt: FieldValue.serverTimestamp(),
    // Bounded retention, enforced by the scheduled cleanup below.
    expiresAt: Timestamp.fromMillis(nowMillis + resolveRetentionDays(analyticsRetentionDaysParam.value()) * 24 * 60 * 60 * 1000),
  })
  return { accepted: true }
})

// Administrator functions require a server-issued custom claim, a current
// (revocation-checked) session and a valid App Check token in production.
// Emulators remain usable for local testing.
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }

export const provisionAdministrator = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireVerifiedEmail: true })
  const configured = bootstrapUidList(administratorBootstrapUids.value())
  if (!configured.includes(caller.uid)) return { eligible: false, updated: false }
  if (caller.admin) return { eligible: true, updated: false }
  const account = await getAuth().getUser(caller.uid)
  await getAuth().setCustomUserClaims(account.uid, { ...(account.customClaims ?? {}), admin: true })
  // A newly issued role must not wait for old tokens to expire.
  await getAuth().revokeRefreshTokens(account.uid)
  return { eligible: true, updated: true }
})

export const listUserAccounts = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = listAccountsSchema.safeParse(request.data ?? {})
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A valid page token is required.')
  const result = await getAuth().listUsers(100, parsed.data.pageToken)
  const controls = await Promise.all(result.users.map((account) => db.collection('accountControls').doc(account.uid).get()))
  const roles = await Promise.all(result.users.map((account) => db.collection('accountRoles').doc(account.uid).get()))
  return {
    accounts: result.users.map((account, index) => {
      const control = controls[index].exists ? controls[index].data() : undefined
      const role = roles[index].exists ? accountRole(roles[index].data()) : null
      return {
        uid: account.uid,
        email: account.email ?? null,
        displayName: account.displayName ?? null,
        disabled: account.disabled || control?.disabled === true || control?.deleted === true,
        emailVerified: account.emailVerified,
        providers: account.providerData.map((provider) => provider.providerId),
        createdAt: account.metadata.creationTime,
        lastSignInAt: account.metadata.lastSignInTime ?? null,
        admin: account.customClaims?.admin === true,
        owner: role === 'owner',
      }
    }),
    nextPageToken: result.pageToken ?? null,
  }
})

export const getAccountSecurityPolicy = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  const snapshot = await db.collection('accountSecurity').doc(caller.uid).get()
  return {
    policy: normaliseSecurityPolicy(snapshot.exists ? snapshot.data() : null),
    capabilities: securityCapabilities,
  }
})

export const manageUserAccount = onCall(protectedOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = accountAdminActionSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A valid account action is required.')
  const { uid, action } = parsed.data

  let target
  try {
    target = await getAuth().getUser(uid)
  } catch (error) {
    const failure = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
    if (failure === 'auth/user-not-found') throw new HttpsError('not-found', 'That account no longer exists.')
    throw error
  }

  const controlSnapshot = await db.collection('accountControls').doc(uid).get()
  const control = controlSnapshot.exists ? controlSnapshot.data() : undefined
  const roleSnapshot = await db.collection('accountRoles').doc(uid).get()
  const targetRole = roleSnapshot.exists ? accountRole(roleSnapshot.data()) : null

  // Owner and last-owner protection is enforced here, on the server, before
  // any state changes; the rules mirror it for client-driven writes.
  assertAccountActionAllowed({
    action,
    callerUid: caller.uid,
    targetUid: uid,
    callerRole: caller.role,
    targetRole,
    targetIsAdmin: target.customClaims?.admin === true,
    ownerCount: await countOwnerAccounts(),
  })

  if (action === 'enable' && control?.deleted === true) {
    throw new HttpsError('failed-precondition', 'Deleted accounts stay closed. Create a new account instead.')
  }
  if (action === 'enable' && control?.deletionState === 'pending') {
    throw new HttpsError('failed-precondition', 'This account is still being deleted.')
  }

  if (action === 'disable' || action === 'enable') {
    await getAuth().updateUser(uid, { disabled: action === 'disable' })
    // Server-owned control record: rules and Storage read this immediately, so
    // a blocked account loses access without waiting for token expiry.
    await db.collection('accountControls').doc(uid).set({
      disabled: action === 'disable',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    // Existing refresh tokens must stop working the moment access is blocked.
    await getAuth().revokeRefreshTokens(uid)
  }

  if (action === 'revokeAdmin') {
    const claims = { ...(target.customClaims ?? {}) }
    delete claims.admin
    await getAuth().setCustomUserClaims(uid, claims)
    if (roleSnapshot.exists && targetRole !== 'owner') {
      await db.collection('accountRoles').doc(uid).set({
        role: 'member',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
      }, { merge: true })
    }
    // Demotion takes effect immediately for sessions that already hold a token.
    await getAuth().revokeRefreshTokens(uid)
  }

  if (action === 'delete') {
    // Tombstone first and resumable; orders are preserved by design.
    await runAccountDeletion(uid, defaultDeletionEnvironment())
  }

  return { updated: true }
})

export const updateOrderFulfilment = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = orderFulfilmentSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A valid order and fulfilment status are required.')
  const ref = db.collection('orders').doc(parsed.data.orderId)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new HttpsError('not-found', 'Order not found.')
    const data = snapshot.data() as DocumentData
    const current = normalizeOrderStatus(data.status)
    const next = parsed.data.status
    // Monotonic, operator-only transition: `fulfilled` and `cancelled` are
    // preserved exactly as before and can never be reached from a webhook.
    if (!isAllowedAdminStatusTransition(current, next)) {
      throw new HttpsError('failed-precondition', 'This order status transition is not allowed.')
    }
    // Cancelling a captured, never-shipped order returns its operational stock
    // exactly once. Shipped stock is never restored automatically.
    const cancelling = current === 'paid' && next === 'cancelled'
    const canReturnStock = cancelling
      && data.inventoryState === 'committed'
      && data.inventoryScope !== 'sandbox'
      && data.fulfilmentStatus !== 'fulfilled'
    if (canReturnStock) {
      const items = Array.isArray(data.items) ? (data.items as Array<{ productId?: unknown; quantity?: unknown; inventoryTracked?: unknown; productCreateTimeMillis?: unknown }>) : []
      const tracked = items.filter((item) => item && item.inventoryTracked === true)
      const productRefs = tracked.map((item) => db.collection('products').doc(String(item.productId)))
      const products = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
      tracked.forEach((item, index) => {
        const product = products[index]
        const decision = resolveStockReturn(
          {
            quantity: Number(item.quantity),
            inventoryTracked: true,
            productCreateTimeMillis: typeof item.productCreateTimeMillis === 'number' ? item.productCreateTimeMillis : null,
          },
          product.exists
            ? {
              exists: true,
              createTimeMillis: product.createTime ? product.createTime.toMillis() : null,
              stock: typeof product.data()?.stock === 'number' ? product.data()!.stock : null,
            }
            : null,
        )
        if (decision.apply) {
          transaction.update(productRefs[index], { stock: FieldValue.increment(decision.delta), updatedAt: FieldValue.serverTimestamp() })
        }
        transaction.set(db.collection('_stockLedger').doc(`${parsed.data.orderId}_${String(item.productId)}`), {
          orderId: parsed.data.orderId,
          productId: String(item.productId),
          delta: decision.apply ? decision.delta : 0,
          reason: decision.reason,
          scope: 'operational',
          source: 'admin_cancel',
          recordedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      })
    }
    transaction.update(ref, {
      status: next,
      fulfilmentStatus: next === 'fulfilled' ? 'fulfilled' : next === 'cancelled' ? 'cancelled' : 'unfulfilled',
      ...(canReturnStock ? { inventoryState: 'released' } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      fulfilledBy: request.auth?.uid,
    })
  })
  return { updated: true }
})

export const dismissTestOrder = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = dismissTestOrderSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A valid test order is required.')
  const orderRef = db.collection('orders').doc(parsed.data.orderId)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'Order not found.')
    const data = snapshot.data() ?? {}
    if (!isSandboxOrder(data.paymentEnvironment)) {
      throw new HttpsError('failed-precondition', 'Only sandbox test orders can be dismissed.')
    }
    const items = Array.isArray(data.items) ? data.items : []
    const trackedItems = shouldRestoreDismissedOrderInventory(data.paymentEnvironment, data.inventoryState, data.inventoryScope)
      ? items.filter((item): item is { productId: string; quantity: number; inventoryTracked: true; productCreateTimeMillis?: number | null } => (
        item?.inventoryTracked === true
        && typeof item.productId === 'string'
        && Number.isSafeInteger(item.quantity)
        && item.quantity > 0
        && item.quantity <= 20
      ))
      : []
    const productRefs = trackedItems.map((item) => db.collection('products').doc(item.productId))
    const productSnapshots = await Promise.all(productRefs.map((reference) => transaction.get(reference)))
    trackedItems.forEach((item, index) => {
      const product = productSnapshots[index]
      const decision = resolveStockReturn(
        item,
        product.exists
          ? {
            exists: true,
            createTimeMillis: product.createTime ? product.createTime.toMillis() : null,
            stock: typeof product.data()?.stock === 'number' ? product.data()!.stock : null,
          }
          : null,
      )
      if (decision.apply) {
        transaction.update(productRefs[index], { stock: FieldValue.increment(decision.delta), updatedAt: FieldValue.serverTimestamp() })
      }
      transaction.set(db.collection('_stockLedger').doc(`${parsed.data.orderId}_${item.productId}`), {
        orderId: parsed.data.orderId,
        productId: item.productId,
        delta: decision.apply ? decision.delta : 0,
        reason: decision.reason,
        scope: 'operational',
        source: 'dismiss_test_order',
        recordedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })
    transaction.delete(orderRef)
  })
  return { dismissed: true }
})

export const deleteMyAccount = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireRecentAuthSeconds: 5 * 60,
    loadRole: true,
  })
  if (caller.role === 'owner' && (await countOwnerAccounts()) <= 1) {
    throw new HttpsError('failed-precondition', 'The last owner account cannot be deleted. Transfer ownership first.')
  }
  await runAccountDeletion(caller.uid, defaultDeletionEnvironment())
  return { deleted: true }
})
