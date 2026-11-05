import type { Product } from '../types'

export const HOME_PRODUCT_SLUGS = [
  'individual-card-pack',
  'card-bundle',
  'collectors-box',
  'twelve-card-demo-pack',
  'card-collecting-binder',
  'doxa-t-shirt',
  'doxa-cap',
  'church-history-bookmarks',
] as const

/**
 * A stored list is an editor-owned merchandising choice. When it is absent,
 * retain the established collection order for existing published websites.
 */
export function orderHomeProducts(products: Product[], productSlugs?: readonly string[]) {
  const bySlug = new Map(products.map((product) => [product.slug, product]))
  const selectedSlugs = productSlugs ?? HOME_PRODUCT_SLUGS
  const seen = new Set<string>()
  return selectedSlugs.flatMap((slug) => {
    if (seen.has(slug)) return []
    seen.add(slug)
    const product = bySlug.get(slug)
    return product ? [product] : []
  })
}
