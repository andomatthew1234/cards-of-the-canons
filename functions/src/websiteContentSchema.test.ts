import { describe, expect, it } from 'vitest'
import {
  defaultHomepageEditorialPanels,
  defaultWebsiteContent,
  parseWebsiteContent,
  websiteContentSchema,
} from './websiteContentSchema'

describe('website content schema', () => {
  it('uses Eternal White for surface-backed sections and upgrades the retired surface colour', () => {
    expect(defaultWebsiteContent.theme.palette.surface).toBe('#fcf5de')

    const legacy = structuredClone(defaultWebsiteContent)
    legacy.theme.palette.surface = '#fff8e8'
    expect(parseWebsiteContent(legacy).theme.palette.surface).toBe('#fcf5de')
  })

  it('accepts intentionally blank homepage Shop-section copy', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.pages.home.sections.featured = { eyebrow: '', title: '', body: '' }

    expect(websiteContentSchema.safeParse(value).success).toBe(true)
  })

  it('accepts an intentionally blank Shop page introduction', () => {
    const value = structuredClone(defaultWebsiteContent)
    value.pages.shop.eyebrow = ''
    value.pages.shop.title = ''
    value.pages.shop.body = ''

    expect(websiteContentSchema.safeParse(value).success).toBe(true)
  })

  it('accepts the bounded default whole-site content', () => {
    const parsed = parseWebsiteContent(structuredClone(defaultWebsiteContent))
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.pages.home.layout.order).toEqual(['hero', 'story', 'featured', 'values', 'newsletter'])
    expect(parsed.pages.about.sections.explore.items).toHaveLength(4)
    expect(parsed.pages.home.sections.values.bubbles?.map((bubble) => bubble.title)).toEqual([
      'Tested for child safety',
      'Reverently produced',
      'No AI',
      'No artificial scarcity',
      'Made in Australia',
    ])
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

  it('accepts legacy homepage cards without a rear image and validates custom rear artwork', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    delete legacy.pages.home.sections.hero.backImageUrl
    delete legacy.pages.home.sections.hero.backImageAlt
    expect(parseWebsiteContent(legacy).pages.home.sections.hero.backImageUrl).toBeUndefined()

    const customised = structuredClone(defaultWebsiteContent)
    customised.pages.home.sections.hero.backImageUrl = '/images/cards/rear.webp'
    customised.pages.home.sections.hero.backImageAlt = 'Reverse side of the Doxa card'
    expect(parseWebsiteContent(customised).pages.home.sections.hero.backImageUrl).toBe('/images/cards/rear.webp')

    customised.pages.home.sections.hero.backImageAlt = ''
    expect(websiteContentSchema.safeParse(customised).success).toBe(false)

    customised.pages.home.sections.hero.backImageAlt = 'Reverse side of the Doxa card'
    customised.pages.home.sections.hero.backImageUrl = 'javascript:alert(1)'
    expect(websiteContentSchema.safeParse(customised).success).toBe(false)
  })

  it('upgrades legacy content with the editable compact homepage panels', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    delete legacy.pages.home.sections.editorial

    expect(parseWebsiteContent(legacy).pages.home.sections.editorial).toEqual(
      defaultHomepageEditorialPanels,
    )
  })

  it('upgrades the untouched Our Genesis placeholder without discarding its image', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    legacy.pages.home.sections.editorial!.genesis = {
      title: 'Our Genesis',
      body: 'TBD.',
      quoteReference: '',
      quote: '',
      imageUrl: '/images/editorial/genesis.webp',
      imageAlt: 'A monastery at vespers',
    }

    const upgraded = parseWebsiteContent(legacy).pages.home.sections.editorial!.genesis
    expect(upgraded.title).toBe('How It Began')
    expect(upgraded.body).toContain('DoXa Treasury began at a vespers service')
    expect(upgraded.quoteReference).toBe('Psalm 27:4')
    expect(upgraded.quote).toContain('One *thing* I have desired')
    expect(upgraded.imageUrl).toBe('/images/editorial/genesis.webp')
  })

  it('adds blank Genesis verse fields to older customised content', () => {
    const legacy = structuredClone(defaultWebsiteContent) as unknown as Record<string, any>
    legacy.pages.home.sections.editorial.genesis = {
      title: 'A custom beginning',
      body: 'Already edited by the client.',
      imageUrl: '',
      imageAlt: '',
    }

    const parsed = parseWebsiteContent(legacy).pages.home.sections.editorial!.genesis
    expect(parsed.title).toBe('A custom beginning')
    expect(parsed.body).toBe('Already edited by the client.')
    expect(parsed.quoteReference).toBe('')
    expect(parsed.quote).toBe('')
  })

  it('upgrades untouched Scriptorium and Socials placeholders while preserving artwork', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    legacy.pages.home.sections.editorial!.scriptorium = {
      title: 'From the Scriptorium',
      body: 'TBD.',
      imageUrl: '/images/editorial/from-the-scriptorium.webp',
      imageAlt: 'A handwritten manuscript beside a candle',
    }
    legacy.pages.home.sections.newsletter = {
      eyebrow: 'From the scriptorium',
      title: 'Thoughtful updates, delivered with care.',
      body: 'Receive occasional news as new cards, collections and stories become available to explore.',
    }

    const parsed = parseWebsiteContent(legacy)
    expect(parsed.pages.home.sections.editorial!.scriptorium.body).toContain('Knowledge of God is more valuable')
    expect(parsed.pages.home.sections.editorial!.scriptorium.imageUrl).toBe('/images/editorial/from-the-scriptorium.webp')
    expect(parsed.pages.home.sections.newsletter.title).toBe('Our Socials')
    expect(parsed.pages.home.sections.newsletter.body).toContain('Follow us on social media')
  })

  it('preserves custom compact panels and validates their image descriptions', () => {
    const customised = structuredClone(defaultWebsiteContent)
    customised.pages.home.sections.editorial!.council.title = 'Gather with Doxa'
    customised.pages.home.sections.editorial!.council.body = ''
    expect(parseWebsiteContent(customised).pages.home.sections.editorial?.council.title).toBe(
      'Gather with Doxa',
    )

    customised.pages.home.sections.editorial!.council.imageAlt = ''
    expect(websiteContentSchema.safeParse(customised).success).toBe(false)
  })
})
