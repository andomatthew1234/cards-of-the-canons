import type { Product } from '../types'

export const LEGACY_PRODUCT_SORT_ORDER = 1000

export type ProductStorefrontSection = 'card-packs' | 'accessories'

export function normaliseProductCategory(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

/**
 * Maps administrator-managed category names into the two customer-facing Shop
 * rails. Category is authoritative for known names; the product identity and
 * redeemable-card count keep legacy/custom catalogue entries useful.
 */
export function productStorefrontSection(product: Product): ProductStorefrontSection {
  const category = normaliseProductCategory(product.category).toLowerCase()
  const identity = `${product.name} ${product.slug}`
  if (/\b(?:collector(?:'s)?|collecting)[\s-]*(?:card[\s-]*)?binder\b/i.test(identity)) return 'card-packs'
  if (/\b(?:accessor(?:y|ies)|apparel|bookmarks?|merchandise)\b/i.test(category)) return 'accessories'
  if (/\b(?:cards?|collectibles?|packs?|bundles?|boxes?)\b/i.test(category)) return 'card-packs'
  return Number.isSafeInteger(product.treasuryCardsPerUnit) && Number(product.treasuryCardsPerUnit) > 0
    ? 'card-packs'
    : 'accessories'
}

export function productSortOrder(product: Pick<Product, 'sortOrder'>): number {
  return Number.isSafeInteger(product.sortOrder) && Number(product.sortOrder) >= 0
    ? Number(product.sortOrder)
    : LEGACY_PRODUCT_SORT_ORDER
}

export function compareProductDisplayOrder(left: Product, right: Product): number {
  return productSortOrder(left) - productSortOrder(right)
    || left.name.localeCompare(right.name, 'en-AU', { sensitivity: 'base' })
    || left.id.localeCompare(right.id)
}

export function orderProductsForDisplay(products: Product[]): Product[] {
  return [...products].sort(compareProductDisplayOrder)
}
