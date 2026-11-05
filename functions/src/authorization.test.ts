import { describe, expect, it } from 'vitest'
import {
  ADMIN_RECENT_AUTH_SECONDS,
  accountRole,
  assertAccountActionAllowed,
  authorizeRequest,
  isAccountControlBlocked,
  requireAdminContext,
  type AuthorizationDeps,
  type CallableRequestLike,
} from './authorization'

function request(overrides: Partial<CallableRequestLike> = {}): CallableRequestLike {
  return {
    auth: { uid: 'caller-1' },
    rawRequest: { headers: { authorization: 'Bearer presented-token' } },
    ...overrides,
  }
}

function deps(overrides: Partial<AuthorizationDeps> = {}): AuthorizationDeps {
  return {
    verifyIdToken: async () => ({ uid: 'caller-1', email: 'caller@example.com', email_verified: true, auth_time: Math.floor(Date.now() / 1000) }),
    loadUser: async () => ({ uid: 'caller-1', disabled: false, email: 'caller@example.com', customClaims: null }),
    loadControl: async () => null,
    loadRole: async () => null,
    ...overrides,
  }
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    return typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'unknown'
  }
}

describe('shared callable authorization', () => {
  it('rejects unauthenticated and token-less requests', async () => {
    expect(await codeOf(authorizeRequest(request({ auth: null }), {}, deps()))).toBe('unauthenticated')
    expect(await codeOf(authorizeRequest(request({ rawRequest: { headers: {} } }), {}, deps()))).toBe('unauthenticated')
    expect(await codeOf(authorizeRequest(request({ rawRequest: { headers: { authorization: 'Basic abc' } } }), {}, deps()))).toBe('unauthenticated')
  })

  it('verifies the raw bearer token with revocation checking', async () => {
    let checkedRevoked: boolean | undefined
    const observing = deps({ verifyIdToken: async (_token, checkRevoked) => { checkedRevoked = checkRevoked; return { uid: 'caller-1', email: 'caller@example.com', email_verified: true, auth_time: 1 } } })
    await authorizeRequest(request(), {}, observing)
    expect(checkedRevoked).toBe(true)

    // Revoked refresh tokens, disabled accounts and unverifiable states all
    // fail closed with a permission error rather than trusting the session.
    const revoked = deps({ verifyIdToken: async () => { throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }) } })
    expect(await codeOf(authorizeRequest(request(), {}, revoked))).toBe('permission-denied')

    const malformed = deps({ verifyIdToken: async () => { throw Object.assign(new Error('bad token'), { code: 'auth/argument-error' }) } })
    expect(await codeOf(authorizeRequest(request(), {}, malformed))).toBe('unauthenticated')
  })

  it('rejects a token that belongs to a different account', async () => {
    const mismatched = deps({ verifyIdToken: async () => ({ uid: 'someone-else', email_verified: true, auth_time: 1 }) })
    expect(await codeOf(authorizeRequest(request(), {}, mismatched))).toBe('permission-denied')
  })

  it('rejects disabled Auth users and blocked or tombstoned control records', async () => {
    const disabledUser = deps({ loadUser: async () => ({ uid: 'caller-1', disabled: true, customClaims: null }) })
    expect(await codeOf(authorizeRequest(request(), {}, disabledUser))).toBe('permission-denied')

    const blocked = deps({ loadControl: async () => ({ disabled: true, updatedAt: 'now' }) })
    expect(await codeOf(authorizeRequest(request(), {}, blocked))).toBe('permission-denied')

    const tombstoned = deps({ loadControl: async () => ({ disabled: false, deleted: true }) })
    expect(await codeOf(authorizeRequest(request(), {}, tombstoned))).toBe('permission-denied')
  })

  it('never blocks an enabled user because optional control fields are missing', async () => {
    // A plain disable record has no `deleted` key, and a fresh account may
    // have neither: absent optional fields must fail safely, not lock out.
    expect(isAccountControlBlocked({ disabled: false })).toBe(false)
    expect(isAccountControlBlocked({ updatedAt: 'now' })).toBe(false)
    expect(isAccountControlBlocked(null)).toBe(false)
    const withoutDeleted = deps({ loadControl: async () => ({ disabled: false, updatedAt: 'now' }) })
    await expect(authorizeRequest(request(), {}, withoutDeleted)).resolves.toMatchObject({ uid: 'caller-1' })
  })

  it('takes administrator status from current claims, never from the token', async () => {
    // The presented token claims admin, but the live Auth record does not.
    const staleToken = request({ auth: { uid: 'caller-1', token: { admin: true } } })
    const noClaim = deps({ loadUser: async () => ({ uid: 'caller-1', disabled: false, email: 'caller@example.com', customClaims: null }) })
    expect(await codeOf(authorizeRequest(staleToken, { requireAdmin: true }, noClaim))).toBe('permission-denied')

    const freshClaim = deps({ loadUser: async () => ({ uid: 'caller-1', disabled: false, email: 'caller@example.com', customClaims: { admin: true } }) })
    await expect(authorizeRequest(request(), { requireAdmin: true }, freshClaim)).resolves.toMatchObject({ admin: true })

    // A revoked claim stops working even though the caller still presents a
    // token that was issued while they held it.
    const demoted = deps({ loadUser: async () => ({ uid: 'caller-1', disabled: false, email: 'caller@example.com', customClaims: {} }) })
    expect(await codeOf(requireAdminContext(request(), demoted))).toBe('permission-denied')
  })

  it('requires a verified email only where the option is set', async () => {
    const unverified = deps({ verifyIdToken: async () => ({ uid: 'caller-1', email: 'caller@example.com', email_verified: false, auth_time: 1 }) })
    expect(await codeOf(authorizeRequest(request(), { requireVerifiedEmail: true }, unverified))).toBe('failed-precondition')
    await expect(authorizeRequest(request(), {}, unverified)).resolves.toMatchObject({ emailVerified: false })
  })

  it('enforces the recent-authentication window for destructive actions', async () => {
    const now = Math.floor(Date.now() / 1000)
    const fresh = deps({ verifyIdToken: async () => ({ uid: 'caller-1', email_verified: true, auth_time: now }) })
    await expect(authorizeRequest(request(), { requireRecentAuthSeconds: 300 }, fresh)).resolves.toBeTruthy()

    const stale = deps({ verifyIdToken: async () => ({ uid: 'caller-1', email_verified: true, auth_time: now - 3600 }) })
    await expect(authorizeRequest(request(), { requireRecentAuthSeconds: 300 }, stale)).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'recent-auth-required' } })

    const missing = deps({ verifyIdToken: async () => ({ uid: 'caller-1', email_verified: true }) })
    await expect(authorizeRequest(request(), { requireRecentAuthSeconds: 300 }, missing)).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'recent-auth-required' } })
  })

  it('keeps administrator dashboard reauthentication valid for seven days', async () => {
    expect(ADMIN_RECENT_AUTH_SECONDS).toBe(7 * 24 * 60 * 60)
    const now = Math.floor(Date.now() / 1000)
    const sixDaysOld = deps({ verifyIdToken: async () => ({ uid: 'caller-1', email_verified: true, auth_time: now - (6 * 24 * 60 * 60) }) })
    await expect(authorizeRequest(request(), { requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS }, sixDaysOld)).resolves.toBeTruthy()

    const eightDaysOld = deps({ verifyIdToken: async () => ({ uid: 'caller-1', email_verified: true, auth_time: now - (8 * 24 * 60 * 60) }) })
    await expect(authorizeRequest(request(), { requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS }, eightDaysOld)).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'recent-auth-required' },
    })
  })

  it('loads the caller role only when asked', async () => {
    const withRole = deps({ loadRole: async () => ({ role: 'owner' }) })
    const context = await authorizeRequest(request(), { loadRole: true }, withRole)
    expect(context.role).toBe('owner')
    expect(accountRole({ role: 'nonsense' })).toBeNull()
    const withoutRole = await authorizeRequest(request(), {}, withRole)
    expect(withoutRole.role).toBeNull()
  })
})

describe('owner and last-owner protection', () => {
  const ownerTarget = { action: 'disable' as const, callerUid: 'admin-1', targetUid: 'owner-1', callerRole: 'admin' as const, targetRole: 'owner' as const, targetIsAdmin: true, ownerCount: 2 }

  it('refuses self-service removal of administrator access', () => {
    expect(() => assertAccountActionAllowed({ ...ownerTarget, targetUid: 'admin-1' })).toThrowError(/cannot change their own access/i)
  })

  it('requires an owner to change an owner account', () => {
    expect(() => assertAccountActionAllowed(ownerTarget)).toThrowError(/owner administrator is required/i)
    expect(() => assertAccountActionAllowed({ ...ownerTarget, callerRole: 'owner' })).not.toThrow()
  })

  it('allows administrators to grant and revoke non-owner administrator access', () => {
    const nonOwnerAdmin = { ...ownerTarget, targetRole: 'admin' as const, targetIsAdmin: true }
    expect(() => assertAccountActionAllowed({ ...nonOwnerAdmin, action: 'revokeAdmin' })).not.toThrow()
    expect(() => assertAccountActionAllowed({ ...nonOwnerAdmin, targetRole: 'member', targetIsAdmin: false, action: 'grantAdmin' })).not.toThrow()
    expect(() => assertAccountActionAllowed({ ...nonOwnerAdmin, action: 'disable' })).toThrowError(/owner administrator is required/i)
    expect(() => assertAccountActionAllowed({ ...nonOwnerAdmin, action: 'delete' })).toThrowError(/owner administrator is required/i)
  })

  it('never allows the final owner to be disabled, deleted or demoted', () => {
    const lastOwner = { ...ownerTarget, callerRole: 'owner' as const, ownerCount: 1 }
    for (const action of ['disable', 'delete', 'revokeAdmin'] as const) {
      expect(() => assertAccountActionAllowed({ ...lastOwner, action })).toThrowError(/last owner/i)
    }
    // A second owner exists, so the first can be changed by another owner.
    expect(() => assertAccountActionAllowed({ ...lastOwner, ownerCount: 2 })).not.toThrow()
  })

  it('leaves ordinary customer actions and non-destructive fixes alone', () => {
    expect(() => assertAccountActionAllowed({ ...ownerTarget, targetRole: null, targetIsAdmin: false, callerRole: 'admin' })).not.toThrow()
    expect(() => assertAccountActionAllowed({ ...ownerTarget, action: 'enable', ownerCount: 1 })).not.toThrow()
  })
})
