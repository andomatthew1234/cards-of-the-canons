import type { Enquiry, Order, Product } from '../types'

export type AdminNotificationTone = 'danger' | 'warning' | 'info' | 'neutral'
export type AdminNotificationGroupKey = 'orders' | 'enquiries' | 'inventory' | 'publishing'

export interface AdminNotificationItem {
  id: string
  title: string
  description: string
  meta: string
  to: string
  tone: AdminNotificationTone
  paymentEnvironment?: 'test' | 'live'
  createdAt?: unknown
}

export interface AdminNotificationGroup {
  key: AdminNotificationGroupKey
  title: string
  description: string
  emptyMessage: string
  items: AdminNotificationItem[]
}

export function buildAdminNotifications({ orders, enquiries, products }: { orders: Order[]; enquiries: Enquiry[]; products: Product[] }): AdminNotificationGroup[] {
  const orderItems = orders.flatMap<AdminNotificationItem>((order) => {
    const to = `/admin/orders/${encodeURIComponent(order.id)}`
    if (order.status === 'paid') return [{ id: `fulfil-${order.id}`, title: `Order ${order.id} is ready to fulfil`, description: 'Payment is confirmed and this order is waiting to be packed and fulfilled.', meta: 'Awaiting fulfilment', to, tone: 'warning', paymentEnvironment: order.paymentEnvironment, createdAt: order.createdAt }]
    if (order.status === 'payment_review') return [{ id: `review-${order.id}`, title: `Order ${order.id} needs payment review`, description: 'Stripe has marked this payment for review before fulfilment.', meta: 'Payment review', to, tone: 'danger', paymentEnvironment: order.paymentEnvironment, createdAt: order.createdAt }]
    if (order.status === 'payment_failed' || order.status === 'checkout_failed') return [{ id: `failed-${order.id}`, title: `Order ${order.id} did not complete`, description: 'The payment or checkout attempt failed. Open the order to review its recorded status.', meta: order.status === 'payment_failed' ? 'Payment failed' : 'Checkout failed', to, tone: 'info', paymentEnvironment: order.paymentEnvironment, createdAt: order.createdAt }]
    return []
  })

  const enquiryItems = enquiries.flatMap<AdminNotificationItem>((enquiry) => {
    if (enquiry.status === 'resolved') return []
    const id = enquiry.id ?? `${enquiry.email}-${String(enquiry.createdAt ?? '')}`
    return [{
      id: `enquiry-${id}`,
      title: `${enquiry.kind === 'quote' ? 'Quote request' : 'Enquiry'} from ${enquiry.name}`,
      description: enquiry.status === 'new' ? 'This message has not been reviewed yet.' : 'A response or follow-up is still in progress.',
      meta: enquiry.status === 'new' ? 'New message' : 'In progress',
      to: `/admin/enquiries/${encodeURIComponent(enquiry.id ?? '')}`,
      tone: enquiry.status === 'new' ? 'warning' : 'info',
      createdAt: enquiry.createdAt,
    }]
  })

  const inventoryItems = products.flatMap<AdminNotificationItem>((product) => {
    if (product.status !== 'published' || product.stock === null || product.stock > 5) return []
    const outOfStock = product.stock === 0
    return [{
      id: `stock-${product.id}`,
      title: outOfStock ? `${product.name} is out of stock` : `${product.name} is low in stock`,
      description: outOfStock ? 'This published product has no stock recorded as available.' : `Only ${product.stock} unit${product.stock === 1 ? '' : 's'} remain in the recorded stock level.`,
      meta: outOfStock ? 'Out of stock' : `${product.stock} remaining`,
      to: `/admin/products/${encodeURIComponent(product.id)}`,
      tone: outOfStock ? 'danger' : 'warning',
    }]
  })

  const publishingItems: AdminNotificationItem[] = products.filter((product) => product.status === 'draft').map((product) => ({
    id: `draft-${product.id}`,
    title: `${product.name} remains in draft`,
    description: 'This product is saved but is not visible in the public shop.',
    meta: 'Draft product',
    to: `/admin/products/${encodeURIComponent(product.id)}`,
    tone: 'neutral',
  }))

  return [
    { key: 'orders', title: 'Orders and payments', description: 'Fulfilment and payment states that require review.', emptyMessage: 'No orders currently require attention.', items: orderItems },
    { key: 'enquiries', title: 'Customer enquiries', description: 'Unread messages and conversations still in progress.', emptyMessage: 'There are no unresolved enquiries.', items: enquiryItems },
    { key: 'inventory', title: 'Inventory', description: 'Published products with low or unavailable recorded stock.', emptyMessage: 'No published products have a low-stock warning.', items: inventoryItems },
    { key: 'publishing', title: 'Publishing', description: 'Catalogue items that remain in draft status.', emptyMessage: 'There are no draft products waiting for review.', items: publishingItems },
  ]
}

export function notificationCount(groups: AdminNotificationGroup[]) {
  return groups.reduce((total, group) => total + group.items.length, 0)
}
