import { describe, expect, it } from 'vitest'
import { accountAdminActionSchema, analyticsEventSchema, bootstrapUidList, checkoutSchema, dismissTestOrderSchema, enquirySchema, launchPrerequisitesSchema, newsletterSchema, newsletterTokenSchema } from './validation'

describe('public form validation', () => {
  it('accepts a bounded enquiry with consent', () => {
    expect(enquirySchema.safeParse({ kind: 'quote', name: 'Jane Doe', email: 'JANE@example.com', message: 'Please share more information.', consent: true }).success).toBe(true)
  })
  it('rejects missing consent, unknown fields and oversized content', () => {
    expect(enquirySchema.safeParse({ kind: 'general', name: 'Jane', email: 'j@example.com', message: 'A'.repeat(3001), consent: false, role: 'admin' }).success).toBe(false)
  })
  it('normalises newsletter signup and refuses a client-chosen status', () => {
    const result = newsletterSchema.safeParse({ email: ' JANE@EXAMPLE.COM ', consent: true, source: 'home' })
    expect(result.success && result.data.email).toBe('jane@example.com')
    // Status is decided by the server's double opt-in flow, never the client.
    expect(newsletterSchema.safeParse({ email: 'jane@example.com', consent: true, source: 'home', status: 'subscribed' }).success).toBe(false)
  })

  it('constrains the newsletter source enum and rejects unknown fields', () => {
    for (const source of ['home', 'footer', 'checkout', 'contact']) {
      expect(newsletterSchema.safeParse({ email: 'jane@example.com', consent: true, source }).success).toBe(true)
    }
    for (const source of ['<script>alert(1)</script>', '../../etc', 'a'.repeat(51), '', 'homepage', null]) {
      expect(newsletterSchema.safeParse({ email: 'jane@example.com', consent: true, source }).success, String(source)).toBe(false)
    }
    expect(newsletterSchema.safeParse({ email: 'jane@example.com', consent: true, source: 'home', campaign: 'x' }).success).toBe(false)
    expect(newsletterSchema.safeParse({ email: 'jane@example.com', consent: false, source: 'home' }).success).toBe(false)
  })

  it('accepts only opaque, bounded consent tokens', () => {
    const token = 'a'.repeat(43)
    expect(newsletterTokenSchema.safeParse({ token }).success).toBe(true)
    expect(newsletterTokenSchema.safeParse({ token: 'short' }).success).toBe(false)
    expect(newsletterTokenSchema.safeParse({ token: `${token} spaces` }).success).toBe(false)
    expect(newsletterTokenSchema.safeParse({ token: `${token}!` }).success).toBe(false)
    expect(newsletterTokenSchema.safeParse({ token, next: '/shop' }).success).toBe(false)
    expect(newsletterTokenSchema.safeParse({}).success).toBe(false)
  })
  it('allows only explicit account administration actions', () => {
    expect(accountAdminActionSchema.safeParse({ uid: 'customer-1', action: 'disable' }).success).toBe(true)
    expect(accountAdminActionSchema.safeParse({ uid: 'customer-1', action: 'revokeAdmin' }).success).toBe(true)
    expect(accountAdminActionSchema.safeParse({ uid: 'customer-1', action: 'setPassword', password: 'secret' }).success).toBe(false)
    // Promotion is never a client-reachable action: provisioning is either an
    // operator-owned migration or the explicitly configured UID allowlist.
    expect(accountAdminActionSchema.safeParse({ uid: 'customer-1', action: 'grantAdmin' }).success).toBe(false)
  })

  it('bounds UID-based provisioning allowlists', () => {
    expect(bootstrapUidList('uid-a, uid-b')).toEqual(['uid-a', 'uid-b'])
    expect(bootstrapUidList('')).toEqual([])
    expect(bootstrapUidList(' , ')).toEqual([])
    expect(bootstrapUidList(undefined)).toEqual([])
    expect(bootstrapUidList('a'.repeat(200))).toEqual([])
    expect(bootstrapUidList(Array.from({ length: 20 }, (_, index) => `uid-${index}`).join(','))).toHaveLength(10)
    expect(bootstrapUidList({ uid: 'uid-a' })).toEqual([])
  })

  it('accepts only a bounded order reference for test-order dismissal', () => {
    expect(dismissTestOrderSchema.safeParse({ orderId: 'co_test' }).success).toBe(true)
    expect(dismissTestOrderSchema.safeParse({ orderId: 'co_test', environment: 'live' }).success).toBe(false)
    expect(dismissTestOrderSchema.safeParse({ orderId: '' }).success).toBe(false)
  })

  it('accepts only bounded product IDs and quantities for checkout', () => {
    const attemptId = '123e4567-e89b-42d3-a456-426614174000'
    const request = (items: Array<{ productId: string; quantity: number }>, expectedPaymentEnvironment: 'test' | 'live' = 'test') => ({ attemptId, expectedPaymentEnvironment, items })
    expect(checkoutSchema.safeParse(request([{ productId: 'product-1', quantity: 2 }])).success).toBe(true)
    expect(checkoutSchema.safeParse(request([{ productId: 'product-1', quantity: 2 }], 'live')).success).toBe(true)
    expect(checkoutSchema.safeParse({ ...request([{ productId: 'product-1', quantity: 2 }]), expectedPaymentEnvironment: 'preview' }).success).toBe(false)
    expect(checkoutSchema.safeParse({ attemptId, items: [{ productId: 'product-1', quantity: 2 }] }).success).toBe(false)
    expect(checkoutSchema.safeParse(request([{ productId: 'product-1', quantity: 2, priceCents: 1 } as never])).success).toBe(false)
    expect(checkoutSchema.safeParse(request([{ productId: 'product-1', quantity: 2 }, { productId: 'product-1', quantity: 1 }])).success).toBe(false)
    expect(checkoutSchema.safeParse(request([{ productId: 'product-1', quantity: 21 }])).success).toBe(false)
    expect(checkoutSchema.safeParse(request(Array.from({ length: 25 }, (_, index) => ({ productId: `product-${index}`, quantity: 1 })))).success).toBe(true)
    expect(checkoutSchema.safeParse(request(Array.from({ length: 26 }, (_, index) => ({ productId: `product-${index}`, quantity: 1 })))).success).toBe(false)
  })

  it('accepts only provider-shaped, live-payment launch evidence', () => {
    const evidence = {
      confirmation: 'RECORD LAUNCH PREREQUISITES',
      webhookDeliveryId: 'evt_1234AbCd',
      webhookEventType: 'checkout.session.completed',
      webhookReceivedAt: '2026-10-24T00:00:00.000Z',
      testOrderRef: `co_${'a'.repeat(32)}`,
      operatorInstructionsRead: true,
    }
    expect(launchPrerequisitesSchema.safeParse(evidence).success).toBe(true)
    expect(launchPrerequisitesSchema.safeParse({ ...evidence, webhookDeliveryId: 'delivery-not-from-stripe' }).success).toBe(false)
    expect(launchPrerequisitesSchema.safeParse({ ...evidence, webhookEventType: 'customer.created' }).success).toBe(false)
    expect(launchPrerequisitesSchema.safeParse({ ...evidence, webhookReceivedAt: 'yesterday' }).success).toBe(false)
    expect(launchPrerequisitesSchema.safeParse({ ...evidence, testOrderRef: 'co_demo' }).success).toBe(false)
    expect(launchPrerequisitesSchema.safeParse({ ...evidence, trusted: true }).success).toBe(false)
  })

  it('accepts only schema-bounded analytics without personal data', () => {
    const base = { name: 'page_view', path: '/shop', sessionId: '0123456789abcdef0123456789abcdef', device: 'mobile' }
    expect(analyticsEventSchema.safeParse(base).success).toBe(true)
    expect(analyticsEventSchema.safeParse({ ...base, email: 'person@example.com' }).success).toBe(false)
    expect(analyticsEventSchema.safeParse({ ...base, name: 'add_to_cart' }).success).toBe(false)
    expect(analyticsEventSchema.safeParse({ ...base, name: 'begin_checkout', valueCents: 1200, currency: 'AUD' }).success).toBe(true)
  })
})
