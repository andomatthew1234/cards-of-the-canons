import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { CustomerDetailPage } from '../src/pages/admin/CustomerDetailPage'
import { EnquiryDetailPage } from '../src/pages/admin/EnquiryDetailPage'
import { OrderDetailPage } from '../src/pages/admin/OrderDetailPage'
import { ProductEditorPage } from '../src/pages/admin/ProductEditorPage'
import { AccountOrdersPage, AccountOverview } from '../src/pages/account/AccountCentrePages'
import { PersonalInfoPage } from '../src/pages/account/PersonalInfoPage'
import { ContentEditorPage } from '../src/pages/admin/ContentEditorPage'

const mocks = vi.hoisted(() => ({
  admin: {
    accounts: [], orders: [], enquiries: [], products: [], subscribers: [], loading: false,
    error: '', errors: {} as Record<string, string>, busy: '', toast: null,
    refresh: vi.fn().mockResolvedValue(undefined), runAction: vi.fn(), dismissToast: vi.fn(),
  },
  auth: {
    user: {
      uid: 'customer-1', email: 'customer@example.com', displayName: 'Known Account Name', emailVerified: true,
      providerData: [{ providerId: 'password' }], metadata: {},
    },
    isAdmin: false, loading: false, providers: ['password'], mfaFactors: [],
    updateDisplayName: vi.fn(), logOut: vi.fn(),
  },
  getProfile: vi.fn(),
  getPolicy: vi.fn(),
  listOrders: vi.fn(),
  mailingStatus: vi.fn(),
  communityAttention: vi.fn(),
  getPageContent: vi.fn(),
}))

vi.mock('../src/admin/AdminContext', () => ({ useAdminData: () => mocks.admin }))
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Request failed.',
}))
vi.mock('../src/lib/accounts', () => ({
  getUserProfile: mocks.getProfile,
  getAccountSecurityPolicy: mocks.getPolicy,
  saveUserProfile: vi.fn(),
  manageAccount: vi.fn(),
}))
vi.mock('../src/lib/data', () => ({
  listOrdersForUser: mocks.listOrders,
  getMyMailingListStatus: mocks.mailingStatus,
  joinAccountMailingList: vi.fn(),
  leaveAccountMailingList: vi.fn(),
  updateOrderStatus: vi.fn(),
  dismissTestOrder: vi.fn(),
  deleteEnquiry: vi.fn(),
  updateEnquiryStatus: vi.fn(),
  getPageContent: mocks.getPageContent,
  savePageContent: vi.fn(),
  uploadPageImage: vi.fn(),
}))
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

describe('backend read failures remain failures', () => {
  beforeEach(() => {
    mocks.admin.accounts = []
    mocks.admin.orders = []
    mocks.admin.enquiries = []
    mocks.admin.errors = {}
    mocks.admin.refresh.mockClear()
    mocks.getProfile.mockReset().mockResolvedValue({ displayName: 'Known Account Name', email: 'customer@example.com', phone: '' })
    mocks.getPolicy.mockReset().mockResolvedValue(securityResponse)
    mocks.listOrders.mockReset().mockResolvedValue([])
    mocks.mailingStatus.mockReset().mockResolvedValue({ email: 'customer@example.com', emailVerified: true, status: 'unsubscribed' })
    mocks.communityAttention.mockReset().mockResolvedValue(0)
    mocks.getPageContent.mockReset().mockResolvedValue(null)
  })

  it.each([
    ['customer', '/admin/customers/missing', 'accounts', 'Customer records could not be loaded.', <CustomerDetailPage />],
    ['order', '/admin/orders/missing', 'orders', 'Order records could not be loaded.', <OrderDetailPage />],
    ['enquiry', '/admin/enquiries/missing', 'enquiries', 'Enquiry records could not be loaded.', <EnquiryDetailPage />],
    ['product', '/admin/products/missing', 'products', 'Product records could not be loaded.', <ProductEditorPage />],
  ])('does not show a false not-found state for a failed %s list', async (_kind, path, resource, message, element) => {
    mocks.admin.errors = { [resource]: message }
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path={path} element={element} /></Routes></MemoryRouter>)

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.admin.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not describe a rejected order request as an empty purchase history', async () => {
    mocks.listOrders.mockRejectedValueOnce(new Error('Orders are temporarily unavailable.'))
    render(<MemoryRouter><AccountOrdersPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Orders are temporarily unavailable.')
    expect(screen.queryByText('No orders yet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No orders yet')).toBeInTheDocument()
    expect(mocks.listOrders).toHaveBeenCalledTimes(2)
  })

  it('does not enable profile editing from fallback values after a rejected profile read', async () => {
    mocks.getProfile.mockRejectedValueOnce(new Error('Profile could not be loaded.'))
    render(<MemoryRouter><PersonalInfoPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Profile could not be loaded.')
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument()
  })

  it('distinguishes partial overview failures from legitimate empty data', async () => {
    mocks.listOrders.mockRejectedValueOnce(new Error('Purchases could not be loaded.'))
    render(<MemoryRouter><AccountOverview /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Purchases could not be loaded.')
    expect(screen.queryByText('No purchases yet.')).not.toBeInTheDocument()
  })

  it('does not present failed community and mailing-list reads as valid preferences', async () => {
    mocks.communityAttention.mockRejectedValue(new Error('Community status could not be loaded.'))
    mocks.mailingStatus.mockRejectedValue(new Error('Mailing preference could not be loaded.'))
    render(<MemoryRouter><AccountOverview /></MemoryRouter>)

    expect((await screen.findByText('Community status could not be loaded.')).closest('[role="alert"]')).not.toBeNull()
    expect(screen.getByText('Mailing preference could not be loaded.').closest('[role="alert"]')).not.toBeNull()
    expect(screen.queryByRole('switch', { name: 'Receive mailing-list updates' })).not.toBeInTheDocument()
    expect(screen.queryByText('new surveys waiting')).not.toBeInTheDocument()
  })

  it('does not expose editable defaults after a managed page read fails', async () => {
    mocks.getPageContent.mockRejectedValueOnce(new Error('Page content could not be loaded.')).mockResolvedValueOnce(null)
    render(<MemoryRouter initialEntries={['/admin/content/home']}><Routes><Route path="/admin/content/:page" element={<ContentEditorPage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Page content could not be loaded.')
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByDisplayValue('The Glory of the Church')).toBeInTheDocument()
    expect(mocks.getPageContent).toHaveBeenCalledTimes(2)
  })
})
