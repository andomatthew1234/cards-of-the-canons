import { describe, expect, it } from 'vitest'
import { defaultWebsiteContent, parseWebsiteContent, websiteContentSchema } from './websiteContentSchema'

describe('website content schema', () => {
  it('accepts the bounded default whole-site content', () => {
    const parsed = parseWebsiteContent(structuredClone(defaultWebsiteContent))
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.pages.home.layout.order).toEqual(['hero', 'story', 'featured', 'values', 'newsletter'])
    expect(parsed.pages.about.sections.explore.items).toHaveLength(4)
  })

  it('rejects unrecognised executable or polluted fields', () => {
    const value = structuredClone(defaultWebsiteContent) as typeof defaultWebsiteContent & { trackingScript?: string }
    value.trackingScript = '<script>alert(1)</script>'
    expect(websiteContentSchema.safeParse(value).success).toBe(false)
  })

  it('accepts only first-party image locations', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.pages.home.sections.hero.imageUrl = 'https://example.com/tracker.png'
    expect(websiteContentSchema.safeParse(value).success).toBe(false)
  })

  it('requires unique home layout entries and category placeholders', () => {
    const duplicateLayout = structuredClone(defaultWebsiteContent)
    duplicateLayout.pages.home.layout.order = ['hero', 'hero', 'featured', 'story', 'newsletter']
    expect(websiteContentSchema.safeParse(duplicateLayout).success).toBe(false)

    const missingPlaceholder = structuredClone(defaultWebsiteContent)
    missingPlaceholder.pages.shop.categoryTitleTemplate = 'A collection'
    expect(websiteContentSchema.safeParse(missingPlaceholder).success).toBe(false)
  })

  it('enforces the total serialized content bound', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.pages.home.body = 'a'.repeat(10_000)
    value.pages.about.body = 'b'.repeat(10_000)
    // Per-field limits still prevent content from becoming unexpectedly large.
    value.pages.contact.body = 'c'.repeat(10_001)
    expect(websiteContentSchema.safeParse(value).success).toBe(false)
  })

  it('accepts HTTPS and same-site fragment links but rejects unsafe destinations', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.footer.groups[1].links[4] = { ...value.footer.groups[1].links[4], path:'https://x.com/doxatreasury',visible:true }
    value.footer.groups[0].links[4].path = '/about#journal'
    expect(websiteContentSchema.safeParse(value).success).toBe(true)
    for (const path of ['http://example.com','//example.com','javascript:alert(1)','https://user:pass@example.com']) {
      const unsafe = structuredClone(value)
      unsafe.footer.groups[1].links[4].path = path
      expect(websiteContentSchema.safeParse(unsafe).success).toBe(false)
    }
  })

  it('upgrades legacy footer columns without losing their existing links', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.footer.groups[0].heading = 'Explore'
    value.footer.groups[0].links = value.footer.groups[0].links.slice(0,3)
    value.footer.groups[1].heading = 'Account'
    value.footer.groups[1].links = value.footer.groups[1].links.slice(0,4)
    const parsed = parseWebsiteContent(value)
    expect(parsed.footer.groups.map((group) => group.heading)).toEqual(['Links','More'])
    expect(parsed.footer.groups.map((group) => group.links.length)).toEqual([6,6])
    expect(parsed.footer.groups[0].links.map((link) => link.id)).toContain('journal')
    expect(parsed.footer.groups[1].links.map((link) => link.id)).toContain('x')
  })

  it('upgrades the retired notification mailbox in saved website content', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.branding.publicContactEmail = 'notifications@doxatreasury.com'
    expect(parseWebsiteContent(value).branding.publicContactEmail).toBe('info@doxatreasury.com')
  })
})
