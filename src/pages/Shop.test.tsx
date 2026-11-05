import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { demoProducts } from '../data/demo'
import { groupShopProducts, Shop } from './Shop'

vi.mock('../context/CartContext', () => ({
  useCart: () => ({ count: 0, lines: [], add: vi.fn(), update: vi.fn() }),
}))

describe('public Shop collections', () => {
  it('groups the catalogue into accessible horizontal product rails without sorting controls', () => {
    render(<MemoryRouter><Shop /></MemoryRouter>)

    const cardPacks = screen.getByRole('region', { name: 'Card packs' })
    const accessories = screen.getByRole('region', { name: 'Doxa accessories' })

    expect(within(cardPacks).getByRole('heading', { name: 'Individual Card Pack' })).toBeInTheDocument()
    expect(within(cardPacks).getByRole('heading', { name: 'Card Collecting Binder' })).toBeInTheDocument()
    expect(within(accessories).queryByRole('heading', { name: 'Card Collecting Binder' })).not.toBeInTheDocument()
    expect(within(cardPacks).getByRole('button', { name: 'Scroll Card packs right' })).toBeInTheDocument()
    expect(within(accessories).getByRole('button', { name: 'Scroll Doxa accessories right' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sort/i })).not.toBeInTheDocument()
  })

  it('retains future published products once and never exposes drafts', () => {
    const futureProduct = { ...demoProducts[0], id: 'future-devotional', slug: 'future-devotional', name: 'Future Devotional', category: 'Future range' }
    const groups = groupShopProducts([...demoProducts, futureProduct])
    const visibleIds = [...groups.cardPacks, ...groups.accessories].map((product) => product.id)

    expect(visibleIds).toContain('future-devotional')
    expect(visibleIds).not.toContain('demo-future-merchandise')
    expect(new Set(visibleIds).size).toBe(visibleIds.length)
    expect(visibleIds).toHaveLength(demoProducts.filter((product) => product.status === 'published').length + 1)
  })

  it('uses the administrator storefront order inside each product rail', () => {
    const products = [
      { ...demoProducts[0], id: 'pack-last', name: 'Pack Last', sortOrder: 90 },
      { ...demoProducts[0], id: 'pack-first', name: 'Pack First', sortOrder: 5 },
      { ...demoProducts[5], id: 'accessory-last', name: 'Accessory Last', sortOrder: 80 },
      { ...demoProducts[5], id: 'accessory-first', name: 'Accessory First', sortOrder: 10 },
    ]
    const groups = groupShopProducts(products)
    expect(groups.cardPacks.map((product) => product.id)).toEqual(['pack-first', 'pack-last'])
    expect(groups.accessories.map((product) => product.id)).toEqual(['accessory-first', 'accessory-last'])
  })

  it('uses administrator-managed production categories when grouping products', () => {
    const products = [
      { ...demoProducts[0], id: 'collectible', name: 'Treasure Pack', slug: 'treasure-pack', category: 'Collectibles', treasuryCardsPerUnit: 1 },
      { ...demoProducts[0], id: 'binder', name: 'Card Collecting Binder', slug: 'card-collecting-binder', category: 'Accessories', treasuryCardsPerUnit: 0 },
      { ...demoProducts[0], id: 'bookmark', name: 'Bookmark', slug: 'bookmark', category: 'Accessories', treasuryCardsPerUnit: 0 },
    ]
    const groups = groupShopProducts(products)

    expect(groups.cardPacks.map((product) => product.id)).toEqual(['binder', 'collectible'])
    expect(groups.accessories.map((product) => product.id)).toEqual(['bookmark'])
  })

  it('advances the mobile rail by exactly one product per arrow press', () => {
    render(<MemoryRouter><Shop /></MemoryRouter>)

    const cardPacks = screen.getByRole('region', { name: 'Card packs' })
    const viewport = within(cardPacks).getByRole('group', { name: /Card packs products/ })
    const items = Array.from(viewport.querySelectorAll<HTMLElement>('.shop-product-rail-item'))

    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: Math.max(900, items.length * 300) },
    })
    items.forEach((item, index) => Object.defineProperty(item, 'offsetLeft', { configurable: true, value: index * 300 }))
    const scrollTo = vi.fn()
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo })
    fireEvent(window, new Event('resize'))

    fireEvent.click(within(cardPacks).getByRole('button', { name: 'Scroll Card packs right' }))

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 300 }))
  })
})
