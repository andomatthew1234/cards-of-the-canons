import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  EmailAuthProvider, GoogleAuthProvider, OAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword,
  getAdditionalUserInfo, getMultiFactorResolver, onAuthStateChanged, onIdTokenChanged, reauthenticateWithCredential, reauthenticateWithPopup, reload,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
  setPersistence, signInWithPopup, signOut, updatePassword, updateProfile, verifyBeforeUpdateEmail,
  type MultiFactorError, type MultiFactorResolver, type User, type UserCredential,
} from 'firebase/auth'
import { appleAuthEnabled, isFirebaseMode } from '../config'
import { beginAccountOnboarding, deleteAuthenticatedAccount, ensureUserProfile, isAccountAccessBlocked, syncUserProfileEmail } from '../lib/accounts'
import { getFirebaseServices } from '../lib/firebase'
import { trackEvent } from '../lib/analytics'
import { recordLoginActivity, recordSecurityActivity } from '../lib/accountActivity'
import { clearSecurityStateExcept } from '../lib/security'
import {
  beginTotpEnrollment as createTotpEnrollment,
  completeTotpEnrollment as enrolTotp,
  enrolledMfaFactors,
  removeMfaFactor as unenrolMfaFactor,
  resolveTotpSignIn,
  summariseMfaFactors,
  type MfaFactorSummary,
  type TotpEnrollmentDraft,
} from '../lib/authenticatorMfa'

export interface MfaSignInChallenge {
  firstFactorMethod: 'password' | 'google' | 'apple'
  factors: MfaFactorSummary[]
}

export interface MfaReauthenticationChallenge {
  factors: MfaFactorSummary[]
}

interface AuthValue {
  user: AccountUser | null
  isAdmin: boolean
  loading: boolean
  notice: string
  providers: string[]
  mfaFactors: MfaFactorSummary[]
  mfaChallenge: MfaSignInChallenge | null
  mfaReauthenticationChallenge: MfaReauthenticationChallenge | null
  clearNotice: () => void
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<boolean>
  signInWithApple: () => Promise<boolean>
  register: (name: string, email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
  refreshUser: () => Promise<AccountUser>
  updateDisplayName: (name: string) => Promise<void>
  requestEmailChange: (email: string) => Promise<void>
  reauthenticate: (providerId: string, password?: string) => Promise<'complete' | 'mfa-required'>
  /**
   * Confirms the current password and applies the new one. When the account
   * has authenticator MFA the shared reauthentication challenge owns the flow
   * and this resolves `mfa-required` after staging the pending change.
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<'complete' | 'mfa-required'>
  /** Abandons a staged sensitive action (for example a closed password dialog). */
  cancelPendingSecurityAction: () => void
  deleteCurrentAccount: (legacyPassword?: string) => Promise<void>
  beginTotpEnrollment: () => Promise<TotpEnrollmentDraft>
  completeTotpEnrollment: (draft: TotpEnrollmentDraft, verificationCode: string, displayName?: string) => Promise<void>
  removeMfaFactor: (enrollmentId: string) => Promise<void>
  refreshMfaFactors: () => Promise<MfaFactorSummary[]>
  resolveMfaSignIn: (enrollmentId: string, verificationCode: string) => Promise<void>
  cancelMfaSignIn: () => void
  resolveMfaReauthentication: (enrollmentId: string, verificationCode: string) => Promise<void>
  cancelMfaReauthentication: () => void
  logOut: () => Promise<void>
}

export interface AccountUser {
  uid: string
  email: string | null
  displayName: string | null
  emailVerified: boolean
  providerData: Array<{ providerId: string; email: string | null; displayName: string | null }>
  metadata: { creationTime?: string; lastSignInTime?: string }
}

const AuthContext = createContext<AuthValue | null>(null)
const blockedAccountMessage = 'This account has been disabled. Contact the site administrator if you think this is a mistake.'

export function friendlyAuthError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const details = typeof error === 'object' && error && 'details' in error && error.details && typeof error.details === 'object'
    ? error.details as { reason?: unknown }
    : undefined
  const serverMessage = typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
    ? error.message
    : ''
  if (code === 'functions/failed-precondition') {
    if (details?.reason === 'recent-auth-required') return 'Please sign in again before completing this action.'
    return serverMessage || 'The requirements for this action have not been met.'
  }
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The email or password was not recognised.',
    'auth/invalid-login-credentials': 'The email or password was not recognised.',
    'auth/user-not-found': 'The email or password was not recognised.',
    'auth/wrong-password': 'The email or password was not recognised.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/missing-password': 'Enter your password to continue.',
    'auth/email-already-in-use': 'An account already uses this email address.',
    'auth/weak-password': 'Choose a stronger password with at least eight characters.',
    'auth/user-disabled': blockedAccountMessage,
    'auth/account-disabled': blockedAccountMessage,
    'auth/network-request-failed': 'The sign-in service could not be reached. Check your connection and try again.',
    'auth/web-storage-unsupported': 'This browser is blocking the storage needed to keep you signed in. Allow site storage and try again.',
    'auth/operation-not-supported-in-this-environment': 'This sign-in method is not supported in the current browser.',
    'auth/internal-error': 'The sign-in service is temporarily unavailable. Please try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before completion.',
    'auth/popup-blocked': 'The Google sign-in window was blocked. Allow pop-ups for this site and try again.',
    'auth/cancelled-popup-request': 'A newer sign-in request replaced the previous one. Please try again.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email. Sign in using its original method first.',
    'auth/user-mismatch': 'Choose the same account that is currently signed in.',
    'auth/invalid-action-code': 'This verification link is no longer valid. Start the change again.',
    'auth/expired-action-code': 'This verification link has expired. Start the change again.',
    'auth/provider-already-linked': 'That sign-in method is already connected.',
    'auth/credential-already-in-use': 'That sign-in method belongs to another account.',
    'auth/requires-recent-login': 'For security, please sign out and sign in again before making this change.',
    'auth/too-many-requests': 'Too many attempts were made. Please wait and try again.',
    'auth/unauthorized-domain': 'This sign-in method is not authorised for this website address.',
    'auth/operation-not-allowed': 'That sign-in option is not available yet.',
    'auth/multi-factor-auth-required': 'Enter a code from your authenticator app to finish signing in.',
    'auth/invalid-verification-code': 'That authenticator code is incorrect or has expired. Enter the current six-digit code and try again.',
    'auth/code-expired': 'That authenticator code has expired. Enter the newest six-digit code from your app.',
    'auth/missing-verification-code': 'Enter the six-digit code from your authenticator app.',
    'auth/maximum-second-factor-count-exceeded': 'This account already has the maximum number of additional security methods.',
    'auth/second-factor-already-in-use': 'This authenticator is already enrolled on the account.',
    'auth/unsupported-first-factor': 'This sign-in method cannot be used with multi-factor authentication.',
    'auth/unverified-email': 'Verify your email address before setting up an authenticator app.',
    'auth/user-token-expired': 'Your session expired after the security method changed. Sign in again to continue.',
  }
  if (messages[code]) return messages[code]
  if (code.startsWith('auth/') || code.startsWith('functions/') || code === 'permission-denied') {
    return 'The account action could not be completed. Please try again.'
  }
  return error instanceof Error ? error.message : 'The account action could not be completed.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [isAdmin, setAdmin] = useState(false)
  const [loading, setLoading] = useState(isFirebaseMode)
  const [notice, setNotice] = useState('')
  const [mfaFactors, setMfaFactors] = useState<MfaFactorSummary[]>([])
  const [mfaChallenge, setMfaChallenge] = useState<MfaSignInChallenge | null>(null)
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null)
  const [mfaReauthenticationChallenge, setMfaReauthenticationChallenge] = useState<MfaReauthenticationChallenge | null>(null)
  const [mfaReauthenticationResolver, setMfaReauthenticationResolver] = useState<MultiFactorResolver | null>(null)
  // A staged sensitive action (for example a password change waiting on the
  // shared MFA challenge) is held in memory only and dies with the session.
  const pendingSensitiveAction = useRef<{ kind: 'password-change'; newPassword: string } | null>(null)
  const activeUidRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isFirebaseMode) return
    const { auth } = getFirebaseServices()
    let unsubscribe: () => void = () => undefined
    let unsubscribeTokens: () => void = () => undefined
    let cancelled = false
    let revision = 0
    // Claims are only ever issued by trusted server tooling. Refresh the ID
    // token once per session so a claim granted while this browser held an
    // older token takes effect, without any mailbox-based fallback path.
    let claimRefreshed = false
    auth.useDeviceLanguage()
    const observe = () => {
      if (cancelled) return
      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        const activeRevision = ++revision
        setLoading(true)

        void (async () => {
          if (!nextUser) {
            if (cancelled || activeRevision !== revision) return
            // Signed out: no account may inherit this browser's security state.
            activeUidRef.current = null
            pendingSensitiveAction.current = null
            clearSecurityStateExcept(null)
            setUser(null)
            setAdmin(false)
            setMfaFactors([])
            setMfaReauthenticationChallenge(null)
            setMfaReauthenticationResolver(null)
            setLoading(false)
            return
          }

          // Identity changed (first sign-in or a different account): drop any
          // staged action and every scoped entry that is not this account's.
          if (activeUidRef.current !== nextUser.uid) {
            pendingSensitiveAction.current = null
            clearSecurityStateExcept(nextUser.uid)
            activeUidRef.current = nextUser.uid
          } else {
            clearSecurityStateExcept(nextUser.uid)
          }

          try {
            if (await isAccountAccessBlocked(nextUser.uid)) {
              if (cancelled || activeRevision !== revision) return
              setUser(null)
              setAdmin(false)
              setNotice(blockedAccountMessage)
              setLoading(false)
              await signOut(auth)
              return
            }
          } catch {
            // Firestore rules remain the authority for private data. A temporary
            // account-control read failure must not destroy a valid Auth session.
            console.warn('Account access status could not be refreshed.')
          }

          let admin = false
          try {
            let token = await nextUser.getIdTokenResult()
            if (!claimRefreshed) {
              claimRefreshed = true
              token = await nextUser.getIdTokenResult(true)
            }
            admin = token.claims.admin === true
          } catch {
            console.warn('Account permissions could not be refreshed.')
          }

          if (cancelled || activeRevision !== revision) return
          setUser(accountUser(nextUser))
          setMfaFactors(enrolledMfaFactors(nextUser))
          setMfaChallenge(null)
          setMfaResolver(null)
          setAdmin(admin)
          setLoading(false)

          void recordLoginActivity()
            .catch(() => console.warn('Recent sign-in activity could not be recorded.'))

          // Profile synchronisation is useful but non-critical. It must never
          // bounce a successfully authenticated customer out of their account.
          if (nextUser.displayName) {
            void ensureUserProfile(nextUser.uid, { displayName: nextUser.displayName, email: nextUser.email || '' })
              .catch(() => console.warn('Account profile synchronisation could not be completed.'))
          }
        })().catch(() => {
          if (cancelled || activeRevision !== revision) return
          setUser(null)
          setAdmin(false)
          setLoading(false)
          setNotice('Your account session could not be checked. Refresh the page and try again.')
        })
      }, () => {
        if (cancelled) return
        setUser(null)
        setAdmin(false)
        setLoading(false)
        setNotice('Your account session could not be loaded. Refresh the page and try again.')
      })

      // Token-change listener: claims and account blocks must take effect on
      // the next token, not only on the next page load. A revoked or blocked
      // session ends here; a demoted administrator loses the flag here.
      unsubscribeTokens = onIdTokenChanged(auth, (tokenUser) => {
        if (cancelled || !tokenUser) return
        if (tokenUser.uid !== activeUidRef.current) return
        void (async () => {
          try {
            if (await isAccountAccessBlocked(tokenUser.uid)) {
              if (cancelled) return
              pendingSensitiveAction.current = null
              clearSecurityStateExcept(null)
              activeUidRef.current = null
              setUser(null)
              setAdmin(false)
              setMfaFactors([])
              setMfaReauthenticationChallenge(null)
              setMfaReauthenticationResolver(null)
              setNotice(blockedAccountMessage)
              await signOut(auth)
              return
            }
            const token = await tokenUser.getIdTokenResult()
            if (cancelled || tokenUser.uid !== activeUidRef.current) return
            setAdmin(token.claims.admin === true)
          } catch (error) {
            // An expired or revoked token ends the session; anything else
            // (offline, transient failure) is left to the rules, which remain
            // the authority for private data.
            const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
            if (code === 'auth/user-token-expired' || code === 'auth/invalid-user-token') {
              if (cancelled) return
              pendingSensitiveAction.current = null
              setUser(null)
              setAdmin(false)
              setLoading(false)
              setNotice('Your session ended because your credentials changed. Sign in again to continue.')
            }
          }
        })()
      })
    }

    void setPersistence(auth, browserLocalPersistence)
      .catch(() => {
        if (!cancelled) setNotice('This browser may not be able to keep you signed in. Check that site storage is allowed.')
      })
      .finally(observe)

    return () => {
      cancelled = true
      revision += 1
      unsubscribe()
      unsubscribeTokens()
    }
  }, [])
  const demoSignIn = (providerId: string, email = 'demo@example.com', displayName = 'Demo Collector') => {
    setUser({ uid: 'demo-customer', email, displayName, emailVerified: true, providerData: [{ providerId, email, displayName }], metadata: {} })
  }
  const firebaseOnly = () => {
    if (!isFirebaseMode) throw new Error('Account services are not available in this environment.')
    return getFirebaseServices().auth
  }
  const currentUser = () => {
    const current = firebaseOnly().currentUser
    if (!current) throw new Error('Please sign in to continue.')
    return current
  }
  async function completeProviderSignIn(provider: GoogleAuthProvider | OAuthProvider) {
    const result = await signInWithPopup(firebaseOnly(), provider)
    const isNewUser = getAdditionalUserInfo(result)?.isNewUser === true
    await finishSignIn(result, result.providerId === 'apple.com' ? 'apple' : 'google')
    if (isNewUser) {
      // The onboarding route retries this idempotent call. A transient App
      // Check/Functions failure must not make a newly created account look
      // like an established account and silently skip setup.
      void beginAccountOnboarding()
        .catch(() => console.warn('New-account onboarding will be resumed on the setup page.'))
    }
    return isNewUser
  }
  async function finishSignIn(result: UserCredential, method: 'password' | 'google' | 'apple') {
    setUser(accountUser(result.user))
    setMfaFactors(enrolledMfaFactors(result.user))
    void ensureUserProfile(result.user.uid, { displayName: result.user.displayName || 'Collector', email: result.user.email || '' })
      .catch(() => console.warn('Account profile synchronisation could not be completed.'))
    if (getAdditionalUserInfo(result)?.isNewUser) trackEvent('sign_up', { method })
  }
  function stageMfaChallenge(error: unknown, method: 'password' | 'google' | 'apple') {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code !== 'auth/multi-factor-auth-required') return false
    const resolver = getMultiFactorResolver(firebaseOnly(), error as MultiFactorError)
    setMfaResolver(resolver)
    setMfaChallenge({ firstFactorMethod: method, factors: summariseMfaFactors(resolver.hints) })
    return true
  }
  /** Applies a staged sensitive action once reauthentication has succeeded. */
  async function runPendingSensitiveAction() {
    const action = pendingSensitiveAction.current
    if (!action) return
    pendingSensitiveAction.current = null
    if (action.kind === 'password-change') await applyPasswordChange(action.newPassword)
  }
  async function applyPasswordChange(newPassword: string) {
    const target = firebaseOnly().currentUser
    if (!target) throw new Error('Please sign in to continue.')
    await updatePassword(target, newPassword)
    void recordSecurityActivity('password_changed')
      .catch(() => console.warn('The password change succeeded, but its activity entry could not be recorded.'))
  }
  /**
   * Shared reauthentication path used by both the guided panel and the
   * password change, so an enrolled authenticator always takes the same
   * challenge workflow instead of failing with a raw credential error.
   */
  async function performReauthentication(providerId: string, password?: string): Promise<'complete' | 'mfa-required'> {
    if (!isFirebaseMode) {
      if (providerId === 'password' && !password) throw new Error('Enter your current password to continue.')
      return 'complete'
    }
    const current = currentUser()
    setMfaReauthenticationChallenge(null)
    setMfaReauthenticationResolver(null)
    try {
      if (providerId === 'password') {
        if (!current.email || !password) throw new Error('Enter your current password to continue.')
        await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password))
      } else if (providerId === 'google.com') {
        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({ prompt: 'select_account' })
        await reauthenticateWithPopup(current, provider)
      } else if (providerId === 'apple.com') {
        const provider = new OAuthProvider('apple.com')
        provider.addScope('email')
        provider.addScope('name')
        await reauthenticateWithPopup(current, provider)
      } else {
        throw new Error('This sign-in method cannot confirm sensitive changes yet.')
      }
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      if (code !== 'auth/multi-factor-auth-required') throw error
      const resolver = getMultiFactorResolver(firebaseOnly(), error as MultiFactorError)
      setMfaReauthenticationResolver(resolver)
      setMfaReauthenticationChallenge({ factors: summariseMfaFactors(resolver.hints) })
      return 'mfa-required'
    }
    await current.getIdToken(true)
    setUser(accountUser(current))
    await runPendingSensitiveAction()
    return 'complete'
  }
  async function beginFirebaseSession(action: () => Promise<void>, method: 'password' | 'google' | 'apple') {
    setNotice('')
    setLoading(true)
    try {
      await action()
      // The auth-state observer completes the access check and clears loading.
    } catch (error) {
      setLoading(false)
      if (stageMfaChallenge(error, method)) return
      throw error
    }
  }
  return <AuthContext.Provider value={{
    user, isAdmin, loading, notice, mfaFactors, mfaChallenge, mfaReauthenticationChallenge,
    providers: user?.providerData.map((provider) => provider.providerId) ?? [],
    clearNotice: () => setNotice(''),
    async signIn(email, password) {
      if (!isFirebaseMode) { if (!email || password.length < 1) throw new Error('Enter an email address and password.'); demoSignIn('password', email, 'Local Customer'); return }
      await beginFirebaseSession(async () => {
        const result = await signInWithEmailAndPassword(firebaseOnly(), email.trim().toLowerCase(), password)
        await finishSignIn(result, 'password')
      }, 'password')
    },
    async signInWithGoogle() {
      if (!isFirebaseMode) { demoSignIn('google.com', 'google.local@example.com', 'Google Customer'); return true }
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      let isNewUser = false
      await beginFirebaseSession(async () => { isNewUser = await completeProviderSignIn(provider) }, 'google')
      return isNewUser
    },
    async signInWithApple() { if (!appleAuthEnabled) throw new Error('Apple sign-in is not available yet.'); if (!isFirebaseMode) { demoSignIn('apple.com', 'apple.local@example.com', 'Apple Customer'); return true }; const provider = new OAuthProvider('apple.com'); provider.addScope('email'); provider.addScope('name'); let isNewUser = false; await beginFirebaseSession(async () => { isNewUser = await completeProviderSignIn(provider) }, 'apple'); return isNewUser },
    async register(name, email, password) {
      if (!isFirebaseMode) { if (password.length < 8) throw new Error('Use at least eight characters.'); demoSignIn('password', email, name.trim()); return }
      await beginFirebaseSession(async () => {
        const normalisedEmail = email.trim().toLowerCase()
        const result = await createUserWithEmailAndPassword(firebaseOnly(), normalisedEmail, password)
        await updateProfile(result.user, { displayName: name.trim() })
          .catch(() => console.warn('The account was created; its display name will be synchronised later.'))
        trackEvent('sign_up', { method: 'password' })
        setUser(accountUser(result.user))

        // These follow-up operations are intentionally recoverable. The Auth
        // account already exists, so rejecting registration here would let the
        // auth observer replace the setup screen with the normal account page.
        // AccountOnboarding retries the server-owned onboarding marker, while
        // profile and email verification each have their own later retry path.
        void ensureUserProfile(result.user.uid, { displayName: name.trim(), email: result.user.email || normalisedEmail })
          .catch(() => console.warn('The new account profile will be synchronised later.'))
        void sendEmailVerification(result.user)
          .catch(() => console.warn('The verification email could not be sent automatically; it can be resent from account security.'))
        void beginAccountOnboarding()
          .catch(() => console.warn('New-account onboarding will be resumed on the setup page.'))
      }, 'password')
    },
    async resetPassword(email) { if (!isFirebaseMode) throw new Error(`Password reset is not available in this environment. No email was sent to ${email}.`); await sendPasswordResetEmail(firebaseOnly(), email.trim().toLowerCase()) },
    async resendVerification() { if (!isFirebaseMode) throw new Error('Email verification is not available in this environment.'); await sendEmailVerification(currentUser()) },
    async refreshUser() {
      if (!isFirebaseMode) {
        if (!user) throw new Error('Please sign in to continue.')
        return user
      }
      const current = currentUser()
      await reload(current)
      await current.getIdToken(true)
      if (current.email) await syncUserProfileEmail(current.uid, current.email)
      const refreshed = accountUser(current)
      setUser(refreshed)
      return refreshed
    },
    async updateDisplayName(name) { if (!isFirebaseMode) { setUser((current) => current ? { ...current, displayName: name.trim() } : current); return }; const current = currentUser(); await updateProfile(current, { displayName: name.trim() }); setUser(accountUser(current)) },
    async requestEmailChange(email) {
      const normalisedEmail = email.trim().toLowerCase()
      if (!isFirebaseMode) { setUser((current) => current ? { ...current, email: normalisedEmail, emailVerified: false } : current); return }
      const continueUrl = new URL('/account/security/email', window.location.origin)
      continueUrl.searchParams.set('status', 'checking')
      await verifyBeforeUpdateEmail(currentUser(), normalisedEmail, { url: continueUrl.toString() })
    },
    async reauthenticate(providerId, password) {
      return performReauthentication(providerId, password)
    },
    async changePassword(currentPassword, newPassword) {
      if (!isFirebaseMode) {
        if (!currentPassword || newPassword.length < 8) throw new Error('Enter the current password and a new password of at least eight characters.')
        return 'complete'
      }
      const current = currentUser()
      if (!current.email) throw new Error('This account has no password email address.')
      pendingSensitiveAction.current = null
      // The password change rides the same reauthentication path as every
      // other sensitive action, so enrolled MFA raises the shared challenge
      // workflow instead of an unhandled credential error.
      const outcome = await performReauthentication('password', currentPassword)
      if (outcome === 'mfa-required') {
        pendingSensitiveAction.current = { kind: 'password-change', newPassword }
        return 'mfa-required'
      }
      await applyPasswordChange(newPassword)
      return 'complete'
    },
    cancelPendingSecurityAction() {
      pendingSensitiveAction.current = null
      setMfaReauthenticationChallenge(null)
      setMfaReauthenticationResolver(null)
    },
    async deleteCurrentAccount() {
      if (!isFirebaseMode) { setUser(null); return }
      await deleteAuthenticatedAccount()
      setUser(null)
    },
    async beginTotpEnrollment() {
      return createTotpEnrollment(currentUser(), 'Doxa')
    },
    async completeTotpEnrollment(draft, verificationCode, displayName = 'Authenticator app') {
      const current = currentUser()
      await enrolTotp(current, draft.secret, verificationCode, displayName)
      await current.getIdToken(true)
      setMfaFactors(enrolledMfaFactors(current))
      void recordSecurityActivity('mfa_enrolled', displayName)
        .catch(() => console.warn('The authenticator was added, but its activity entry could not be recorded.'))
    },
    async removeMfaFactor(enrollmentId) {
      const current = currentUser()
      const factorName = enrolledMfaFactors(current).find((factor) => factor.uid === enrollmentId)?.displayName || 'Authenticator app'
      try {
        await unenrolMfaFactor(current, enrollmentId)
        void recordSecurityActivity('mfa_removed', factorName)
          .catch(() => console.warn('The authenticator was removed, but its activity entry could not be recorded.'))
        await current.getIdToken(true)
        setMfaFactors(enrolledMfaFactors(current))
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
        if (code === 'auth/user-token-expired') {
          setUser(null)
          setAdmin(false)
          setMfaFactors([])
          setNotice('Your authenticator was removed. Firebase ended this session for security, so please sign in again.')
        }
        throw error
      }
    },
    async refreshMfaFactors() {
      const factors = enrolledMfaFactors(currentUser())
      setMfaFactors(factors)
      return factors
    },
    async resolveMfaSignIn(enrollmentId, verificationCode) {
      if (!mfaResolver || !mfaChallenge) throw new Error('This multi-factor sign-in request is no longer available. Start signing in again.')
      const factor = mfaChallenge.factors.find((candidate) => candidate.uid === enrollmentId)
      if (!factor) throw new Error('Choose an available security method.')
      if (factor.factorId !== 'totp') throw new Error('This security method is not supported by this version of the sign-in page.')
      const result = await resolveTotpSignIn(mfaResolver, enrollmentId, verificationCode)
      await finishSignIn(result, mfaChallenge.firstFactorMethod)
      setMfaResolver(null)
      setMfaChallenge(null)
      setLoading(false)
    },
    cancelMfaSignIn() {
      setMfaResolver(null)
      setMfaChallenge(null)
      setLoading(false)
    },
    async resolveMfaReauthentication(enrollmentId, verificationCode) {
      if (!mfaReauthenticationResolver || !mfaReauthenticationChallenge) throw new Error('This identity-confirmation request is no longer available. Start again.')
      const factor = mfaReauthenticationChallenge.factors.find((candidate) => candidate.uid === enrollmentId)
      if (!factor) throw new Error('Choose an available security method.')
      if (factor.factorId !== 'totp') throw new Error('This security method is not supported by this version of the confirmation page.')
      const result = await resolveTotpSignIn(mfaReauthenticationResolver, enrollmentId, verificationCode)
      await result.user.getIdToken(true)
      setUser(accountUser(result.user))
      setMfaFactors(enrolledMfaFactors(result.user))
      setMfaReauthenticationResolver(null)
      setMfaReauthenticationChallenge(null)
      // Completing the challenge also completes the action that opened it
      // (for example the password change staged by `changePassword`).
      await runPendingSensitiveAction()
    },
    cancelMfaReauthentication() {
      setMfaReauthenticationResolver(null)
      setMfaReauthenticationChallenge(null)
    },
    async logOut() { setMfaResolver(null); setMfaChallenge(null); setMfaReauthenticationResolver(null); setMfaReauthenticationChallenge(null); setMfaFactors([]); pendingSensitiveAction.current = null; if (!isFirebaseMode) { setUser(null); return }; await signOut(firebaseOnly()) },
  }}>{children}</AuthContext.Provider>
}

function accountUser(user: User): AccountUser {
  const metadata = user.metadata ?? {}
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    providerData: user.providerData.map(({ providerId, email, displayName }) => ({ providerId, email, displayName })),
    metadata: { creationTime: metadata.creationTime, lastSignInTime: metadata.lastSignInTime },
  }
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
