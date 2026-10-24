import { describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import { beginOnboarding, finishOnboarding, onboardingCompletionSchema, type OnboardingEnvironment } from './onboarding'

function scenario(options: { createdAt?: number; profile?: Record<string, unknown> | null } = {}) {
  let profile = options.profile ?? null
  const saves: Record<string, unknown>[] = []
  const limits: string[] = []
  const now = Date.parse('2026-10-09T06:00:00Z')
  const env: OnboardingEnvironment = {
    loadAccountCreatedAt: async () => options.createdAt ?? now - 60_000,
    loadProfile: async () => profile,
    saveProfile: async (_uid, data) => { saves.push(data); profile = { ...(profile ?? {}), ...data } },
    rateLimit: async (key) => { limits.push(key) },
    now: () => now,
  }
  return { env, saves, limits }
}

describe('account onboarding', () => {
  it('accepts only explicit current terms and autofill consent', () => {
    expect(onboardingCompletionSchema.safeParse({ termsAccepted: true, termsVersion: 'account-terms-v1', autofillConsent: true, mailingListSelected: false, recoveryPhone: null }).success).toBe(true)
    expect(onboardingCompletionSchema.safeParse({ termsAccepted: false, termsVersion: 'account-terms-v1', autofillConsent: true, mailingListSelected: false, recoveryPhone: null }).success).toBe(false)
    expect(onboardingCompletionSchema.safeParse({ termsAccepted: true, termsVersion: 'old', autofillConsent: true, mailingListSelected: false, recoveryPhone: null }).success).toBe(false)
    expect(onboardingCompletionSchema.safeParse({ termsAccepted: true, termsVersion: 'account-terms-v1', autofillConsent: false, mailingListSelected: false, recoveryPhone: null }).success).toBe(false)
  })

  it('marks a newly created account as pending and is idempotent while pending', async () => {
    const first = scenario()
    await expect(beginOnboarding('uid-1', first.env)).resolves.toEqual({ required: true })
    expect(first.saves).toHaveLength(1)
    expect(first.saves[0]).toMatchObject({ onboarding: { status: 'pending', version: 1 } })
    await expect(beginOnboarding('uid-1', first.env)).resolves.toEqual({ required: true })
    expect(first.saves).toHaveLength(1)
  })

  it('will not start onboarding for an established account', async () => {
    const { env, saves } = scenario({ createdAt: Date.parse('2026-10-01T00:00:00Z') })
    await expect(beginOnboarding('uid-1', env)).rejects.toBeInstanceOf(HttpsError)
    expect(saves).toHaveLength(0)
  })

  it('records a bounded phone and immutable consent evidence for a pending account', async () => {
    const { env, saves, limits } = scenario({ profile: { onboarding: { status: 'pending' } } })
    await expect(finishOnboarding('uid-1', {
      termsAccepted: true,
      termsVersion: 'account-terms-v1',
      autofillConsent: true,
      mailingListSelected: true,
      recoveryPhone: ' 0400 000 000 ',
    }, env)).resolves.toEqual({ completed: true })
    expect(saves[0]).toMatchObject({
      phone: '0400 000 000',
      onboarding: { status: 'complete', version: 1, termsVersion: 'account-terms-v1' },
      preferences: { checkoutAndEnquiryAutofill: true, mailingListRequested: true, recoveryPhoneProvided: true },
    })
    expect(limits).toEqual(['onboarding:complete:uid-1'])
  })

  it('makes a repeated completion a safe no-op', async () => {
    const { env, saves } = scenario({ profile: { onboarding: { status: 'complete' } } })
    await expect(finishOnboarding('uid-1', {
      termsAccepted: true,
      termsVersion: 'account-terms-v1',
      autofillConsent: true,
      mailingListSelected: false,
      recoveryPhone: null,
    }, env)).resolves.toEqual({ completed: true })
    expect(saves).toHaveLength(0)
  })

  it('refuses completion unless trusted state says onboarding was started', async () => {
    const { env, saves } = scenario({ profile: { displayName: 'Ada' } })
    await expect(finishOnboarding('uid-1', {
      termsAccepted: true,
      termsVersion: 'account-terms-v1',
      autofillConsent: true,
      mailingListSelected: false,
      recoveryPhone: null,
    }, env)).rejects.toBeInstanceOf(HttpsError)
    expect(saves).toHaveLength(0)
  })
})
