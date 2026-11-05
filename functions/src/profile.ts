import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { authorizeRequest, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'

// Server-owned profile mutation (S10). Clients no longer write usersPrivate
// directly: this callable is the only mutation path, it is rate limited, it
// derives the email address from the Auth record instead of trusting the
// caller, and it skips the write entirely when nothing changed so the
// profile-change trigger cannot be used for noise or amplification. An empty
// payload is a valid synchronisation request (email refresh after reload).

const region = 'australia-southeast1'
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  checkoutAndEnquiryAutofill: z.boolean().optional(),
}).strict()

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

export interface ProfileEnvironment {
  loadAuthUser: (uid: string) => Promise<{ email?: string | null; displayName?: string | null }>
  loadProfile: (uid: string) => Promise<Record<string, unknown> | null>
  saveProfile: (uid: string, data: Record<string, unknown>) => Promise<void>
  rateLimit: (key: string, maximum: number, windowMinutes: number) => Promise<void>
}

export const defaultProfileEnvironment: ProfileEnvironment = {
  async loadAuthUser(uid) {
    const account = await getAuth().getUser(uid)
    return { email: account.email ?? null, displayName: account.displayName ?? null }
  },
  async loadProfile(uid) {
    const snapshot = await db.collection('usersPrivate').doc(uid).get()
    return snapshot.exists ? snapshot.data() ?? null : null
  },
  async saveProfile(uid, data) {
    await db.collection('usersPrivate').doc(uid).set(data, { merge: true })
  },
  rateLimit: (key, maximum, windowMinutes) => checkRateLimit(key, maximum, windowMinutes),
}

function boundedName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : ''
}

export async function applyProfileUpdate(uid: string, input: ProfileUpdate, env: ProfileEnvironment = defaultProfileEnvironment) {
  const account = await env.loadAuthUser(uid)
  const current = await env.loadProfile(uid)
  const email = typeof account.email === 'string' ? account.email.trim().toLowerCase() : ''
  const displayName = boundedName(input.displayName ?? current?.displayName ?? account.displayName) || 'Customer'
  const currentPhone = typeof current?.phone === 'string' ? current.phone : ''
  const currentPreferences = typeof current?.preferences === 'object' && current.preferences !== null
    ? current.preferences as Record<string, unknown>
    : {}
  const currentAutofill = currentPreferences.checkoutAndEnquiryAutofill !== false
  const checkoutAndEnquiryAutofill = input.checkoutAndEnquiryAutofill ?? currentAutofill
  let phone: string
  if (input.phone === undefined) phone = currentPhone
  else if (input.phone === null) phone = ''
  else phone = input.phone.trim().slice(0, 30)

  const unchanged = Boolean(current)
    && boundedName(current?.displayName) === displayName
    && (typeof current?.phone === 'string' ? current.phone : '') === phone
    && boundedName(current?.email) === email
    && (input.checkoutAndEnquiryAutofill === undefined || currentAutofill === checkoutAndEnquiryAutofill)
  if (unchanged) return { updated: false }

  await env.rateLimit(`profile:${uid}`, 12, 60)
  const document: Record<string, unknown> = {
    displayName,
    email,
    phone: phone || FieldValue.delete(),
    ...(input.checkoutAndEnquiryAutofill === undefined ? {} : {
      preferences: { ...currentPreferences, checkoutAndEnquiryAutofill },
    }),
    updatedAt: FieldValue.serverTimestamp(),
    ...(current ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }
  await env.saveProfile(uid, document)
  return { updated: true }
}

export const updateMyProfile = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  const parsed = profileUpdateSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Please check the profile fields.')
  const result = await applyProfileUpdate(caller.uid, parsed.data)
  return { updated: result.updated }
})
