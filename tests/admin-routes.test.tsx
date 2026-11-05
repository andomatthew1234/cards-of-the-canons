import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { demoProducts } from '../src/data/demo'
import { AdminRoutes } from '../src/pages/admin/AdminRoutes'
import * as dataApi from '../src/lib/data'
import * as communityApi from '../src/lib/community'
import * as treasuryApi from '../src/lib/treasury'

vi.mock('../src/context/AuthContext', () => ({
  friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Admin action failed.',
  useAuth: () => ({
    user: { uid: 'admin-1', email: 'admin@example.com', displayName: 'Admin', emailVerified: true, providerData: [] },
    isAdmin: true,
    loading: false,
    providers: ['password'],
    mfaReauthenticationChallenge: null,
    reauthenticate: vi.fn().mockResolvedValue('complete'),
    resolveMfaReauthentication: vi.fn().mockResolvedValue(undefined),
    cancelMfaReauthentication: vi.fn(),
    logOut: vi.fn(),
  }),
}))

vi.mock('../src/lib/accounts', () => ({
  listManagedAccounts: vi.fn().mockResolvedValue([]),
  manageAccount: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/lib/data', () => ({
  listAdminProducts: vi.fn().mockResolvedValue(demoProducts),
  listAdminOrders: vi.fn().mockResolvedValue([]),
  listEnquiries: vi.fn().mockResolvedValue([]),
  listSubscribers: vi.fn().mockResolvedValue([]),
  deleteProduct: vi.fn().mockResolvedValue(undefined),
  upsertProduct: vi.fn().mockResolvedValue(undefined),
  uploadProductImage: vi.fn().mockResolvedValue('https://example.com/image.jpg'),
  listProductMedia: vi.fn().mockResolvedValue([]),
  uploadPageImage: vi.fn().mockResolvedValue('https://example.com/page-image.jpg'),
  getPageContent: vi.fn().mockResolvedValue(null),
  savePageContent: vi.fn().mockResolvedValue(undefined),
  getSiteSettings: vi.fn().mockResolvedValue(null),
  saveSiteSettings: vi.fn().mockResolvedValue(undefined),
  deleteEnquiry: vi.fn().mockResolvedValue(undefined),
  updateEnquiryStatus: vi.fn().mockResolvedValue(undefined),
  deleteSubscriber: vi.fn().mockResolvedValue(undefined),
  updateSubscriberStatus: vi.fn().mockResolvedValue(undefined),
  updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  dismissTestOrder: vi.fn().mockResolvedValue({ dismissed: true }),
  listJournalArticlesAdmin: vi.fn().mockResolvedValue([]),
  listJournalArticlesAdminPage: vi.fn().mockResolvedValue({ articles: [], nextCursor: null, counts: { draft: 0, published: 0 } }),
  getJournalArticleAdmin: vi.fn().mockResolvedValue(null),
  saveJournalArticle: vi.fn(),
  publishJournalArticle: vi.fn(),
  retryJournalNotification: vi.fn(),
  deleteJournalArticle: vi.fn(),
  uploadJournalImage: vi.fn(),
  getSocialMediaLinksEditorState: vi.fn().mockResolvedValue({
    draft: { status:'draft',revision:0,heading:'Follow',links:[
      { id:'instagram',label:'Instagram',url:'',visible:false },
      { id:'tiktok',label:'TikTok',url:'',visible:false },
      { id:'youtube',label:'YouTube',url:'',visible:false },
      { id:'facebook',label:'Facebook',url:'',visible:false },
      { id:'x',label:'X',url:'',visible:false },
    ],updatedAt:null },
    published: null,
  }),
  saveSocialMediaLinksDraft: vi.fn(),
  publishSocialMediaLinks: vi.fn(),
}))

vi.mock('../src/lib/community', () => ({
  listAdminCommunitySurveys: vi.fn().mockResolvedValue([]),
  getAdminCommunitySurvey: vi.fn().mockResolvedValue(null),
  listCommunityResponses: vi.fn().mockResolvedValue([]),
  saveCommunitySurvey: vi.fn().mockResolvedValue('survey-1'),
  deleteCommunitySurvey: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../src/lib/treasury', () => ({
  getTreasuryAdminState: vi.fn().mockResolvedValue({ editions: [], cards: [], batches: [] }),
  getTreasuryCustomerAdmin: vi.fn().mockResolvedValue({ editions: [], cards: [], accountId:'customer-1', banned:false, orders:[], transactions:[] }),
  adminManageTreasury: vi.fn().mockResolvedValue({ updated:true }),
  assignPhysicalCodesToOrder: vi.fn().mockResolvedValue({ assigned:1,eligible:1 }),
  saveTreasuryEdition: vi.fn().mockResolvedValue('edition-1'),
  saveTreasuryCard: vi.fn().mockResolvedValue('card-1'),
  generateTreasuryCodeBatch: vi.fn().mockResolvedValue({ batchId:'batch-1',codes:['DXA-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'] }),
  revokeTreasuryCodeBatch: vi.fn().mockResolvedValue({ revoked:1 }),
}))

function LocationProbe() { return <output data-testid="location">{useLocation().pathname}</output> }

function renderAdmin(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/*" element={<><AdminRoutes /><LocationProbe /></>} /></Routes></MemoryRouter>)
}

describe('routed administrator workspace', () => {
  beforeEach(() => {
    cleanup()
    vi.mocked(dataApi.listAdminProducts).mockReset().mockResolvedValue(demoProducts)
    vi.mocked(dataApi.listAdminOrders).mockReset().mockResolvedValue([])
    vi.mocked(dataApi.listEnquiries).mockReset().mockResolvedValue([])
    vi.mocked(dataApi.listSubscribers).mockReset().mockResolvedValue([])
    vi.mocked(dataApi.dismissTestOrder).mockReset().mockResolvedValue({ dismissed: true })
    vi.mocked(dataApi.upsertProduct).mockReset().mockResolvedValue(undefined)
    vi.mocked(dataApi.uploadProductImage).mockReset().mockResolvedValue('https://example.com/product-image.jpg')
    vi.mocked(dataApi.listProductMedia).mockReset().mockResolvedValue([])
    vi.mocked(communityApi.listAdminCommunitySurveys).mockReset().mockResolvedValue([])
    vi.mocked(treasuryApi.getTreasuryAdminState).mockReset().mockResolvedValue({ editions: [], cards: [], batches: [] })
  })

  it('navigates between real admin views and updates the URL', async () => {
    renderAdmin('/admin/products')
    expect(await screen.findByRole('heading', { name: 'Products', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(demoProducts[0].name)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Orders' }))
    expect(await screen.findByRole('heading', { name: 'Orders', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/orders')
    expect(screen.getByText('No orders yet')).toBeInTheDocument()
  })

  it('supports direct navigation to the dedicated new-product editor', async () => {
    renderAdmin('/admin/products/new')
    expect(await screen.findByRole('heading', { name: 'Add product', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('form')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
  })

  it('uploads a new product image before a URL slug has been entered', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    renderAdmin('/admin/products/new')
    const image = new File(['product image'], 'front.webp', { type: 'image/webp' })
    await userEvent.upload(await screen.findByLabelText('Upload new image'), image)
    await waitFor(() => expect(dataApi.uploadProductImage).toHaveBeenCalledTimes(1))
    expect(alert).not.toHaveBeenCalledWith('Add a URL slug before uploading an image.')
    alert.mockRestore()
  })

  it('selects and saves an existing central Media Library image without entering a URL or slug', async () => {
    vi.mocked(dataApi.listProductMedia).mockResolvedValueOnce([{
      path: 'page-images/library/1790000000000-a1b2c3d4-front-card.webp',
      size: 1200,
      contentType: 'image/webp',
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
      url: 'https://example.com/front-card.webp',
    }])
    renderAdmin('/admin/products/new')
    await userEvent.click(await screen.findByRole('button', { name: 'Select front card' }))
    expect(screen.getByRole('img', { name: 'front card' })).toHaveAttribute('src', 'https://example.com/front-card.webp')
    expect(screen.getByLabelText(/^Image description/)).toHaveValue('front card')
    await userEvent.type(screen.getByLabelText('Name'), 'Media Library Pack')
    await userEvent.type(screen.getByLabelText(/^Short description/), 'A pack using a library image.')
    await userEvent.type(screen.getByLabelText('Full description'), 'A collectible pack using an existing Media Library image.')
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(dataApi.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-library-pack',
      slug: 'media-library-pack',
      imageUrl: 'https://example.com/front-card.webp',
      imageAlt: 'front card',
    })))
    expect(screen.queryByLabelText('URL slug')).not.toBeInTheDocument()
  })

  it('creates a product with an automatic URL instead of asking for a slug', async () => {
    renderAdmin('/admin/products/new')
    await userEvent.type(await screen.findByLabelText('Name'), 'Pilgrim Pack')
    await userEvent.type(screen.getByLabelText(/^Short description/), 'A compact card pack.')
    await userEvent.type(screen.getByLabelText('Full description'), 'A compact card pack for collectors.')
    await userEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(dataApi.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pilgrim-pack',
      slug: 'pilgrim-pack',
      name: 'Pilgrim Pack',
    })))
    expect(screen.queryByLabelText('URL slug')).not.toBeInTheDocument()
  })

  it('opens the dedicated social media settings editor', async () => {
    renderAdmin('/admin/settings/social-media')
    expect(await screen.findByRole('heading', { name: 'Social media links', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByLabelText(/^Profile URL/)).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText('No profiles selected yet.')).toBeInTheDocument()
  })

  it('offers provider-appropriate reauthentication when Journal publishing needs a fresh session', async () => {
    vi.mocked(dataApi.publishJournalArticle)
      .mockRejectedValueOnce({ code: 'functions/failed-precondition', message: 'Recent sign-in is required.', details: { reason: 'recent-auth-required' } })
      .mockResolvedValueOnce({
        id: 'journal-1', revision: 1, slug: 'welcome-to-the-journal', title: 'Welcome to the Journal',
        excerpt: 'A considered introduction to the Doxa Journal.', bodyMarkdown: '## Welcome\n\nThis is the beginning of a fresh story.',
        category: 'Progress update', coverImageUrl: '', coverImageAlt: '', authorName: 'Doxa Treasury',
        seoTitle: '', seoDescription: '', featured: false, status: 'published', publishedAt: '2026-10-21T00:00:00Z',
      })
    renderAdmin('/admin/journal/new')
    await userEvent.type(await screen.findByLabelText('Title'), 'Welcome to the Journal')
    await userEvent.type(screen.getByLabelText(/Introduction/), 'A considered introduction to the Doxa Journal.')
    await userEvent.type(screen.getByLabelText('Journal article in Markdown'), '## Welcome\n\nThis is the beginning of a fresh story.')
    await userEvent.click(screen.getByRole('button', { name: 'Review & publish' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Release this Journal story?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish story' }))
    expect(await screen.findByRole('heading', { name: 'Confirm it’s you' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Current password'), 'current-password')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm identity' }))
    await waitFor(() => expect(dataApi.publishJournalArticle).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/journal/journal-1'))
  }, 10_000)

  it('does not misclassify other Journal preconditions as a recent-login failure', async () => {
    vi.mocked(dataApi.publishJournalArticle).mockRejectedValueOnce({ code: 'functions/failed-precondition', message: 'Verify your email address before continuing.' })
    renderAdmin('/admin/journal/new')
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'A Journal Story' } })
    fireEvent.change(screen.getByLabelText(/Introduction/), { target: { value: 'A considered introduction to this Journal story.' } })
    fireEvent.change(screen.getByLabelText('Journal article in Markdown'), { target: { value: '## Story\n\nA complete Journal story ready for publication.' } })
    await userEvent.click(screen.getByRole('button', { name: 'Review & publish' }))
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Release this Journal story?' })).getByRole('button', { name: 'Publish story' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin action failed.')
    expect(screen.queryByRole('heading', { name: 'Confirm it’s you' })).not.toBeInTheDocument()
  })

  it('opens the Treasury workspace with set, card and physical activity management', async () => {
    renderAdmin('/admin/treasury')
    expect(await screen.findByRole('heading', { name: 'Treasury & physical cards', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collection sets' })).toHaveClass('active')
    expect(screen.getByRole('heading', { name: 'Create a collection set' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(screen.getByRole('heading', { name: 'Treasury activity' })).toBeInTheDocument()
  })

  it('opens Community and the dedicated survey builder', async () => {
    renderAdmin('/admin/community')
    expect(await screen.findByRole('heading', { name: 'Community', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('No community surveys yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Create survey' }))
    expect(await screen.findByRole('heading', { name: 'Create survey', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Question')).toBeInTheDocument()
  })

  it('opens the structured notifications view from the dashboard attention banner', async () => {
    vi.mocked(dataApi.listAdminOrders).mockResolvedValue([{
      id: 'co_paid', userId: 'customer-1', status: 'paid', currency: 'AUD', subtotalCents: 3200, shippingCents: 0, totalCents: 3200, items: [], createdAt: '2026-10-03T01:00:00Z',
    }])
    vi.mocked(dataApi.listEnquiries).mockResolvedValue([{
      id: 'enquiry-1', kind: 'general', name: 'Customer', email: 'customer@example.com', message: 'Please help.', consent: true, status: 'new', createdAt: '2026-10-03T02:00:00Z',
    }])
    renderAdmin('/admin')
    const attention = await screen.findByRole('link', { name: /item(?:s)? require(?:s)? attention/i })
    expect(attention).toHaveTextContent('Review notifications')
    await userEvent.click(attention)
    expect(await screen.findByRole('heading', { name: 'Notifications', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Orders and payments' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Customer enquiries' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/notifications')
  })

  it('clearly labels and dismisses a sandbox order through the trusted action', async () => {
    vi.mocked(dataApi.listAdminOrders).mockResolvedValue([{
      id: 'co_test', userId: 'customer-1', status: 'paid', currency: 'AUD', subtotalCents: 3200, shippingCents: 0, totalCents: 3200, items: [], paymentEnvironment: 'test', inventoryState: 'committed', createdAt: '2026-10-03T01:00:00Z',
    }])
    renderAdmin('/admin/orders/co_test')
    expect(await screen.findByRole('heading', { name: 'Order #co_test', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByText('Sandbox test').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss test order' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Dismiss this sandbox order?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss test order' }))
    await waitFor(() => expect(dataApi.dismissTestOrder).toHaveBeenCalledWith('co_test'))
    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/orders')
  })

  it('warns before a sidebar link discards unsaved editor changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAdmin('/admin/products/new')
    await userEvent.type(await screen.findByLabelText('Name'), 'Unsaved product')
    await userEvent.click(screen.getByRole('link', { name: 'Orders' }))
    expect(confirm).toHaveBeenCalledWith('Leave the product editor and discard your unsaved changes?')
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/products/new')
    confirm.mockRestore()
  })
})
