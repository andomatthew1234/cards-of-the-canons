import fs from 'node:fs/promises'
import path from 'node:path'

const dist = path.join(process.cwd(), 'dist')
const failures = []
const requireText = (text, needle, file) => { if (!text.includes(needle)) failures.push(`${file}: missing ${needle}`) }

for (const route of ['', 'shop', 'about', 'contact']) {
  const file = path.join(dist, route, 'index.html')
  const text = await fs.readFile(file, 'utf8')
  requireText(text, '<link rel="canonical"', file)
  requireText(text, 'property="og:title"', file)
  requireText(text, 'name="twitter:card"', file)
  requireText(text, 'name="robots" content="index,follow', file)
  if ((text.match(/<title>/g) || []).length !== 1) failures.push(`${file}: expected exactly one title`)
  if ((text.match(/name="description"/g) || []).length !== 1) failures.push(`${file}: expected exactly one description`)
}

const privateShell = await fs.readFile(path.join(dist, 'private.html'), 'utf8')
requireText(privateShell, 'noindex,nofollow,noarchive', 'private.html')
const notFound = await fs.readFile(path.join(dist, '404.html'), 'utf8')
requireText(notFound, 'noindex,nofollow,noarchive', '404.html')
const terms = await fs.readFile(path.join(dist, 'policies', 'terms', 'index.html'), 'utf8')
requireText(terms, 'Terms and Conditions', 'policies/terms/index.html')
requireText(terms, 'noindex,nofollow,noarchive', 'policies/terms/index.html')

const sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8')
for (const forbidden of ['/account', '/admin', '/cart', '/checkout']) if (sitemap.includes(forbidden)) failures.push(`sitemap.xml: private path ${forbidden} must not appear`)
if (sitemap.includes('/policies/terms')) failures.push('sitemap.xml: unpublished dynamic Terms page must not appear')
requireText(await fs.readFile(path.join(dist, 'robots.txt'), 'utf8'), 'Sitemap:', 'robots.txt')

// HTML/path safety over every generated document: no executable inline script,
// no scriptable URL scheme, no unescaped interpolation markers.
const htmlFiles = []
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(target)
    else if (entry.name.endsWith('.html')) htmlFiles.push(target)
  }
}
await walk(dist)

for (const file of htmlFiles) {
  const relative = path.relative(dist, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) failures.push(`${file}: HTML written outside dist`)
  const text = await fs.readFile(file, 'utf8')
  if (/(?:href|src|content)=["']?\s*(?:javascript|vbscript|data):/i.test(text)) failures.push(`${relative}: scriptable URL scheme in an attribute`)
  if (/\son[a-z]+\s*=\s*["']?javascript/i.test(text)) failures.push(`${relative}: inline javascript event handler`)
  const inlineScripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  for (const [, attributes, body] of inlineScripts) {
    const type = /type\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]?.toLowerCase() ?? ''
    const isData = type === 'application/ld+json'
    const hasSource = /\ssrc\s*=/i.test(attributes)
    if (!isData && !hasSource && body.trim()) failures.push(`${relative}: executable inline script block`)
    if (isData && body.includes('</script')) failures.push(`${relative}: structured data could close its script block`)
  }
  if (text.includes('${')) failures.push(`${relative}: unresolved interpolation marker`)
}

if (failures.length) {
  console.error(`SEO checks failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`SEO checks passed: canonical metadata, social metadata, index controls, sitemap, robots, 404 output and HTML/path safety across ${htmlFiles.length} documents are present.`)
