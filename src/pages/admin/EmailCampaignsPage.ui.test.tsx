import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailCampaignsPage } from './EmailCampaignsPage'

const listEmailCampaignWorkspace = vi.fn()
const sendEmailCampaignTest = vi.fn()
const retryEmailCampaign = vi.fn()
const searchEmailCampaignAudience = vi.fn()

vi.mock('../../lib/data', () => ({
  cancelScheduledEmailCampaign: vi.fn(),
  deleteEmailCampaign: vi.fn(),
  listEmailCampaignWorkspace: (...args: unknown[]) => listEmailCampaignWorkspace(...args),
  queueEmailCampaign: vi.fn(),
  retryEmailCampaign: (...args: unknown[]) => retryEmailCampaign(...args),
  searchEmailCampaignAudience: (...args: unknown[]) => searchEmailCampaignAudience(...args),
  saveEmailCampaign: vi.fn(),
  sendEmailCampaignTest: (...args: unknown[]) => sendEmailCampaignTest(...args),
  uploadEmailCampaignImage: vi.fn(),
}))

vi.mock('../../components/account/ReauthenticationPanel', () => ({
  ReauthenticationPanel: ({ onAuthenticated }: { onAuthenticated: () => void | Promise<void> }) => <div><h2>Confirm it’s you</h2><button onClick={() => void onAuthenticated()}>Confirm identity</button></div>,
}))

vi.mock('../../admin/AdminContext', () => ({
  useAdminData: () => ({ accounts: [], subscribers: [] }),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ cancelMfaReauthentication: vi.fn() }),
}))

function workspace(status = 'draft') {
  return {
    campaigns: [{
      id: 'campaign-1', revision: 1, name: 'Welcome', subject: 'Welcome to Doxa', previewText: '',
      blocks: [{ id: 'heading-1', type: 'heading', text: 'Welcome', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
      purpose: 'marketing', audience: 'mailing_list', recipientEmails: [], status, recipientCount: 0,
      acceptedCount: 0, failedCount: status === 'failed' ? 1 : 0, createdAt: null, updatedAt: null, scheduledAt: null, sentAt: null, lastError: status === 'failed' ? 'Provider unavailable.' : null,
    }],
    queue: [], configured: true,
    audienceCounts: { mailingList: 0, verifiedAccounts: 0 },
    audienceCandidates: [{ email: 'member@example.com', label: 'Member · member@example.com', subscribed: true, verified: true }],
    audienceDirectoryComplete: true,
  }
}

describe('email campaign workspace chrome', () => {
  beforeEach(() => {
    sendEmailCampaignTest.mockReset()
    sendEmailCampaignTest.mockResolvedValue({ sent: true, to: 'admin@example.com' })
    retryEmailCampaign.mockReset()
    retryEmailCampaign.mockResolvedValue({})
    searchEmailCampaignAudience.mockReset()
    searchEmailCampaignAudience.mockResolvedValue({ candidates: workspace().audienceCandidates, nextCursor: null })
    listEmailCampaignWorkspace.mockResolvedValue(workspace())
  })

  it('presents one primary create action and an accessible section switcher', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><EmailCampaignsPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Email campaigns' })).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: /create campaign/i })).toHaveLength(1)

    const campaigns = screen.getByRole('tab', { name: 'Campaigns' })
    const queue = screen.getByRole('tab', { name: 'Delivery queue' })
    expect(campaigns).toHaveAttribute('aria-selected', 'true')
    expect(queue).toHaveAttribute('aria-selected', 'false')

    await user.click(queue)
    expect(campaigns).toHaveAttribute('aria-selected', 'false')
    expect(queue).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Delivery queue' })).toBeInTheDocument()
  })

  it('keeps a stable message row so a clean campaign workspace fills the editor', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><EmailCampaignsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /open editor/i }))
    expect(screen.getByTestId('campaign-message-slot')).toBeInTheDocument()
    expect(screen.getByLabelText('Campaign steps')).toBeInTheDocument()
    expect(screen.getByText('640px email canvas')).toBeInTheDocument()
  })

  it('uses the campaign workspace audience even when the global admin cache is still empty', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><EmailCampaignsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /open editor/i }))
    await user.click(screen.getByRole('button', { name: /recipients & details/i }))
    await user.click(screen.getByRole('button', { name: /individuals/i }))

    expect(screen.getByText('Member · member@example.com')).toBeInTheDocument()
    expect(screen.getByText('Confirmed subscriber')).toBeInTheDocument()
  })

  it('loads later individual-recipient pages instead of truncating the directory', async () => {
    const user = userEvent.setup()
    searchEmailCampaignAudience
      .mockResolvedValueOnce({ candidates: [{ email: 'first@example.com', label: 'First member', subscribed: true, verified: true }], nextCursor: 'first@example.com' })
      .mockResolvedValueOnce({ candidates: [{ email: 'later@example.com', label: 'Later member', subscribed: true, verified: true }], nextCursor: null })
    render(<MemoryRouter><EmailCampaignsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /open editor/i }))
    await user.click(screen.getByRole('button', { name: /recipients & details/i }))
    await user.click(screen.getByRole('button', { name: /individuals/i }))
    expect(await screen.findByText('First member')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more people' }))

    expect(await screen.findByText('Later member')).toBeInTheDocument()
    expect(searchEmailCampaignAudience).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'first@example.com' }))
  })

  it('prompts for reauthentication and retries a protected test email', async () => {
    const user = userEvent.setup()
    sendEmailCampaignTest
      .mockRejectedValueOnce(Object.assign(new Error('Recent sign-in is required.'), {
        code: 'functions/failed-precondition', details: { reason: 'recent-auth-required' },
      }))
      .mockResolvedValueOnce({ sent: true, to: 'admin@example.com' })
    render(<MemoryRouter><EmailCampaignsPage /></MemoryRouter>)

    await user.click(await screen.findByRole('button', { name: /open editor/i }))
    await user.click(screen.getByRole('button', { name: /send test/i }))
    expect(await screen.findByRole('heading', { name: 'Confirm it’s you' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm identity' }))
    await waitFor(() => expect(sendEmailCampaignTest).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Test email accepted by the provider.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Confirm it’s you' })).not.toBeInTheDocument())
  })

  it('prompts for reauthentication and retries a failed campaign action', async () => {
    const user = userEvent.setup()
    listEmailCampaignWorkspace.mockResolvedValue(workspace('failed'))
    retryEmailCampaign
      .mockRejectedValueOnce(Object.assign(new Error('Recent sign-in is required.'), {
        code: 'functions/failed-precondition', details: { reason: 'recent-auth-required' },
      }))
      .mockResolvedValueOnce({})
    render(<MemoryRouter><EmailCampaignsPage /></MemoryRouter>)

    await user.click(await screen.findByLabelText('Actions for Welcome'))
    await user.click(screen.getByRole('menuitem', { name: /retry safely/i }))
    expect(await screen.findByRole('heading', { name: 'Confirm it’s you' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm identity' }))
    await waitFor(() => expect(retryEmailCampaign).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Confirm it’s you' })).not.toBeInTheDocument())
  })
})
