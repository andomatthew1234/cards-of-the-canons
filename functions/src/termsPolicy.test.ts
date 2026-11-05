import { describe, expect, it } from 'vitest'
import { storedPolicy, termsVersionDocumentId } from './termsPolicy'

describe('Terms and Conditions publication history', () => {
  it('creates sortable, policy-scoped immutable version IDs', () => {
    expect(termsVersionDocumentId(1)).toBe('terms-v0000000001')
    expect(termsVersionDocumentId(42)).toBe('terms-v0000000042')
    expect(() => termsVersionDocumentId(0)).toThrow()
  })

  it('reads validated content while ignoring server-owned metadata fields', () => {
    expect(storedPolicy({
      slug: 'terms', status: 'published', revision: 4,
      title: 'Terms and Conditions', description: 'The approved terms for Doxa customers.',
      bodyMarkdown: '## Orders\n\nThese are the approved terms.', version: '1.2', effectiveDate: '2026-10-27',
      updatedBy: 'admin-user', publishedBy: 'admin-user', updatedAt: '2026-10-27T01:00:00.000Z', publishedAt: '2026-10-27T01:00:00.000Z',
    }, 'published')).toMatchObject({ slug: 'terms', status: 'published', revision: 4, version: '1.2' })
  })
})
