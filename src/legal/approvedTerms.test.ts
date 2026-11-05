import { describe, expect, it } from 'vitest'
import { APPROVED_TERMS_POLICY } from './approvedTerms'

describe('APPROVED_TERMS_POLICY', () => {
  it('contains the supplied approved legal document and identifying details', () => {
    expect(APPROVED_TERMS_POLICY).toMatchObject({
      slug: 'terms',
      status: 'published',
      version: '1.0',
      effectiveDate: '2026-11-05',
    })
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).toContain('ABN 57 919 748 380')
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).toContain('within 30 days')
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).toContain('for 90 days')
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).toContain('## 14. Dispute Resolution')
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).toContain('## 16. Governing Law')
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).toContain('## 18. Entire Agreement, Variation and Waiver')
    expect(APPROVED_TERMS_POLICY.bodyMarkdown).not.toContain('[date of publication]')
  })
})
