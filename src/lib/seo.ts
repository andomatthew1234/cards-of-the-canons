import type { Product } from '../types'
import { BRAND_NAME } from './brand'

export const SITE_NAME = BRAND_NAME
export const DEFAULT_SOCIAL_IMAGE = '/images/history/mount-athos-simonopetra.jpg'

const configuredOrigin = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim().replace(/\/$/, '')

export function getSiteOrigin() {
  if (configuredOrigin) return configuredOrigin
  if (import.meta.env.PROD) return 'https://doxatreasury.com'
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://doxatreasury.com'
}

export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path
  const normalised = path.startsWith('/') ? path : `/${path}`
  return new URL(normalised, `${getSiteOrigin()}/`).toString()
}

export function categorySlug(category: string) {
  return category.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function isPrivateOrUtilityPath(pathname: string) {
  return ['/account', '/admin', '/cart', '/checkout'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function productsMayBeIndexed() {
  return import.meta.env.VITE_INDEX_PRODUCTS === 'true'
}

export type JsonLd = Record<string, unknown>

export function websiteJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${absoluteUrl('/')}#website`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    publisher: { '@id': `${absoluteUrl('/')}#organization` },
  }
}

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${absoluteUrl('/')}#organization`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  }
}

export function productJsonLd(product: Product): JsonLd | null {
  if (!productsMayBeIndexed()) return null
  const availability = product.stock === null
    ? undefined
    : product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${absoluteUrl(`/product/${product.slug}`)}#product`,
    name: product.name,
    description: product.description,
    image: [absoluteUrl(product.imageUrl)],
    sku: product.id,
    category: product.category,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: product.currency,
      price: (product.priceCents / 100).toFixed(2),
      ...(availability ? { availability } : {}),
    },
  }
}
