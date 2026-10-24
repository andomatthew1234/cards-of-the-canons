import { describe, expect, it } from 'vitest'
import { activityCopy, activityDocument, activityEventId, providerLabel } from './accountActivity'

describe('account activity helpers', () => {
  it('produces deterministic opaque IDs for idempotent events', () => {
    expect(activityEventId('login', 'customer-a', 123)).toBe(activityEventId('login', 'customer-a', 123))
    expect(activityEventId('login', 'customer-a', 123)).not.toBe(activityEventId('login', 'customer-a', 124))
    expect(activityEventId('login', 'customer-a', 123)).toMatch(/^[a-f0-9]{40}$/)
  })

  it('uses a strict, non-sensitive provider label', () => {
    expect(providerLabel('password')).toBe('Email and password')
    expect(providerLabel('google.com')).toBe('Google')
    expect(providerLabel('unexpected-secret-provider')).toBe('Connected sign-in method')
  })

  it('bounds human-readable copy and adds 180-day retention', () => {
    const copy = activityCopy('mfa_enrolled', 'A'.repeat(300))
    const now = Date.UTC(2026, 9, 4)
    const document = activityDocument({ type:'mfa_enrolled', verification:'server', ...copy }, now)
    expect(copy.description.length).toBeLessThanOrEqual(300)
    expect(document.expiresAt.toMillis()).toBe(now + 180 * 24 * 60 * 60 * 1000)
    expect(document).not.toHaveProperty('ip')
    expect(document.verification).toBe('server')
  })

  it('keeps client-reported events labelled so they are never authoritative', () => {
    const now = Date.UTC(2026, 9, 4)
    const reported = activityDocument({ type:'login', verification:'client_reported', ...activityCopy('login', 'Reported by device') }, now)
    expect(reported.verification).toBe('client_reported')
    const evidence = activityDocument({ type:'order_purchased', verification:'server', ...activityCopy('order_purchased', 'Verified purchase') }, now)
    expect(evidence.verification).toBe('server')
  })
})
