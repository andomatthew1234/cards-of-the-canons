import { describe, expect, it } from 'vitest'
import {
  defaultHomepageEditorialPanels,
  defaultWebsiteContent,
  parseWebsiteContent,
  websiteContentSchema,
} from './websiteContent'

describe('homepage display-card content', () => {
  it('uses Eternal White for every surface-backed section and upgrades the retired surface colour', () => {
    expect(defaultWebsiteContent.theme.palette.surface).toBe('#fcf5de')

    const legacy = structuredClone(defaultWebsiteContent)
    legacy.theme.palette.surface = '#fff8e8'
    expect(parseWebsiteContent(legacy)?.theme.palette.surface).toBe('#fcf5de')
  })

  it('allows every visible Shop-section copy field to be intentionally blank', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.home.sections.featured = { eyebrow: '', title: '', body: '' }

    expect(websiteContentSchema.safeParse(content).success).toBe(true)
  })

  it('allows the Shop page introduction to be intentionally blank', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.shop.eyebrow = ''
    content.pages.shop.title = ''
    content.pages.shop.body = ''

    expect(websiteContentSchema.safeParse(content).success).toBe(true)
  })

  it('upgrades the retired three-card values to the current editable selling points', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    delete legacy.pages.home.sections.values.bubbles

    const parsed = parseWebsiteContent(legacy)
    expect(parsed?.pages.home.sections.values.bubbles?.map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'Tested for child safety', body: '' },
      { title: 'Reverently produced', body: '' },
      { title: 'No AI', body: '' },
      { title: 'No artificial scarcity', body: '' },
      { title: 'Made in Australia', body: '' },
    ])
  })

  it('preserves later custom information bubbles and allows an intentionally blank description', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.home.sections.values.bubbles = [{ id: 'custom-value', title: 'A custom value', body: '', imageUrl: '', imageAlt: '' }]

    expect(websiteContentSchema.safeParse(content).success).toBe(true)
    expect(parseWebsiteContent(content)?.pages.home.sections.values.bubbles).toEqual(content.pages.home.sections.values.bubbles)
  })

  it('replaces the exact retired live bubble set without overwriting unrelated custom cards', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.home.sections.values.bubbles = [
      { id: 'rich-context', title: 'Reverently Crafted', body: 'Designed by a human, under the supervision of a priest.', imageUrl: '', imageAlt: '' },
      { id: 'collectible-format', title: 'Perfect Equality', body: 'Each card holds the same value, no artificial scarcity.', imageUrl: '', imageAlt: '' },
      { id: 'considered-detail', title: 'Made in Australia', body: 'Manufactured at home right here in Australia', imageUrl: '', imageAlt: '' },
    ]

    expect(parseWebsiteContent(content)?.pages.home.sections.values.bubbles?.map((bubble) => bubble.title)).toEqual([
      'Tested for child safety',
      'Reverently produced',
      'No AI',
      'No artificial scarcity',
      'Made in Australia',
    ])
  })

  it('allows a secure optional bubble background and requires its description', () => {
    const content = structuredClone(defaultWebsiteContent)
    const bubble = content.pages.home.sections.values.bubbles![0]
    bubble.imageUrl = '/images/history/orthodox-candles.jpg'
    bubble.imageAlt = 'Prayer candles in a Church'
    expect(websiteContentSchema.safeParse(content).success).toBe(true)

    bubble.imageAlt = ''
    expect(websiteContentSchema.safeParse(content).success).toBe(false)
  })

  it('upgrades content saved before the compact homepage panels became editable', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    delete legacy.pages.home.sections.editorial

    expect(parseWebsiteContent(legacy)?.pages.home.sections.editorial).toEqual(
      defaultHomepageEditorialPanels,
    )
  })

  it('preserves customised compact homepage panels and permits deliberate blank copy', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.home.sections.editorial!.genesis = {
      title: 'A beginning remembered',
      body: '',
      quoteReference: '',
      quote: '',
      imageUrl: '/images/editorial/genesis.webp',
      imageAlt: 'An archival photograph of the first collection',
    }

    expect(websiteContentSchema.safeParse(content).success).toBe(true)
    expect(parseWebsiteContent(content)?.pages.home.sections.editorial?.genesis).toEqual(
      content.pages.home.sections.editorial!.genesis,
    )
  })

  it('upgrades only the untouched Our Genesis placeholder to How It Began', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    legacy.pages.home.sections.editorial!.genesis = {
      title: 'Our Genesis',
      body: 'TBD.',
      quoteReference: '',
      quote: '',
      imageUrl: '/images/editorial/genesis.webp',
      imageAlt: 'A monastery at vespers',
    }

    const upgraded = parseWebsiteContent(legacy)?.pages.home.sections.editorial?.genesis
    expect(upgraded?.title).toBe('How It Began')
    expect(upgraded?.body).toContain('DoXa Treasury began at a vespers service')
    expect(upgraded?.quoteReference).toBe('Psalm 27:4')
    expect(upgraded?.quote).toContain('One *thing* I have desired')
    expect(upgraded?.imageUrl).toBe('/images/editorial/genesis.webp')
  })

  it('preserves a client-authored Genesis story', () => {
    const customised = structuredClone(defaultWebsiteContent)
    customised.pages.home.sections.editorial!.genesis.title = 'Our first chapter'
    customised.pages.home.sections.editorial!.genesis.body = 'Client-authored copy.'

    expect(parseWebsiteContent(customised)?.pages.home.sections.editorial?.genesis).toEqual(
      customised.pages.home.sections.editorial!.genesis,
    )
  })

  it('upgrades the untouched Scriptorium placeholder without discarding its image', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    legacy.pages.home.sections.editorial!.scriptorium = {
      title: 'From the Scriptorium',
      body: 'TBD.',
      imageUrl: '/images/editorial/from-the-scriptorium.webp',
      imageAlt: 'A handwritten manuscript beside a candle',
    }

    const upgraded = parseWebsiteContent(legacy)?.pages.home.sections.editorial?.scriptorium
    expect(upgraded?.body).toContain('Knowledge of God is more valuable')
    expect(upgraded?.body).toContain('Browse our library')
    expect(upgraded?.imageUrl).toBe('/images/editorial/from-the-scriptorium.webp')
  })

  it('upgrades the untouched newsletter panel to Our Socials but preserves custom copy', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    legacy.pages.home.sections.newsletter = {
      eyebrow: 'From the scriptorium',
      title: 'Thoughtful updates, delivered with care.',
      body: 'Receive occasional news as new cards, collections and stories become available to explore.',
    }

    const upgraded = parseWebsiteContent(legacy)?.pages.home.sections.newsletter
    expect(upgraded).toEqual({
      eyebrow: '',
      title: 'Our Socials',
      body: 'Follow us on social media for live updates, events, to show support, and share your experiences!',
    })

    legacy.pages.home.sections.newsletter.title = 'A client-authored heading'
    expect(parseWebsiteContent(legacy)?.pages.home.sections.newsletter.title).toBe('A client-authored heading')
  })

  it('requires accessible descriptions for compact-panel images', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.home.sections.editorial!.scriptorium.imageUrl = '/images/editorial/manuscript.webp'
    content.pages.home.sections.editorial!.scriptorium.imageAlt = ''

    expect(websiteContentSchema.safeParse(content).success).toBe(false)
  })

  it('keeps content saved before the optional rear image fields compatible', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    delete legacy.pages.home.sections.hero.backImageUrl
    delete legacy.pages.home.sections.hero.backImageAlt

    const parsed = parseWebsiteContent(legacy)
    expect(parsed).not.toBeNull()
    expect(parsed?.pages.home.sections.hero.backImageUrl).toBeUndefined()
  })

  it('accepts approved rear artwork locations and rejects executable values', () => {
    const content = structuredClone(defaultWebsiteContent)
    content.pages.home.sections.hero.backImageUrl = '/images/cards/rear.webp'
    content.pages.home.sections.hero.backImageAlt = 'Reverse side of the Doxa card'
    expect(websiteContentSchema.safeParse(content).success).toBe(true)

    content.pages.home.sections.hero.backImageAlt = ''
    expect(websiteContentSchema.safeParse(content).success).toBe(false)

    content.pages.home.sections.hero.backImageAlt = 'Reverse side of the Doxa card'
    content.pages.home.sections.hero.backImageUrl = 'javascript:alert(1)'
    expect(websiteContentSchema.safeParse(content).success).toBe(false)
  })
})
