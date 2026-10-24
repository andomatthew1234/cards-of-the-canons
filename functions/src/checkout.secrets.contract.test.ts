import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Stripe secret bindings', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/checkout.ts'), 'utf8')

  it('binds both Stripe secrets to checkout creation and webhook delivery', () => {
    const createCheckout = source.slice(source.indexOf('export const createCheckoutSession'), source.indexOf('export const cancelCheckoutSession'))
    const webhook = source.slice(source.indexOf('export const stripeWebhook'), source.indexOf('async function settleExpiredSession'))

    expect(createCheckout).toContain('secrets: [stripeSecretKey, stripeWebhookSecret]')
    expect(webhook).toContain('secrets: [stripeSecretKey, stripeWebhookSecret]')
  })

  it('binds the Stripe key to scheduled reservation cleanup', () => {
    const cleanup = source.slice(source.indexOf('export const releaseExpiredCheckoutReservations'))
    expect(cleanup).toContain('secrets: [stripeSecretKey]')
  })

  it('derives launch approval from persisted Stripe event and order evidence', () => {
    const recording = source.slice(source.indexOf('export const recordLaunchPrerequisites'), source.indexOf('export const setLivePaymentsEnabled'))
    expect(recording).toContain("db.collection('_stripeEvents').doc(parsed.data.webhookDeliveryId).get()")
    expect(recording).toContain("db.collection('orders').doc(parsed.data.testOrderRef).get()")
    expect(recording).toContain("eventData.outcome === 'commit'")
    expect(recording).toContain('eventData.webhookSecretFingerprint === webhookSecretFingerprint(stripeWebhookSecret.value())')
    expect(recording).toContain("orderData.paymentEnvironment === 'live'")
    expect(recording).toContain("=== 'paid'")
  })

  it('marks evidence only on events accepted by the signed webhook path', () => {
    const webhook = source.slice(source.indexOf('export const stripeWebhook'), source.indexOf('async function reconcileExpiredReservation'))
    expect(webhook).toContain('webhookSecretFingerprint(stripeWebhookSecret.value())')

    const recording = source.slice(source.indexOf('async function applyCheckoutEvent'), source.indexOf('async function applyChargeEvent'))
    expect(recording).toContain('verifiedWebhookFingerprint?: string')
    expect(recording).toContain('webhookSecretFingerprint: verifiedWebhookFingerprint')
  })
})
