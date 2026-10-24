const onboardingWindowMs = 30 * 60 * 1000

/**
 * Mirrors the trusted server's new-account window. This client check never
 * grants access; it only decides whether the idempotent onboarding callable
 * should be retried instead of silently treating a new account as complete.
 */
export function isRecentlyCreatedAccount(metadata: { creationTime?: string }, now = Date.now()) {
  const createdAt = metadata.creationTime ? Date.parse(metadata.creationTime) : Number.NaN
  return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt <= onboardingWindowMs
}
