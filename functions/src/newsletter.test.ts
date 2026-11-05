import { describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import {
  consentEvent,
  consentTokenExpiry,
  evaluateConfirmToken,
  evaluateUnsubscribeToken,
  generateConsentToken,
  hashConsentToken,
  isMailable,
  normaliseNewsletterEmail,
  publicSubscribeResponse,
  resolveAccountJoinStatus,
  resolveSubscribeOutcome,
  statusOf,
  subscriptionConfirmationMessage,
  subscriberIdForEmail,
  unsubscribeTokenHorizon,
} from './newsletter'
import { clearTransactionalTransports, deliver, registerTransactionalTransport, transportStatus } from './mailTransport'

describe('newsletter mailbox and token handling', () => {
  it('normalises mailboxes before hashing so one address has one record', () => {
    expect(normaliseNewsletterEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com')
    expect(normaliseNewsletterEmail(undefined)).toBe('')
    expect(subscriberIdForEmail('JANE@example.com')).toBe(subscriberIdForEmail(' jane@example.com '))
    expect(subscriberIdForEmail('jane@example.com')).not.toBe(subscriberIdForEmail('jack@example.com'))
    expect(subscriberIdForEmail('jane@example.com')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('stores only a hash of a consent token', () => {
    const token = generateConsentToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const hash = hashConsentToken(token)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain(token)
    expect(hashConsentToken(token)).toBe(hash)
    expect(hashConsentToken(generateConsentToken())).not.toBe(hash)
    expect(generateConsentToken()).not.toBe(token)
  })

  it('expires confirmation tokens after the documented window', () => {
    const now = Date.UTC(2026, 9, 8)
    expect(consentTokenExpiry(now) - now).toBe(7 * 24 * 60 * 60 * 1000)
    expect(consentTokenExpiry(now, 1) - now).toBe(24 * 60 * 60 * 1000)
  })

  it('keeps unsubscribe tokens out of the expired-token cleanup query', () => {
    const now = Date.UTC(2026, 9, 8)
    // Firestore orders null before every timestamp, so a null expiry would be
    // swept by `expiresAt <= now`; the horizon must stay far in the future.
    const horizon = unsubscribeTokenHorizon(now)
    expect(horizon).toBeGreaterThan(now)
    expect(horizon).toBeGreaterThan(consentTokenExpiry(now))
    expect(unsubscribeTokenHorizon(now + 24 * 60 * 60 * 1000) - horizon).toBe(24 * 60 * 60 * 1000)
  })
})

describe('confirmation token verdicts', () => {
  const now = Date.UTC(2026, 9, 8)
  const valid = { action: 'confirm', subscriberId: 'sub-1', expiresAt: now + 1000, usedAt: null }

  it('accepts a live, single-use confirmation token', () => {
    expect(evaluateConfirmToken(valid, now)).toBe('ok')
    expect(evaluateConfirmToken({ ...valid, expiresAt: Timestamp.fromMillis(now + 1000) }, now)).toBe('ok')
    expect(evaluateConfirmToken({ ...valid, expiresAt: new Date(now + 1000) }, now)).toBe('ok')
  })

  it('fails closed for unknown, wrong-action, expired and reused tokens', () => {
    expect(evaluateConfirmToken(undefined, now)).toBe('unknown')
    expect(evaluateConfirmToken(null, now)).toBe('unknown')
    expect(evaluateConfirmToken({ ...valid, subscriberId: '' }, now)).toBe('unknown')
    expect(evaluateConfirmToken({ ...valid, action: 'unsubscribe' }, now)).toBe('wrong-action')
    expect(evaluateConfirmToken({ ...valid, expiresAt: undefined }, now)).toBe('expired')
    expect(evaluateConfirmToken({ ...valid, expiresAt: null }, now)).toBe('expired')
    expect(evaluateConfirmToken({ ...valid, expiresAt: now }, now)).toBe('expired')
    expect(evaluateConfirmToken({ ...valid, usedAt: Timestamp.fromMillis(now - 1) }, now)).toBe('used')
  })

  it('always allows suppression, even for an expired or spent token', () => {
    expect(evaluateUnsubscribeToken({ ...valid, expiresAt: now - 1000 })).toBe('ok')
    expect(evaluateUnsubscribeToken({ ...valid, action: 'unsubscribe', expiresAt: null, usedAt: Timestamp.fromMillis(now) })).toBe('ok')
    expect(evaluateUnsubscribeToken({ action: 'confirm' })).toBe('unknown')
    expect(evaluateUnsubscribeToken({ action: 'reset-password' })).toBe('wrong-action')
    expect(evaluateUnsubscribeToken(undefined)).toBe('unknown')
  })
})

describe('consent state invariants', () => {
  it('returns one invariant public response for every signup outcome', () => {
    const outcomes = [
      resolveSubscribeOutcome(undefined),
      resolveSubscribeOutcome({ status: 'pending' }),
      resolveSubscribeOutcome({ status: 'subscribed' }),
      resolveSubscribeOutcome({ status: 'unsubscribed' }),
    ]

    for (const outcome of outcomes) {
      expect(outcome).toBeDefined()
      expect(publicSubscribeResponse()).toEqual({ accepted: true })
      expect(publicSubscribeResponse()).not.toHaveProperty('status')
      expect(publicSubscribeResponse()).not.toHaveProperty('confirmationEmailSent')
      expect(publicSubscribeResponse()).not.toHaveProperty('deliveryReason')
    }
  })

  it('treats only an explicitly consented active subscriber as mailable', () => {
    expect(isMailable('subscribed')).toBe(true)
    expect(isMailable('pending')).toBe(false)
    expect(isMailable('unsubscribed')).toBe(false)
    expect(isMailable('unknown')).toBe(false)
    expect(isMailable(undefined)).toBe(false)
  })

  it('lets an existing unsubscribe suppression win over a new signup', () => {
    expect(resolveSubscribeOutcome(undefined)).toEqual({ status: 'subscribed', issueToken: true })
    expect(resolveSubscribeOutcome({ status: 'pending' })).toEqual({ status: 'subscribed', issueToken: true })
    expect(resolveSubscribeOutcome({ status: 'subscribed' })).toEqual({ status: 'subscribed', issueToken: false })
    expect(resolveSubscribeOutcome({ status: 'unsubscribed' })).toEqual({ status: 'unsubscribed', issueToken: false })
    // Corrupted or unknown stored state fails closed instead of re-subscribing.
    expect(resolveSubscribeOutcome({ status: 'SOMETHING' })).toEqual({ status: 'unsubscribed', issueToken: false })
    expect(resolveSubscribeOutcome({})).toEqual({ status: 'unsubscribed', issueToken: false })
  })

  it('activates authenticated account consent without requiring a second confirmation', () => {
    expect(resolveAccountJoinStatus(undefined, false)).toBe('subscribed')
    expect(resolveAccountJoinStatus({ status: 'unsubscribed' }, false)).toBe('subscribed')
    expect(resolveAccountJoinStatus({ status: 'unsubscribed' }, true)).toBe('subscribed')
    expect(resolveAccountJoinStatus({ status: 'subscribed' }, false)).toBe('subscribed')
  })

  it('builds an informational subscription email with unsubscribe, not activation', () => {
    const message = subscriptionConfirmationMessage(
      'jane@example.com',
      'unsubscribe-token',
      'https://doxatreasury.com/',
    )

    expect(message.subject).toBe('You’re subscribed to Doxa updates')
    expect(message.text).toContain('No further confirmation is required.')
    expect(message.text).toContain('https://doxatreasury.com/newsletter/unsubscribe?token=unsubscribe-token')
    expect(message.text).not.toContain('/newsletter/confirm')
  })

  it('recognises only the three stored statuses', () => {
    expect(statusOf({ status: 'pending' })).toBe('pending')
    expect(statusOf({ status: 'nope' })).toBe('unknown')
    expect(statusOf(null)).toBe('unknown')
  })

  it('writes append-only consent evidence with a bounded retention horizon', () => {
    const now = Timestamp.fromMillis(Date.UTC(2026, 9, 8))
    const event = consentEvent('sub-1', 'confirmed', null, now, 10)
    expect(event.subscriberId).toBe('sub-1')
    expect(event.action).toBe('confirmed')
    expect(event.writtenBy).toBe('server')
    expect(event.expiresAt.toMillis()).toBe(now.toMillis() + 10 * 24 * 60 * 60 * 1000)
    expect(consentEvent('sub-1', 'requested', 'home', now).source).toBe('home')
  })
})

describe('explicit transactional mail transport', () => {
  it('fails closed when no transport is configured', async () => {
    clearTransactionalTransports()
    expect(transportStatus('none')).toEqual({ provider: 'none', configured: false, available: false })
    expect(transportStatus(undefined)).toEqual({ provider: 'none', configured: false, available: false })
    expect(transportStatus('DROP TABLE')).toEqual({ provider: 'none', configured: false, available: false })
    const result = await deliver({ to: 'jane@example.com', subject: 'Confirm', text: 'body' }, 'none')
    expect(result).toEqual({ sent: false, provider: 'none', reason: 'no-transport-configured' })
  })

  it('fails closed when a provider is named but not implemented in this build', async () => {
    clearTransactionalTransports()
    const result = await deliver({ to: 'jane@example.com', subject: 'Confirm', text: 'body' }, 'some-provider')
    expect(result).toEqual({ sent: false, provider: 'some-provider', reason: 'transport-unavailable' })
  })

  it('delivers only through an explicitly registered provider', async () => {
    clearTransactionalTransports()
    const sender = vi.fn().mockResolvedValue(undefined)
    registerTransactionalTransport('acme-mail', sender)
    const message = { to: 'jane@example.com', subject: 'Confirm', text: 'body' }
    const result = await deliver(message, 'acme-mail')
    expect(result).toEqual({ sent: true, provider: 'acme-mail' })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledWith(message)
    // A different configured provider must not silently reuse the sender.
    const other = await deliver(message, 'other-mail')
    expect(other).toEqual({ sent: false, provider: 'other-mail', reason: 'transport-unavailable' })
    clearTransactionalTransports()
  })

  it('rejects unusable transport identifiers', () => {
    expect(() => registerTransactionalTransport('ACME', vi.fn())).toThrow()
    expect(() => registerTransactionalTransport('', vi.fn())).toThrow()
    expect(() => registerTransactionalTransport('acme mail', vi.fn())).toThrow()
  })
})
