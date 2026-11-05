import { z } from 'zod'

/**
 * Bounded, explicitly configured UID allowlist for administrator provisioning.
 * Returns an empty list for any unusable input, so an unconfigured deployment
 * simply fails closed instead of promoting anybody.
 */
export function bootstrapUidList(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 128)
    .slice(0, 10)
}

export const enquirySchema = z.object({
  kind: z.enum(['general', 'quote']),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  organisation: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(3000),
  consent: z.literal(true),
}).strict()

/**
 * Newsletter signup sources are a closed enum: a client can no longer write an
 * arbitrary string into the consent record, and the server decides the status.
 */
export const newsletterSources = ['home', 'footer', 'checkout', 'contact', 'account_registration', 'account_settings'] as const
export type NewsletterSource = (typeof newsletterSources)[number]
export const newsletterSourceSchema = z.enum(newsletterSources)

export const accountNewsletterSchema = z.object({
  consent: z.literal(true),
  source: z.enum(['account_registration', 'account_settings']),
}).strict()

export const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  consent: z.literal(true),
  source: newsletterSourceSchema,
}).strict()

/**
 * Confirmation/unsubscribe links carry an opaque token. The stored record keeps
 * only a hash, so a database read never exposes a usable link.
 */
export const newsletterTokenSchema = z.object({
  token: z.string().trim().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/),
}).strict()

export const accountAdminActionSchema = z.object({
  uid: z.string().min(1).max(128),
  action: z.enum(['disable', 'enable', 'delete', 'grantAdmin', 'revokeAdmin']),
}).strict()

export const listAccountsSchema = z.object({
  pageToken: z.string().min(1).max(256).optional(),
}).strict()

export const orderFulfilmentSchema = z.object({
  orderId: z.string().min(1).max(128),
  status: z.enum(['paid', 'cancelled', 'fulfilled']),
}).strict()

export const dismissTestOrderSchema = z.object({
  orderId: z.string().min(1).max(128),
}).strict()

export const checkoutSchema = z.object({
  attemptId: z.string().uuid(),
  expectedPaymentEnvironment: z.enum(['test', 'live']),
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(128),
    quantity: z.number().int().min(1).max(20),
  }).strict()).min(1).max(25),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.productId)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Each product can appear only once.' })
  }
})

export const cancelCheckoutSchema = z.object({
  orderId: z.string().min(1).max(128),
}).strict()

/**
 * Operator-recorded, end-to-end launch evidence. A Stripe `whsec_` prefix is a
 * configuration artefact, never proof that a webhook was actually validated, so
 * live payments stay locked until an administrator records real evidence.
 */
export const launchPrerequisitesSchema = z.object({
  confirmation: z.literal('RECORD LAUNCH PREREQUISITES'),
  webhookDeliveryId: z.string().trim().regex(/^evt_[A-Za-z0-9]+$/).max(200),
  webhookEventType: z.enum(['checkout.session.completed', 'checkout.session.async_payment_succeeded']),
  webhookReceivedAt: z.iso.datetime({ offset: true }),
  testOrderRef: z.string().trim().regex(/^co_[a-f0-9]{32}$/),
  operatorInstructionsRead: z.literal(true),
}).strict()

/**
 * Publishing an image from the administrator's private staging area into a
 * publicly readable, server-approved location. Both paths are re-checked by
 * the server with strict patterns before any object is touched.
 */
export const publishImageSchema = z.object({
  stagingPath: z.string().min(1).max(300),
  destination: z.string().min(1).max(300),
}).strict()

/**
 * Analytics event names are a closed enum shared by the client allowlist and
 * the server ingest guard, so both sides cannot drift apart.
 */
export const analyticsEventNames = [
  'page_view', 'view_shop', 'view_product', 'add_to_cart', 'begin_checkout',
  'generate_lead', 'newsletter_signup', 'sign_up',
] as const

export const analyticsEventSchema = z.object({
  name: z.enum(analyticsEventNames),
  path: z.string().min(1).max(512).regex(/^\//),
  sessionId: z.string().regex(/^[a-f0-9]{32}$/),
  device: z.enum(['desktop', 'tablet', 'mobile']),
  itemId: z.string().min(1).max(128).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  valueCents: z.number().int().min(0).max(100_000_000).optional(),
  currency: z.literal('AUD').optional(),
  method: z.enum(['password', 'google', 'apple']).optional(),
  referrerHost: z.string().max(160).regex(/^[a-z0-9.-]+$/i).optional(),
  isLanding: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.name === 'view_product' && !value.itemId) {
    context.addIssue({ code: 'custom', message: 'Product views require an item ID.' })
  }
  if (value.name === 'add_to_cart' && (!value.itemId || value.quantity === undefined)) {
    context.addIssue({ code: 'custom', message: 'Cart events require an item ID and quantity.' })
  }
  if (value.name === 'begin_checkout' && (value.valueCents === undefined || value.currency !== 'AUD')) {
    context.addIssue({ code: 'custom', message: 'Checkout events require an AUD value.' })
  }
})
