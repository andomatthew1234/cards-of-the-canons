import path from 'node:path'

/**
 * Pure helpers for the SEO generator.
 *
 * Everything here is deliberately offline and side-effect free so the
 * malicious-data parser tests in tests/seo-generate.test.mjs can exercise the
 * exact code the build uses without touching Firestore or the network.
 */

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const STRICT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const STRICT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Hosts a product/page image may be served from. Everything else is rejected. */
export const APPROVED_IMAGE_HOSTS = Object.freeze(['firebasestorage.googleapis.com'])

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Attribute- and text-safe escaping for every interpolation in generated HTML. */
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character])
}

/** JSON-LD payload escaping: `<` never appears literally inside a script block. */
export function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** XML escaping for sitemap entries. */
export function escapeXml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character])
}

/**
 * Keeps server-generated SEO copy available when JavaScript is disabled
 * without painting that copy for a moment before React mounts. The app root
 * deliberately stays empty; the same semantic content lives in `noscript`.
 */
export function renderSeoFallbackShell(template, fallbackBody) {
  const emptyRoot = template.replace(/<div id="root">[\s\S]*?<\/div>/i, '<div id="root"></div>')
  const fallback = `<noscript>${fallbackBody}</noscript>`
  if (/<noscript>[\s\S]*?<\/noscript>/i.test(emptyRoot)) {
    return emptyRoot.replace(/<noscript>[\s\S]*?<\/noscript>/i, fallback)
  }
  return emptyRoot.replace('</body>', `    ${fallback}\n  </body>`)
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

/** Slugs written to disk or used in a route must be strict, lowercase, hyphenated. */
export function isStrictSlug(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 100 && STRICT_SLUG.test(value)
}

export function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false
  if (CONTROL_CHARACTERS.test(value) || value.includes('\\')) return false
  if (!value.startsWith('/') || value.startsWith('//')) return false
  const [pathname] = value.split(/[?#]/)
  return pathname.split('/').every((segment) => segment === '' || (segment !== '.' && segment !== '..'))
}

export function parseAbsoluteHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null
  if (CONTROL_CHARACTERS.test(value) || /\s/.test(value)) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!APPROVED_IMAGE_HOSTS.includes(url.hostname)) return null
  return url
}

/**
 * URL allowlist/parser for every image reference that reaches generated HTML.
 * Only site-relative paths or approved https hosts are accepted; `javascript:`,
 * `data:`, protocol-relative, embedded-credential and whitespace-obfuscated
 * inputs all fail closed.
 */
export function isApprovedImageUrl(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed !== value) return false
  if (isSafeRelativePath(trimmed)) return true
  return parseAbsoluteHttpUrl(trimmed) !== null
}

/**
 * Builds an absolute https URL for a site-relative path, or null when the
 * input is not a safe site path. Scheme-bearing input is only accepted when it
 * is an approved https image host, so a hostile value can never become a
 * canonical/OG/JSON-LD URL.
 */
export function absoluteUrl(value, siteOrigin) {
  const candidate = typeof value === 'string' ? value.trim() : ''
  if (!candidate || !siteOrigin) return null
  if (isSafeRelativePath(candidate)) {
    const base = new URL(siteOrigin)
    return new URL(candidate, `${base.origin}/`).toString()
  }
  const absolute = parseAbsoluteHttpUrl(candidate)
  return absolute ? absolute.toString() : null
}

/**
 * Resolves a route to a directory inside `dist`. Any traversal, backslash,
 * control character or absolute escape returns null so callers can skip the
 * page instead of writing outside the artifact directory.
 */
export function resolveOutputPath(distRoot, route) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.includes('\0')) return null
  const segments = route.split('/').filter(Boolean)
  if (segments.length === 0) return distRoot
  if (!segments.every((segment) => STRICT_SEGMENT.test(segment) && segment !== '.' && segment !== '..')) return null
  const target = path.resolve(distRoot, ...segments)
  if (target !== distRoot && !target.startsWith(distRoot + path.sep)) return null
  return target
}

function isBoundedText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && !CONTROL_CHARACTERS.test(value)
}

/**
 * Validates one catalogue record before anything is written. Invalid records
 * are dropped with a reason rather than rendered, so hostile content never
 * reaches a route, an attribute or the sitemap.
 */
export function validateSeoProduct(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-an-object' }
  if (raw.status !== 'published') return { ok: false, reason: 'not-published' }
  if (!isStrictSlug(raw.slug)) return { ok: false, reason: 'slug-not-strict' }
  if (!isBoundedText(raw.name, 2, 120)) return { ok: false, reason: 'name-invalid' }
  if (!isBoundedText(raw.description, 2, 5000)) return { ok: false, reason: 'description-invalid' }
  if (raw.shortDescription !== undefined && !isBoundedText(raw.shortDescription, 0, 400)) return { ok: false, reason: 'short-description-invalid' }
  if (raw.imageAlt !== undefined && !isBoundedText(raw.imageAlt, 0, 200)) return { ok: false, reason: 'image-alt-invalid' }
  if (!isApprovedImageUrl(raw.imageUrl)) return { ok: false, reason: 'image-url-not-approved' }
  if (raw.category !== undefined && raw.category !== null) {
    if (!isBoundedText(raw.category, 2, 80)) return { ok: false, reason: 'category-invalid' }
    // Category text feeds a generated path segment, so traversal-looking
    // values are rejected outright rather than left for the slugifier.
    if (/[\\/]|\.\./.test(raw.category)) return { ok: false, reason: 'category-unsafe' }
  }
  const price = Number(raw.priceCents)
  if (!Number.isInteger(price) || price < 0 || price > 100_000_000) return { ok: false, reason: 'price-invalid' }
  if (raw.currency !== undefined && raw.currency !== 'AUD') return { ok: false, reason: 'currency-invalid' }
  if (raw.stock !== undefined && raw.stock !== null && raw.stock !== undefined) {
    const stock = Number(raw.stock)
    if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) return { ok: false, reason: 'stock-invalid' }
  }
  return { ok: true }
}

/**
 * Route collision gate: every page must own exactly one route, otherwise the
 * later write would silently overwrite an earlier page.
 */
export function createRouteRegistry() {
  const seen = new Map()
  return {
    claim(route) {
      if (seen.has(route)) return { accepted: false, owner: seen.get(route) }
      seen.set(route, true)
      return { accepted: true, owner: null }
    },
    routes() {
      return [...seen.keys()]
    },
  }
}
