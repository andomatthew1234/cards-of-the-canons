export function maskEmail(email: string | null | undefined) {
  if (!email) return 'Email unavailable'
  const at = email.lastIndexOf('@')
  if (at <= 0) return 'Email unavailable'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const first = local.slice(0, 1)
  const tail = local.length > 4 ? local.slice(-2) : ''
  const hiddenLength = Math.max(3, Math.min(8, local.length - first.length - tail.length))
  return `${first}${'•'.repeat(hiddenLength)}${tail}@${domain}`
}

export function emailMatches(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())
}

export function providerName(providerId: string) {
  if (providerId === 'password') return 'Email and password'
  if (providerId === 'google.com') return 'Google'
  if (providerId === 'apple.com') return 'Apple'
  return 'Connected provider'
}

// ---------------------------------------------------------------------------
// UID-scoped security state
//
// Sensitive in-progress account state (a pending email change and its resend
// cooldown) is stored under keys that embed the account UID, and anything that
// does not belong to the signed-in account is removed when identity changes or
// the session ends. A shared browser can therefore never show user A's pending
// change to user B, and a signed-out visitor never inherits one.
// ---------------------------------------------------------------------------

const statePrefix = 'cards.security.'
const uidPattern = /^[A-Za-z0-9_-]{1,128}$/

function usableUid(uid: string | null | undefined): uid is string {
  return typeof uid === 'string' && uidPattern.test(uid)
}

/** Scoped storage key, or null when there is no usable identity to scope to. */
export function securityStateKey(uid: string | null | undefined, name: string): string | null {
  if (!usableUid(uid) || !/^[a-z0-9.-]{1,64}$/.test(name)) return null
  return `${statePrefix}${uid}.${name}`
}

export function readSecurityState(uid: string | null | undefined, name: string): string {
  const key = securityStateKey(uid, name)
  if (!key) return ''
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function writeSecurityState(uid: string | null | undefined, name: string, value: string): void {
  const key = securityStateKey(uid, name)
  if (!key) return
  try {
    sessionStorage.setItem(key, value)
  } catch { /* Storage may be unavailable; the flow simply starts fresh. */ }
}

export function clearSecurityState(uid: string | null | undefined, name: string): void {
  const key = securityStateKey(uid, name)
  if (!key) return
  try {
    sessionStorage.removeItem(key)
  } catch { /* Nothing to clear. */ }
}

/**
 * Removes every scoped entry that does not belong to `currentUid`. Passing
 * null (signed out) clears all of them.
 */
export function clearSecurityStateExcept(currentUid: string | null | undefined): void {
  try {
    const keepPrefix = usableUid(currentUid) ? `${statePrefix}${currentUid}.` : null
    const stale: string[] = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (!key || !key.startsWith(statePrefix)) continue
      if (!keepPrefix || !key.startsWith(keepPrefix)) stale.push(key)
    }
    stale.forEach((key) => sessionStorage.removeItem(key))
  } catch { /* Storage may be unavailable; nothing is retained anyway. */ }
}
