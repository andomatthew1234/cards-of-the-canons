import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { MailingListPage } from '../src/pages/account/MailingListPage'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  communityAttention: vi.fn().mockResolvedValue(0),
  auth: {
    user: { uid: 'customer-1', email: 'customer@example.com', displayName: 'Jane Customer', emailVerified: true },
    isAdmin: false,
    loading: false,
    logOut: vi.fn(),
  },
}))

vi.mock('../src/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../src/context/AuthContext')>('../src/context/AuthContext')
  return { ...actual, useAuth: () => mocks.auth }
})
vi.mock('../src/lib/community', () => ({ getCommunityAttentionCount: mocks.communityAttention }))
vi.mock('../src/lib/data', () => ({
  getMyMailingListStatus: mocks.status,
  joinAccountMailingList: mocks.join,
  leaveAccountMailingList: mocks.leave,
}))

describe('account mailing list', () => {
  beforeEach(() => {
    mocks.status.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'not_joined' })
    mocks.join.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'subscribed' })
    mocks.leave.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'unsubscribed' })
  })

  it('requires explicit consent and joins using the account-settings source', async () => {
    render(<MemoryRouter initialEntries={['/account/mailing-list']}><MailingListPage /></MemoryRouter>)
    const button = await screen.findByRole('button', { name: 'Join mailing list' })
    expect(button).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Yes, add me to the mailing list/i }))
    await userEvent.click(button)
    await waitFor(() => expect(mocks.join).toHaveBeenCalledWith('account_settings'))
    expect(await screen.findByText(/You are now on the mailing list/i)).toHaveTextContent(/confirmation email has been sent for your records/i)
    expect(screen.queryByText('customer@example.com', { exact: false })).not.toBeInTheDocument()
  })

  it('does not ask an unverified account for a second mailing-list confirmation', async () => {
    mocks.status.mockResolvedValueOnce({ email: 'customer@example.com', emailVerified: false, status: 'pending' })
    render(<MemoryRouter initialEntries={['/account/mailing-list']}><MailingListPage /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Join mailing list' })).toBeInTheDocument()
    expect(screen.queryByText('Pending verification')).not.toBeInTheDocument()
    expect(screen.queryByText('Verify your account email')).not.toBeInTheDocument()
  })
})
