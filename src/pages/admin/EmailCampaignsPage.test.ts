import { describe, expect, it } from 'vitest'
import { validateDraft } from './EmailCampaignsPage'
import type { EmailCampaignDraft } from '../../types'

const readyDraft = (): EmailCampaignDraft => ({
  revision: 0,
  name: 'hi',
  subject: 'i',
  previewText: '',
  blocks: [
    { id: 'heading', type: 'heading', text: 'A story worth sharing', url: '', alt: '', caption: '', align: 'left', size: 'medium' },
    { id: 'paragraph', type: 'paragraph', text: 'Write your message here.', url: '', alt: '', caption: '', align: 'left', size: 'medium' },
  ],
  purpose: 'service',
  audience: 'individuals',
  recipientEmails: ['recipient@example.com'],
})

describe('email campaign readiness', () => {
  it('accepts short names and subjects when they contain visible text', () => {
    expect(validateDraft(readyDraft())).toBe('')
  })

  it('still rejects whitespace-only names and subjects', () => {
    expect(validateDraft({ ...readyDraft(), name: '   ' })).toBe('Add an internal campaign name.')
    expect(validateDraft({ ...readyDraft(), subject: '   ' })).toBe('Add an email subject.')
  })
})
