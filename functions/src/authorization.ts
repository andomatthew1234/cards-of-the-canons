import { getAuth } from 'firebase-admin/auth'
import { HttpsError } from 'firebase-functions/v2/https'
import { db } from './firebase'

// Shared current-user authorization for every authenticated callable endpoint.
//
// A caller is accepted only when all of the following hold:
//   1. the request carries an authenticated session,
//   2. the raw bearer token verifies with revocation checking enabled, so
//      disabled accounts and revoked refresh tokens fail closed,
//   3. the Auth user still exists and is not disabled,
//   4. the server-owned accountControls record is not a block or tombstone,
//   5. the roles checked are the *current* roles (fresh Auth claims plus the
//      server-owned accountRoles record), not whatever an old token claimed.
//
// Dependencies are injectable so the decision logic can be regression tested
// without an Auth emulator.

export type AccountRole = 'owner' | 'admin' | 'member'

export interface AccountControlRecord {
  disabled?: unknown
  deleted?: unknown
  deletionState?: unknown
  updatedAt?: unknown
}

export interface CallerContext {
  uid: string
  email: string | null
  emailVerified: boolean
  admin: boolean
  role: AccountRole | null
  authTime: number
}

export interface AuthorizationOptions {
  requireAdmin?: boolean
  requireRecentAuthSeconds?: number
  requireVerifiedEmail?: boolean
  loadRole?: boolean
}

/**
 * Administrator dashboard actions share one predictable reauthentication
 * window. Firebase still verifies every ID token with revocation checking and
 * reloads the user's current admin claim on every request; this only controls
 * how often an already-authorised administrator must prove their credentials
 * again for a sensitive dashboard action.
 */
export const ADMIN_RECENT_AUTH_SECONDS = 7 * 24 * 60 * 60

interface DecodedTokenLike {
  uid: string
  email?: string | null
  email_verified?: boolean
  auth_time?: number
}

interface UserRecordLike {
  uid: string
  disabled: boolean
  email?: string | null
  customClaims?: { admin?: unknown; [key: string]: unknown } | null
}

export interface AuthorizationDeps {
  verifyIdToken: (token: string, checkRevoked: boolean) => Promise<DecodedTokenLike>
  loadUser: (uid: string) => Promise<UserRecordLike>
  loadControl: (uid: string) => Promise<unknown>
  loadRole: (uid: string) => Promise<unknown>
}

export interface CallableRequestLike {
  auth?: { uid: string; token?: Record<string, unknown> } | null
  rawRequest?: {
    headers?: Record<string, string | string[] | undefined>
    get?: (name: string) => string | undefined
  } | null
}

function code(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
}

/**
 * Account-controls records only ever *add* access limits. Missing optional
 * fields (for example `deleted` on a plain disable record) must fail safely:
 * an absent flag never blocks a valid, enabled user, while an explicit
 * `true` always does.
 */
export function isAccountControlBlocked(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const control = value as Record<string, unknown>
  return control.disabled === true || control.deleted === true
}

export function accountRole(value: unknown): AccountRole | null {
  if (!value || typeof value !== 'object') return null
  const role = (value as Record<string, unknown>).role
  return role === 'owner' || role === 'admin' || role === 'member' ? role : null
}

function bearerToken(request: CallableRequestLike): string | null {
  const raw = request.rawRequest
  const header = raw?.headers?.authorization ?? (raw?.get ? raw.get('authorization') : undefined)
  const value = Array.isArray(header) ? header[0] : header
  if (typeof value !== 'string') return null
  const match = /^Bearer[ \t]+(.+)$/i.exec(value.trim())
  return match ? match[1].trim() : null
}

const defaultDeps: AuthorizationDeps = {
  async verifyIdToken(token, checkRevoked) {
    const decoded = await getAuth().verifyIdToken(token, checkRevoked)
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      email_verified: decoded.email_verified === true,
      auth_time: typeof decoded.auth_time === 'number' ? decoded.auth_time : undefined,
    }
  },
  async loadUser(uid) {
    const account = await getAuth().getUser(uid)
    return {
      uid: account.uid,
      disabled: account.disabled,
      email: account.email ?? null,
      customClaims: (account.customClaims ?? null) as UserRecordLike['customClaims'],
    }
  },
  async loadControl(uid) {
    const snapshot = await db.collection('accountControls').doc(uid).get()
    return snapshot.exists ? snapshot.data() : null
  },
  async loadRole(uid) {
    const snapshot = await db.collection('accountRoles').doc(uid).get()
    return snapshot.exists ? snapshot.data() : null
  },
}

/**
 * Authorises the current caller for an authenticated callable endpoint.
 * Throws HttpsError and therefore fails closed on every uncertain input.
 */
export async function authorizeRequest(
  request: CallableRequestLike,
  options: AuthorizationOptions = {},
  deps: AuthorizationDeps = defaultDeps,
): Promise<CallerContext> {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.')

  const token = bearerToken(request)
  if (!token) throw new HttpsError('unauthenticated', 'A valid session token is required.')

  let decoded: DecodedTokenLike
  try {
    decoded = await deps.verifyIdToken(token, true)
  } catch (error) {
    const failure = code(error)
    if (failure === 'auth/user-not-found' || failure === 'auth/id-token-expired' || failure === 'auth/argument-error' || failure === 'auth/invalid-id-token') {
      throw new HttpsError('unauthenticated', 'Your session has expired. Sign in again.')
    }
    // Revoked tokens, disabled accounts and unknown revocation states all land
    // here: deny rather than trusting a token we cannot verify.
    throw new HttpsError('permission-denied', 'This session is no longer valid. Sign in again.')
  }
  if (decoded.uid !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'This session does not match the signed-in account.')
  }

  let user: UserRecordLike
  try {
    user = await deps.loadUser(decoded.uid)
  } catch (error) {
    const failure = code(error)
    if (failure === 'auth/user-not-found') throw new HttpsError('unauthenticated', 'This account no longer exists. Sign in again.')
    throw new HttpsError('permission-denied', 'This account could not be authorised right now.')
  }
  if (user.disabled) throw new HttpsError('permission-denied', 'This account has been disabled.')

  const control = await deps.loadControl(decoded.uid)
  if (isAccountControlBlocked(control)) {
    throw new HttpsError('permission-denied', 'This account has been disabled by an administrator.')
  }

  // Roles come from the live Auth record, never from the presented token.
  const admin = user.customClaims?.admin === true
  const role = options.loadRole ? accountRole(await deps.loadRole(decoded.uid)) : null
  if (options.requireAdmin && !admin) {
    throw new HttpsError('permission-denied', 'Administrator access required.')
  }

  const emailVerified = decoded.email_verified === true
  if (options.requireVerifiedEmail && !emailVerified) {
    throw new HttpsError('failed-precondition', 'Verify your email address before continuing.')
  }

  const authTime = typeof decoded.auth_time === 'number' && decoded.auth_time > 0 ? decoded.auth_time : 0
  if (options.requireRecentAuthSeconds !== undefined) {
    if (!authTime) throw new HttpsError('failed-precondition', 'Recent sign-in is required.', { reason: 'recent-auth-required' })
    const age = Date.now() / 1000 - authTime
    if (age < 0 || age > options.requireRecentAuthSeconds) {
      throw new HttpsError('failed-precondition', 'Recent sign-in is required.', { reason: 'recent-auth-required' })
    }
  }

  return {
    uid: decoded.uid,
    email: typeof user.email === 'string' ? user.email : decoded.email ?? null,
    emailVerified,
    admin,
    role,
    authTime,
  }
}

/** Convenience wrapper for administrator-only endpoints. */
export function requireAdminContext(request: CallableRequestLike, deps?: AuthorizationDeps) {
  return authorizeRequest(request, { requireAdmin: true, loadRole: true }, deps)
}

export interface DestructiveActionInput {
  action: 'disable' | 'enable' | 'delete' | 'revokeAdmin'
  callerUid: string
  targetUid: string
  callerRole: AccountRole | null
  targetRole: AccountRole | null
  targetIsAdmin: boolean
  ownerCount: number
}

/**
 * Owner and last-owner protection for account administration. Owner or
 * administrator accounts can only be changed by an owner, and the final owner
 * can never be disabled or deleted, so a compromised or careless session
 * cannot lock every operator out of the site.
 */
export function assertAccountActionAllowed(input: DestructiveActionInput): void {
  const destructive = input.action === 'disable' || input.action === 'delete' || input.action === 'revokeAdmin'
  if (!destructive) return
  if (input.callerUid === input.targetUid) {
    throw new HttpsError('failed-precondition', 'Administrators cannot remove their own access.')
  }
  const protectedTarget = input.targetRole === 'owner' || input.targetIsAdmin
  if (!protectedTarget) return
  if (input.callerRole !== 'owner') {
    throw new HttpsError('permission-denied', 'An owner administrator is required to change another administrator.')
  }
  if (input.targetRole === 'owner' && input.ownerCount <= 1) {
    throw new HttpsError('failed-precondition', 'The last owner account cannot be disabled, deleted or demoted.')
  }
}

/** Counts owner role records so last-owner protection can be enforced. */
export async function countOwnerAccounts(): Promise<number> {
  const snapshot = await db.collection('accountRoles').where('role', '==', 'owner').limit(50).get()
  return snapshot.size
}
