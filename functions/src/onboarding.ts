import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { authorizeRequest, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'

const region = 'australia-southeast1'
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const termsVersion = 'account-terms-v1'
const onboardingWindowMs = 30 * 60 * 1000

export const onboardingCompletionSchema = z.object({
  termsAccepted: z.literal(true),
  termsVersion: z.literal(termsVersion),
  autofillConsent: z.literal(true),
  mailingListSelected: z.boolean(),
  recoveryPhone: z.string().trim().min(6).max(30).nullable(),
}).strict()

export type OnboardingCompletion = z.infer<typeof onboardingCompletionSchema>

export interface OnboardingEnvironment {
  loadAccountCreatedAt: (uid: string) => Promise<number>
  loadProfile: (uid: string) => Promise<Record<string, unknown> | null>
  saveProfile: (uid: string, data: Record<string, unknown>) => Promise<void>
  rateLimit: (key: string, maximum: number, windowMinutes: number) => Promise<void>
  now: () => number
}

export const defaultOnboardingEnvironment: OnboardingEnvironment = {
  async loadAccountCreatedAt(uid) {
    const account = await getAuth().getUser(uid)
    return new Date(account.metadata.creationTime).getTime()
  },
  async loadProfile(uid) {
    const snapshot = await db.collection('usersPrivate').doc(uid).get()
    return snapshot.exists ? snapshot.data() ?? null : null
  },
  async saveProfile(uid, data) {
    await db.collection('usersPrivate').doc(uid).set(data, { merge: true })
  },
  rateLimit: (key, maximum, windowMinutes) => checkRateLimit(key, maximum, windowMinutes),
  now: () => Date.now(),
}

function onboardingStatus(profile: Record<string, unknown> | null) {
  if (!profile || typeof profile.onboarding !== 'object' || profile.onboarding === null) return ''
  const status = (profile.onboarding as Record<string, unknown>).status
  return typeof status === 'string' ? status : ''
}

export async function beginOnboarding(uid: string, env: OnboardingEnvironment = defaultOnboardingEnvironment) {
  const profile = await env.loadProfile(uid)
  const currentStatus = onboardingStatus(profile)
  if (currentStatus === 'complete') return { required: false }
  if (currentStatus === 'pending') return { required: true }

  const createdAt = await env.loadAccountCreatedAt(uid)
  if (!Number.isFinite(createdAt) || env.now() - createdAt > onboardingWindowMs) {
    throw new HttpsError('failed-precondition', 'Onboarding can only be started for a newly created account.')
  }

  await env.rateLimit(`onboarding:start:${uid}`, 4, 60)
  await env.saveProfile(uid, {
    onboarding: {
      status: 'pending',
      version: 1,
      startedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { required: true }
}

export async function finishOnboarding(uid: string, input: OnboardingCompletion, env: OnboardingEnvironment = defaultOnboardingEnvironment) {
  const profile = await env.loadProfile(uid)
  const currentStatus = onboardingStatus(profile)
  // A response can be lost after Firestore commits. Repeating the request is
  // therefore a safe no-op, not a second consent write or a broken UI state.
  if (currentStatus === 'complete') return { completed: true }
  if (currentStatus !== 'pending') {
    throw new HttpsError('failed-precondition', 'This account does not have onboarding in progress.')
  }

  await env.rateLimit(`onboarding:complete:${uid}`, 8, 60)
  const recoveryPhone = input.recoveryPhone?.trim() ?? ''
  await env.saveProfile(uid, {
    phone: recoveryPhone || FieldValue.delete(),
    onboarding: {
      status: 'complete',
      version: 1,
      termsVersion: input.termsVersion,
      termsAcceptedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    },
    preferences: {
      checkoutAndEnquiryAutofill: true,
      mailingListRequested: input.mailingListSelected,
      recoveryPhoneProvided: Boolean(recoveryPhone),
    },
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { completed: true }
}

export const beginAccountOnboarding = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  return beginOnboarding(caller.uid)
})

export const completeAccountOnboarding = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  const parsed = onboardingCompletionSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Please review the onboarding choices and try again.')
  return finishOnboarding(caller.uid, parsed.data)
})
