import { describe, expect, it } from 'vitest'
import { isSandboxOrder, shouldRestoreDismissedOrderInventory } from './orderAdmin'

describe('test order dismissal safeguards', () => {
  it('allows only sandbox orders to be dismissed', () => {
    expect(isSandboxOrder('test')).toBe(true)
    expect(isSandboxOrder('live')).toBe(false)
    expect(isSandboxOrder(undefined)).toBe(false)
  })

  it('restores stock only when the test reservation still affects inventory', () => {
    expect(shouldRestoreDismissedOrderInventory('test', 'reserved')).toBe(true)
    expect(shouldRestoreDismissedOrderInventory('test', 'committed')).toBe(true)
    expect(shouldRestoreDismissedOrderInventory('test', 'released')).toBe(false)
    expect(shouldRestoreDismissedOrderInventory('live', 'committed')).toBe(false)
  })

  it('never restores operational stock for sandbox-scoped reservations (S5)', () => {
    expect(shouldRestoreDismissedOrderInventory('test', 'reserved', 'sandbox')).toBe(false)
    expect(shouldRestoreDismissedOrderInventory('test', 'committed', 'sandbox')).toBe(false)
    // Orders written before scope bookkeeping existed keep legacy behaviour.
    expect(shouldRestoreDismissedOrderInventory('test', 'reserved', undefined)).toBe(true)
    expect(shouldRestoreDismissedOrderInventory('test', 'reserved', 'operational')).toBe(true)
    expect(shouldRestoreDismissedOrderInventory('live', 'committed', 'operational')).toBe(false)
  })
})
