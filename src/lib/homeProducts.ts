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

export function orderHomeProducts(products: Product[]) {
  const bySlug = new Map(products.map((product) => [product.slug, product]))
  return HOME_PRODUCT_SLUGS.flatMap((slug) => {
    const product = bySlug.get(slug)
    return product ? [product] : []
  })
}
