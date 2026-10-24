import {
  TotpMultiFactorGenerator,
  multiFactor,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
  type UserCredential,
} from 'firebase/auth'

export const authenticatorFactorId = TotpMultiFactorGenerator.FACTOR_ID

export interface MfaFactorSummary {
  uid: string
  factorId: string
  displayName: string
  enrollmentTime: string
}

export interface TotpEnrollmentDraft {
  secret: TotpSecret
  secretKey: string
  qrCodeUrl: string
}

export function summariseMfaFactors(factors: MultiFactorInfo[]): MfaFactorSummary[] {
  return factors.map((factor, index) => ({
    uid: factor.uid,
    factorId: factor.factorId,
    displayName: factor.displayName?.trim() || (factor.factorId === authenticatorFactorId ? 'Authenticator app' : `Security method ${index + 1}`),
    enrollmentTime: factor.enrollmentTime,
  }))
}

export function enrolledMfaFactors(user: User): MfaFactorSummary[] {
  return summariseMfaFactors(multiFactor(user).enrolledFactors)
}

export async function beginTotpEnrollment(user: User, issuer: string): Promise<TotpEnrollmentDraft> {
  const session = await multiFactor(user).getSession()
  const secret = await TotpMultiFactorGenerator.generateSecret(session)
  const accountName = user.email || user.uid
  return {
    secret,
    secretKey: secret.secretKey,
    qrCodeUrl: secret.generateQrCodeUrl(accountName, issuer),
  }
}

export async function completeTotpEnrollment(user: User, secret: TotpSecret, verificationCode: string, displayName: string) {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, verificationCode)
  await multiFactor(user).enroll(assertion, displayName)
}

export async function removeMfaFactor(user: User, enrollmentId: string) {
  await multiFactor(user).unenroll(enrollmentId)
}

export async function resolveTotpSignIn(resolver: MultiFactorResolver, enrollmentId: string, verificationCode: string): Promise<UserCredential> {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(enrollmentId, verificationCode)
  return resolver.resolveSignIn(assertion)
}
