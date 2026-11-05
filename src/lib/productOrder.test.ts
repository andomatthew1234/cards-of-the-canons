import { describe, expect, it } from 'vitest'
import { demoProducts } from '../data/demo'
import { LEGACY_PRODUCT_SORT_ORDER, normaliseProductCategory, orderProductsForDisplay, productSortOrder, productStorefrontSection } from './productOrder'

describe('product storefront order', () => {
  it('orders products by the administrator value, then by name', () => {
    const products = [
      { ...demoProducts[0], id: 'last', name: 'Last', sortOrder: 90 },
      { ...demoProducts[0], id: 'first', name: 'First', sortOrder: 5 },
      { ...demoProducts[0], id: 'middle-b', name: 'Beta', sortOrder: 20 },
      { ...demoProducts[0], id: 'middle-a', name: 'Alpha', sortOrder: 20 },
    ]
    expect(orderProductsForDisplay(products).map((product) => product.id)).toEqual(['first', 'middle-a', 'middle-b', 'last'])
  })

  it('keeps legacy records valid with a stable alphabetical fallback', () => {
    expect(productSortOrder({})).toBe(LEGACY_PRODUCT_SORT_ORDER)
    expect(productSortOrder({ sortOrder: -1 })).toBe(LEGACY_PRODUCT_SORT_ORDER)
    const legacy = demoProducts.map((product) => ({ ...product, sortOrder: undefined }))
    expect(orderProductsForDisplay(legacy).map((product) => product.name)).toEqual(
      [...legacy].sort((left, right) => left.name.localeCompare(right.name, 'en-AU', { sensitivity: 'base' })).map((product) => product.name),
    )
  })

  it('normalises administrator category values and maps production categories to Shop sections', () => {
    expect(normaliseProductCategory('  Limited   editions  ')).toBe('Limited editions')
    expect(productStorefrontSection({ ...demoProducts[0], category: 'Collectibles' })).toBe('card-packs')
    expect(productStorefrontSection({ ...demoProducts[0], name: 'Bookmark', slug: 'bookmark', category: 'Accessories', treasuryCardsPerUnit: 0 })).toBe('accessories')
    expect(productStorefrontSection({ ...demoProducts[0], name: 'Card Collecting Binder', slug: 'card-collecting-binder', category: 'Accessories', treasuryCardsPerUnit: 0 })).toBe('card-packs')
    expect(productStorefrontSection({ ...demoProducts[0], category: 'Limited editions', treasuryCardsPerUnit: 4 })).toBe('card-packs')
    expect(productStorefrontSection({ ...demoProducts[0], category: 'Limited editions', treasuryCardsPerUnit: 0 })).toBe('accessories')
  })
})
