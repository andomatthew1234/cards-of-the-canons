import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AccountCentreShell } from '../src/components/account/AccountChrome'
import { AccountOverview, AccountOrdersPage } from '../src/pages/account/AccountCentrePages'
import { RecentActivityPage } from '../src/pages/account/RecentActivityPage'

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      uid: 'customer-1', email: 'customer@example.com', displayName: 'Matthew Anderson', emailVerified: true,
      providerData: [{ providerId: 'password', email: 'customer@example.com', displayName: 'Matthew Anderson' }],
      metadata: { creationTime: '2026-09-30T00:00:00Z', lastSignInTime: '2026-10-03T00:00:00Z' },
    },
    isAdmin: false, loading: false, providers: ['password'],
    mfaFactors: [] as Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }>,
    logOut: vi.fn(),
  },
  getProfile: vi.fn(),
  getPolicy: vi.fn(),
  listOrders: vi.fn(),
  mailingStatus: vi.fn(),
  joinMailing: vi.fn(),
  leaveMailing: vi.fn(),
  listActivity: vi.fn(),
  communityAttention: vi.fn(),
}))

vi.mock('../src/context/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../src/lib/accounts', () => ({ getUserProfile: mocks.getProfile, getAccountSecurityPolicy: mocks.getPolicy }))
vi.mock('../src/lib/data', () => ({
  listOrdersForUser: mocks.listOrders,
  getMyMailingListStatus: mocks.mailingStatus,
  joinAccountMailingList: mocks.joinMailing,
  leaveAccountMailingList: mocks.leaveMailing,
}))
vi.mock('../src/lib/accountActivity', () => ({ listAccountActivity: mocks.listActivity }))
vi.mock('../src/lib/community', () => ({ getCommunityAttentionCount: mocks.communityAttention }))

const securityResponse = {
  policy: {
    version: 1,
    methods: {
      emailCode: { status: 'not_configured', verifiedAt: null },
      authenticator: { status: 'not_configured', verifiedAt: null },
      passkey: { status: 'not_configured', verifiedAt: null },
    },
    requirements: { signIn: false, criticalActions: false, paymentActions: false, passwordlessSignIn: false },
  },
  capabilities: { emailCodeDelivery: false, passwordlessEmailCode: false, authenticator: true, passkeys: false, explanation: '' },
}

describe('routed Account Centre', () => {
  beforeEach(() => {
    mocks.auth.isAdmin = false
    mocks.auth.mfaFactors = []
    mocks.auth.logOut.mockReset()
    mocks.getProfile.mockReset().mockResolvedValue({ displayName: 'Matthew Anderson', email: 'customer@example.com', phone: '0400000123' })
    mocks.getPolicy.mockReset().mockResolvedValue(securityResponse)
    mocks.listOrders.mockReset().mockResolvedValue([])
    mocks.mailingStatus.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'unsubscribed' })
    mocks.joinMailing.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'subscribed' })
    mocks.leaveMailing.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'unsubscribed' })
    mocks.listActivity.mockReset().mockResolvedValue([])
    mocks.communityAttention.mockReset().mockResolvedValue(0)
  })

  it('uses persistent destination navigation rather than in-page anchor navigation', async () => {
    render(<MemoryRouter initialEntries={['/account/security']}><AccountCentreShell title="Security & sign-in" eyebrow="Account protection" description="Manage protection."><p>Security destination</p></AccountCentreShell></MemoryRouter>)
    const navigation = screen.getByRole('navigation', { name: 'Account Centre' })
    const accountToggle = screen.getByRole('button', { name: /Account, profile, and security/i })
    expect(accountToggle).toHaveAttribute('aria-expanded', 'true')
    expect(accountToggle).toHaveTextContent('Matthew Anderson')
    expect(screen.queryByRole('button', { name: 'Orders' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/account/orders')
    expect(navigation.querySelectorAll('a')).toHaveLength(11)
    expect(screen.getByRole('link', { name: 'Mailing list' })).toHaveAttribute('href', '/account/mailing-list')
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute('href', '/account/community')
    expect(screen.getByRole('link', { name: 'My Treasury' })).toHaveAttribute('href', '/account/treasury')
    expect(screen.getByRole('link', { name: 'Security & sign-in' })).toHaveClass('active')
    expect(Array.from(navigation.querySelectorAll('a')).every((link) => !link.getAttribute('href')?.startsWith('#'))).toBe(true)
    await userEvent.click(accountToggle)
    expect(accountToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Mailing list' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Orders' }))
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Orders' }).querySelector('.account-primary-current')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open account navigation' }))
    expect(navigation.closest('aside')).toHaveClass('open')
  })

  it('keeps the administrator identity inside the compact expandable account card', () => {
    mocks.auth.isAdmin = true
    render(<MemoryRouter initialEntries={['/account']}><AccountCentreShell title="Overview" eyebrow="Account" description="Overview."><p>Overview destination</p></AccountCentreShell></MemoryRouter>)
    const accountToggle = screen.getByRole('button', { name: /Account, profile, and security/i })
    expect(accountToggle).toHaveTextContent('Matthew Anderson')
    expect(accountToggle).toHaveTextContent('Administrator')
    expect(accountToggle.querySelector('.account-profile-icon')).toBeInTheDocument()
    expect(screen.queryByText('Doxa')).not.toBeInTheDocument()
  })

  it('selects Overview by default without expanding account, profile, and security', () => {
    render(<MemoryRouter initialEntries={['/account']}><AccountCentreShell title="Overview" eyebrow="Account" description="Overview."><p>Overview destination</p></AccountCentreShell></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Overview' }).querySelector('.account-primary-current')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Account, profile, and security/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Personal info & details' })).not.toBeInTheDocument()
  })

  it('keeps the sidebar visible while an account destination is loading', () => {
    render(<MemoryRouter initialEntries={['/account/security']}><AccountCentreShell title="Account" eyebrow="" description="" loading><span /></AccountCentreShell></MemoryRouter>)
    expect(screen.getByRole('navigation', { name: 'Account Centre' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading account page' })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('marks Community when an open survey is awaiting this account', async () => {
    mocks.communityAttention.mockResolvedValueOnce(2)
    render(<MemoryRouter initialEntries={['/account']}><AccountCentreShell title="Overview" eyebrow="Account" description="Overview."><p>Overview destination</p></AccountCentreShell></MemoryRouter>)
    const community = screen.getByText('Community').closest('a')
    expect(community).not.toBeNull()
    await waitFor(() => expect(community?.querySelector('.account-community-dot')).toBeInTheDocument())
    expect(community).toHaveTextContent('2 unanswered surveys')
    expect(mocks.communityAttention).toHaveBeenCalledWith('customer-1', false)
  })

  it('presents a focused overview with security, orders, community and mailing-list controls', async () => {
    render(<MemoryRouter initialEntries={['/account']}><AccountOverview /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Welcome, Matthew' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Security checkup' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Orders & purchases' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Community' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mailing list' })).toBeInTheDocument()
    expect(screen.getByText('Recent account activity')).toBeInTheDocument()
    expect(screen.getByText('Current login method')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Receive mailing-list updates' })).not.toBeChecked()
    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalledWith('customer-1'))
  })

  it('updates the mailing-list preference from the Overview switch', async () => {
    render(<MemoryRouter initialEntries={['/account']}><AccountOverview /></MemoryRouter>)
    const mailingSwitch = await screen.findByRole('switch', { name: 'Receive mailing-list updates' })
    await waitFor(() => expect(mailingSwitch).toBeEnabled())
    await userEvent.click(mailingSwitch)
    await waitFor(() => expect(mocks.joinMailing).toHaveBeenCalledWith('account_settings'))
    expect(mailingSwitch).toBeChecked()
    expect(screen.getByText('Mailing list turned on.')).toBeInTheDocument()
  })

  it('integrates real available order data into the dedicated purchase destination', async () => {
    mocks.listOrders.mockResolvedValueOnce([{
      id: 'ORDER-1', userId: 'customer-1', status: 'paid', paymentEnvironment: 'test', totalCents: 4900, currency: 'AUD', createdAt: null,
      items: [{ productId: 'p1', name: 'Council Fathers', quantity: 1, unitPriceCents: 4900 }],
    }])
    render(<MemoryRouter initialEntries={['/account/orders']}><AccountOrdersPage /></MemoryRouter>)
    expect(await screen.findByText('Order #ORDER-1')).toBeInTheDocument()
    expect(screen.getByText('Council Fathers', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Test order')).toBeInTheDocument()
  })

  it('presents private, filterable activity with an approximate login map', async () => {
    mocks.listActivity.mockResolvedValueOnce([
      { id:'login-1',type:'login',category:'security',title:'New sign-in',description:'Signed in with Google.',createdAt:'2026-10-04T08:00:00Z',location:{ city:'Sydney',region:'New South Wales',country:'Australia',countryCode:'AU',latitude:-33.8688,longitude:151.2093,accuracy:'approximate' } },
      { id:'order-1',type:'order_purchased',category:'purchase',title:'Order purchased',description:'Order #ORDER-1 was completed.',createdAt:'2026-10-04T07:00:00Z',metadata:{ orderId:'ORDER-1',totalCents:4900,currency:'AUD',itemCount:1 } },
    ])
    render(<MemoryRouter initialEntries={['/account/activity']}><RecentActivityPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'New sign-in' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Approximate sign-in location: Sydney/i })).toBeInTheDocument()
    expect(screen.getByText('$49.00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Purchases' }))
    expect(screen.queryByRole('heading', { name: 'New sign-in' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Order purchased' })).toBeInTheDocument()
  })
})
