import fs from 'node:fs/promises'
import path from 'node:path'
import { initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore, limit, orderBy, query, where } from 'firebase/firestore/lite'
import {
  absoluteUrl,
  createRouteRegistry,
  escapeHtml,
  escapeJson,
  escapeXml,
  isStrictSlug,
  renderSeoFallbackShell,
  resolveOutputPath,
  slugify,
  validateSeoProduct,
} from './seo-lib.mjs'

const root = process.cwd()

async function readEnvironment() {
  const values = { ...process.env }
  for (const name of ['.env', '.env.local']) {
    try {
      const text = await fs.readFile(path.join(root, name), 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
        if (!match || values[match[1]] !== undefined) continue
        values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
      }
    } catch { /* Optional environment file. */ }
  }
  return values
}

const env = await readEnvironment()

// The configured origin is validated before it is used to build any URL, so a
// malformed or non-http environment value cannot leak into canonical, Open
// Graph or JSON-LD output.
function resolveSiteOrigin(raw) {
  try {
    const parsed = new URL(raw || 'https://doxatreasury.com')
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null
  } catch {
    return null
  }
}
const siteOrigin = resolveSiteOrigin(env.VITE_PUBLIC_SITE_URL)
if (!siteOrigin) throw new Error('VITE_PUBLIC_SITE_URL must be an absolute http(s) origin.')
const indexProducts = env.VITE_INDEX_PRODUCTS === 'true'
const template = await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8')
const isoDate = new Date().toISOString().slice(0, 10)
const replaceLegacyBrand = (value) => typeof value === 'string' ? value.replace(/Cards of the Canons/gi, 'Doxa') : value

// Only safe site-relative paths (or approved https image hosts) become URLs.
const absolute = (value = '/') => absoluteUrl(value, siteOrigin)
function jsonLdBreadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items
      .map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absolute(item.path) }))
      .filter((entry) => typeof entry.item === 'string'),
  }
}

function renderPage({ route, title, description, body, image = '/images/history/mount-athos-simonopetra.jpg', type = 'website', noindex = false, jsonLd = [], sensitive = false }) {
  const fullTitle = title === 'Doxa' ? title : `${title} — Doxa`
  const canonical = absolute(route)
  const socialImage = absolute(image)
  const robots = noindex ? 'noindex,nofollow,noarchive' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<script[^>]+data-page-json-ld[^>]*>[\s\S]*?<\/script>\s*/gi, '')
  // Every value interpolated into an attribute goes through escapeHtml, URL
  // values additionally pass the allowlist parser first. No raw database value
  // is ever written into markup unescaped.
  const tags = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${robots}">`,
    ...(!sensitive && canonical ? [
      `<link rel="canonical" href="${escapeHtml(canonical)}">`,
      '<meta property="og:site_name" content="Doxa">',
      `<meta property="og:title" content="${escapeHtml(fullTitle)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      `<meta property="og:type" content="${escapeHtml(type)}">`,
      `<meta property="og:url" content="${escapeHtml(canonical)}">`,
      ...(socialImage ? [`<meta property="og:image" content="${escapeHtml(socialImage)}">`] : []),
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${escapeHtml(fullTitle)}">`,
      `<meta name="twitter:description" content="${escapeHtml(description)}">`,
      ...(socialImage ? [`<meta name="twitter:image" content="${escapeHtml(socialImage)}">`] : []),
      ...jsonLd.filter(Boolean).map((entry) => `<script type="application/ld+json" data-page-json-ld>${escapeJson(entry)}</script>`),
    ] : []),
  ].join('\n    ')
  html = html.replace('</head>', `    ${tags}\n  </head>`)
  return renderSeoFallbackShell(html, body)
}

const distRoot = path.join(root, 'dist')

async function writeRoute(route, html) {
  // Path containment: the resolved directory must stay inside dist, so a
  // hostile slug can never write outside the artifact directory.
  const directory = resolveOutputPath(distRoot, route)
  if (!directory) {
    console.warn(`SEO generator skipped an unsafe route: ${JSON.stringify(String(route).slice(0, 120))}`)
    return false
  }
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'index.html'), html)
  return true
}

const nav = '<nav aria-label="Primary"><a href="/">Home</a> · <a href="/shop">Shop</a> · <a href="/about">About</a> · <a href="/journal">Journal</a> · <a href="/contact">Contact</a></nav>'
const routes = [
  { route: '/', title: 'Collectible stories from church history', description: 'Explore the Doxa collection, inspired by people, places and turning points in Christian history.', body: `<main>${nav}<h1>Collectible stories from church history</h1><p>Doxa brings remarkable people, defining moments and enduring ideas from church history into an inviting collectible format.</p><p><a href="/shop">Explore the collection</a></p></main>`, jsonLd: [{ '@context': 'https://schema.org', '@type': 'Organization', '@id': `${absolute('/')}#organization`, name: 'Doxa', url: absolute('/') }, { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${absolute('/')}#website`, name: 'Doxa', url: absolute('/'), publisher: { '@id': `${absolute('/')}#organization` } }] },
  { route: '/shop', title: 'Church-history collectible cards', description: 'Explore the Doxa collection: thoughtfully presented collectible cards inspired by Christian and church history.', body: `<main>${nav}<h1>Browse the archive</h1><p>Discover collectible stories inspired by remarkable people, places and turning points from church history.</p><div data-static-products></div></main>` },
  { route: '/about', title: 'About Doxa', description: 'Discover the purpose behind Doxa and its thoughtful approach to Christian and church-history collectibles.', body: `<main>${nav}<h1>Church history, made to collect and explore</h1><h2>History you can hold</h2><p>Doxa brings stories from Christian and church history into an approachable, tactile format.</p><p><a href="/shop">Browse the collection</a></p></main>` },
  { route: '/contact', title: 'Contact and quote requests', description: 'Send a general enquiry or quote request to the Doxa team.', body: `<main>${nav}<h1>Start a conversation</h1><p>Ask about the collection or submit a quote request through the secure contact form.</p></main>` },
  { route: '/policies/terms', title: 'Terms and Conditions', description: 'Read the current Terms and Conditions for using Doxa, creating an account and placing an order.', noindex: true, body: `<main>${nav}<h1>Terms and Conditions</h1><p>The published policy is loading securely.</p></main>` },
  { route: '/journal', title: 'The Doxa Journal', description: 'Progress updates and stories from behind the Doxa Treasury collection.', body: `<main>${nav}<h1>Stories behind the Treasury</h1><p>Progress updates, collection notes and deeper stories from the history of the Church.</p><article><h2><a href="/journal/building-the-doxa-treasury">Building the Doxa Treasury</a></h2><p>A first look at the ideas shaping Doxa.</p></article><article><h2><a href="/journal/why-history-belongs-in-your-hands">Why history belongs in your hands</a></h2><p>The thinking behind a tactile collection.</p></article></main>` },
  { route: '/journal/building-the-doxa-treasury', title: 'Building the Doxa Treasury', description: 'A first look at the ideas shaping Doxa: beautiful objects, carefully told stories and a collection designed to be revisited.', body: `<main>${nav}<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/journal">Journal</a> / Building the Doxa Treasury</nav><article><h1>Building the Doxa Treasury</h1><p>Doxa began with a simple hope: to make the beauty and history of the Church easier to encounter, hold and share.</p></article></main>` },
  { route: '/journal/why-history-belongs-in-your-hands', title: 'Why history belongs in your hands', description: 'The thinking behind a tactile collection—and why a physical object can make a story feel newly present.', body: `<main>${nav}<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/journal">Journal</a> / Why history belongs in your hands</nav><article><h1>Why history belongs in your hands</h1><p>A thoughtfully made card creates a different kind of encounter: an image to study, a story to remember and an object that can be shared.</p></article></main>` },
]

let products = []
let journalArticles = []
if (env.VITE_DATA_MODE === 'firebase' && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY) {
  try {
    const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID })
    const snapshot = await getDocs(query(collection(getFirestore(app), 'products'), where('status', '==', 'published'), orderBy('name'), limit(100)))
    // Prevalidate everything before a single byte is written: strict slugs,
    // bounded copy and approved image hosts only.
    products = snapshot.docs.map((document) => {
      const product = { id: document.id, ...document.data() }
      return {
        ...product,
        name: replaceLegacyBrand(product.name),
        shortDescription: replaceLegacyBrand(product.shortDescription),
        description: replaceLegacyBrand(product.description),
        imageAlt: replaceLegacyBrand(product.imageAlt),
      }
    }).filter((product) => {
      const verdict = validateSeoProduct(product)
      if (!verdict.ok) {
        console.warn(`SEO generator excluded product ${String(product?.id ?? 'unknown').slice(0, 60)}: ${verdict.reason}.`)
        return false
      }
      return true
    })
    const articleSnapshot = await getDocs(query(collection(getFirestore(app), 'articles'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(100)))
    journalArticles = articleSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })).filter((article) => {
      const safe = isStrictSlug(article.slug) && typeof article.title === 'string' && article.title.length >= 2 && article.title.length <= 180 && typeof article.excerpt === 'string' && article.excerpt.length <= 500 && typeof article.bodyMarkdown === 'string' && article.bodyMarkdown.length <= 100_000
      if (!safe) console.warn(`SEO generator excluded Journal article ${String(article?.id ?? 'unknown').slice(0, 60)}: invalid public metadata.`)
      return safe
    })
  } catch (error) {
    console.warn(`SEO generator could not load the published catalogue: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

const productLinks = products.map((product) => `<article><h2><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a></h2><p>${escapeHtml(product.shortDescription || product.description)}</p></article>`).join('')
routes[1].body = routes[1].body.replace('<div data-static-products></div>', `<section aria-label="Published products">${productLinks || '<p>The first collection is being prepared.</p>'}</section>`)
if (journalArticles.length) {
  const journalPage = routes.find((page) => page.route === '/journal')
  if (journalPage) journalPage.body = `<main>${nav}<h1>Stories behind the Treasury</h1><p>Progress updates, collection notes and deeper stories from the history of the Church.</p>${journalArticles.map((article) => `<article><h2><a href="/journal/${escapeHtml(article.slug)}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.excerpt)}</p></article>`).join('')}</main>`
}

// One owner per route: a later page can never silently overwrite an earlier
// one, and every collision is reported instead of hidden.
const registry = createRouteRegistry()
const writtenRoutes = []
async function writeClaimed(route, html) {
  const claim = registry.claim(route)
  if (!claim.accepted) {
    console.warn(`SEO generator skipped a colliding route: ${route}`)
    return false
  }
  const written = await writeRoute(route, html)
  if (written) writtenRoutes.push(route)
  return written
}

for (const page of routes) await writeClaimed(page.route, renderPage(page))
const staticRoutes = routes.filter((page) => !page.noindex).map((page) => page.route)

const journalRoutes = []
for (const article of journalArticles) {
  const route = `/journal/${article.slug}`
  const published = typeof article.publishedAt?.toDate === 'function' ? article.publishedAt.toDate().toISOString() : undefined
  const modified = typeof article.updatedAt?.toDate === 'function' ? article.updatedAt.toDate().toISOString() : published
  const schema = { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.excerpt, image: absolute(article.coverImageUrl || '/images/history/mount-athos-simonopetra.jpg'), ...(published ? { datePublished: published } : {}), ...(modified ? { dateModified: modified } : {}), author: { '@type': 'Organization', name: article.authorName || 'Doxa Treasury' }, mainEntityOfPage: absolute(route) }
  const written = await writeClaimed(route, renderPage({ route, title: article.seoTitle || article.title, description: article.seoDescription || article.excerpt, image: article.coverImageUrl, type: 'article', body: `<main>${nav}<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/journal">Journal</a> / ${escapeHtml(article.title)}</nav><article><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.excerpt)}</p></article></main>`, jsonLd: [jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Journal', path: '/journal' }, { name: article.title, path: route }]), schema] }))
  if (written) journalRoutes.push(route)
}

const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]
const categoryRoutes = []
for (const category of categories) {
  const slug = slugify(category)
  if (!isStrictSlug(slug)) {
    console.warn(`SEO generator excluded category ${JSON.stringify(String(category).slice(0, 60))}: slug not strict.`)
    continue
  }
  const route = `/shop/category/${slug}`
  const categoryProducts = products.filter((product) => product.category === category)
  const written = await writeClaimed(route, renderPage({
    route, title: `${category} collection`, noindex: !indexProducts,
    description: `Browse ${category.toLowerCase()} from Doxa.`,
    body: `<main>${nav}<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/shop">Shop</a> / ${escapeHtml(category)}</nav><h1>${escapeHtml(category)}</h1>${categoryProducts.map((product) => `<article><h2><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a></h2><p>${escapeHtml(product.shortDescription || '')}</p></article>`).join('')}</main>`,
    jsonLd: indexProducts ? [jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: category, path: route }])] : [],
  }))
  if (written) categoryRoutes.push(route)
}

const productRoutes = []
for (const product of products) {
  const route = `/product/${product.slug}`
  const categorySlug = slugify(product.category || 'collection')
  const categoryPath = isStrictSlug(categorySlug) ? `/shop/category/${categorySlug}` : '/shop'
  const imageUrl = absolute(product.imageUrl)
  const availability = product.stock === null || product.stock === undefined ? undefined : product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
  const productSchema = indexProducts ? { '@context': 'https://schema.org', '@type': 'Product', '@id': `${absolute(route)}#product`, name: product.name, description: product.description, image: imageUrl ? [imageUrl] : [], sku: product.id, category: product.category, brand: { '@type': 'Brand', name: 'Doxa' }, offers: { '@type': 'Offer', url: absolute(route), priceCurrency: product.currency ?? 'AUD', price: (Number(product.priceCents) / 100).toFixed(2), ...(availability ? { availability } : {}) } } : null
  const written = await writeClaimed(route, renderPage({
    route, title: product.name, description: product.shortDescription || product.description, image: product.imageUrl, type: 'product', noindex: !indexProducts,
    body: `<main>${nav}<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/shop">Shop</a> / <a href="${escapeHtml(categoryPath)}">${escapeHtml(product.category || 'Collection')}</a> / ${escapeHtml(product.name)}</nav><article><h1>${escapeHtml(product.name)}</h1>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.imageAlt || product.name)}" width="800" height="920">` : ''}<p>${escapeHtml(product.description)}</p></article></main>`,
    jsonLd: indexProducts ? [jsonLdBreadcrumb([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: product.category || 'Collection', path: categoryPath }, { name: product.name, path: route }]), productSchema] : [],
  }))
  if (written) productRoutes.push(route)
}

const sitemapRoutes = staticRoutes.concat(journalRoutes, indexProducts ? categoryRoutes : [], indexProducts ? productRoutes : [])
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>${escapeXml(absolute(route))}</loc></url>`).join('\n')}\n</urlset>\n`
await fs.writeFile(path.join(root, 'dist', 'sitemap.xml'), sitemap)
await fs.writeFile(path.join(root, 'dist', 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${absolute('/sitemap.xml')}\n`)
await fs.writeFile(path.join(root, 'dist', '404.html'), renderPage({ route: '/404', title: 'Page not found', description: 'The requested page could not be found.', noindex: true, body: `<main>${nav}<p>404</p><h1>This page has slipped from the archive.</h1><p><a href="/">Return home</a> or <a href="/shop">browse the collection</a>.</p></main>` }))
await fs.writeFile(path.join(root, 'dist', 'private.html'), renderPage({ route: '/account', title: 'Private account area', description: 'Secure Doxa customer and administration area.', noindex: true, sensitive: true, body: '<main><h1>Secure account area</h1><p>Loading the protected account experience…</p></main>' }))

console.log(`SEO output generated for ${staticRoutes.length} public pages, ${journalRoutes.length} managed Journal entries, ${categoryRoutes.length} categories and ${productRoutes.length} published products (${indexProducts ? 'product indexing enabled' : 'preview products noindexed'}; ${isoDate}).`)
