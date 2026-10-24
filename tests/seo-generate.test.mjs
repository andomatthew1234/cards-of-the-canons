import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APPROVED_IMAGE_HOSTS,
  absoluteUrl,
  createRouteRegistry,
  escapeHtml,
  escapeJson,
  escapeXml,
  isApprovedImageUrl,
  isSafeRelativePath,
  isStrictSlug,
  parseAbsoluteHttpUrl,
  renderSeoFallbackShell,
  resolveOutputPath,
  slugify,
  validateSeoProduct,
} from '../scripts/seo-lib.mjs'

const siteOrigin = 'https://cards-of-canons-au-260930.web.app'
const distRoot = path.resolve('dist')

describe('pre-React SEO fallback', () => {
  it('keeps crawlable fallback copy out of the visible application root', () => {
    const template = '<body><div id="root"></div><noscript>old fallback</noscript></body>'
    const body = '<main><h1>Current page heading</h1></main>'
    const rendered = renderSeoFallbackShell(template, body)
    const rootMarkup = rendered.match(/<div id="root">([\s\S]*?)<\/div>/i)?.[1]

    expect(rootMarkup).toBe('')
    expect(rendered).toContain(`<noscript>${body}</noscript>`)
  })
})

function publishedProduct(overrides = {}) {
  return {
    id: 'demo-pack',
    slug: 'twelve-card-demo-pack',
    name: '12-Card Demo Pack',
    shortDescription: 'A short summary.',
    description: 'A complete description of the pack.',
    imageAlt: 'A card pack',
    imageUrl: '/images/twelve-card-demo-pack.svg',
    category: 'Card packs',
    priceCents: 2400,
    currency: 'AUD',
    stock: 3,
    status: 'published',
    ...overrides,
  }
}

describe('HTML and JSON escaping', () => {
  it('neutralises attribute breakout payloads', () => {
    const payload = '" onerror="alert(1)" data-x=\''
    const escaped = escapeHtml(payload)
    expect(escaped).not.toContain('"')
    expect(escaped).toContain('&quot;')
    expect(escaped).not.toContain("'")
  })

  it('neutralises tag and script payloads in text interpolations', () => {
    const escaped = escapeHtml('<script>alert(1)</script> & more')
    expect(escaped).not.toContain('<')
    expect(escaped).not.toContain('>')
    expect(escaped).toContain('&amp;')
  })

  it('keeps a hostile JSON-LD payload inside its own script block', () => {
    const encoded = escapeJson({ name: '</script><script>alert(1)</script>' })
    expect(encoded).not.toContain('<')
    expect(encoded).toContain('\\u003c/script>')
    expect(JSON.parse(encoded).name).toBe('</script><script>alert(1)</script>')
  })

  it('escapes XML sitemap entries', () => {
    expect(escapeXml('a&b<c>')).toBe('a&amp;b&lt;c&gt;')
  })
})

describe('URL allowlist and parser', () => {
  it('accepts site-relative paths and approved https image hosts', () => {
    expect(isApprovedImageUrl('/images/history/mount-athos.jpg')).toBe(true)
    expect(isApprovedImageUrl('https://firebasestorage.googleapis.com/v0/b/bucket/o/x.jpg?alt=media')).toBe(true)
    expect(APPROVED_IMAGE_HOSTS).toContain('firebasestorage.googleapis.com')
  })

  it('rejects scriptable, off-host, protocol-relative and obfuscated URLs', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'https://evil.example.com/image.jpg',
      'http://firebasestorage.googleapis.com/image.jpg',
      '//evil.example.com/image.jpg',
      '/images/../../etc/passwd',
      '/images\\..\\..\\windows',
      '  https://firebasestorage.googleapis.com/x.jpg',
      'https://firebasestorage.googleapis.com/x.jpg ',
      'https://user:pass@firebasestorage.googleapis.com/x.jpg',
      'https://firebasestorage.googleapis.com.evil.com/x.jpg',
      'java\nscript:alert(1)',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(isApprovedImageUrl(hostile), String(hostile)).toBe(false)
    }
  })

  it('parses only approved absolute https URLs', () => {
    expect(parseAbsoluteHttpUrl('https://firebasestorage.googleapis.com/a.jpg')).not.toBeNull()
    expect(parseAbsoluteHttpUrl('https://evil.example.com/a.jpg')).toBeNull()
    expect(parseAbsoluteHttpUrl('not a url')).toBeNull()
    expect(parseAbsoluteHttpUrl('https://firebasestorage.googleapis.com/a b.jpg')).toBeNull()
  })

  it('builds canonical URLs only from safe site paths', () => {
    expect(absoluteUrl('/shop', siteOrigin)).toBe(`${siteOrigin}/shop`)
    expect(absoluteUrl('/product/ok-slug', siteOrigin)).toBe(`${siteOrigin}/product/ok-slug`)
    expect(absoluteUrl('javascript:alert(1)', siteOrigin)).toBeNull()
    expect(absoluteUrl('/shop/../admin', siteOrigin)).toBeNull()
    expect(absoluteUrl('https://evil.example.com/x', siteOrigin)).toBeNull()
    expect(absoluteUrl('https://firebasestorage.googleapis.com/x.jpg', siteOrigin)).toBe('https://firebasestorage.googleapis.com/x.jpg')
    expect(absoluteUrl('', siteOrigin)).toBeNull()
    expect(absoluteUrl('/shop', '')).toBeNull()
  })

  it('classifies safe relative paths', () => {
    expect(isSafeRelativePath('/shop/category/ok')).toBe(true)
    expect(isSafeRelativePath('/')).toBe(true)
    expect(isSafeRelativePath('//evil.example.com')).toBe(false)
    expect(isSafeRelativePath('/shop/./x')).toBe(false)
    expect(isSafeRelativePath('shop')).toBe(false)
    expect(isSafeRelativePath('/shop\u0000')).toBe(false)
  })
})

describe('strict slugs and path containment', () => {
  it('accepts only lowercase hyphenated slugs', () => {
    expect(isStrictSlug('twelve-card-demo-pack')).toBe(true)
    expect(isStrictSlug('a')).toBe(false)
    expect(isStrictSlug('../etc/passwd')).toBe(false)
    expect(isStrictSlug('UPPER')).toBe(false)
    expect(isStrictSlug('has space')).toBe(false)
    expect(isStrictSlug('has%20space')).toBe(false)
    expect(isStrictSlug('a'.repeat(101))).toBe(false)
    expect(isStrictSlug('..')).toBe(false)
  })

  it('slugifies hostile category names into strict slugs', () => {
    expect(slugify('../etc/passwd')).toBe('etc-passwd')
    expect(slugify('"><img src=x onerror=alert(1)>')).toBe('img-src-x-onerror-alert-1')
    expect(isStrictSlug(slugify('Study Sets & Guides'))).toBe(true)
    expect(isStrictSlug(slugify('../../secret'))).toBe(true)
  })

  it('refuses to resolve a route outside the artifact directory', () => {
    expect(resolveOutputPath(distRoot, '/product/twelve-card-demo-pack')).toBe(path.join(distRoot, 'product', 'twelve-card-demo-pack'))
    expect(resolveOutputPath(distRoot, '/')).toBe(distRoot)
    expect(resolveOutputPath(distRoot, '/../secrets')).toBeNull()
    expect(resolveOutputPath(distRoot, '/product/../../secrets')).toBeNull()
    expect(resolveOutputPath(distRoot, '/product\\..\\secrets')).toBeNull()
    expect(resolveOutputPath(distRoot, '/product/\u0000')).toBeNull()
    expect(resolveOutputPath(distRoot, '/product/.')).toBeNull()
    expect(resolveOutputPath(distRoot, '/')).not.toBeNull()
    expect(resolveOutputPath(distRoot, 'relative/path')).toBeNull()
    expect(resolveOutputPath(distRoot, '')).toBeNull()
  })

  it('reports route collisions instead of overwriting', () => {
    const registry = createRouteRegistry()
    expect(registry.claim('/product/ok').accepted).toBe(true)
    expect(registry.claim('/product/ok').accepted).toBe(false)
    expect(registry.claim('/shop').accepted).toBe(true)
    expect(registry.routes()).toEqual(['/product/ok', '/shop'])
  })
})

describe('catalogue prevalidation before writes', () => {
  it('accepts a well-formed published product', () => {
    expect(validateSeoProduct(publishedProduct())).toEqual({ ok: true })
  })

  it('rejects hostile or malformed catalogue records', () => {
    const cases = [
      ['slug traversal', () => publishedProduct({ slug: '../../admin' })],
      ['slug uppercase', () => publishedProduct({ slug: 'Twelve Card Pack' })],
      ['scriptable image', () => publishedProduct({ imageUrl: 'javascript:alert(1)' })],
      ['off-host image', () => publishedProduct({ imageUrl: 'https://evil.example.com/x.jpg' })],
      ['protocol-relative image', () => publishedProduct({ imageUrl: '//evil.example.com/x.jpg' })],
      ['name with newline', () => publishedProduct({ name: 'Pack\nName' })],
      ['oversized description', () => publishedProduct({ description: 'x'.repeat(5001) })],
      ['non-integer price', () => publishedProduct({ priceCents: 12.5 })],
      ['negative price', () => publishedProduct({ priceCents: -1 })],
      ['wrong currency', () => publishedProduct({ currency: 'USD' })],
      ['draft status', () => publishedProduct({ status: 'draft' })],
      ['missing image', () => publishedProduct({ imageUrl: undefined })],
      ['category traversal', () => publishedProduct({ category: '../../etc' })],
      ['stock out of range', () => publishedProduct({ stock: -1 })],
      ['missing image alt with control character', () => publishedProduct({ imageAlt: 'alt\u0007bell' })],
      ['null record', () => null],
      ['string record', () => 'product'],
      ['undefined record', () => undefined],
    ]
    for (const [label, build] of cases) {
      const verdict = validateSeoProduct(build())
      expect(verdict.ok, label).toBe(false)
      expect(verdict.reason, label).toBeTruthy()
    }
  })

  it('keeps quotes in copy renderable only through the escaper', () => {
    const hostile = publishedProduct({ name: 'The "Best" <Pack>' })
    expect(validateSeoProduct(hostile).ok).toBe(true)
    const rendered = `<h1>${escapeHtml(hostile.name)}</h1>`
    expect(rendered).not.toContain('<Pack>')
    expect(rendered).toContain('&quot;')
  })
})
