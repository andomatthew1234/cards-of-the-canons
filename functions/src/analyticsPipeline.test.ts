import { describe, expect, it } from 'vitest'
import {
  matchesAllowedRouteTemplate,
  normalizeAnalyticsItemId,
  normalizeAnalyticsPath,
  normalizeReferrerHost,
  prepareAnalyticsEvent,
  resolveRetentionDays,
  retentionCutoffMillis,
} from './analyticsPipeline'

const baseEvent = {
  name: 'page_view',
  path: '/shop',
  sessionId: 'a'.repeat(32),
  device: 'desktop' as const,
}

const deps = {
  productExists: async (id: string) => id === 'demo-councils-pack',
}

describe('analytics route template allowlist', () => {
  it('accepts only published route templates', () => {
    expect(matchesAllowedRouteTemplate('/')).toBe(true)
    expect(matchesAllowedRouteTemplate('/shop/category/reformers')).toBe(true)
    expect(matchesAllowedRouteTemplate('/product/demo-reformers-set')).toBe(true)
    expect(matchesAllowedRouteTemplate('/checkout/success')).toBe(true)

    // Unknown routes and private/PII-carrying paths are never allowlisted.
    expect(matchesAllowedRouteTemplate('/account/security')).toBe(false)
    expect(matchesAllowedRouteTemplate('/admin/products')).toBe(false)
    expect(matchesAllowedRouteTemplate('/reset-password?token=abc')).toBe(false)
    expect(matchesAllowedRouteTemplate('/shop/../etc/passwd')).toBe(false)
    expect(matchesAllowedRouteTemplate('/someone@example.com')).toBe(false)
  })

  it('normalises paths before matching', () => {
    expect(normalizeAnalyticsPath('shop//category//reformers?utm=x')).toBe('/shop/category/reformers')
    expect(normalizeAnalyticsPath('  /about#team  ')).toBe('/about')
    expect(normalizeAnalyticsPath(' /account/orders?email=a@b.com ')).toBe('/account/orders')
    // A scriptable scheme survives character filtering but is never allowlisted.
    expect(matchesAllowedRouteTemplate(normalizeAnalyticsPath('javascript:alert(1)') ?? '')).toBe(false)
  })

  it('normalises referrers to bare hosts and refuses junk', () => {
    expect(normalizeReferrerHost('News.Example.ORG:443')).toBe('news.example.org')
    expect(normalizeReferrerHost('not a host')).toBeNull()
  })
})

describe('analytics identifier allowlisting', () => {
  it('accepts bounded identifiers and refuses PII-like values', () => {
    expect(normalizeAnalyticsItemId('demo-councils-pack')).toBe('demo-councils-pack')
    expect(normalizeAnalyticsItemId('reformers')).toBe('reformers')
    expect(normalizeAnalyticsItemId('user@example.com')).toBeNull()
    expect(normalizeAnalyticsItemId('a'.repeat(65))).toBeNull()
    expect(normalizeAnalyticsItemId('../../etc/passwd')).toBeNull()
    expect(normalizeAnalyticsItemId('token abc')).toBeNull()
  })
})

describe('server-side analytics ingest guard', () => {
  it('stores a normalised event for a published route', async () => {
    const stored = await prepareAnalyticsEvent({ ...baseEvent, referrerHost: 'News.Example.org' }, deps)
    expect(stored.path).toBe('/shop')
    expect(stored.referrerHost).toBe('news.example.org')
    expect(stored.sessionId).toBe('a'.repeat(32))
  })

  it('rejects unknown routes instead of storing them', async () => {
    await expect(prepareAnalyticsEvent({ ...baseEvent, path: '/account/orders?email=a@b.com' }, deps))
      .rejects.toThrow(/invalid/i)
    await expect(prepareAnalyticsEvent({ ...baseEvent, path: '/unpublished-route' }, deps))
      .rejects.toThrow(/invalid/i)
  })

  it('requires product events to reference a real product ID', async () => {
    const accepted = await prepareAnalyticsEvent(
      { ...baseEvent, name: 'view_product', path: '/product/demo-councils-pack', itemId: 'demo-councils-pack' },
      deps,
    )
    expect(accepted.itemId).toBe('demo-councils-pack')

    // Unknown product IDs are rejected at the backend, not merely truncated.
    await expect(prepareAnalyticsEvent(
      { ...baseEvent, name: 'view_product', path: '/product/ghost', itemId: 'ghost-product' },
      deps,
    )).rejects.toThrow(/invalid/i)

    // PII-shaped identifiers are rejected even before the existence check.
    await expect(prepareAnalyticsEvent(
      { ...baseEvent, name: 'add_to_cart', path: '/shop', itemId: 'someone@example.com', quantity: 1 },
      deps,
    )).rejects.toThrow(/invalid/i)
  })

  it('drops invalid referrers rather than failing the event', async () => {
    const stored = await prepareAnalyticsEvent({ ...baseEvent, referrerHost: 'https://exa mple.com' }, deps)
    expect(stored.referrerHost).toBeUndefined()
  })

  it('keeps retention inside documented bounds', () => {
    expect(resolveRetentionDays(Number.NaN)).toBe(400)
    expect(resolveRetentionDays(1)).toBe(7)
    expect(resolveRetentionDays(9999)).toBe(730)
    expect(retentionCutoffMillis(0, 10)).toBe(-10 * 24 * 60 * 60 * 1000)
  })
})
