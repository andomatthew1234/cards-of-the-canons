import { ArrowRight, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, OrderEnvironmentBadge, SearchField, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { formatAdminDate, orderTone } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { formatMoney } from '../../config'
import type { OrderStatus } from '../../types'

export function OrdersPage() {
  const { orders, accounts, loading, errors, refresh } = useAdminData()
  const error = errors.orders || errors.accounts
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const customer = (userId: string) => accounts.find((account) => account.uid === userId)
  const filtered = orders.filter((order) => {
    const account = customer(order.userId)
    const term = search.trim().toLowerCase()
    return (!term || `${order.id} ${order.userId} ${account?.email ?? ''} ${account?.displayName ?? ''}`.toLowerCase().includes(term)) && (status === 'all' || order.status === status)
  })
  if (loading) return <LoadingState label="Loading orders…" />
  return <>
    <PageMeta title="Orders — Admin" description="Manage customer orders and fulfilment." />
    <AdminPageHeader eyebrow="Commerce" title="Orders" description="Review order snapshots and manage the permitted fulfilment transitions." />
    {error && <ErrorState message={error} onRetry={() => void refresh()} />}
    <AdminPanel className="admin-list-card"><div className="admin-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search order or customer…" label="Search orders" /><div className="admin-filters"><select aria-label="Filter orders by status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="payment_review">Payment review</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option><option value="payment_failed">Payment failed</option><option value="checkout_failed">Checkout failed</option></select></div></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Order</th><th>Environment</th><th>Customer</th><th>Date</th><th>Payment / order</th><th>Fulfilment</th><th>Total</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filtered.map((order) => { const account = customer(order.userId); return <tr className={order.paymentEnvironment === 'test' ? 'admin-test-order-row' : ''} key={order.id}><td><Link className="admin-strong-link" to={`/admin/orders/${encodeURIComponent(order.id)}`}>#{order.id}</Link></td><td><OrderEnvironmentBadge environment={order.paymentEnvironment} /></td><td><span className="admin-cell-stack"><strong>{account?.displayName || account?.email || 'Customer'}</strong><small>{account?.email || order.userId}</small></span></td><td>{formatAdminDate(order.createdAt)}</td><td><StatusBadge tone={orderTone(order.status)}>{order.status.replace('_', ' ')}</StatusBadge></td><td>{order.status === 'fulfilled' ? <StatusBadge tone="positive">Fulfilled</StatusBadge> : order.status === 'paid' ? <StatusBadge tone="warning">Awaiting fulfilment</StatusBadge> : '—'}</td><td><strong>{formatMoney(order.totalCents, order.currency)}</strong></td><td><Link className="text-button" aria-label={`Open order ${order.id}`} to={`/admin/orders/${encodeURIComponent(order.id)}`}><ArrowRight /></Link></td></tr> })}</tbody></table></div> : <EmptyState icon={<ShoppingBag />} title={orders.length ? 'No matching orders' : 'No orders yet'} description={orders.length ? 'Try a different search or status filter.' : 'Orders will appear here after they are created by the trusted checkout and payment flow. No example orders have been fabricated.'} />}
      <footer className="admin-list-footer">Showing {filtered.length} of {orders.length} orders</footer>
    </AdminPanel>
  </>
}
