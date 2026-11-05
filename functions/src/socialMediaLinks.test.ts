import { describe, expect, it } from 'vitest'
import { blankSocialMediaLinks, socialMediaVersionDocumentId, storedSocialMediaLinks, validSocialDestination } from './socialMediaLinks'

describe('social media link publishing', () => {
  it('accepts official profile URLs and rejects unsafe or unfinished destinations', () => {
    expect(validSocialDestination('instagram', 'https://www.instagram.com/doxatreasury')).toBe(true)
    expect(validSocialDestination('youtube', 'https://youtube.com/@doxatreasury')).toBe(true)
    expect(validSocialDestination('x', 'https://twitter.com/doxatreasury')).toBe(true)
    expect(validSocialDestination('instagram', 'https://instagram.com/')).toBe(false)
    expect(validSocialDestination('instagram', 'http://instagram.com/doxatreasury')).toBe(false)
    expect(validSocialDestination('instagram', 'https://facebook.com/doxatreasury')).toBe(false)
    expect(validSocialDestination('facebook', 'https://user:secret@facebook.com/doxatreasury')).toBe(false)
    expect(validSocialDestination('x', 'https://x.com/coming-soon')).toBe(false)
  })

  it('starts with every supported platform private and present exactly once', () => {
    const blank = blankSocialMediaLinks()
    expect(blank.links.map((link) => link.id)).toEqual(['instagram', 'tiktok', 'youtube', 'facebook', 'x'])
    expect(new Set(blank.links.map((link) => link.id)).size).toBe(5)
    expect(blank.links.every((link) => !link.visible && link.url === '')).toBe(true)
  })

  it('reads validated content without trusting unexpected stored fields', () => {
    const blank = blankSocialMediaLinks()
    expect(storedSocialMediaLinks({
      ...blank,
      status: 'published',
      revision: 3,
      links: blank.links.map((link, index) => index === 0 ? { ...link, visible: true, url: 'https://instagram.com/doxatreasury' } : link),
      updatedAt: '2026-10-27T00:00:00.000Z',
      publishedAt: '2026-10-27T00:00:00.000Z',
      trackingScript: 'not retained',
    }, 'published')).toMatchObject({ status: 'published', revision: 3, heading: 'Follow' })
  })

  it('creates sortable immutable version identifiers', () => {
    expect(socialMediaVersionDocumentId(1)).toBe('v0000000001')
    expect(socialMediaVersionDocumentId(29)).toBe('v0000000029')
    expect(() => socialMediaVersionDocumentId(0)).toThrow()
  })
})
