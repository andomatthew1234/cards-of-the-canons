import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { MfaSignInChallenge } from '../src/components/account/MfaSignInChallenge'
import { TotpSetupFlow } from '../src/pages/account/TotpSetupFlow'

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      uid: 'customer-1', email: 'customer@example.com', displayName: 'Customer', emailVerified: true,
      providerData: [{ providerId: 'google.com', email: 'customer@example.com', displayName: 'Customer' }],
      metadata: {},
    },
    isAdmin: false, loading: false, notice: '', providers: ['google.com'], mfaFactors: [] as Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }>,
    mfaChallenge: null as null | { firstFactorMethod: 'password' | 'google' | 'apple'; factors: Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }> },
    mfaReauthenticationChallenge: null as null | { factors: Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }> },
    clearNotice: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), register: vi.fn(), resetPassword: vi.fn(),
    resendVerification: vi.fn(), refreshUser: vi.fn(), updateDisplayName: vi.fn(), requestEmailChange: vi.fn(),
    reauthenticate: vi.fn(), changePassword: vi.fn(), deleteCurrentAccount: vi.fn(), logOut: vi.fn(),
    beginTotpEnrollment: vi.fn(), completeTotpEnrollment: vi.fn(), removeMfaFactor: vi.fn(), refreshMfaFactors: vi.fn(),
    resolveMfaSignIn: vi.fn(), cancelMfaSignIn: vi.fn(), resolveMfaReauthentication: vi.fn(), cancelMfaReauthentication: vi.fn(),
  },
  qr: vi.fn().mockResolvedValue('data:image/png;base64,qr'),
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  friendlyAuthError: (error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'auth/invalid-verification-code') return 'That authenticator code is incorrect or has expired. Enter the current six-digit code and try again.'
    if (code === 'auth/user-token-expired') return 'Your session expired after the security method changed. Sign in again to continue.'
    return error instanceof Error ? error.message : 'The account action could not be completed.'
  },
}))

vi.mock('qrcode', () => ({ toDataURL: mocks.qr }))

const draft = {
  secret: { secretKey: 'ABCDEFGHIJKLMNOP', generateQrCodeUrl: vi.fn() },
  secretKey: 'ABCDEFGHIJKLMNOP',
  qrCodeUrl: 'otpauth://totp/Cards%20of%20the%20Canons:customer@example.com?secret=ABCDEFGHIJKLMNOP',
}

function renderSetup() {
  return render(<MemoryRouter initialEntries={['/account/settings/authenticator']}><Routes>
    <Route path="/account/settings/authenticator" element={<TotpSetupFlow />} />
    <Route path="/account/security" element={<div>Security centre home</div>} />
    <Route path="/account" element={<div>Sign in</div>} />
  </Routes></MemoryRouter>)
}

describe('authenticator app enrollment and management', () => {
  beforeEach(() => {
    mocks.auth.user.emailVerified = true
    mocks.auth.providers = ['google.com']
    mocks.auth.user.providerData = [{ providerId: 'google.com', email: 'customer@example.com', displayName: 'Customer' }]
    mocks.auth.mfaFactors = []
    mocks.auth.mfaChallenge = null
    mocks.auth.mfaReauthenticationChallenge = null
    mocks.auth.resolveMfaReauthentication.mockReset()
    mocks.auth.cancelMfaReauthentication.mockReset()
    mocks.auth.reauthenticate.mockReset().mockResolvedValue(undefined)
    mocks.auth.beginTotpEnrollment.mockReset().mockResolvedValue(draft)
    mocks.auth.completeTotpEnrollment.mockReset().mockResolvedValue(undefined)
    mocks.auth.refreshMfaFactors.mockReset().mockResolvedValue([])
    mocks.auth.removeMfaFactor.mockReset().mockResolvedValue(undefined)
    mocks.qr.mockClear()
  })

  async function reachSetup() {
    renderSetup()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(mocks.auth.reauthenticate).toHaveBeenCalledWith('google.com', undefined)
    expect(mocks.auth.beginTotpEnrollment).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Scan this with your authenticator app')).toBeInTheDocument()
  }

  it('generates a Firebase enrollment draft and offers QR and manual setup', async () => {
    await reachSetup()
    expect(screen.getByAltText('QR code for enrolling this account in an authenticator app')).toHaveAttribute('src', 'data:image/png;base64,qr')
    expect(screen.getByText('ABCDEFGHIJKLMNOP')).toBeInTheDocument()
    expect(screen.getByText(/anyone who has it can generate security codes/i)).toBeInTheDocument()
  })

  it('cancels enrollment without enrolling a factor', async () => {
    await reachSetup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel setup' }))
    expect(await screen.findByText('Security centre home')).toBeInTheDocument()
    expect(mocks.auth.completeTotpEnrollment).not.toHaveBeenCalled()
  })

  it('uses Firebase enrollment verification and reports an incorrect code', async () => {
    mocks.auth.completeTotpEnrollment.mockRejectedValueOnce({ code: 'auth/invalid-verification-code' })
    await reachSetup()
    await userEvent.click(screen.getByRole('button', { name: 'I’ve added the account' }))
    await userEvent.type(screen.getByRole('textbox', { name: /six-digit code/i }), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and enable' }))
    expect(mocks.auth.completeTotpEnrollment).toHaveBeenCalledWith(draft, '123456', 'Authenticator app')
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect or has expired')
  })

  it('completes native enrollment successfully', async () => {
    await reachSetup()
    await userEvent.click(screen.getByRole('button', { name: 'I’ve added the account' }))
    await userEvent.type(screen.getByRole('textbox', { name: /six-digit code/i }), '654321')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and enable' }))
    expect(await screen.findByRole('heading', { name: 'Authenticator app protection is enabled.' })).toBeInTheDocument()
    expect(mocks.auth.refreshMfaFactors).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation and fresh provider-aware authentication before removal', async () => {
    mocks.auth.mfaFactors = [{ uid: 'totp-1', factorId: 'totp', displayName: 'My authenticator', enrollmentTime: '2026-10-03T00:00:00Z' }]
    mocks.auth.removeMfaFactor.mockImplementationOnce(async () => { mocks.auth.mfaFactors = [] })
    renderSetup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Remove My authenticator?')
    await userEvent.click(screen.getByRole('button', { name: 'Continue to identity check' }))
    expect(mocks.auth.removeMfaFactor).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(mocks.auth.removeMfaFactor).toHaveBeenCalledWith('totp-1'))
    expect(await screen.findByRole('heading', { name: 'Authenticator app removed.' })).toBeInTheDocument()
  })
})

describe('authenticator challenge interface', () => {
  beforeEach(() => {
    mocks.auth.mfaChallenge = {
      firstFactorMethod: 'password',
      factors: [
        { uid: 'totp-1', factorId: 'totp', displayName: 'My authenticator', enrollmentTime: '2026-10-03T00:00:00Z' },
        { uid: 'future-1', factorId: 'phone', displayName: 'Phone ending 42', enrollmentTime: '2026-10-03T00:00:00Z' },
      ],
    }
    mocks.auth.resolveMfaSignIn.mockReset()
    mocks.auth.cancelMfaSignIn.mockReset()
  })

  it('is multiple-factor ready and reports an incorrect sign-in code', async () => {
    mocks.auth.resolveMfaSignIn.mockRejectedValueOnce({ code: 'auth/invalid-verification-code' })
    render(<MemoryRouter><MfaSignInChallenge /></MemoryRouter>)
    expect(screen.getByText('My authenticator')).toBeInTheDocument()
    expect(screen.getByText('Phone ending 42')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /six-digit code/i }), '111111')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    expect(mocks.auth.resolveMfaSignIn).toHaveBeenCalledWith('totp-1', '111111')
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect or has expired')
  })

  it('allows the pending MFA sign-in to be cancelled cleanly', async () => {
    render(<MemoryRouter><MfaSignInChallenge /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /cancel and return to sign in/i }))
    expect(mocks.auth.cancelMfaSignIn).toHaveBeenCalledTimes(1)
  })
})
