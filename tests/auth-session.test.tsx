import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  auth: { useDeviceLanguage: vi.fn(), currentUser: null as unknown },
  observer: undefined as ((user: unknown) => void) | undefined,
  observerError: undefined as ((error: unknown) => void) | undefined,
  tokenObserver: undefined as ((user: unknown) => void) | undefined,
  blocked: vi.fn(),
  ensureProfile: vi.fn().mockResolvedValue(undefined),
  setPersistence: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  signInEmail: vi.fn(),
  signInPopup: vi.fn(),
  reauthenticateCredential: vi.fn(),
  reauthenticatePopup: vi.fn(),
  getResolver: vi.fn(),
}))

vi.mock('../src/config', () => ({
  adminFunctionsAvailable: false,
  appleAuthEnabled: false,
  isFirebaseMode: true,
}))

vi.mock('../src/lib/firebase', () => ({
  getFirebaseServices: () => ({ auth: mocks.auth }),
}))

vi.mock('../src/lib/accounts', () => ({
  deleteAuthenticatedAccount: vi.fn(),
  ensureUserProfile: mocks.ensureProfile,
  isAccountAccessBlocked: mocks.blocked,
  syncUserProfileEmail: vi.fn(),
}))

vi.mock('../src/lib/analytics', () => ({ trackEvent: vi.fn() }))

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider {
    setCustomParameters() {}
  }
  class OAuthProvider {
    addScope() {}
  }
  return {
    EmailAuthProvider: { credential: vi.fn() },
    GoogleAuthProvider,
    OAuthProvider,
    browserLocalPersistence: {},
    createUserWithEmailAndPassword: vi.fn(),
    deleteUser: vi.fn(),
    getAdditionalUserInfo: vi.fn(),
    getMultiFactorResolver: mocks.getResolver,
    multiFactor: (user: { enrolledFactors?: unknown[] }) => ({
      enrolledFactors: user.enrolledFactors ?? [],
      getSession: vi.fn(),
      enroll: vi.fn(),
      unenroll: vi.fn(),
    }),
    TotpMultiFactorGenerator: {
      FACTOR_ID: 'totp',
      generateSecret: vi.fn(),
      assertionForEnrollment: vi.fn(),
      assertionForSignIn: vi.fn((uid: string, code: string) => ({ uid, code })),
    },
    onAuthStateChanged: (_auth: unknown, observer: (user: unknown) => void, error: (value: unknown) => void) => {
      mocks.observer = observer
      mocks.observerError = error
      return vi.fn()
    },
    onIdTokenChanged: (_auth: unknown, observer: (user: unknown) => void) => {
      mocks.tokenObserver = observer
      return vi.fn()
    },
    reauthenticateWithCredential: mocks.reauthenticateCredential,
    reauthenticateWithPopup: mocks.reauthenticatePopup,
    reload: vi.fn(),
    revokeAccessToken: vi.fn(),
    sendEmailVerification: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    setPersistence: mocks.setPersistence,
    signInWithEmailAndPassword: mocks.signInEmail,
    signInWithPopup: mocks.signInPopup,
    signOut: mocks.signOut,
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
    verifyBeforeUpdateEmail: vi.fn(),
  }
})

import { AuthProvider, friendlyAuthError, useAuth } from '../src/context/AuthContext'

function Probe({ children }: { children?: ReactNode }) {
  const auth = useAuth()
  return <div>
    <output data-testid="session-state">{auth.loading ? 'loading' : auth.user?.email ?? 'signed-out'}</output>
    <output data-testid="admin-state">{auth.isAdmin ? 'admin' : 'customer'}</output>
    {auth.notice && <p>{auth.notice}</p>}
    {children}
  </div>
}

function MfaProbe() {
  const auth = useAuth()
  return <div>
    <button onClick={() => void auth.signIn('customer@example.com', 'password')}>Password sign in</button>
    <button onClick={() => void auth.signInWithGoogle()}>Google sign in</button>
    <output data-testid="challenge-method">{auth.mfaChallenge?.firstFactorMethod ?? 'none'}</output>
    <output data-testid="challenge-factors">{auth.mfaChallenge?.factors.map((factor) => factor.displayName).join('|') ?? ''}</output>
    <button disabled={!auth.mfaChallenge} onClick={() => void auth.resolveMfaSignIn(auth.mfaChallenge!.factors[0].uid, '123456')}>Resolve MFA</button>
    <button onClick={() => void auth.reauthenticate('password', 'correct password')}>Password reauthentication</button>
    <output data-testid="reauth-factors">{auth.mfaReauthenticationChallenge?.factors.map((factor) => factor.displayName).join('|') ?? ''}</output>
    <button disabled={!auth.mfaReauthenticationChallenge} onClick={() => void auth.resolveMfaReauthentication(auth.mfaReauthenticationChallenge!.factors[0].uid, '654321')}>Resolve reauthentication MFA</button>
  </div>
}

function firebaseUser(overrides: Partial<ReturnType<typeof baseFirebaseUser>> = {}) {
  return { ...baseFirebaseUser(), ...overrides }
}

function baseFirebaseUser() {
  return {
    uid: 'customer-1',
    email: 'customer@example.com',
    displayName: 'Customer',
    emailVerified: true,
    providerData: [{ providerId: 'password' }],
    enrolledFactors: [] as unknown[],
    metadata: { creationTime: '2026-09-30T00:00:00Z', lastSignInTime: '2026-10-03T00:00:00Z' },
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }),
    getIdToken: vi.fn().mockResolvedValue('token'),
  }
}

describe('validated Firebase sessions', () => {
  beforeEach(() => {
    mocks.observer = undefined
    mocks.observerError = undefined
    mocks.tokenObserver = undefined
    mocks.blocked.mockReset()
    mocks.ensureProfile.mockClear()
    mocks.setPersistence.mockClear()
    mocks.signOut.mockClear()
    mocks.signInEmail.mockReset()
    mocks.signInPopup.mockReset()
    mocks.reauthenticateCredential.mockReset()
    mocks.reauthenticatePopup.mockReset()
    mocks.getResolver.mockReset()
    mocks.auth.currentUser = null
  })

  it('does not expose a signed-in user before the access check completes', async () => {
    let releaseAccessCheck: ((blocked: boolean) => void) | undefined
    mocks.blocked.mockImplementation(() => new Promise<boolean>((resolve) => { releaseAccessCheck = resolve }))
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    act(() => mocks.observer?.(firebaseUser()))
    expect(screen.getByTestId('session-state')).toHaveTextContent('loading')
    expect(screen.queryByText('customer@example.com')).not.toBeInTheDocument()

    await act(async () => { releaseAccessCheck?.(false) })
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('customer@example.com'))
  })

  it('keeps a blocked account signed out and explains what happened', async () => {
    mocks.blocked.mockResolvedValue(true)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    act(() => mocks.observer?.(firebaseUser()))

    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('signed-out'))
    expect(screen.getByRole('paragraph')).toHaveTextContent('This account has been disabled')
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('force-refreshes the session token once so a newly issued claim takes effect', async () => {
    mocks.blocked.mockResolvedValue(false)
    const getIdTokenResult = vi.fn()
      .mockResolvedValueOnce({ claims: {} })
      .mockResolvedValueOnce({ claims: { admin: true } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    act(() => mocks.observer?.(firebaseUser({ getIdTokenResult })))

    await waitFor(() => expect(screen.getByTestId('admin-state')).toHaveTextContent('admin'))
    expect(getIdTokenResult).toHaveBeenNthCalledWith(2, true)
  })

  it('never grants administration from a mailbox address, even a verified one', async () => {
    mocks.blocked.mockResolvedValue(false)
    const getIdTokenResult = vi.fn().mockResolvedValue({ claims: {} })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    // One of the addresses that used to bootstrap administration permanently.
    act(() => mocks.observer?.(firebaseUser({ email: 'matthew@andomail.com', emailVerified: true, getIdTokenResult })))

    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('matthew@andomail.com'))
    expect(screen.getByTestId('admin-state')).toHaveTextContent('customer')
  })

  it('keeps a blocked account from reaching the administrator state', async () => {
    mocks.blocked.mockResolvedValue(true)
    const getIdTokenResult = vi.fn().mockResolvedValue({ claims: { admin: true } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    act(() => mocks.observer?.(firebaseUser({ getIdTokenResult })))

    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('signed-out'))
    expect(screen.getByTestId('admin-state')).toHaveTextContent('customer')
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('applies a claim change on the next token refresh without a reload', async () => {
    mocks.blocked.mockResolvedValue(false)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    const granted = firebaseUser({ getIdTokenResult: vi.fn().mockResolvedValue({ claims: { admin: true } }) })
    act(() => mocks.observer?.(granted))
    await waitFor(() => expect(screen.getByTestId('admin-state')).toHaveTextContent('admin'))

    // A demotion issued by the server reaches this browser when its token
    // refreshes, not only on the next full page load.
    const demoted = firebaseUser({ getIdTokenResult: vi.fn().mockResolvedValue({ claims: {} }) })
    await act(async () => { mocks.tokenObserver?.(demoted) })
    await waitFor(() => expect(screen.getByTestId('admin-state')).toHaveTextContent('customer'))
    expect(screen.getByTestId('session-state')).toHaveTextContent('customer@example.com')
  })

  it('ends the session when a token refresh reveals a blocked account', async () => {
    mocks.blocked.mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))

    act(() => mocks.observer?.(firebaseUser()))
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('customer@example.com'))

    await act(async () => { mocks.tokenObserver?.(firebaseUser()) })
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('signed-out'))
    expect(screen.getByRole('paragraph')).toHaveTextContent('This account has been disabled')
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})

describe('Firebase-native MFA sign-in handling', () => {
  beforeEach(() => {
    mocks.observer = undefined
    mocks.tokenObserver = undefined
    mocks.blocked.mockResolvedValue(false)
    mocks.signInEmail.mockReset()
    mocks.signInPopup.mockReset()
    mocks.reauthenticateCredential.mockReset()
    mocks.reauthenticatePopup.mockReset()
    mocks.getResolver.mockReset()
    mocks.auth.currentUser = null
  })

  async function renderSignedOutProbe() {
    render(<AuthProvider><MfaProbe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))
    act(() => mocks.observer?.(null))
    await waitFor(() => expect(screen.getByTestId('challenge-method')).toHaveTextContent('none'))
  }

  function resolverWith(hints = [{ uid: 'totp-1', factorId: 'totp', displayName: 'My authenticator', enrollmentTime: '2026-10-03T00:00:00Z' }]) {
    const resolveSignIn = vi.fn().mockResolvedValue({ user: firebaseUser({ enrolledFactors: hints }) })
    const resolver = { hints, resolveSignIn }
    mocks.getResolver.mockReturnValue(resolver)
    return resolver
  }

  it('continues password sign-in with a TOTP resolver', async () => {
    const resolver = resolverWith()
    mocks.signInEmail.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' })
    await renderSignedOutProbe()
    screen.getByRole('button', { name: 'Password sign in' }).click()
    await waitFor(() => expect(screen.getByTestId('challenge-method')).toHaveTextContent('password'))
    screen.getByRole('button', { name: 'Resolve MFA' }).click()
    await waitFor(() => expect(resolver.resolveSignIn).toHaveBeenCalledWith({ uid: 'totp-1', code: '123456' }))
  })

  it('continues Google sign-in with the same native MFA resolver flow', async () => {
    resolverWith()
    mocks.signInPopup.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' })
    await renderSignedOutProbe()
    screen.getByRole('button', { name: 'Google sign in' }).click()
    await waitFor(() => expect(screen.getByTestId('challenge-method')).toHaveTextContent('google'))
  })

  it('retains every resolver hint so the interface can choose among multiple factors', async () => {
    resolverWith([
      { uid: 'totp-1', factorId: 'totp', displayName: 'Authenticator app', enrollmentTime: '2026-10-03T00:00:00Z' },
      { uid: 'future-1', factorId: 'phone', displayName: 'Phone ending 42', enrollmentTime: '2026-10-03T00:00:00Z' },
    ])
    mocks.signInEmail.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' })
    await renderSignedOutProbe()
    screen.getByRole('button', { name: 'Password sign in' }).click()
    await waitFor(() => expect(screen.getByTestId('challenge-factors')).toHaveTextContent('Authenticator app|Phone ending 42'))
  })

  it('continues password reauthentication with a distinct native TOTP challenge', async () => {
    const user = firebaseUser({ enrolledFactors: [{ uid: 'totp-1', factorId: 'totp', displayName: 'My authenticator', enrollmentTime: '2026-10-03T00:00:00Z' }] })
    const resolver = resolverWith()
    mocks.reauthenticateCredential.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' })
    mocks.auth.currentUser = user
    render(<AuthProvider><MfaProbe /></AuthProvider>)
    await waitFor(() => expect(mocks.observer).toBeTypeOf('function'))
    act(() => mocks.observer?.(user))
    await waitFor(() => expect(mocks.blocked).toHaveBeenCalledWith('customer-1'))

    screen.getByRole('button', { name: 'Password reauthentication' }).click()
    await waitFor(() => expect(screen.getByTestId('reauth-factors')).toHaveTextContent('My authenticator'))
    screen.getByRole('button', { name: 'Resolve reauthentication MFA' }).click()
    await waitFor(() => expect(resolver.resolveSignIn).toHaveBeenCalledWith({ uid: 'totp-1', code: '654321' }))
  })
})

describe('friendlyAuthError', () => {
  it('keeps invalid credentials private and explains recoverable browser failures', () => {
    expect(friendlyAuthError({ code: 'auth/user-not-found' })).toBe('The email or password was not recognised.')
    expect(friendlyAuthError({ code: 'auth/network-request-failed' })).toContain('Check your connection')
    expect(friendlyAuthError({ code: 'auth/user-disabled' })).toContain('account has been disabled')
    expect(friendlyAuthError({ code: 'auth/popup-closed-by-user' })).toContain('closed before completion')
    expect(friendlyAuthError({ code: 'auth/user-mismatch' })).toContain('same account')
    expect(friendlyAuthError({ code: 'auth/requires-recent-login' })).toContain('sign in again')
    expect(friendlyAuthError({ code: 'auth/expired-action-code' })).toContain('expired')
    expect(friendlyAuthError({ code: 'auth/invalid-verification-code' })).toContain('incorrect or has expired')
    expect(friendlyAuthError({ code: 'auth/user-token-expired' })).toContain('Sign in again')
  })

  it('only labels the dedicated recent-auth precondition as a sign-in request', () => {
    expect(friendlyAuthError({
      code: 'functions/failed-precondition',
      message: 'Recent sign-in is required.',
      details: { reason: 'recent-auth-required' },
    })).toContain('sign in again')
    expect(friendlyAuthError({
      code: 'functions/failed-precondition',
      message: 'Verify your email address before continuing.',
    })).toBe('Verify your email address before continuing.')
  })
})
