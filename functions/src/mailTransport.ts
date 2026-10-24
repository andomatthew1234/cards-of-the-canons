import { defineString } from 'firebase-functions/params'

/**
 * Explicit transactional mail boundary.
 *
 * A message is delivered only when the configured `MAIL_TRANSPORT` has a
 * registered sender implementation in this build. The production default is
 * Resend; missing credentials, an unknown provider, or an unavailable sender
 * fails closed, and callers must never pretend a message was delivered.
 *
 * No message is ever sent by this module during development, tests or review.
 */

export interface OutboundMail {
  to: string
  subject: string
  text: string
}

export interface DeliveryResult {
  sent: false
  provider: string
  reason: 'no-transport-configured' | 'transport-unavailable'
}

export type MailSender = (message: OutboundMail) => Promise<void>

export const mailTransportParam = defineString('MAIL_TRANSPORT', { default: 'resend' })
export const publicSiteOriginParam = defineString('PUBLIC_SITE_URL', { default: 'https://doxatreasury.com' })

const senders = new Map<string, MailSender>()

/** Registers a provider implementation. Deployments that send mail own this wiring. */
export function registerTransactionalTransport(provider: string, sender: MailSender) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(provider)) throw new Error('Unsupported mail transport identifier.')
  senders.set(provider, sender)
}

/** Test/cleanup helper: removes a registered provider. */
export function clearTransactionalTransports() {
  senders.clear()
}

export function transportStatus(provider: unknown): { provider: string; configured: boolean; available: boolean } {
  const name = typeof provider === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(provider) ? provider : 'none'
  return { provider: name, configured: name !== 'none', available: name !== 'none' && senders.has(name) }
}

/**
 * Delivers one message through the explicitly configured transport, or reports
 * that nothing was sent. Callers must never treat a `sent: false` result as a
 * delivered confirmation.
 */
export async function deliver(message: OutboundMail, provider: unknown = mailTransportParam.value()): Promise<DeliveryResult | { sent: true; provider: string }> {
  const status = transportStatus(provider)
  if (!status.configured) return { sent: false, provider: status.provider, reason: 'no-transport-configured' }
  const sender = senders.get(status.provider)
  if (!sender) return { sent: false, provider: status.provider, reason: 'transport-unavailable' }
  await sender(message)
  return { sent: true, provider: status.provider }
}
