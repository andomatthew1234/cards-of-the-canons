import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  generateSecret: vi.fn(),
  assertionForEnrollment: vi.fn(),
  assertionForSignIn: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  multiFactor: vi.fn(() => ({ enrolledFactors: [], getSession: mocks.getSession, enroll: mocks.enroll, unenroll: mocks.unenroll })),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    generateSecret: mocks.generateSecret,
    assertionForEnrollment: mocks.assertionForEnrollment,
    assertionForSignIn: mocks.assertionForSignIn,
  },
}))

import { beginTotpEnrollment, completeTotpEnrollment, removeMfaFactor, resolveTotpSignIn } from '../src/lib/authenticatorMfa'

describe('Firebase-native authenticator MFA service', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('gets a Firebase MFA session and generates the standard QR URI', async () => {
    const user = { uid: 'customer-1', email: 'customer@example.com' }
    const session = { session: 'firebase-mfa-session' }
    const secret = { secretKey: 'FIREBASESECRET', generateQrCodeUrl: vi.fn().mockReturnValue('otpauth://firebase-uri') }
    mocks.getSession.mockResolvedValue(session)
    mocks.generateSecret.mockResolvedValue(secret)

    const result = await beginTotpEnrollment(user as never, 'Doxa')

    expect(mocks.generateSecret).toHaveBeenCalledWith(session)
    expect(secret.generateQrCodeUrl).toHaveBeenCalledWith('customer@example.com', 'Doxa')
    expect(result).toEqual({ secret, secretKey: 'FIREBASESECRET', qrCodeUrl: 'otpauth://firebase-uri' })
  })

  it('uses Firebase assertions for enrollment and sign-in rather than comparing codes', async () => {
    const enrollmentAssertion = { kind: 'enrollment' }
    const signInAssertion = { kind: 'sign-in' }
    const credential = { user: { uid: 'customer-1' } }
    mocks.assertionForEnrollment.mockReturnValue(enrollmentAssertion)
    mocks.assertionForSignIn.mockReturnValue(signInAssertion)
    const resolver = { resolveSignIn: vi.fn().mockResolvedValue(credential) }

    await completeTotpEnrollment({} as never, {} as never, '123456', 'My authenticator')
    const result = await resolveTotpSignIn(resolver as never, 'enrollment-1', '654321')

    expect(mocks.assertionForEnrollment).toHaveBeenCalledWith({}, '123456')
    expect(mocks.enroll).toHaveBeenCalledWith(enrollmentAssertion, 'My authenticator')
    expect(mocks.assertionForSignIn).toHaveBeenCalledWith('enrollment-1', '654321')
    expect(resolver.resolveSignIn).toHaveBeenCalledWith(signInAssertion)
    expect(result).toBe(credential)
  })

  it('removes an enrollment through Firebase multiFactor().unenroll()', async () => {
    await removeMfaFactor({} as never, 'enrollment-1')
    expect(mocks.unenroll).toHaveBeenCalledWith('enrollment-1')
  })
})
