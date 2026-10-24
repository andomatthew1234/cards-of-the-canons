import { describe, expect, it } from 'vitest'
import { renderNewsletter } from './newsletterCampaigns'

describe('newsletter campaign rendering', () => {
  it('escapes administrator-authored content and always includes an unsubscribe link', () => {
    const output = renderNewsletter({
      subject: 'A Doxa update',
      previewText: '<script>preview</script>',
      heading: 'Hello <Collector>',
      body: 'A safe update.\n\n<script>alert(1)</script>',
      buttonLabel: 'Visit & browse',
      buttonUrl: 'https://doxatreasury.com/shop?range=new&sort=recent',
    })

    expect(output.html).not.toContain('<script>')
    expect(output.html).toContain('&lt;script&gt;')
    expect(output.html).toContain('Hello &lt;Collector&gt;')
    expect(output.html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}')
    expect(output.text).toContain('Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}')
  })

  it('does not render a call-to-action when one was not configured', () => {
    const output = renderNewsletter({
      subject: 'A Doxa update', previewText: '', heading: 'Hello',
      body: 'This message is comfortably longer than twenty characters.', buttonLabel: '', buttonUrl: '',
    })
    expect(output.html).not.toContain('newsletter-preview-button')
    expect(output.text).not.toContain('undefined')
  })
})
