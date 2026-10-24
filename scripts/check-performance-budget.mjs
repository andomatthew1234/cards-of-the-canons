import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const dist = path.join(root, 'dist')
const limits = {
  initialJavaScriptGzip: 430 * 1024,
  initialCssGzip: 90 * 1024,
  mobileHeroBytes: 1_750_000,
  desktopHeroBytes: 3_450_000,
  heroPosterBytes: 100_000,
}

const failures = []

async function readSize(relativePath) {
  const file = path.join(dist, relativePath.replace(/^\//, ''))
  try {
    const bytes = await fs.readFile(file)
    return { raw: bytes.length, gzip: gzipSync(bytes).length }
  } catch {
    failures.push(`${relativePath}: referenced initial asset is missing`)
    return { raw: 0, gzip: 0 }
  }
}

const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
const initialAssets = new Set()
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["'](\/assets\/[^"']+)["'][^>]*>/gi)) {
  initialAssets.add(match[1])
}

let initialJavaScriptGzip = 0
let initialCssGzip = 0
for (const asset of initialAssets) {
  const size = await readSize(asset)
  if (asset.endsWith('.js')) initialJavaScriptGzip += size.gzip
  if (asset.endsWith('.css')) initialCssGzip += size.gzip
}

if (initialJavaScriptGzip > limits.initialJavaScriptGzip) {
  failures.push(`initial JavaScript is ${initialJavaScriptGzip} gzip bytes (budget ${limits.initialJavaScriptGzip})`)
}
if (initialCssGzip > limits.initialCssGzip) {
  failures.push(`initial CSS is ${initialCssGzip} gzip bytes (budget ${limits.initialCssGzip})`)
}

async function enforceAsset(relativePath, limit) {
  const size = await readSize(relativePath)
  if (size.raw > limit) failures.push(`${relativePath} is ${size.raw} bytes (budget ${limit})`)
  return size.raw
}

const mobileHero = await enforceAsset('/videos/doxa-home-hero-boomerang-mobile.mp4', limits.mobileHeroBytes)
const desktopHero = await enforceAsset('/videos/doxa-home-hero-boomerang.mp4', limits.desktopHeroBytes)
const heroPoster = await enforceAsset('/images/doxa-home-hero-poster.webp', limits.heroPosterBytes)

if (failures.length) {
  console.error(`Performance budgets failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log([
  `Performance budgets passed: initial JS ${(initialJavaScriptGzip / 1024).toFixed(1)} KiB gzip`,
  `initial CSS ${(initialCssGzip / 1024).toFixed(1)} KiB gzip`,
  `mobile hero ${(mobileHero / 1024 / 1024).toFixed(2)} MiB`,
  `desktop hero ${(desktopHero / 1024 / 1024).toFixed(2)} MiB`,
  `poster ${(heroPoster / 1024).toFixed(1)} KiB.`,
].join('; '))
