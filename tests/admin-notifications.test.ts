import { describe, expect, it } from 'vitest'
import { buildAdminNotifications, notificationCount } from '../src/admin/notifications'
import type { Enquiry, Order, Product } from '../src/types'

const paidOrder: Order = {
  id: 'co_paid', userId: 'customer-1', status: 'paid', currency: 'AUD', subtotalCents: 3200, shippingCents: 0, totalCents: 3200, items: [], createdAt: '2026-10-03T01:00:00Z',
}

const newEnquiry: Enquiry = {
  id: 'enquiry-1', kind: 'general', name: 'Customer', email: 'customer@example.com', message: 'Please help.', consent: true, status: 'new', createdAt: '2026-10-03T02:00:00Z',
}

const lowStockProduct: Product = {
  id: 'product-1', slug: 'product-one', name: 'Product One', shortDescription: 'Short description', description: 'Description', priceCents: 1200, currency: 'AUD', imageUrl: '/placeholder.svg', imageAlt: '', category: 'Cards', featured: false, stock: 3, treasuryCardsPerUnit: 1, status: 'published',
}

describe('administrator notifications', () => {
  it('groups actionable store records and links to their detail screens', () => {
    const groups = buildAdminNotifications({ orders: [paidOrder], enquiries: [newEnquiry], products: [lowStockProduct] })
    expect(notificationCount(groups)).toBe(3)
    expect(groups.find((group) => group.key === 'orders')?.items[0]).toMatchObject({ to: '/admin/orders/co_paid', tone: 'warning' })
    expect(groups.find((group) => group.key === 'enquiries')?.items[0]).toMatchObject({ to: '/admin/enquiries/enquiry-1', meta: 'New message' })
    expect(groups.find((group) => group.key === 'inventory')?.items[0]).toMatchObject({ to: '/admin/products/product-1', meta: '3 remaining' })
  })

  it('does not treat completed or resolved work as an active notification', () => {
    const groups = buildAdminNotifications({ orders: [{ ...paidOrder, status: 'fulfilled' }], enquiries: [{ ...newEnquiry, status: 'resolved' }], products: [{ ...lowStockProduct, stock: null }] })
    expect(notificationCount(groups)).toBe(0)
    expect(groups.every((group) => group.items.length === 0)).toBe(true)
  })
})
