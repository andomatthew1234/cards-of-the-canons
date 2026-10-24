import { describe, expect, it } from 'vitest'
import { circularWindow, wrapIndex } from './carousel'

describe('circular carousel helpers', () => {
  it('wraps one step in either direction', () => {
    expect(wrapIndex(4, 4)).toBe(0)
    expect(wrapIndex(-1, 4)).toBe(3)
  })

  it('moves a multi-card window one product at a time across the end', () => {
    const products = ['one', 'two', 'three', 'four']
    expect(circularWindow(products, 0, 3)).toEqual(['one', 'two', 'three'])
    expect(circularWindow(products, 1, 3)).toEqual(['two', 'three', 'four'])
    expect(circularWindow(products, 3, 3)).toEqual(['four', 'one', 'two'])
  })
})
