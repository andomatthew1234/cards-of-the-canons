import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const projectId = 'cards-of-canons-au-260930'
const webhookUrl = 'https://australia-southeast1-cards-of-canons-au-260930.cloudfunctions.net/stripeWebhook'
const events = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]
const stripeCommand = process.platform === 'win32' ? 'stripe.cmd' : 'stripe'
const firebaseCandidate = resolve('node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase')
const firebaseCommand = existsSync(firebaseCandidate) ? firebaseCandidate : process.platform === 'win32' ? 'firebase.cmd' : 'firebase'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32', ...options })
  if (result.status !== 0) {
    const safeMessage = `${result.stdout ?? ''}${result.stderr ?? ''}`
      .replace(/\b(?:sk|rk|rkcs|pk)_(?:test|live)_[A-Za-z0-9_]+\b/g, '[REDACTED_KEY]')
      .replace(/whsec_[A-Za-z0-9_]+/g, '[REDACTED_WEBHOOK_SECRET]')
    throw new Error(safeMessage.trim() || result.error?.message || `${command} failed.`)
  }
  return result.stdout
}

const whoami = JSON.parse(run(stripeCommand, ['whoami', '--format', 'json', '--color', 'off']))
if (!whoami.test_mode_key?.available || whoami.live_mode_key?.available) {
  throw new Error('An isolated Stripe sandbox profile is required. Refusing to configure a live Stripe profile.')
}

const existing = JSON.parse(run(stripeCommand, ['webhook_endpoints', 'list', '--limit', '100', '--color', 'off', '--log-level', 'error']))
if (existing.data?.some((endpoint) => endpoint.url === webhookUrl && endpoint.status === 'enabled')) {
  throw new Error('A sandbox webhook already exists for this URL. Roll its signing secret in Stripe before rerunning this script.')
}

const createArgs = ['webhook_endpoints', 'create', '--url', webhookUrl, '--api-version', '2026-09-30.endive', '--confirm', '--color', 'off', '--log-level', 'error']
for (const event of events) createArgs.push('--enabled-events', event)
const endpoint = JSON.parse(run(stripeCommand, createArgs))
if (!endpoint.id || !endpoint.secret?.startsWith('whsec_')) throw new Error('Stripe did not return a webhook signing secret.')

run(firebaseCommand, ['functions:secrets:set', 'STRIPE_WEBHOOK_SECRET', '--data-file', '-', '--force', '--project', projectId], { input: endpoint.secret })
console.log(`Sandbox webhook ${endpoint.id} is registered and its signing secret is stored in Google Secret Manager.`)
