import { describe, expect, it } from 'vitest'
import { siteSettings } from '../src/config'
import { defaultPageContent, normalisePageContent, normaliseSiteSettings } from '../src/context/SiteContentContext'
import { demoProducts, normaliseProductCopy } from '../src/data/demo'
import { LEGACY_BRAND_NAME } from '../src/lib/brand'

describe('copy normalisation', () => {
  it('upgrades legacy default page copy without replacing custom content', () => {
    const migrated = normalisePageContent({
      page: 'home',
      eyebrow: 'History worth holding',
      title: 'Stories of faith, carefully collected.',
      body: 'A proposed collection of cards designed to make remarkable people, moments and ideas from church history inviting to discover.',
      status: 'published',
    })
    expect(migrated.body).toBe(defaultPageContent.home.body)
    expect(migrated.contentVersion).toBe(2)
    expect(migrated.sections).toEqual(defaultPageContent.home.sections)

    const custom = { ...defaultPageContent.home, body: 'A deliberately custom introduction.' }
    expect(normalisePageContent(custom)).toEqual(custom)
  })

  it('deeply hydrates older homepage documents without overwriting stored section edits', () => {
    const migrated = normalisePageContent({
      page: 'home',
      eyebrow: 'Custom eyebrow',
      title: 'Custom title',
      body: 'Custom body',
      sections: { featured: { eyebrow: 'Chosen', title: 'A custom collection heading', body: 'Custom collection copy.' } } as never,
      status: 'published',
    })
    expect(migrated.sections?.featured.title).toBe('A custom collection heading')
    expect(migrated.sections?.hero.imageUrl).toBe(defaultPageContent.home.sections?.hero.imageUrl)
    expect(migrated.sections?.story.imageAlt).toBe(defaultPageContent.home.sections?.story.imageAlt)
  })

  it('upgrades the legacy announcement without overwriting CMS product copy', () => {
    expect(normaliseSiteSettings({
      ...siteSettings,
      announcement: 'Design preview — sample products, imagery and prices are shown for review.',
    }).announcement).toBe(siteSettings.announcement)

    const legacyProduct = {
      ...demoProducts[0],
      description: 'A proposed study set bringing together key people and moments from the Reformation. Final card count, subjects, artwork and contents are awaiting approval.',
    }
    expect(normaliseProductCopy(legacyProduct).description).toBe(legacyProduct.description)
    expect(normaliseProductCopy({ ...legacyProduct, sortOrder: undefined }).sortOrder).toBe(1000)
  })

  it('rebrands previously stored editable content without changing infrastructure identifiers', () => {
    expect(normaliseSiteSettings({
      ...siteSettings,
      businessName: LEGACY_BRAND_NAME,
      announcement: `Welcome to the ${LEGACY_BRAND_NAME} collection.`,
    })).toMatchObject({ businessName: 'Doxa', announcement: 'Welcome to the Doxa collection.' })

    expect(normalisePageContent({
      page: 'about',
      eyebrow: `About ${LEGACY_BRAND_NAME}`,
      title: `The ${LEGACY_BRAND_NAME} story`,
      body: `${LEGACY_BRAND_NAME} brings history to life.`,
      status: 'published',
    })).toMatchObject({
      eyebrow: 'About Doxa',
      title: 'The Doxa story',
      body: 'Doxa brings history to life.',
    })

    expect(normaliseProductCopy({
      ...demoProducts[0],
      id: 'custom-product',
      name: `${LEGACY_BRAND_NAME} Collector Pack`,
      shortDescription: `A ${LEGACY_BRAND_NAME} pack.`,
      description: `Made for ${LEGACY_BRAND_NAME} collectors.`,
      imageAlt: `${LEGACY_BRAND_NAME} pack`,
    })).toMatchObject({
      name: 'Doxa Collector Pack',
      shortDescription: 'A Doxa pack.',
      description: 'Made for Doxa collectors.',
      imageAlt: 'Doxa pack',
    })
  })
})
