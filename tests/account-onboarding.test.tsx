import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountOnboarding } from '../src/pages/account/AccountOnboarding'

const mocks = vi.hoisted(() => ({
  user: {
    uid: 'new-customer',
    email: 'matthew@example.com',
    displayName: 'Matthew Anderson',
    emailVerified: false,
    providerData: [{ providerId: 'password', email: 'matthew@example.com', displayName: 'Matthew Anderson' }],
    metadata: { creationTime: new Date().toISOString() },
  },
  profile: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  joinMailingList: vi.fn(),
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    loading: false,
  }),
  friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Could not complete setup.',
}))

vi.mock('../src/lib/accounts', () => ({
  getUserProfile: mocks.profile,
  beginAccountOnboarding: mocks.begin,
  completeAccountOnboarding: mocks.complete,
}))

vi.mock('../src/lib/data', () => ({
  joinAccountMailingList: mocks.joinMailingList,
}))

describe('new account onboarding', () => {
  beforeEach(() => {
    mocks.user.metadata.creationTime = new Date().toISOString()
    mocks.profile.mockReset().mockResolvedValue({ onboarding: { status: 'pending', version: 1 } })
    mocks.begin.mockReset().mockResolvedValue({ required: true })
    mocks.complete.mockReset().mockResolvedValue({ completed: true })
    mocks.joinMailingList.mockReset().mockResolvedValue({ status: 'pending' })
  })

  it('requires terms, captures preferences and presents a final review before saving', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/account/onboarding']}><AccountOnboarding /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Terms and conditions' })).toBeInTheDocument()
    const continueButton = screen.getByRole('button', { name: /Continue/i })
    expect(continueButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I agree to the account terms/i }))
    expect(continueButton).toBeEnabled()
    await user.click(continueButton)

    expect(screen.getByRole('heading', { name: 'Choose your preferences' })).toBeInTheDocument()
    const requiredAutofill = screen.getByRole('checkbox', { name: /Autofill my details.*required/i })
    expect(requiredAutofill).toBeChecked()
    expect(requiredAutofill).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Also sign me up to the mailing list/i }))
    await user.click(screen.getByRole('checkbox', { name: /Add a recovery contact number/i }))
    await user.type(screen.getByRole('textbox', { name: 'Phone number' }), '0400 000 000')
    await user.click(screen.getByRole('button', { name: /Review choices/i }))

    expect(screen.getByRole('heading', { name: 'Final checks' })).toBeInTheDocument()
    expect(screen.getByText('0400 000 000')).toBeInTheDocument()
    expect(screen.getByText('Sign me up')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Finish setup/i }))

    await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith({
      termsAccepted: true,
      termsVersion: 'account-terms-v1',
      autofillConsent: true,
      mailingListSelected: true,
      recoveryPhone: '0400 000 000',
    }))
    expect(mocks.joinMailingList).toHaveBeenCalledWith('account_registration')
    expect(await screen.findByRole('heading', { name: 'Thank you, Matthew!' })).toBeInTheDocument()
  })

  it('does not expose onboarding to an established account', async () => {
    mocks.user.metadata.creationTime = '2025-01-01T00:00:00.000Z'
    mocks.profile.mockResolvedValue({ displayName: 'Matthew', email: 'matthew@example.com' })
    render(<MemoryRouter initialEntries={['/account/onboarding']}><AccountOnboarding /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Your account is ready.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Terms and conditions' })).not.toBeInTheDocument()
  })

  it('repairs a missing onboarding marker for a newly created account instead of skipping to overview', async () => {
    mocks.profile.mockResolvedValue(null)
    render(<MemoryRouter initialEntries={['/account/onboarding']}><AccountOnboarding /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Terms and conditions' })).toBeInTheDocument()
    expect(mocks.begin).toHaveBeenCalledTimes(1)
  })

  it('shows a retryable setup state when the trusted onboarding start is temporarily unavailable', async () => {
    const user = userEvent.setup()
    mocks.profile.mockResolvedValue(null)
    mocks.begin.mockRejectedValueOnce(new Error('Account setup could not be reached.')).mockResolvedValueOnce({ required: true })
    render(<MemoryRouter initialEntries={['/account/onboarding']}><AccountOnboarding /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: /finish setting up your account/i })).toBeInTheDocument()
    expect(screen.queryByText('Your account is ready.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Terms and conditions' })).toBeInTheDocument()
    expect(mocks.begin).toHaveBeenCalledTimes(2)
  })
})
