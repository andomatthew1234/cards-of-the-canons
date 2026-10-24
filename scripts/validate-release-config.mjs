import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const production = process.argv.includes('--production')
const productionFirebaseProject = 'cards-of-canons-au-260930'
const files = ['.env', '.env.local', '.env.production', '.env.production.local']
const values = {}

for (const file of files) {
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) continue
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
}

Object.assign(values, Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)))

const errors = []
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10)
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  errors.push(`Release checks require Node 22 or newer (current: ${process.versions.node}).`)
}
const requiredValue = (key) => {
  const value = String(values[key] ?? '').trim()
  if (!value || /replace-me|changeme|example/i.test(value)) errors.push(`${key} must be configured.`)
  return value
}

const checkoutState = requiredValue('VITE_CHECKOUT_STATE')
if (!['disabled', 'test', 'live'].includes(checkoutState)) {
  errors.push('VITE_CHECKOUT_STATE must be disabled, test or live.')
}

const publicSiteUrl = requiredValue('VITE_PUBLIC_SITE_URL')
try {
  const url = new URL(publicSiteUrl)
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    errors.push('VITE_PUBLIC_SITE_URL must be an HTTPS origin without a path, query or fragment.')
  }
} catch {
  errors.push('VITE_PUBLIC_SITE_URL must be a valid HTTPS origin.')
}

if (production) {
  if (values.VITE_DATA_MODE !== 'firebase') errors.push('Production releases require VITE_DATA_MODE=firebase.')
  if (values.VITE_USE_FIREBASE_EMULATORS !== 'false') errors.push('Production releases require VITE_USE_FIREBASE_EMULATORS=false.')
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_APP_CHECK_SITE_KEY',
  ]) requiredValue(key)
  if (values.VITE_FIREBASE_PROJECT_ID !== productionFirebaseProject) {
    errors.push(`Production releases require VITE_FIREBASE_PROJECT_ID=${productionFirebaseProject}.`)
  }
  if (values.VITE_FIREBASE_AUTH_DOMAIN !== `${productionFirebaseProject}.firebaseapp.com`) {
    errors.push('VITE_FIREBASE_AUTH_DOMAIN does not match the production Firebase project.')
  }
  if (![`${productionFirebaseProject}.firebasestorage.app`, `${productionFirebaseProject}.appspot.com`].includes(values.VITE_FIREBASE_STORAGE_BUCKET)) {
    errors.push('VITE_FIREBASE_STORAGE_BUCKET does not match the production Firebase project.')
  }
  if (publicSiteUrl !== 'https://doxatreasury.com') {
    errors.push('Production releases require VITE_PUBLIC_SITE_URL=https://doxatreasury.com.')
  }
}

if (checkoutState === 'live' && (values.VITE_DATA_MODE !== 'firebase' || values.VITE_USE_FIREBASE_EMULATORS !== 'false')) {
  errors.push('Live checkout requires Firebase mode with emulators disabled.')
}

if (errors.length) {
  console.error(`Release configuration is unsafe:\n- ${[...new Set(errors)].join('\n- ')}`)
  process.exit(1)
}

console.log(`Release configuration valid (${production ? 'production' : 'general'}, checkout ${checkoutState}).`)
