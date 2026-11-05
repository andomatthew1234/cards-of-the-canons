import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { Contact } from '../src/pages/Contact'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  user: {
    uid: 'customer-1', email: 'customer@example.com', displayName: 'Matthew Anderson',
  },
}))

vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../src/lib/accounts', () => ({ getUserProfile: mocks.profile }))

describe('contact account-detail autofill preference', () => {
  it('keeps fields blank after an opt-out but permits a one-time account-details override', async () => {
    mocks.profile.mockResolvedValueOnce({
      displayName: 'Matthew Anderson', email: 'customer@example.com',
      preferences: { checkoutAndEnquiryAutofill: false, mailingListRequested: false, recoveryPhoneProvided: false },
    })
    render(<MemoryRouter><Contact /></MemoryRouter>)

    await waitFor(() => expect(mocks.profile).toHaveBeenCalledWith('customer-1'))
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveValue('')
      expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveValue('')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Use my account details instead' }))
    expect(screen.getByText('Your account details will be included automatically when you submit this form.')).toBeInTheDocument()
  })
})
