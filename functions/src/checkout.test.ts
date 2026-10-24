import { describe, expect, it, vi } from 'vitest'
import { coalesce, isLiveStripeKey, readTerminalCancel, resolveCheckoutTransition, writeTerminalCancel } from './checkout'


describe('checkout payment transitions', () => {
  it('commits a reserved order only after confirmed payment', () => {
    expect(resolveCheckoutTransition('checkout.session.completed', 'paid', 'reserved')).toEqual({
      action: 'commit', orderStatus: 'paid', inventoryState: 'committed',
    })
    expect(resolveCheckoutTransition('checkout.session.completed', 'unpaid', 'reserved')).toEqual({
      action: 'hold', orderStatus: 'pending', inventoryState: 'reserved',
    })
    expect(resolveCheckoutTransition('checkout.session.async_payment_succeeded', 'paid', 'reserved')).toEqual({
      action: 'commit', orderStatus: 'paid', inventoryState: 'committed',
    })
  })

  it('releases inventory once for failed or expired checkouts', () => {
    expect(resolveCheckoutTransition('checkout.session.async_payment_failed', 'unpaid', 'reserved')).toEqual({
      action: 'release', orderStatus: 'payment_failed', inventoryState: 'released',
    })
    expect(resolveCheckoutTransition('checkout.session.expired', 'unpaid', 'reserved')).toEqual({
      action: 'release', orderStatus: 'cancelled', inventoryState: 'released',
    })
    expect(resolveCheckoutTransition('checkout.session.expired', 'unpaid', 'committed')).toEqual({
      action: 'ignore', orderStatus: 'paid', inventoryState: 'committed',
    })
  })

  it('routes a late payment after released inventory to manual review', () => {
    expect(resolveCheckoutTransition('checkout.session.async_payment_succeeded', 'paid', 'released')).toEqual({
      action: 'ignore', orderStatus: 'payment_review', inventoryState: 'released',
    })
  })

  it('recognises live keys without confusing sandbox restricted keys', () => {
    expect(isLiveStripeKey('rkcs_test_example')).toBe(false)
    expect(isLiveStripeKey('sk_live_example')).toBe(true)
    expect(isLiveStripeKey('rk_live_example')).toBe(true)
    expect(isLiveStripeKey('rkcs_live_example')).toBe(true)
  })
})

describe('invocation coalescing and terminal cancel cache (S9)', () => {
  it('runs one operation per key and releases the key afterwards', async () => {
    let runs = 0
    const work = async () => {
      runs += 1
      return runs
    }
    const first = coalesce('create:s9-order', work)
    const second = coalesce('create:s9-order', work)
    expect(runs).toBe(1)
    expect(await first).toBe(1)
    expect(await second).toBe(1)
    await coalesce('create:s9-order', work)
    expect(runs).toBe(2)
    await coalesce('cancel:s9-order', work)
    expect(runs).toBe(3)
  })

  it('fails closed instead of allowing unbounded fan-out when the instance is saturated', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = () => resolve()
    })

    const held = Array.from({ length: 64 }, (_value, index) => coalesce(`gate:${index}`, () => gate))
    await expect(coalesce('gate:overflow', async () => 'never')).rejects.toMatchObject({ code: 'resource-exhausted' })
    release()
    await Promise.all(held)
    expect(await coalesce('gate:overflow', async () => 'after')).toBe('after')
  })

  it('serves a recent terminal cancel result without re-running the operation', () => {
    writeTerminalCancel('s9-terminal', { cancelled: true })
    expect(readTerminalCancel('s9-terminal')).toEqual({ cancelled: true })
    expect(readTerminalCancel('s9-unknown')).toBeUndefined()
  })

  it('expires a cached terminal result after the cache window', () => {
    vi.useFakeTimers()
    try {
      writeTerminalCancel('s9-expiring', { cancelled: false, processing: true })
      vi.advanceTimersByTime(61_000)
      expect(readTerminalCancel('s9-expiring')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
