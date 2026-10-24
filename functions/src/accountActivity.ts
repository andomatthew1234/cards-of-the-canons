import { createHash } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { z } from 'zod'
import { authorizeRequest, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'

const region = 'australia-southeast1'
const retentionDays = 180
const cleanupPageSize = 400
const cleanupMaxPages = 10
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }

export type ActivityType =
  | 'login'
  | 'order_purchased'
  | 'email_changed'
  | 'password_changed'
  | 'phone_changed'
  | 'profile_changed'
  | 'mfa_enrolled'
  | 'mfa_removed'

type ActivityCategory = 'security' | 'profile' | 'purchase'

// 'server' events are written from server-side evidence (triggers, webhooks).
// 'client_reported' events originate from this device after server checks and
// are never presented as independently verified evidence.
export type ActivityVerification = 'server' | 'client_reported'

export interface ActivityLocation {
  city?: string
  region?: string
  country: string
  countryCode?: string
  latitude: number
  longitude: number
  accuracy: 'approximate'
}

interface ActivityInput {
  type: ActivityType
  category: ActivityCategory
  title: string
  description: string
  verification: ActivityVerification
  createdAt?: Timestamp | FieldValue
  metadata?: Record<string, string | number | boolean>
  location?: ActivityLocation
}

const securityActivitySchema = z.object({
  type: z.enum(['password_changed', 'mfa_enrolled', 'mfa_removed']),
  factorName: z.string().trim().min(1).max(80).optional(),
}).strict()

export function activityEventId(...parts: Array<string | number>) {
  return createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 40)
}

export function providerLabel(providerId: unknown) {
  if (providerId === 'password') return 'Email and password'
  if (providerId === 'google.com') return 'Google'
  if (providerId === 'apple.com') return 'Apple'
  if (providerId === 'phone') return 'Phone'
  return 'Connected sign-in method'
}

export function activityCopy(type: ActivityType, detail?: string) {
  const safeDetail = detail?.trim().slice(0, 80)
  const copy: Record<ActivityType, { category: ActivityCategory; title: string; description: string }> = {
    login: { category: 'security', title: 'New sign-in', description: `Signed in with ${safeDetail || 'a connected sign-in method'}.` },
    order_purchased: { category: 'purchase', title: 'Order purchased', description: safeDetail || 'A purchase was completed.' },
    email_changed: { category: 'profile', title: 'Email address changed', description: 'The email address connected to this account was updated.' },
    password_changed: { category: 'security', title: 'Password changed', description: 'The password for this account was updated.' },
    phone_changed: { category: 'profile', title: 'Phone number changed', description: 'The contact phone number on this account was updated.' },
    profile_changed: { category: 'profile', title: 'Profile details changed', description: 'The name connected to this account was updated.' },
    mfa_enrolled: { category: 'security', title: 'Authenticator app added', description: `${safeDetail || 'An authenticator app'} was added to two-step verification.` },
    mfa_removed: { category: 'security', title: 'Authenticator app removed', description: `${safeDetail || 'An authenticator app'} was removed from two-step verification.` },
  }
  return copy[type]
}

export function activityEventRef(uid: string, eventId: string): DocumentReference<DocumentData> {
  return db.collection('accountActivity').doc(uid).collection('activityEvents').doc(eventId)
}

export function activityDocument(input: ActivityInput, now = Date.now()) {
  return {
    type: input.type,
    category: input.category,
    title: input.title.slice(0, 120),
    description: input.description.slice(0, 300),
    verification: input.verification,
    createdAt: input.createdAt ?? FieldValue.serverTimestamp(),
    recordedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + retentionDays * 24 * 60 * 60 * 1000),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.location ? { location: input.location } : {}),
  }
}

/**
 * Append-only write: an event ID is written once and never overwritten, so a
 * replayed or coalesced event cannot rewrite existing audit evidence.
 * Returns false when the event was already recorded.
 */
export async function writeActivityEvent(uid: string, eventId: string, input: ActivityInput) {
  const reference = activityEventRef(uid, eventId)
  try {
    await reference.create(activityDocument(input))
    return true
  } catch (error) {
    const existing = await reference.get().catch(() => null)
    if (existing?.exists) return false
    throw error
  }
}

export const recordLoginActivity = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  if (!caller.authTime) throw new HttpsError('failed-precondition', 'The sign-in time could not be verified.')
  await checkRateLimit(`activity-login:${caller.uid}`, 40, 60)
  const provider = providerLabel(request.auth?.token.firebase?.sign_in_provider)
  const copy = activityCopy('login', provider)
  const createdAt = Timestamp.fromMillis(caller.authTime * 1000)
  await writeActivityEvent(caller.uid, activityEventId('login', caller.uid, caller.authTime), {
    type: 'login',
    ...copy,
    verification: 'client_reported',
    createdAt,
    metadata: { provider },
  })
  // request.rawRequest.ip is intentionally not persisted. A coarse location is
  // added only after a separately licensed, privacy-reviewed provider exists.
  return { recorded: true, locationRecorded: false }
})

export const recordSecurityActivity = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireRecentAuthSeconds: 10 * 60 })
  const parsed = securityActivitySchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'The security activity is invalid.')
  await checkRateLimit(`activity-security:${caller.uid}`, 20, 60)

  const factorName = parsed.data.factorName || 'Authenticator app'
  if (parsed.data.type === 'mfa_enrolled') {
    const account = await getAuth().getUser(caller.uid)
    const enrolled = account.multiFactor?.enrolledFactors.some((factor) => factor.factorId === 'totp') === true
    if (!enrolled) throw new HttpsError('failed-precondition', 'No enrolled authenticator could be verified.')
  }
  const copy = activityCopy(parsed.data.type, factorName)
  const eventId = activityEventId(parsed.data.type, caller.uid, Date.now(), factorName)
  await writeActivityEvent(caller.uid, eventId, {
    type: parsed.data.type,
    ...copy,
    verification: 'client_reported',
    metadata: parsed.data.type.startsWith('mfa_') ? { factorName } : undefined,
  })
  return { recorded: true }
})

// One coalesced event per change type per UTC day: profile synchronisation
// retries must not amplify into a wall of near-identical audit entries.
export function profileActivityEventId(uid: string, type: ActivityType, dayKey: string) {
  return activityEventId('profile', uid, type, dayKey)
}

export const recordProfileActivity = onDocumentUpdated({
  region,
  document: 'usersPrivate/{uid}',
}, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  const uid = event.params.uid
  if (!before || !after || !uid) return
  const changes: ActivityType[] = []
  if (before.email !== after.email) changes.push('email_changed')
  if ((before.phone ?? '') !== (after.phone ?? '')) changes.push('phone_changed')
  if (before.displayName !== after.displayName) changes.push('profile_changed')
  if (!changes.length) return
  const dayKey = new Date().toISOString().slice(0, 10)
  await Promise.all(changes.map((type) => {
    const copy = activityCopy(type)
    return writeActivityEvent(uid, profileActivityEventId(uid, type, dayKey), {
      type,
      ...copy,
      verification: 'server',
    })
  }))
})

export const removeExpiredAccountActivity = onSchedule({
  region,
  schedule: 'every 24 hours',
  timeZone: 'Australia/Sydney',
}, async () => {
  let removed = 0
  // Bounded, cursor-paginated cleanup: one run can drain a large backlog
  // without a single unbounded batch, and a later run continues where the
  // previous one stopped.
  let cursor: QueryDocumentSnapshot | undefined
  for (let page = 0; page < cleanupMaxPages; page += 1) {
    let reference = db.collectionGroup('activityEvents')
      .where('expiresAt', '<=', Timestamp.now())
      .orderBy('expiresAt')
      .limit(cleanupPageSize)
    if (cursor) reference = reference.startAfter(cursor)
    const expired = await reference.get()
    if (expired.empty) break
    const batch = db.batch()
    expired.docs.forEach((document) => batch.delete(document.ref))
    await batch.commit()
    removed += expired.size
    cursor = expired.docs[expired.docs.length - 1]
    if (expired.size < cleanupPageSize) break
  }

  let counters = 0
  let counterCursor: QueryDocumentSnapshot | undefined
  for (let page = 0; page < cleanupMaxPages; page += 1) {
    let reference = db.collection('_abuseCounters')
      .where('expiresAt', '<=', Timestamp.now())
      .orderBy('expiresAt')
      .limit(cleanupPageSize)
    if (counterCursor) reference = reference.startAfter(counterCursor)
    const expired = await reference.get()
    if (expired.empty) break
    const batch = db.batch()
    expired.docs.forEach((document) => batch.delete(document.ref))
    await batch.commit()
    counters += expired.size
    counterCursor = expired.docs[expired.docs.length - 1]
    if (expired.size < cleanupPageSize) break
  }

  if (removed || counters) logger.info('Removed expired account activity and counters.', { removed, counters })
})
