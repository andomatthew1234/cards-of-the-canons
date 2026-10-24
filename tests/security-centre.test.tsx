import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { ChangeEmailFlow } from '../src/pages/account/ChangeEmailFlow'
import { DeleteAccountFlow } from '../src/pages/account/DeleteAccountFlow'
import { EmailCodeSetup } from '../src/pages/account/EmailCodeSetup'
import { SecurityCentre } from '../src/pages/account/SecurityCentre'

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      uid: 'customer-1', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson', emailVerified: true,
      providerData: [{ providerId: 'google.com', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }],
      metadata: { creationTime: '2026-09-30T00:00:00Z', lastSignInTime: '2026-10-03T00:00:00Z' },
    },
    isAdmin: true, loading: false, notice: '', providers: ['google.com'], mfaFactors: [] as Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }>, mfaChallenge: null,
    mfaReauthenticationChallenge: null as null | { factors: Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }> },
    clearNotice: vi.fn(), signIn: vi.fn(), signInWithGoogle: vi.fn(), signInWithApple: vi.fn(), register: vi.fn(), resetPassword: vi.fn(),
    resendVerification: vi.fn().mockResolvedValue(undefined), refreshUser: vi.fn(), updateDisplayName: vi.fn().mockResolvedValue(undefined),
    requestEmailChange: vi.fn().mockResolvedValue(undefined), reauthenticate: vi.fn().mockResolvedValue(undefined), changePassword: vi.fn(),
    deleteCurrentAccount: vi.fn(), beginTotpEnrollment: vi.fn(), completeTotpEnrollment: vi.fn(), removeMfaFactor: vi.fn(), refreshMfaFactors: vi.fn(), resolveMfaSignIn: vi.fn(), cancelMfaSignIn: vi.fn(),
    resolveMfaReauthentication: vi.fn(), cancelMfaReauthentication: vi.fn(), cancelPendingSecurityAction: vi.fn(), logOut: vi.fn(),
  },
  getProfile: vi.fn(),
  getPolicy: vi.fn(),
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Account action failed.',
}))

vi.mock('../src/lib/accounts', () => ({
  getUserProfile: mocks.getProfile,
  getAccountSecurityPolicy: mocks.getPolicy,
  saveUserProfile: vi.fn(),
}))

const securityResponse = {
  policy: {
    version: 1 as const,
    methods: {
      emailCode: { status: 'not_configured' as const, verifiedAt: null },
      authenticator: { status: 'not_configured' as const, verifiedAt: null },
      passkey: { status: 'not_configured' as const, verifiedAt: null },
    },
    requirements: { signIn: false, criticalActions: false, paymentActions: false, passwordlessSignIn: false },
  },
  capabilities: {
    emailCodeDelivery: false, passwordlessEmailCode: false, authenticator: false, passkeys: false,
    explanation: 'Secure email-code delivery is not configured for this site yet.',
  },
}

describe('account security centre', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.getProfile.mockReset().mockResolvedValue({ displayName: 'Matthew Anderson', email: 'mumanderson10@gmail.com' })
    mocks.getPolicy.mockReset().mockResolvedValue(securityResponse)
    mocks.auth.reauthenticate.mockClear()
    mocks.auth.requestEmailChange.mockClear()
    mocks.auth.changePassword.mockReset()
    mocks.auth.cancelPendingSecurityAction.mockReset()
    mocks.auth.refreshUser.mockReset().mockResolvedValue(mocks.auth.user)
    mocks.auth.deleteCurrentAccount.mockReset().mockResolvedValue(undefined)
    mocks.auth.user.emailVerified = true
    mocks.auth.providers = ['google.com']
    mocks.auth.user.providerData = [{ providerId: 'google.com', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }]
    mocks.auth.mfaFactors = []
    mocks.auth.mfaReauthenticationChallenge = null
    mocks.auth.resolveMfaReauthentication.mockReset()
    mocks.auth.cancelMfaReauthentication.mockReset()
  })

  it('masks the email and presents Google as a connected method without password controls', async () => {
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Email & sign-in' })).toBeInTheDocument()
    expect(screen.getAllByText('m••••••••10@gmail.com').length).toBeGreaterThan(0)
    const googleRow = screen.getByRole('heading', { name: 'Google' }).closest('.security-setting-row')
    expect(googleRow).not.toBeNull()
    expect(within(googleRow as HTMLElement).getByText('Connected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /administrator workspace/i })).toBeInTheDocument()
  })

  it('shows a calm unverified-email state with resend and refresh actions', async () => {
    mocks.auth.user.emailVerified = false
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    expect(await screen.findByText('Your email is not verified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeInTheDocument()
  })

  it('uses real Google reauthentication before accepting a new email', async () => {
    render(<MemoryRouter initialEntries={['/account/settings/email']}><Routes><Route path="/account/settings/email" element={<ChangeEmailFlow />} /></Routes></MemoryRouter>)
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(mocks.auth.reauthenticate).toHaveBeenCalledWith('google.com', undefined)
    expect(await screen.findByRole('heading', { name: 'What email would you like to use?' })).toBeInTheDocument()
  })

  it('completes password confirmation before requesting the separate authenticator code', async () => {
    mocks.auth.providers = ['password']
    mocks.auth.user.providerData = [{ providerId: 'password', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }]
    mocks.auth.reauthenticate.mockImplementationOnce(async () => {
      mocks.auth.mfaReauthenticationChallenge = {
        factors: [{ uid: 'totp-1', factorId: 'totp', displayName: 'My authenticator', enrollmentTime: '2026-10-03T00:00:00Z' }],
      }
      return 'mfa-required'
    })
    mocks.auth.resolveMfaReauthentication.mockImplementationOnce(async () => {
      mocks.auth.mfaReauthenticationChallenge = null
    })

    render(<MemoryRouter initialEntries={['/account/settings/email']}><Routes><Route path="/account/settings/email" element={<ChangeEmailFlow />} /></Routes></MemoryRouter>)
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.type(screen.getByLabelText('Current password'), 'correct password')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm identity' }))

    expect(mocks.auth.reauthenticate).toHaveBeenCalledWith('password', 'correct password')
    expect(await screen.findByRole('heading', { name: 'Enter your authenticator code' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What email would you like to use?' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: /six-digit authenticator code/i }), '654321')
    await userEvent.click(screen.getByRole('button', { name: 'Verify authenticator code' }))
    expect(mocks.auth.resolveMfaReauthentication).toHaveBeenCalledWith('totp-1', '654321')
    expect(await screen.findByRole('heading', { name: 'What email would you like to use?' })).toBeInTheDocument()
  })

  it('shows password controls only when the password provider is actually linked', async () => {
    mocks.auth.providers = ['password']
    mocks.auth.user.providerData = [{ providerId: 'password', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }]
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /change password/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Email and password' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Google' })).not.toBeInTheDocument()
  })

  it('shows every linked sign-in method as a separately manageable method', async () => {
    mocks.auth.providers = ['google.com', 'password']
    mocks.auth.user.providerData = [
      { providerId: 'google.com', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' },
      { providerId: 'password', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' },
    ]
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Google' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Email and password' })).toBeInTheDocument()
    expect(screen.getAllByText('Connected')).toHaveLength(2)
  })

  it('uses Firebase Auth factors as the authoritative authenticator status', async () => {
    mocks.auth.mfaFactors = [{ uid: 'totp-1', factorId: 'totp', displayName: 'Matthew’s authenticator', enrollmentTime: '2026-10-03T00:00:00Z' }]
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    const row = (await screen.findByRole('heading', { name: 'Authenticator app' })).closest('.security-setting-row')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Enabled')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText('Matthew’s authenticator')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByRole('link', { name: /manage/i })).toHaveAttribute('href', '/account/security/authenticator')
  })

  it('reauthenticates before the final delete confirmation and prevents one-click deletion', async () => {
    render(<MemoryRouter><DeleteAccountFlow /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Permanently delete account' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(mocks.auth.reauthenticate).toHaveBeenCalledWith('google.com', undefined)
    expect(await screen.findByRole('button', { name: 'Permanently delete account' })).toBeInTheDocument()
    expect(mocks.auth.deleteCurrentAccount).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }))
    expect(mocks.auth.deleteCurrentAccount).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Your account has been deleted.' })).toBeInTheDocument()
  })

  it('recognises a completed signed-link email change after refreshing account state', async () => {
    sessionStorage.setItem('cards.security.customer-1.pending-email-change', 'newaddress@example.com')
    mocks.auth.refreshUser.mockResolvedValue({ ...mocks.auth.user, email: 'newaddress@example.com', emailVerified: true })
    render(<MemoryRouter initialEntries={['/account/settings/email?status=checking']}><Routes><Route path="/account/settings/email" element={<ChangeEmailFlow />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'You’re all done.' })).toBeInTheDocument()
    expect(screen.getByText('n•••••••ss@example.com')).toBeInTheDocument()
  })

  it('keeps the verification step pending when the signed link is not complete', async () => {
    sessionStorage.setItem('cards.security.customer-1.pending-email-change', 'newaddress@example.com')
    render(<MemoryRouter initialEntries={['/account/settings/email?status=checking']}><Routes><Route path="/account/settings/email" element={<ChangeEmailFlow />} /></Routes></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'I’ve opened the link — check status' }))
    expect(await screen.findByText(/has not been verified yet/i)).toBeInTheDocument()
  })

  it('stops email-code setup honestly when secure delivery is unavailable', async () => {
    render(<MemoryRouter><EmailCodeSetup /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, continue' }))
    expect(await screen.findByRole('heading', { name: 'Secure code delivery is not connected yet.' })).toBeInTheDocument()
    expect(screen.getByText('No code has been sent and no protection setting has been changed.')).toBeInTheDocument()
  })

  it('ignores pending email state that belongs to a different account', async () => {
    sessionStorage.setItem('cards.security.other-account.pending-email-change', 'attacker@example.com')
    render(<MemoryRouter initialEntries={['/account/settings/email?status=checking']}><Routes><Route path="/account/settings/email" element={<ChangeEmailFlow />} /></Routes></MemoryRouter>)
    // Another account's staged change never opens the verification step here.
    expect(await screen.findByRole('checkbox')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check your new email.' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('cards.security.other-account.pending-email-change')).toBe('attacker@example.com')
  })

  it('routes a password change through the shared MFA challenge workflow', async () => {
    mocks.auth.providers = ['password']
    mocks.auth.user.providerData = [{ providerId: 'password', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }]
    mocks.auth.changePassword.mockImplementationOnce(async () => {
      mocks.auth.mfaReauthenticationChallenge = {
        factors: [{ uid: 'totp-1', factorId: 'totp', displayName: 'My authenticator', enrollmentTime: '2026-10-03T00:00:00Z' }],
      }
      return 'mfa-required'
    })
    mocks.auth.resolveMfaReauthentication.mockImplementationOnce(async () => {
      mocks.auth.mfaReauthenticationChallenge = null
    })

    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /change password/i }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Current password'), 'current secret')
    await userEvent.type(dialog.getByLabelText('New password'), 'a brand new secret')
    await userEvent.type(dialog.getByLabelText('Confirm new password'), 'a brand new secret')
    await userEvent.click(dialog.getByRole('button', { name: 'Change password' }))

    expect(mocks.auth.changePassword).toHaveBeenCalledWith('current secret', 'a brand new secret')
    // The shared challenge panel owns the flow; no premature success message.
    expect(await screen.findByRole('heading', { name: 'Enter your authenticator code' })).toBeInTheDocument()
    expect(screen.queryByText('Your password has been changed securely.')).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: /six-digit authenticator code/i }), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify authenticator code' }))
    expect(mocks.auth.resolveMfaReauthentication).toHaveBeenCalledWith('totp-1', '123456')
    expect(await screen.findByText('Your password has been changed securely.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('applies the password immediately when no second factor is enrolled', async () => {
    mocks.auth.providers = ['password']
    mocks.auth.user.providerData = [{ providerId: 'password', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }]
    mocks.auth.changePassword.mockResolvedValue('complete')
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /change password/i }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Current password'), 'current secret')
    await userEvent.type(dialog.getByLabelText('New password'), 'a brand new secret')
    await userEvent.type(dialog.getByLabelText('Confirm new password'), 'a brand new secret')
    await userEvent.click(dialog.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Your password has been changed securely.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('abandons a staged password change when the dialog is closed', async () => {
    mocks.auth.providers = ['password']
    mocks.auth.user.providerData = [{ providerId: 'password', email: 'mumanderson10@gmail.com', displayName: 'Matthew Anderson' }]
    render(<MemoryRouter><SecurityCentre /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /change password/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close password change' }))
    expect(mocks.auth.cancelPendingSecurityAction).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
