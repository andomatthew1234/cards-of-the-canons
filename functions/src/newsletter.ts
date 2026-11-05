import { createHash, randomBytes } from 'node:crypto'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { db } from './firebase'
import { authorizeRequest, type CallableRequestLike, type CallerContext } from './authorization'
import { deliver, mailTransportParam, publicSiteOriginParam } from './mailTransport'
import { checkRateLimit } from './rateLimit'
import { ensureNewsletterSegment, resendApiKey, syncNewsletterContact } from './resendProvider'
import { accountNewsletterSchema, newsletterSchema, newsletterTokenSchema, type NewsletterSource } from './validation'

const region = 'australia-southeast1'
const options = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true', secrets: [resendApiKey] }
const confirmationTokenTtlDays = 7

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed'
export type ConsentAction = 'requested' | 'confirmed' | 'unsubscribed'

function clientKey(rawIp: string | undefined) {
  return rawIp?.slice(0, 80) || 'unknown-client'
}

// ---------------------------------------------------------------------------
// Pure helpers: hashing, token records and consent state transitions. These are
// exported so the regression tests can exercise the exact logic the endpoints
// use, without a Firestore emulator or any network access.
// ---------------------------------------------------------------------------

export function normaliseNewsletterEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** Stable, non-reversible subscriber id: sha256 of the normalised mailbox. */
export function subscriberIdForEmail(email: string): string {
  return createHash('sha256').update(normaliseNewsletterEmail(email)).digest('hex')
}

/** Only a hash of a consent token is ever stored, so reads cannot replay links. */
export function hashConsentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateConsentToken(): string {
  return randomBytes(32).toString('base64url')
}

export function consentTokenExpiry(nowMillis: number, ttlDays = confirmationTokenTtlDays): number {
  return nowMillis + ttlDays * 24 * 60 * 60 * 1000
}

/**
 * Unsubscribe tokens never expire in the product sense (suppression must stay
 * one click away), but the cleanup job reads `expiresAt <= now`, and Firestore
 * orders null before every timestamp — so a null expiry would make every live
 * unsubscribe token look expired and delete it. A far-future horizon keeps the
 * link usable and out of the cleanup query.
 */
const unsubscribeHorizonDays = 36500

export function unsubscribeTokenHorizon(nowMillis: number): number {
  return nowMillis + unsubscribeHorizonDays * 24 * 60 * 60 * 1000
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return value.getTime()
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(millis) ? millis : null
  }
  return null
}

export interface ConsentTokenRecord {
  action?: unknown
  subscriberId?: unknown
  expiresAt?: unknown
  usedAt?: unknown
}

export type ConfirmTokenVerdict = 'ok' | 'unknown' | 'wrong-action' | 'expired' | 'used'

/**
 * Confirmation tokens are single-use and expiring; a missing or unusable
 * expiry fails closed as expired.
 */
export function evaluateConfirmToken(record: ConsentTokenRecord | null | undefined, nowMillis: number): ConfirmTokenVerdict {
  if (!record || typeof record !== 'object') return 'unknown'
  if (record.action !== 'confirm') return 'wrong-action'
  if (typeof record.subscriberId !== 'string' || record.subscriberId.length === 0) return 'unknown'
  const expiresAt = toMillis(record.expiresAt)
  if (expiresAt === null || expiresAt <= nowMillis) return 'expired'
  if (record.usedAt !== null && record.usedAt !== undefined) return 'used'
  return 'ok'
}

/**
 * Suppression must always be possible: an unsubscribe link stays usable after
 * expiry or a previous use, because refusing it can only cause harm.
 */
export function evaluateUnsubscribeToken(record: ConsentTokenRecord | null | undefined): ConfirmTokenVerdict {
  if (!record || typeof record !== 'object') return 'unknown'
  if (record.action !== 'confirm' && record.action !== 'unsubscribe') return 'wrong-action'
  if (typeof record.subscriberId !== 'string' || record.subscriberId.length === 0) return 'unknown'
  return 'ok'
}

export function statusOf(record: { status?: unknown } | null | undefined): SubscriberStatus | 'unknown' {
  const status = record?.status
  return status === 'pending' || status === 'subscribed' || status === 'unsubscribed' ? status : 'unknown'
}

/** Only an explicitly consented, active subscriber is ever mailable. */
export function isMailable(status: unknown): boolean {
  return status === 'subscribed'
}

export interface SubscribeDecision {
  status: SubscriberStatus
  issueToken: boolean
}

/**
 * Public newsletter signup never reports whether an address is new, awaiting
 * confirmation, already subscribed, or suppressed. Keeping this response
 * invariant prevents the endpoint from becoming an address-enumeration oracle.
 */
export function publicSubscribeResponse() {
  return { accepted: true as const }
}

/**
 * Signup outcomes. An existing unsubscribe suppression always wins, an already
 * confirmed address is idempotent, and unknown stored state fails closed.
 */
export function resolveSubscribeOutcome(existing: { status?: unknown } | undefined): SubscribeDecision {
  // Explicit consent activates a new subscription immediately. The token is
  // now an unsubscribe token included in the informational welcome email.
  if (!existing) return { status: 'subscribed', issueToken: true }
  const status = statusOf(existing)
  // Migrate an older double-opt-in request when that person submits consent
  // again through the current form.
  if (status === 'pending') return { status: 'subscribed', issueToken: true }
  if (status === 'subscribed') return { status: 'subscribed', issueToken: false }
  // Existing suppression — or unusable stored state — always wins.
  return { status: 'unsubscribed', issueToken: false }
}

export function resolveAccountJoinStatus(existing: { status?: unknown } | undefined, _emailVerified: boolean): SubscriberStatus {
  if (statusOf(existing) === 'subscribed') return 'subscribed'
  return 'subscribed'
}

/** Consent evidence is append-only and retained for a bounded, documented period. */
export const consentRetentionDays = 730

export function consentEvent(subscriberId: string, action: ConsentAction, source: string | null, now: Timestamp, retentionDays = consentRetentionDays) {
  return {
    subscriberId,
    action,
    ...(source ? { source } : {}),
    recordedAt: now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + retentionDays * 24 * 60 * 60 * 1000),
    // Provenance: consent events are server-written evidence only.
    writtenBy: 'server',
  }
}

function requireAccountEmail(caller: CallerContext): string {
  const email = normaliseNewsletterEmail(caller.email)
  if (!email || email.length > 160 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError('failed-precondition', 'This account does not have a usable email address.')
  }
  return email
}

function accountStatus(email: string, emailVerified: boolean, status: SubscriberStatus | 'not_joined') {
  return { email, emailVerified, status }
}

async function syncProviderSafely(email: string, subscribed: boolean) {
  try {
    const segmentId = subscribed ? await ensureNewsletterSegment() : undefined
    await syncNewsletterContact(email, subscribed, segmentId, { allowResubscribe: subscribed })
  } catch (error) {
    logger.warn('Newsletter provider contact sync deferred.', {
      subscribed,
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
}

export function subscriptionConfirmationMessage(email: string, unsubscribeToken: string, siteOrigin: string) {
  const unsubscribeUrl = `${siteOrigin.replace(/\/$/, '')}/newsletter/unsubscribe?token=${unsubscribeToken}`
  return {
    to: email,
    subject: 'You’re subscribed to Doxa updates',
    text: [
      'You are now subscribed to occasional Doxa news and updates.',
      '',
      'No further confirmation is required.',
      '',
      `Unsubscribe at any time: ${unsubscribeUrl}`,
    ].join('\n'),
  }
}

async function sendSubscriptionConfirmation(email: string, unsubscribeToken: string) {
  try {
    const delivery = await deliver(subscriptionConfirmationMessage(email, unsubscribeToken, publicSiteOriginParam.value()))
    if (!delivery.sent) {
      logger.warn('Newsletter subscription notice was not delivered.', {
        provider: delivery.provider,
        reason: delivery.reason,
      })
    }
  } catch (error) {
    logger.warn('Newsletter subscription notice could not be delivered.', {
      provider: mailTransportParam.value(),
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * Account membership is bound to the revocation-checked Firebase identity.
 * The browser never chooses which email address is stored. A verified account
 * becomes mailable immediately after explicit consent. Account email
 * verification remains a separate sign-in security control.
 */
export const joinAccountMailingList = onCall(options, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  const parsed = accountNewsletterSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Please confirm that you want to join the mailing list.')
  await checkRateLimit(`account-newsletter:${caller.uid}`, 12, 60)

  const email = requireAccountEmail(caller)
  const subscriberId = subscriberIdForEmail(email)
  const now = Timestamp.now()
  const newUnsubscribeToken = generateConsentToken()
  const newUnsubscribeTokenHash = hashConsentToken(newUnsubscribeToken)
  const result = await db.runTransaction(async (transaction) => {
    const subscriberRef = db.collection('newsletterSubscribers').doc(subscriberId)
    const snapshot = await transaction.get(subscriberRef)
    const existing = snapshot.exists ? snapshot.data() : undefined
    const previousConfirmHash = typeof existing?.confirmTokenHash === 'string' ? existing.confirmTokenHash : ''
    const alreadySubscribed = statusOf(existing) === 'subscribed'
    const desiredStatus = resolveAccountJoinStatus(existing, caller.emailVerified)

    if (previousConfirmHash) transaction.delete(db.collection('_newsletterTokens').doc(previousConfirmHash))

    let unsubscribeTokenHash = typeof existing?.unsubscribeTokenHash === 'string' ? existing.unsubscribeTokenHash : ''
    if (!alreadySubscribed) {
      unsubscribeTokenHash = newUnsubscribeTokenHash
      transaction.set(db.collection('_newsletterTokens').doc(unsubscribeTokenHash), {
        action: 'unsubscribe',
        subscriberId,
        issuedAt: now,
        expiresAt: Timestamp.fromMillis(unsubscribeTokenHorizon(now.toMillis())),
        usedAt: null,
      })
    }

    transaction.set(subscriberRef, {
      email,
      emailHash: subscriberId,
      consent: true,
      source: parsed.data.source,
      status: 'subscribed',
      requestedAt: now,
      confirmTokenHash: null,
      unsubscribedAt: FieldValue.delete(),
      ...(unsubscribeTokenHash ? { unsubscribeTokenHash } : {}),
      confirmedAt: alreadySubscribed && existing?.confirmedAt ? existing.confirmedAt : now,
      ...(snapshot.exists ? {} : { createdAt: now }),
      updatedAt: now,
    }, { merge: true })
    transaction.set(db.collection('newsletterConsentEvents').doc(), consentEvent(subscriberId, 'requested', parsed.data.source, now))
    if (!alreadySubscribed) {
      transaction.set(db.collection('newsletterConsentEvents').doc(), consentEvent(subscriberId, 'confirmed', parsed.data.source, now))
    }
    return { status: desiredStatus, newlySubscribed: !alreadySubscribed }
  })

  await syncProviderSafely(email, true)
  if (result.newlySubscribed) await sendSubscriptionConfirmation(email, newUnsubscribeToken)
  return accountStatus(email, caller.emailVerified, result.status)
})

/**
 * Returns only the caller's own mailing-list state. Legacy pending records are
 * upgraded immediately because confirmation is no longer required.
 */
export const getMyMailingListStatus = onCall(options, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  const email = requireAccountEmail(caller)
  const subscriberId = subscriberIdForEmail(email)
  const subscriberRef = db.collection('newsletterSubscribers').doc(subscriberId)
  const snapshot = await subscriberRef.get()
  if (!snapshot.exists) return accountStatus(email, caller.emailVerified, 'not_joined')

  const storedStatus = statusOf(snapshot.data())
  if (storedStatus === 'unknown') return accountStatus(email, caller.emailVerified, 'not_joined')
  if (storedStatus !== 'pending') return accountStatus(email, caller.emailVerified, storedStatus)

  const now = Timestamp.now()
  const migrationUnsubscribeToken = generateConsentToken()
  const migrationUnsubscribeTokenHash = hashConsentToken(migrationUnsubscribeToken)
  const migration = await db.runTransaction(async (transaction): Promise<{ status: SubscriberStatus | 'not_joined'; migrated: boolean }> => {
    const current = await transaction.get(subscriberRef)
    if (!current.exists) return { status: 'not_joined', migrated: false }
    const currentStatus = statusOf(current.data())
    if (currentStatus !== 'pending') {
      return { status: currentStatus === 'unknown' ? 'not_joined' : currentStatus, migrated: false }
    }
    const existing = current.data()
    const previousConfirmHash = typeof existing?.confirmTokenHash === 'string' ? existing.confirmTokenHash : ''
    if (previousConfirmHash) transaction.delete(db.collection('_newsletterTokens').doc(previousConfirmHash))
    transaction.set(db.collection('_newsletterTokens').doc(migrationUnsubscribeTokenHash), {
      action: 'unsubscribe', subscriberId, issuedAt: now,
      expiresAt: Timestamp.fromMillis(unsubscribeTokenHorizon(now.toMillis())), usedAt: null,
    })
    transaction.set(subscriberRef, {
      status: 'subscribed', confirmedAt: now, confirmTokenHash: null,
      unsubscribeTokenHash: migrationUnsubscribeTokenHash, updatedAt: now,
    }, { merge: true })
    transaction.set(db.collection('newsletterConsentEvents').doc(), consentEvent(subscriberId, 'confirmed', 'account_settings', now))
    return { status: 'subscribed', migrated: true }
  })
  if (migration.status === 'subscribed') await syncProviderSafely(email, true)
  if (migration.migrated) await sendSubscriptionConfirmation(email, migrationUnsubscribeToken)
  return accountStatus(email, caller.emailVerified, migration.status)
})

export const leaveAccountMailingList = onCall(options, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  await checkRateLimit(`account-newsletter-leave:${caller.uid}`, 12, 60)
  const email = requireAccountEmail(caller)
  const subscriberId = subscriberIdForEmail(email)
  const now = Timestamp.now()
  await db.runTransaction(async (transaction) => {
    const ref = db.collection('newsletterSubscribers').doc(subscriberId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) return
    transaction.set(ref, { status: 'unsubscribed', unsubscribedAt: now, updatedAt: now }, { merge: true })
    transaction.set(db.collection('newsletterConsentEvents').doc(), consentEvent(subscriberId, 'unsubscribed', 'account_settings', now))
  })
  await syncProviderSafely(email, false)
  return accountStatus(email, caller.emailVerified, 'unsubscribed')
})

// ---------------------------------------------------------------------------
// Endpoints. Every mutation happens here; the client only ever presents input.
// ---------------------------------------------------------------------------

export const subscribeNewsletter = onCall(options, async (request) => {
  const parsed = newsletterSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Please check the signup fields and consent.')
  await checkRateLimit(`newsletter:${clientKey(request.rawRequest?.ip)}`, 5)

  const email = normaliseNewsletterEmail(parsed.data.email)
  const subscriberId = subscriberIdForEmail(email)
  const source: NewsletterSource = parsed.data.source
  const unsubscribeToken = generateConsentToken()
  const unsubscribeTokenHash = hashConsentToken(unsubscribeToken)
  const now = Timestamp.now()

  const decision = await db.runTransaction(async (transaction) => {
    const subscriberRef = db.collection('newsletterSubscribers').doc(subscriberId)
    const snapshot = await transaction.get(subscriberRef)
    const existing = snapshot.exists ? snapshot.data() : undefined
    const outcome = resolveSubscribeOutcome(existing)
    if (!outcome.issueToken) return { outcome, activated: false }

    // Remove any unused legacy confirmation token and issue an unsubscribe
    // token immediately. No confirmation action is required from the person.
    const previousHash = typeof existing?.confirmTokenHash === 'string' ? existing.confirmTokenHash : ''
    if (previousHash) transaction.delete(db.collection('_newsletterTokens').doc(previousHash))

    transaction.set(db.collection('_newsletterTokens').doc(unsubscribeTokenHash), {
      action: 'unsubscribe',
      subscriberId,
      issuedAt: now,
      expiresAt: Timestamp.fromMillis(unsubscribeTokenHorizon(now.toMillis())),
      usedAt: null,
    })
    transaction.set(subscriberRef, {
      email,
      emailHash: subscriberId,
      consent: true,
      source,
      status: 'subscribed',
      requestedAt: now,
      confirmedAt: now,
      confirmTokenHash: null,
      unsubscribeTokenHash,
      unsubscribedAt: FieldValue.delete(),
      ...(snapshot.exists ? {} : { createdAt: now }),
      updatedAt: now,
    }, { merge: true })
    transaction.set(db.collection('newsletterConsentEvents').doc(), consentEvent(subscriberId, 'requested', source, now))
    transaction.set(db.collection('newsletterConsentEvents').doc(), consentEvent(subscriberId, 'confirmed', source, now))
    return { outcome, activated: true }
  })

  if (decision.activated) {
    await syncProviderSafely(email, true)
    await sendSubscriptionConfirmation(email, unsubscribeToken)
  }

  // Do not expose the stored consent state or provider delivery outcome. A
  // caller receives the same result for new, active and suppressed
  // addresses. Operational delivery failures remain visible in server logs.
  return publicSubscribeResponse()
})

export const confirmNewsletterSubscription = onCall(options, async (request) => {
  const parsed = newsletterTokenSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'This confirmation link is not valid.')
  await checkRateLimit(`newsletter-confirm:${clientKey(request.rawRequest?.ip)}`, 10, 60)

  const tokenHash = hashConsentToken(parsed.data.token)
  const now = Timestamp.now()
  const outcome = await db.runTransaction(async (transaction) => {
    const tokenRef = db.collection('_newsletterTokens').doc(tokenHash)
    const tokenSnapshot = await transaction.get(tokenRef)
    if (!tokenSnapshot.exists) throw new HttpsError('invalid-argument', 'This confirmation link is not valid or has expired.')
    const record = tokenSnapshot.data() as ConsentTokenRecord
    const verdict = evaluateConfirmToken(record, Date.now())

    if (verdict === 'unknown' || verdict === 'wrong-action') {
      throw new HttpsError('invalid-argument', 'This confirmation link is not valid.')
    }
    if (verdict === 'expired') throw new HttpsError('invalid-argument', 'This confirmation link has expired. Request a new signup to receive a fresh link.')

    const subscriberRef = db.collection('newsletterSubscribers').doc(String(record.subscriberId))
    const subscriberSnapshot = await transaction.get(subscriberRef)
    if (!subscriberSnapshot.exists) throw new HttpsError('invalid-argument', 'This confirmation link is not valid.')
    const status = statusOf(subscriberSnapshot.data())

    if (verdict === 'used') {
      // Single use for state changes, but idempotent for the person who
      // double-clicks the link they already completed.
      if (status === 'subscribed') return { confirmed: true, status, subscriberId: String(record.subscriberId), unsubscribeToken: null as string | null, freshlyConfirmed: false }
      throw new HttpsError('invalid-argument', 'This confirmation link has already been used.')
    }

    if (status === 'unsubscribed') return { confirmed: false, status, subscriberId: String(record.subscriberId), unsubscribeToken: null as string | null, freshlyConfirmed: false }
    if (status === 'subscribed') {
      transaction.update(tokenRef, { usedAt: now })
      return { confirmed: true, status, subscriberId: String(record.subscriberId), unsubscribeToken: null as string | null, freshlyConfirmed: false }
    }

    // Pending -> subscribed, with a durable unsubscribe token issued once.
    const unsubscribeToken = generateConsentToken()
    const unsubscribeHash = hashConsentToken(unsubscribeToken)
    transaction.set(db.collection('_newsletterTokens').doc(unsubscribeHash), {
      action: 'unsubscribe',
      subscriberId: String(record.subscriberId),
      issuedAt: now,
      expiresAt: Timestamp.fromMillis(unsubscribeTokenHorizon(now.toMillis())),
      usedAt: null,
    })
    transaction.set(subscriberRef, {
      status: 'subscribed',
      consent: true,
      confirmedAt: now,
      confirmTokenHash: null,
      unsubscribeTokenHash: unsubscribeHash,
      updatedAt: now,
    }, { merge: true })
    transaction.update(tokenRef, { usedAt: now })
    return { confirmed: true, status: 'subscribed' as SubscriberStatus, subscriberId: String(record.subscriberId), unsubscribeToken, freshlyConfirmed: true }
  })

  if (outcome.freshlyConfirmed) {
    await db.collection('newsletterConsentEvents').add(consentEvent(outcome.subscriberId, 'confirmed', null, now))
    const subscriber = await db.collection('newsletterSubscribers').doc(outcome.subscriberId).get()
    const email = normaliseNewsletterEmail(subscriber.data()?.email)
    if (email) await syncProviderSafely(email, true)
  }

  return {
    confirmed: outcome.confirmed,
    status: outcome.status,
    ...(outcome.unsubscribeToken
      ? { unsubscribeUrl: `${publicSiteOriginParam.value().replace(/\/$/, '')}/newsletter/unsubscribe?token=${outcome.unsubscribeToken}` }
      : {}),
  }
})

export const unsubscribeNewsletter = onCall(options, async (request) => {
  const parsed = newsletterTokenSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'This unsubscribe link is not valid.')
  await checkRateLimit(`newsletter-unsubscribe:${clientKey(request.rawRequest?.ip)}`, 10, 60)

  const tokenHash = hashConsentToken(parsed.data.token)
  const now = Timestamp.now()
  const outcome = await db.runTransaction(async (transaction) => {
    const tokenSnapshot = await transaction.get(db.collection('_newsletterTokens').doc(tokenHash))
    if (!tokenSnapshot.exists) throw new HttpsError('invalid-argument', 'This unsubscribe link is not valid.')
    const verdict = evaluateUnsubscribeToken(tokenSnapshot.data() as ConsentTokenRecord)
    if (verdict !== 'ok') throw new HttpsError('invalid-argument', 'This unsubscribe link is not valid.')
    const subscriberId = String((tokenSnapshot.data() as ConsentTokenRecord).subscriberId)
    const subscriberRef = db.collection('newsletterSubscribers').doc(subscriberId)
    const subscriberSnapshot = await transaction.get(subscriberRef)
    if (!subscriberSnapshot.exists) throw new HttpsError('invalid-argument', 'This unsubscribe link is not valid.')
    transaction.set(subscriberRef, {
      status: 'unsubscribed',
      unsubscribedAt: now,
      updatedAt: now,
    }, { merge: true })
    return { subscriberId }
  })

  await db.collection('newsletterConsentEvents').add(consentEvent(outcome.subscriberId, 'unsubscribed', null, now))
  const subscriber = await db.collection('newsletterSubscribers').doc(outcome.subscriberId).get()
  const email = normaliseNewsletterEmail(subscriber.data()?.email)
  if (email) await syncProviderSafely(email, false)
  return { unsubscribed: true, status: 'unsubscribed' }
})

/**
 * Retention: consent evidence and spent/expired tokens are removed after a
 * bounded period by a scheduled, page-bounded cleanup, so the append-only log
 * cannot grow without limit.
 */
export const removeExpiredNewsletterRecords = onSchedule({
  region,
  schedule: 'every 24 hours',
  timeZone: 'Australia/Sydney',
}, async () => {
  const now = Timestamp.now()
  let removed = 0
  for (const collection of ['newsletterConsentEvents', '_newsletterTokens']) {
    let cursor: QueryDocumentSnapshot | undefined
    for (let page = 0; page < 5; page += 1) {
      let reference = db.collection(collection).where('expiresAt', '<=', now).orderBy('expiresAt').limit(200)
      if (cursor) reference = reference.startAfter(cursor)
      const expired = await reference.get()
      if (expired.empty) break
      const batch = db.batch()
      expired.docs.forEach((document) => batch.delete(document.ref))
      await batch.commit()
      removed += expired.size
      cursor = expired.docs[expired.docs.length - 1]
      if (expired.size < 200) break
    }
  }
  if (removed) logger.info('Removed expired newsletter consent records.', { removed })
})
