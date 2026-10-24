export function requiresRecentAuthentication(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const error = value as { code?: unknown; message?: unknown; details?: unknown }
  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()
  const details = error.details && typeof error.details === 'object'
    ? error.details as { reason?: unknown }
    : undefined
  if (code === 'auth/requires-recent-login') return true
  if (code !== 'functions/failed-precondition') return false
  return details?.reason === 'recent-auth-required'
    || message.includes('recent sign-in')
    || message.includes('sign in again')
}
