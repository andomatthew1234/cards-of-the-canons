import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineBoolean, defineInt } from 'firebase-functions/params'
import { HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { analyticsEventNames, analyticsEventSchema } from './validation'
import { db } from './firebase'

/**
 * Analytics is opt-in and off until an operator turns it on. Nothing in the
 * client or the server records an event while this is false, so an
 * unconfigured deployment fails closed rather than silently collecting data.
 */
export const analyticsEnabledParam = defineBoolean('ANALYTICS_ENABLED', { default: false })

/**
 * Events are kept for a bounded, documented window and then removed by the
 * scheduled cleanup below. Values are clamped so a typo cannot store events
 * forever (or delete them immediately).
 */
export const analyticsRetentionDaysParam = defineInt('ANALYTICS_RETENTION_DAYS', { default: 400 })

export const minRetentionDays = 7
export const maxRetentionDays = 730

export function resolveRetentionDays(configured: number): number {
  if (!Number.isFinite(configured)) return 400
  return Math.min(maxRetentionDays, Math.max(minRetentionDays, Math.floor(configured)))
}

export function analyticsAccepts(enabled: boolean): boolean {
  return enabled === true
}

export function retentionCutoffMillis(nowMillis: number, configuredDays: number): number {
  return nowMillis - resolveRetentionDays(configuredDays) * 24 * 60 * 60 * 1000
}

const pathSegmentPattern = /\/{2,}/g

/**
 * Server-side path normalisation: query strings, fragments and backslashes are
 * removed before anything is stored, so an event can never smuggle a search
 * term, identifier or crafted string into the reporting path dimension.
 * Returns null when the value cannot be made into a plain site path.
 */
export function normalizeAnalyticsPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let path = value.trim().replace(/\\/g, '/').replace(/[?#].*$/, '')
  path = path.replace(pathSegmentPattern, '/')
  if (!path.startsWith('/')) path = `/${path}`
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(path)) return null
  if (path.length > 512) return null
  return path === '' ? '/' : path
}

/** Referrer hosts are lower-cased, de-ported and reduced to a bare hostname. */
export function normalizeReferrerHost(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const host = value.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return null
  return host.length <= 160 ? host : null
}

/**
 * A closed set of normalised route templates. Anything that does not match a
 * template (unknown routes, account/admin paths, or a path carrying a query
 * term, token or other identifier) is rejected before it can be stored, so the
 * reporting path dimension can never hold unexpected or PII-like data.
 */
export const allowedRouteTemplates: readonly string[] = [
  '/',
  '/shop',
  '/shop/category/{slug}',
  '/product/{slug}',
  '/cart',
  '/checkout/success',
  '/checkout/cancelled',
  '/about',
  '/contact',
  '/newsletter/confirm',
  '/newsletter/unsubscribe',
]

const slugSegment = '[A-Za-z0-9._~%-]{1,120}'
const templatePatterns = allowedRouteTemplates.map((template) => ({
  template,
  pattern: new RegExp(`^${template.replace('{slug}', slugSegment)}$`),
}))

/** True only when the normalised path matches a published route template. */
export function matchesAllowedRouteTemplate(path: string): boolean {
  return templatePatterns.some(({ pattern }) => pattern.test(path))
}

/**
 * Identifiers are reduced to a bounded, non-PII shape: no `@`, no percent
 * escapes, no spaces. Anything that looks like an address, token or free text
 * is refused rather than stored.
 */
export function normalizeAnalyticsItemId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed)) return null
  return trimmed
}

/** Product-scoped events may only reference a real, existing product document. */
const productIdRequiredEvents = new Set(['view_product', 'add_to_cart'])

function invalidAnalyticsEvent(): never {
  throw new HttpsError('invalid-argument', 'The analytics event is invalid.')
}

export interface AnalyticsIngestDeps {
  /** Server-side existence check against the products collection. */
  productExists: (productId: string) => Promise<boolean>
}

/**
 * Server-owned ingest guard. The client payload is never trusted: the path is
 * normalised and matched against the route-template allowlist, identifiers are
 * shape-checked, and product identifiers must resolve to a real product before
 * anything is written. Failures throw `invalid-argument`; nothing is stored.
 */
export async function prepareAnalyticsEvent(
  raw: Record<string, unknown>,
  deps: AnalyticsIngestDeps,
): Promise<Record<string, unknown>> {
  const eventName = raw.name
  if (typeof eventName !== 'string' || !analyticsEventNames.includes(eventName as (typeof analyticsEventNames)[number])) {
    invalidAnalyticsEvent()
  }

  const path = normalizeAnalyticsPath(raw.path)
  if (path === null || !matchesAllowedRouteTemplate(path)) invalidAnalyticsEvent()

  const normalised: Record<string, unknown> = { ...raw, path }

  if (raw.referrerHost !== undefined) {
    const host = normalizeReferrerHost(raw.referrerHost)
    if (host === null) delete normalised.referrerHost
    else normalised.referrerHost = host
  }

  if (raw.itemId !== undefined) {
    const itemId = normalizeAnalyticsItemId(raw.itemId)
    if (itemId === null) invalidAnalyticsEvent()
    if (productIdRequiredEvents.has(eventName) && !(await deps.productExists(itemId))) invalidAnalyticsEvent()
    normalised.itemId = itemId
  } else if (productIdRequiredEvents.has(eventName)) {
    invalidAnalyticsEvent()
  }

  const parsed = analyticsEventSchema.safeParse(normalised)
  if (!parsed.success) invalidAnalyticsEvent()
  return parsed.data as Record<string, unknown>
}


/**
 * Retention: analytics documents carry an `expiresAt` written at ingest, and
 * this scheduled, page-bounded sweep removes anything past it, so the event
 * log cannot grow without limit even if a document predates the field.
 */
export const removeExpiredAnalyticsEvents = onSchedule({
  region: 'australia-southeast1',
  schedule: 'every 24 hours',
  timeZone: 'Australia/Sydney',
}, async () => {
  const now = Timestamp.now()
  const cutoff = Timestamp.fromMillis(retentionCutoffMillis(Date.now(), analyticsRetentionDaysParam.value()))
  let removed = 0
  let cursor: QueryDocumentSnapshot | undefined
  for (let page = 0; page < 10; page += 1) {
    let reference = db.collection('analyticsEvents')
      .where('createdAt', '<=', cutoff)
      .orderBy('createdAt')
      .limit(200)
    if (cursor) reference = reference.startAfter(cursor)
    const expired = await reference.get()
    if (expired.empty) break
    const batch = db.batch()
    expired.docs.forEach((document) => batch.delete(document.ref))
    await batch.commit()
    removed += expired.size
    cursor = expired.docs[expired.docs.length - 1]
    if (expired.size < 200) break
  }
  // The newest document must never be older than the cutoff once swept.
  if (removed) logger.info('Removed expired analytics events.', { removed, cutoff: cutoff.toMillis(), now: now.toMillis() })
})
