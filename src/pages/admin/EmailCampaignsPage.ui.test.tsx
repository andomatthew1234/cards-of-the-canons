import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailCampaignsPage } from './EmailCampaignsPage'

const listEmailCampaignWorkspace = vi.fn()

vi.mock('../../lib/data', () => ({
  cancelScheduledEmailCampaign: vi.fn(),
  deleteEmailCampaign: vi.fn(),
  listEmailCampaignWorkspace: (...args: unknown[]) => listEmailCampaignWorkspace(...args),
  queueEmailCampaign: vi.fn(),
  retryEmailCampaign: vi.fn(),
  saveEmailCampaign: vi.fn(),
  sendEmailCampaignTest: vi.fn(),
  uploadEmailCampaignImage: vi.fn(),
}))

vi.mock('../../admin/AdminContext', () => ({
  useAdminData: () => ({ accounts: [], subscribers: [] }),
}))

describe('email campaign workspace chrome', () => {
  beforeEach(() => {
    listEmailCampaignWorkspace.mockResolvedValue({
      campaigns: [{
        id: 'campaign-1', revision: 1, name: 'Welcome', subject: 'Welcome to Doxa', previewText: '',
        blocks: [{ id: 'heading-1', type: 'heading', text: 'Welcome', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
        purpose: 'marketing', audience: 'mailing_list', recipientEmails: [], status: 'draft', recipientCount: 0,
        acceptedCount: 0, failedCount: 0, createdAt: null, updatedAt: null, scheduledAt: null, sentAt: null, lastError: null,
      }],
      queue: [],
      configured: true,
      audienceCounts: { mailingList: 0, verifiedAccounts: 0 },
    })
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
})
