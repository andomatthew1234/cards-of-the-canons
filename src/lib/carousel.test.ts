import { describe, expect, it } from 'vitest'
import { carouselTrackWindow, circularWindow, wrapIndex } from './carousel'

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

  it('keeps the outgoing cards mounted while adding one incoming slide', () => {
    const products = ['one', 'two', 'three', 'four']
    expect(carouselTrackWindow(products, 0, 3, 1)).toEqual(['one', 'two', 'three', 'four'])
    expect(carouselTrackWindow(products, 0, 3, -1)).toEqual(['four', 'one', 'two', 'three'])
    expect(carouselTrackWindow(products, 0, 3, null)).toEqual(['one', 'two', 'three'])
  })

  it('supplies a duplicate edge slide when every item is visible', () => {
    expect(carouselTrackWindow(['one', 'two', 'three'], 0, 3, 1)).toEqual([
      'one',
      'two',
      'three',
      'one',
    ])
  })
})
