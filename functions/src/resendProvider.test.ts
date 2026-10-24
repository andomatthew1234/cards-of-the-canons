import { describe, expect, it } from 'vitest'
import { defaultNewsletterFrom, defaultNewsletterReplyTo, shouldUpdateContactSubscription } from './resendProvider'

describe('Resend contact consent safety', () => {
  it('uses the verified Doxa Treasury domain by default', () => {
    expect(defaultNewsletterFrom).toBe('Doxa Cards <info@doxatreasury.com>')
    expect(defaultNewsletterReplyTo).toBe('info@doxatreasury.com')
  })

  it('preserves a provider opt-out during routine campaign synchronisation', () => {
    expect(shouldUpdateContactSubscription(true, true)).toBe(false)
  })

  it('allows a fresh explicit consent action to resubscribe the contact', () => {
    expect(shouldUpdateContactSubscription(true, true, true)).toBe(true)
  })

  it('always permits suppression and keeps an already subscribed contact subscribed', () => {
    expect(shouldUpdateContactSubscription(false, false)).toBe(true)
    expect(shouldUpdateContactSubscription(false, true)).toBe(true)
  })
})
