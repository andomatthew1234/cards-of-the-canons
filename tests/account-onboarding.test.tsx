import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registrationNewsPreferenceKey } from '../src/lib/accountOnboarding'
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
  useAuth: () => ({ user: mocks.user, loading: false }),
  friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Could not complete setup.',
}))

vi.mock('../src/lib/accounts', () => ({
  getUserProfile: mocks.profile,
  beginAccountOnboarding: mocks.begin,
  completeAccountOnboarding: mocks.complete,
}))

vi.mock('../src/lib/data', () => ({ joinAccountMailingList: mocks.joinMailingList }))

function renderOnboarding() {
  return render(<MemoryRouter initialEntries={['/account/onboarding']}><Routes><Route path="/account/onboarding" element={<AccountOnboarding />} /><Route path="/account" element={<p>Account overview</p>} /></Routes></MemoryRouter>)
}

describe('new account onboarding', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.user.metadata.creationTime = new Date().toISOString()
    mocks.profile.mockReset().mockResolvedValue({ onboarding: { status: 'pending', version: 1 } })
    mocks.begin.mockReset().mockResolvedValue({ required: true })
    mocks.complete.mockReset().mockResolvedValue({ completed: true })
    mocks.joinMailingList.mockReset().mockResolvedValue({ status: 'subscribed' })
  })

  it('finishes setup automatically and applies the news choice made during registration', async () => {
    sessionStorage.setItem(registrationNewsPreferenceKey, 'true')
    renderOnboarding()

    await waitFor(() => expect(mocks.joinMailingList).toHaveBeenCalledWith('account_registration'))
    expect(mocks.complete).toHaveBeenCalledWith({
      termsAccepted: true,
      termsVersion: 'account-terms-v1',
      autofillConsent: true,
      mailingListSelected: true,
      recoveryPhone: null,
    })
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
    expect(sessionStorage.getItem(registrationNewsPreferenceKey)).toBeNull()
    expect(screen.queryByText(/Step \d of/i)).not.toBeInTheDocument()
  })

  it('respects an unticked news choice without showing another checkbox', async () => {
    sessionStorage.setItem(registrationNewsPreferenceKey, 'false')
    renderOnboarding()

    await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ mailingListSelected: false })))
    expect(mocks.joinMailingList).not.toHaveBeenCalled()
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
  })

  it('does not expose automatic onboarding to an established account', async () => {
    mocks.user.metadata.creationTime = '2025-01-01T00:00:00.000Z'
    mocks.profile.mockResolvedValue({ displayName: 'Matthew', email: 'matthew@example.com' })
    renderOnboarding()

    expect(await screen.findByRole('heading', { name: 'Your account is ready.' })).toBeInTheDocument()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('repairs a missing onboarding marker for a newly created account', async () => {
    mocks.profile.mockResolvedValue(null)
    renderOnboarding()

    await waitFor(() => expect(mocks.begin).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
  })

  it('shows a retryable state when trusted setup is temporarily unavailable', async () => {
    const user = userEvent.setup()
    mocks.profile.mockResolvedValue(null)
    mocks.begin.mockRejectedValueOnce(new Error('Account setup could not be reached.')).mockResolvedValueOnce({ required: true })
    renderOnboarding()

    expect(await screen.findByRole('heading', { name: /finish setting up your account/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mocks.begin).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Account overview')).toBeInTheDocument()
  })
})
