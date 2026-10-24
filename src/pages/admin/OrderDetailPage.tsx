import { ArrowLeft, ExternalLink, FlaskConical, KeyRound, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, LoadingState, OrderEnvironmentBadge, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { formatAdminDate, orderTone } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { formatMoney } from '../../config'
import { dismissTestOrder, updateOrderStatus } from '../../lib/data'
import type { OrderStatus } from '../../types'

export function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dismissOpen, setDismissOpen] = useState(false)
  const { orders, accounts, loading, busy, runAction } = useAdminData()
  if (loading) return <LoadingState label="Loading order…" />
  const order = orders.find((item) => item.id === id)
  if (!order) return <EmptyState title="Order not found" description="It may have been removed or the link is no longer valid." action={<Link className="button secondary" to="/admin/orders"><ArrowLeft /> Back to orders</Link>} />
  const account = accounts.find((item) => item.uid === order.userId)
  const allowed: OrderStatus[] = order.status === 'paid' ? ['fulfilled', 'cancelled'] : order.status === 'fulfilled' ? ['paid'] : []
  const isTestOrder = order.paymentEnvironment !== 'live'
  const confirmDismiss = async () => {
    const success = await runAction(`dismiss-order-${order.id}`, async () => { await dismissTestOrder(order.id) }, 'Test order dismissed.')
    if (success) navigate('/admin/orders', { replace: true })
  }
  return <>
    <PageMeta title={`Order ${order.id} — Admin`} description="Review order and fulfilment details." />
    <AdminPageHeader title={`Order #${order.id}`} description={`Created ${formatAdminDate(order.createdAt)}.`} breadcrumbs={[{ label: 'Orders', to: '/admin/orders' }, { label: `#${order.id}` }]} actions={<div className="admin-order-header-badges"><OrderEnvironmentBadge environment={order.paymentEnvironment} /><StatusBadge tone={orderTone(order.status)}>{order.status.replace('_', ' ')}</StatusBadge></div>} />
    {isTestOrder && <div className="admin-test-order-banner" role="note"><FlaskConical aria-hidden="true" /><div><strong>Sandbox test order</strong><p>No real money was processed. This order is excluded from live revenue and can be dismissed when testing is complete.</p></div></div>}
    <div className="admin-detail-grid"><div className="admin-editor-main"><AdminPanel title="Items" description={`${order.items.length} line item${order.items.length === 1 ? '' : 's'}.`}><div className="admin-order-items">{order.items.map((item, index) => <div key={`${item.productId}-${index}`}><span><strong>{item.name}</strong><small>{item.quantity} × {formatMoney(item.unitPriceCents, order.currency)}</small></span><strong>{formatMoney(item.lineTotalCents, order.currency)}</strong></div>)}</div><dl className="admin-totals"><div><dt>Subtotal</dt><dd>{formatMoney(order.subtotalCents, order.currency)}</dd></div><div><dt>Shipping</dt><dd>{formatMoney(order.shippingCents, order.currency)}</dd></div><div><dt>Total</dt><dd>{formatMoney(order.totalCents, order.currency)}</dd></div></dl></AdminPanel>
        <AdminPanel title="Order record" description="Commercial totals and item snapshots are immutable from the browser."><dl className="admin-detail-list"><div><dt>Order reference</dt><dd>{order.id}</dd></div><div><dt>Customer ID</dt><dd>{order.userId}</dd></div><div><dt>Currency</dt><dd>{order.currency}</dd></div><div><dt>Created</dt><dd>{formatAdminDate(order.createdAt)}</dd></div></dl></AdminPanel></div>
      <aside className="admin-editor-aside"><AdminPanel title="Fulfilment"><div className="admin-form-stack"><div className="admin-publish-summary"><StatusBadge tone={orderTone(order.status)}>{order.status.replace('_', ' ')}</StatusBadge><p>{allowed.length ? 'Choose an allowed status transition below.' : 'This order has no browser-managed status transitions.'}</p></div>{allowed.map((nextStatus) => <button className={nextStatus === 'cancelled' ? 'button secondary danger' : 'button primary'} disabled={busy === `order-${order.id}`} key={nextStatus} onClick={() => void runAction(`order-${order.id}`, () => updateOrderStatus(order.id, nextStatus as 'paid' | 'fulfilled' | 'cancelled'), `Order marked ${nextStatus}.`)}>Mark {nextStatus}</button>)}</div></AdminPanel>
        <AdminPanel title="Treasury codes" description="Prepare the physical card codes included while packing this order."><div className="admin-form-stack"><p className="admin-help">Choose the actual cards being packed; a product or pack does not automatically identify the card inside.</p><Link className="button secondary" to={`/admin/treasury?order=${encodeURIComponent(order.id)}`}><KeyRound aria-hidden="true" /> Prepare card codes</Link></div></AdminPanel>
        {isTestOrder && <AdminPanel title="Sandbox cleanup" description="Available only for test orders."><div className="admin-danger-zone"><p className="admin-help">Dismiss this test after reviewing the checkout flow. It will disappear from the customer account and administrator dashboard.</p><button className="button secondary danger" disabled={busy === `dismiss-order-${order.id}`} onClick={() => setDismissOpen(true)}><Trash2 aria-hidden="true" /> Dismiss test order</button></div></AdminPanel>}
        <AdminPanel title="Customer"><div className="admin-customer-summary"><strong>{account?.displayName || 'Customer account'}</strong><span>{account?.email || order.userId}</span>{account && <Link className="text-button" to={`/admin/customers/${encodeURIComponent(account.uid)}`}>View customer <ExternalLink /></Link>}</div></AdminPanel></aside></div>
    <ConfirmDialog open={dismissOpen} title="Dismiss this sandbox order?" description="This permanently removes the test order from the storefront, customer account and administrator dashboard. Any reserved or committed test inventory is restored. Live orders cannot be dismissed." confirmLabel="Dismiss test order" busy={busy === `dismiss-order-${order.id}`} onCancel={() => setDismissOpen(false)} onConfirm={() => void confirmDismiss()} />
  </>
}
