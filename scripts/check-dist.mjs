import fs from 'node:fs/promises'
import path from 'node:path'

// Deployment artifact validation for the hosting bundle (`dist/`) and the
// compiled Functions output (`functions/lib/`). Runs as part of `npm run build`
// so an artifact with secrets, environment files, stray sources or unsafe HTML
// never reaches a deploy. No network access, no deployment: this only inspects
// local files and exits non-zero on any finding.

const root = process.cwd()
const dist = path.join(root, 'dist')
const functionsLib = path.join(root, 'functions', 'lib')
const failures = []

const allowedExtensions = new Set(['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.ico', '.txt', '.xml', '.json', '.md'])
const textExtensions = new Set(['.html', '.js', '.css', '.svg', '.txt', '.xml', '.json', '.md'])
const secretPatterns = [
  [/sk_live_[0-9a-zA-Z]{8,}/, 'Stripe live secret key'],
  [/sk_test_[0-9a-zA-Z]{16,}/, 'Stripe test secret key'],
  [/whsec_[0-9a-zA-Z]{8,}/, 'Stripe webhook signing secret'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key material'],
  [/ghp_[0-9A-Za-z]{20,}/, 'GitHub access token'],
  [/xox[baprs]-[0-9A-Za-z-]{10,}/, 'Slack token'],
]
// Emulator endpoints must never ship: a production artifact talks to the real
// project or to nothing.
const emulatorPatterns = [
  [/127\.0\.0\.1:9099|localhost:9099/, 'Auth emulator endpoint'],
  [/127\.0\.0\.1:8080|localhost:8080/, 'Firestore emulator endpoint'],
  [/127\.0\.0\.1:9199|localhost:9199/, 'Storage emulator endpoint'],
  [/127\.0\.0\.1:5001|localhost:5001/, 'Functions emulator endpoint'],
  [/127\.0\.0\.1:4000|localhost:4000/, 'Emulator UI endpoint'],
]
const environmentFilePattern = /(^|\/)\.env($|\.|\/)|\.local$|\.log$/

async function walk(directory) {
  const entries = []
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) entries.push(...await walk(target))
      else entries.push(target)
    }
  } catch (error) {
    failures.push(`${path.relative(root, directory)}: unreadable (${error.code ?? 'error'})`)
  }
  return entries
}

function scanText(relative, text, extra = []) {
  for (const [pattern, label] of [...secretPatterns, ...emulatorPatterns, ...extra]) {
    // Placeholder values such as `whsec_placeholder` in validation code or docs
    // are not credentials; anything else that matches is a finding.
    let match
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    while ((match = regex.exec(text)) !== null) {
      if (/(placeholder|example|your[-_]|xxxx)/i.test(match[0])) continue
      failures.push(`${relative}: contains ${label}`)
      break
    }
  }
}

// --- Hosting bundle -------------------------------------------------------
const distFiles = await walk(dist)
if (!distFiles.length) failures.push('dist: empty or missing — run the build first')

for (const file of distFiles) {
  const relative = path.relative(dist, file).split(path.sep).join('/')
  const segments = relative.split('/')
  if (segments.some((segment) => segment.startsWith('.'))) failures.push(`${relative}: dotfile in the deploy bundle`)
  if (environmentFilePattern.test(relative)) failures.push(`${relative}: environment or log file in the deploy bundle`)
  const extension = path.extname(file).toLowerCase()
  if (!allowedExtensions.has(extension)) failures.push(`${relative}: unexpected file type for deployment`)

  if (!textExtensions.has(extension)) continue
  const text = await fs.readFile(file, 'utf8')
  scanText(relative, text)
  if (extension !== '.html') continue

  // HTML/path safety: no executable inline script, no scriptable URL scheme,
  // no unresolved build interpolation.
  if (/(?:href|src|content)=["']?\s*(?:javascript|vbscript):/i.test(text)) failures.push(`${relative}: scriptable URL scheme`)
  for (const [, attributes, body] of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = /type\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1]?.toLowerCase() ?? ''
    const hasSource = /\ssrc\s*=/i.test(attributes)
    if (type !== 'application/ld+json' && !hasSource && body.trim()) failures.push(`${relative}: executable inline script block`)
    if (type === 'application/ld+json' && body.includes('</script')) failures.push(`${relative}: structured data could close its script block`)
  }
  if (text.includes('${')) failures.push(`${relative}: unresolved interpolation marker`)
}

// Private shells must never be indexable.
for (const shell of ['private.html', '404.html']) {
  const file = path.join(dist, shell)
  try {
    const text = await fs.readFile(file, 'utf8')
    if (!text.includes('noindex,nofollow,noarchive')) failures.push(`${shell}: missing noindex directives`)
  } catch {
    failures.push(`${shell}: missing from the deploy bundle`)
  }
}

// Every module script referenced by the entry document must exist on disk.
try {
  const indexHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
  for (const [, src] of indexHtml.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    if (!src.startsWith('/')) { failures.push(`index.html: non-absolute script src ${src}`); continue }
    const target = path.join(dist, src.slice(1))
    try { await fs.readFile(target) } catch { failures.push(`index.html: referenced script ${src} is missing from dist`) }
  }
} catch {
  failures.push('index.html: missing from the deploy bundle')
}

// --- Functions output -----------------------------------------------------
try {
  await fs.readFile(path.join(functionsLib, 'index.js'))
} catch {
  failures.push('functions/lib/index.js: missing — run `npm --prefix functions run build`')
}
for (const file of await walk(functionsLib)) {
  const relative = path.relative(root, file).split(path.sep).join('/')
  const base = path.basename(file)
  if (base.endsWith('.test.js') || base.endsWith('.test.d.ts')) failures.push(`${relative}: test file compiled into the deployable Functions output`)
  if (environmentFilePattern.test(base)) failures.push(`${relative}: environment or log file in the Functions output`)
  if (base.endsWith('.js')) {
    const text = await fs.readFile(file, 'utf8')
    scanText(relative, text)
    if (text.includes('process.env.FUNCTIONS_EMULATOR') && text.includes("'http://127.0.0.1")) {
      failures.push(`${relative}: hard-coded emulator endpoint`)
    }
  }
}

if (failures.length) {
  console.error(`Artifact checks failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`Artifact checks passed: ${distFiles.length} hosting files and the compiled Functions output are free of secrets, environment files, unexpected types, unsafe HTML and emulator endpoints.`)
