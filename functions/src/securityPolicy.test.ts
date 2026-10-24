import { describe, expect, it } from 'vitest'
import { defaultSecurityPolicy, normaliseSecurityPolicy, securityCapabilities } from './securityPolicy'

describe('account security policy', () => {
  it('defaults every optional method and requirement to off', () => {
    expect(normaliseSecurityPolicy(null)).toEqual(defaultSecurityPolicy)
    expect(securityCapabilities.emailCodeDelivery).toBe(false)
  })

  it('returns only recognised, bounded policy fields', () => {
    expect(normaliseSecurityPolicy({
      version: 99,
      methods: { emailCode: { status: 'enabled', verifiedAt: '2026-10-03T00:00:00.000Z', secret: 'never-return' } },
      requirements: { criticalActions: true, signIn: 'yes', administrator: true },
      role: 'admin',
    })).toEqual({
      version: 1,
      methods: {
        emailCode: { status: 'enabled', verifiedAt: '2026-10-03T00:00:00.000Z' },
        authenticator: { status: 'not_configured', verifiedAt: null },
        passkey: { status: 'not_configured', verifiedAt: null },
      },
      requirements: { signIn: false, criticalActions: false, paymentActions: false, passwordlessSignIn: false },
    })
  })

  it('never reports an unenforceable requirement as active', () => {
    // Email-code delivery, passwordless sign-in and action challenges are not
    // configured, so a stored requirement must not be surfaced as protection.
    expect(securityCapabilities.emailCodeDelivery).toBe(false)
    expect(securityCapabilities.passwordlessEmailCode).toBe(false)
    const policy = normaliseSecurityPolicy({
      version: 1,
      requirements: { signIn: true, criticalActions: true, paymentActions: true, passwordlessSignIn: true },
    })
    expect(Object.values(policy.requirements).every((value) => value === false)).toBe(true)
  })
})
