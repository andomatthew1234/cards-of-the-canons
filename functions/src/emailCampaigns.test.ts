import { describe, expect, it } from 'vitest'
import { parseEmailCampaignDraft, parseEmailCampaignSaveDraft, renderEmailCampaign } from './emailCampaigns'

describe('structured email campaign rendering', () => {
  it('escapes administrator content and keeps marketing unsubscribe controls', () => {
    const output = renderEmailCampaign({
      purpose: 'marketing',
      previewText: '<script>preview</script>',
      blocks: [
        { id: 'heading1', type: 'heading', text: 'Hello <Collector>', url: '', alt: '', caption: '', align: 'left', size: 'large' },
        { id: 'body001', type: 'paragraph', text: '<img src=x onerror=alert(1)>', url: '', alt: '', caption: '', align: 'left', size: 'medium' },
        { id: 'button1', type: 'button', text: 'Visit & browse', url: 'https://doxatreasury.com/shop?a=1&b=2', alt: '', caption: '', align: 'center', size: 'medium' },
      ],
    })

    expect(output.html).not.toContain('<script>')
    expect(output.html).not.toContain('<img src=x')
    expect(output.html).toContain('Hello &lt;Collector&gt;')
    expect(output.html).toContain('Visit &amp; browse')
    expect(output.html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}')
    expect(output.text).toContain('Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}')
  })

  it('uses account settings rather than a marketing unsubscribe link for service messages', () => {
    const output = renderEmailCampaign({
      purpose: 'service',
      previewText: '',
      blocks: [{ id: 'body002', type: 'paragraph', text: 'An important account update.', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
    })

    expect(output.html).not.toContain('{{{RESEND_UNSUBSCRIBE_URL}}}')
    expect(output.html).toContain('/account')
    expect(output.text).toContain('This service message relates to your Doxa Cards account.')
  })

  it('rejects unsafe links and marketing mail to all accounts', () => {
    const base = {
      revision: 0,
      name: 'A campaign draft',
      subject: 'A useful update',
      previewText: '',
      recipientEmails: [],
    }
    expect(() => parseEmailCampaignDraft({
      ...base,
      purpose: 'marketing',
      audience: 'mailing_list',
      blocks: [{ id: 'button2', type: 'button', text: 'Open this', url: 'javascript:alert(1)', alt: '', caption: '', align: 'left', size: 'medium' }],
    })).toThrow()
    expect(() => parseEmailCampaignDraft({
      ...base,
      purpose: 'marketing',
      audience: 'all_accounts',
      blocks: [{ id: 'body003', type: 'paragraph', text: 'A normal paragraph.', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
    })).toThrow()
  })

  it('allows an incomplete content-first draft without making it sendable', () => {
    const incomplete = {
      revision: 0,
      name: '',
      subject: '',
      previewText: '',
      purpose: 'marketing',
      audience: 'mailing_list',
      recipientEmails: [],
      blocks: [{ id: 'image01', type: 'image', text: '', url: '', alt: '', caption: '', align: 'center', size: 'medium' }],
    }
    expect(parseEmailCampaignSaveDraft(incomplete).name).toBe('')
    expect(() => parseEmailCampaignDraft(incomplete)).toThrow()
  })

  it('accepts short names and subjects when they contain visible text', () => {
    const draft = {
      revision: 0,
      name: 'hi',
      subject: 'i',
      previewText: '',
      blocks: [{ id: 'heading', type: 'heading', text: 'A story worth sharing', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
      purpose: 'service',
      audience: 'individuals',
      recipientEmails: ['recipient@example.com'],
    }
    expect(parseEmailCampaignDraft(draft)).toBeTruthy()
    expect(() => parseEmailCampaignDraft({ ...draft, name: '   ' })).toThrow()
    expect(() => parseEmailCampaignDraft({ ...draft, subject: '   ' })).toThrow()
  })

  it('renders validated multi-column layouts as email-safe presentation tables', () => {
    const base = {
      id: 'column-layout', type: 'columns', text: '', url: '', alt: '', caption: '', align: 'left', size: 'medium',
      columns: [
        [{ id: 'left-column', type: 'heading', text: 'Left story', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
        [{ id: 'right-column', type: 'paragraph', text: 'Right story', url: '', alt: '', caption: '', align: 'left', size: 'medium' }],
      ],
    }
    const draft = parseEmailCampaignDraft({ revision: 0, name: 'Two columns', subject: 'A layout', previewText: '', blocks: [base], purpose: 'marketing', audience: 'mailing_list', recipientEmails: [] })
    const output = renderEmailCampaign(draft)
    expect(output.html).toContain('role="presentation"')
    expect(output.html).toContain('Left story')
    expect(output.html).toContain('Right story')
  })

  it('rejects untrusted style strings before rendering', () => {
    expect(() => parseEmailCampaignDraft({
      revision: 0, name: 'Unsafe style', subject: 'Do not send', previewText: '', purpose: 'marketing', audience: 'mailing_list', recipientEmails: [],
      blocks: [{ id: 'unsafe-style', type: 'paragraph', text: 'Hello', url: '', alt: '', caption: '', align: 'left', size: 'medium', backgroundColor: 'url(javascript:alert(1))' }],
    })).toThrow()
  })
})
