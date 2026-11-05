import { Firestore, FieldValue } from '@google-cloud/firestore'
import { describe, expect, it } from 'vitest'
import {
  legacyWebsiteContent, mediaLockId, referencedWebsiteMedia,
  publishedDraftDocument, storagePathFromImageUrl, versionDocumentId,
} from './websiteContent'
import { defaultWebsiteContent, parseWebsiteContent, websiteContentSchema } from './websiteContentSchema'

const image = 'https://firebasestorage.googleapis.com/v0/b/example.appspot.com/o/page-images%2Flibrary%2Fhero.jpg?alt=media&token=abc'

describe('website content helpers', () => {
  it('migrates legacy values to the five current editable selling points and validates background media', () => {
    const legacy = structuredClone(defaultWebsiteContent)
    delete legacy.pages.home.sections.values.bubbles
    const bubbles = parseWebsiteContent(legacy).pages.home.sections.values.bubbles
    expect(bubbles).toHaveLength(5)
    expect(bubbles?.map((bubble) => bubble.title)).toEqual([
      'Tested for child safety',
      'Reverently produced',
      'No AI',
      'No artificial scarcity',
      'Made in Australia',
    ])

    const content = structuredClone(defaultWebsiteContent)
    const bubble = content.pages.home.sections.values.bubbles![0]
    bubble.imageUrl = '/images/history/candles.jpg'
    bubble.imageAlt = 'Prayer candles'
    expect(websiteContentSchema.safeParse(content).success).toBe(true)
    bubble.imageAlt = ''
    expect(websiteContentSchema.safeParse(content).success).toBe(false)
  })

  it('only upgrades the exact retired three-card set and preserves custom bubbles', () => {
    const retired = structuredClone(defaultWebsiteContent)
    retired.pages.home.sections.values.bubbles = [
      { id: 'rich-context', title: 'Reverently Crafted', body: 'Designed by a human, under the supervision of a priest.', imageUrl: '', imageAlt: '' },
      { id: 'collectible-format', title: 'Perfect Equality', body: 'Each card holds the same value, no artificial scarcity.', imageUrl: '', imageAlt: '' },
      { id: 'considered-detail', title: 'Made in Australia', body: 'Manufactured at home right here in Australia', imageUrl: '', imageAlt: '' },
    ]
    expect(parseWebsiteContent(retired).pages.home.sections.values.bubbles).toHaveLength(5)

    const custom = structuredClone(defaultWebsiteContent)
    custom.pages.home.sections.values.bubbles = [{ id: 'custom', title: 'Custom', body: '', imageUrl: '', imageAlt: '' }]
    expect(parseWebsiteContent(custom).pages.home.sections.values.bubbles).toEqual(custom.pages.home.sections.values.bubbles)
  })

  it('migrates bounded legacy content without copying unknown data', () => {
    const sections = {
      hero:{ accent:'Legacy accent',imageUrl:'/images/legacy.jpg',imageAlt:'Legacy image',imageCredit:'',primaryActionLabel:'Explore',secondaryActionLabel:'About us' },
      values:{ firstTitle:'First',firstBody:'First body',secondTitle:'Second',secondBody:'Second body',thirdTitle:'Third',thirdBody:'Third body',marquee:'Legacy stories' },
      featured:{ eyebrow:'Featured',title:'Legacy featured',body:'Featured body' },
      story:{ eyebrow:'Story',title:'Legacy story',body:'Story body',imageUrl:'/images/story.jpg',imageAlt:'Legacy story image',imageCredit:'',actionLabel:'Learn more' },
    }
    const migrated = legacyWebsiteContent(
      { eyebrow: 'Legacy', title: 'Legacy home', body: 'Legacy body', sections, trackingScript: 'evil' },
      { eyebrow: 'About', title: 'Legacy about', body: 'About body' },
      { businessName: 'Doxa Treasury', contactEmail: 'HELLO@DOXATREASURY.COM', announcement: 'Welcome' },
    )
    expect(migrated.branding.businessName).toBe('Doxa Treasury')
    expect(migrated.branding.publicContactEmail).toBe('hello@doxatreasury.com')
    expect(migrated.pages.home.title).toBe('Legacy home')
    expect(migrated.pages.home.sections.hero.accent).toBe('Legacy accent')
    expect(migrated.pages.home.sections.newsletter.title).toBeTruthy()
    expect(migrated).not.toHaveProperty('trackingScript')
  })

  it('generates sortable bounded version document IDs', () => {
    expect(versionDocumentId(1)).toBe('v0000000001')
    expect(versionDocumentId(25)).toBe('v0000000025')
    expect(() => versionDocumentId(0)).toThrow()
  })

  it('extracts only page-image paths from approved Firebase download URLs', () => {
    expect(storagePathFromImageUrl(image)).toBe('page-images/library/hero.jpg')
    expect(storagePathFromImageUrl('https://example.com/page-images/library/hero.jpg')).toBeNull()
    expect(storagePathFromImageUrl('https://firebasestorage.googleapis.com/v0/b/example/o/product-images%2Fa%2Fx.jpg?alt=media')).toBeNull()
  })

  it('deduplicates nested media references and makes opaque lock IDs', () => {
    expect(referencedWebsiteMedia({ hero: image, cards: [{ image }, image] })).toEqual(['page-images/library/hero.jpg'])
    expect(mediaLockId('page-images/library/hero.jpg')).toMatch(/^[a-f0-9]{64}$/)
    expect(mediaLockId('page-images/library/hero.jpg')).not.toContain('hero')
  })

  it('builds a first-publish draft document accepted by a full Firestore set', () => {
    const firestore = new Firestore({ projectId: 'website-content-test' })
    const draft = publishedDraftDocument(
      { schemaVersion: 1, revision: 1, restoredFromRevision: 1 },
      2,
      1,
      defaultWebsiteContent,
      'admin-user',
      FieldValue.serverTimestamp(),
    )

    expect(() => firestore.batch().set(firestore.doc('websiteContentDrafts/current'), draft)).not.toThrow()
    expect(draft).not.toHaveProperty('restoredFromRevision')
  })
})
