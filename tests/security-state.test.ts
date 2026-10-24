import { beforeEach, describe, expect, it } from 'vitest'
import { clearSecurityState, clearSecurityStateExcept, readSecurityState, securityStateKey, writeSecurityState } from '../src/lib/security'

describe('UID-scoped security state', () => {
  beforeEach(() => sessionStorage.clear())

  it('derives keys from the account identity', () => {
    expect(securityStateKey('customer-1', 'pending-email-change')).toBe('cards.security.customer-1.pending-email-change')
    expect(readSecurityState('customer-1', 'pending-email-change')).toBe('')
  })

  it('refuses to read or write without a usable identity', () => {
    expect(securityStateKey(null, 'pending-email-change')).toBeNull()
    expect(securityStateKey('not a valid uid!', 'pending-email-change')).toBeNull()
    writeSecurityState(null, 'pending-email-change', 'someone@example.com')
    expect(sessionStorage.length).toBe(0)
    expect(readSecurityState(undefined, 'pending-email-change')).toBe('')
  })

  it('keeps one account’s pending change invisible to another', () => {
    writeSecurityState('customer-1', 'pending-email-change', 'first@example.com')
    expect(readSecurityState('customer-1', 'pending-email-change')).toBe('first@example.com')
    expect(readSecurityState('customer-2', 'pending-email-change')).toBe('')
  })

  it('clears only entries that belong to other accounts', () => {
    writeSecurityState('customer-1', 'pending-email-change', 'mine@example.com')
    writeSecurityState('customer-1', 'email-change-resend', '123')
    writeSecurityState('customer-2', 'pending-email-change', 'theirs@example.com')
    clearSecurityStateExcept('customer-1')
    expect(readSecurityState('customer-1', 'pending-email-change')).toBe('mine@example.com')
    expect(readSecurityState('customer-1', 'email-change-resend')).toBe('123')
    expect(readSecurityState('customer-2', 'pending-email-change')).toBe('')
  })

  it('drops every scoped entry when the session ends', () => {
    writeSecurityState('customer-1', 'pending-email-change', 'mine@example.com')
    sessionStorage.setItem('unrelated.preference', 'keep-me')
    clearSecurityStateExcept(null)
    expect(sessionStorage.length).toBe(1)
    expect(sessionStorage.getItem('unrelated.preference')).toBe('keep-me')
  })

  it('removes a single entry by name', () => {
    writeSecurityState('customer-1', 'pending-email-change', 'mine@example.com')
    clearSecurityState('customer-1', 'pending-email-change')
    expect(readSecurityState('customer-1', 'pending-email-change')).toBe('')
  })
})
