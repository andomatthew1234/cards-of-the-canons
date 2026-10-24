import { describe, expect, it } from 'vitest'
import { demoProducts } from '../data/demo'
import { HOME_PRODUCT_SLUGS, orderHomeProducts } from './homeProducts'

describe('homepage product merchandising', () => {
  it('uses the requested eight-product order regardless of source order', () => {
    const shuffled = [...demoProducts].reverse()
    expect(orderHomeProducts(shuffled).map((product) => product.slug)).toEqual([...HOME_PRODUCT_SLUGS])
  })

  it('omits missing and unrelated products without duplicating cards', () => {
    const products = [...demoProducts, { ...demoProducts[0], id: 'unrelated', slug: 'unrelated' }]
      .filter((product) => product.slug !== 'doxa-cap')
    const result = orderHomeProducts(products)
    expect(result.some((product) => product.slug === 'doxa-cap')).toBe(false)
    expect(result.some((product) => product.slug === 'unrelated')).toBe(false)
    expect(new Set(result.map((product) => product.slug)).size).toBe(result.length)
  })
})
