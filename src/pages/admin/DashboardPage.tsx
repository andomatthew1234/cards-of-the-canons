import { AlertCircle, ArrowRight, BookOpenText, Inbox, Mail, Package, Plus, ShoppingBag, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, OrderEnvironmentBadge, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { buildAdminNotifications, notificationCount } from '../../admin/notifications'
import { dateValue, formatAdminDate, truncate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { formatMoney } from '../../config'

export function DashboardPage() {
  const { products, orders, accounts, enquiries, subscribers, loading, error, refresh } = useAdminData()
  if (loading) return <LoadingState label="Loading dashboard…" />
  const revenue = orders.filter((order) => order.paymentEnvironment === 'live' && (order.status === 'paid' || order.status === 'fulfilled')).reduce((sum, order) => sum + order.totalCents, 0)
  const recentOrders = [...orders].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)).slice(0, 5)
  const recentEnquiries = [...enquiries].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)).slice(0, 5)
  const notificationGroups = buildAdminNotifications({ products, orders, enquiries })
  const attention = notificationCount(notificationGroups)
  const attentionSummary = notificationGroups.filter((group) => group.items.length).map((group) => `${group.items.length} ${group.title.toLowerCase()}`).join(' · ')
  const stats = [
    { label: 'Products', value: products.length, to: '/admin/products', icon: Package },
    { label: 'Orders', value: orders.length, to: '/admin/orders', icon: ShoppingBag },
    { label: 'Customers', value: accounts.length, to: '/admin/customers', icon: Users },
    { label: 'Enquiries', value: enquiries.length, to: '/admin/enquiries', icon: Inbox },
    { label: 'Subscribers', value: subscribers.length, to: '/admin/mailing-list', icon: Mail },
    { label: 'Journal', value: 'Write', to: '/admin/journal', icon: BookOpenText },
  ]
  return <>
    <PageMeta title="Admin dashboard" description="Doxa store overview." />
    <AdminPageHeader eyebrow="Overview" title="Dashboard" description="A concise overview of the store, customers and items requiring attention." actions={<div className="admin-page-actions"><Link className="button secondary" to="/admin/journal/new"><BookOpenText /> Write Journal entry</Link><Link className="button primary" to="/admin/products/new"><Plus /> Add product</Link></div>} />
    {error && <ErrorState message={error} onRetry={() => void refresh()} />}
    <section className="admin-stat-grid">{stats.map(({ label, value, to, icon: Icon }) => <Link to={to} className="admin-stat" key={label}><span><Icon aria-hidden="true" />{label}</span><strong>{value}</strong><ArrowRight aria-hidden="true" /></Link>)}<Link to="/admin/orders" className="admin-stat featured"><span><ShoppingBag aria-hidden="true" />Live revenue</span><strong>{formatMoney(revenue)}</strong><small>Paid and fulfilled live orders only</small></Link></section>
    {attention > 0 && <Link className="admin-attention" to="/admin/notifications"><span className="admin-attention-icon"><AlertCircle aria-hidden="true" /></span><span className="admin-attention-copy"><strong>{attention} item{attention === 1 ? '' : 's'} require{attention === 1 ? 's' : ''} attention</strong><small>{attentionSummary}</small></span><span className="admin-attention-action">Review notifications <ArrowRight aria-hidden="true" /></span></Link>}
    <div className="admin-dashboard-grid">
      <AdminPanel title="Recent orders" description="The latest customer orders." action={<Link className="text-button" to="/admin/orders">View all <ArrowRight /></Link>}>
        {recentOrders.length ? <div className="admin-compact-list">{recentOrders.map((order) => <Link to={`/admin/orders/${encodeURIComponent(order.id)}`} key={order.id}><span><strong>Order {order.id}</strong><small>{formatAdminDate(order.createdAt)}</small></span><span><OrderEnvironmentBadge environment={order.paymentEnvironment} /><StatusBadge tone={order.status === 'paid' || order.status === 'fulfilled' ? 'positive' : order.status === 'payment_failed' || order.status === 'cancelled' ? 'danger' : 'warning'}>{order.status.replace('_', ' ')}</StatusBadge><strong>{formatMoney(order.totalCents)}</strong></span></Link>)}</div> : <EmptyState title="No orders yet" description="Orders will appear here after the trusted checkout flow creates them." />}
      </AdminPanel>
      <AdminPanel title="Recent enquiries" description="New messages and quote requests." action={<Link className="text-button" to="/admin/enquiries">Open inbox <ArrowRight /></Link>}>
        {recentEnquiries.length ? <div className="admin-compact-list">{recentEnquiries.map((item) => <Link to={`/admin/enquiries/${encodeURIComponent(item.id ?? '')}`} key={item.id}><span><strong>{item.name}</strong><small>{truncate(item.message)}</small></span><span><StatusBadge tone={item.status === 'new' ? 'warning' : item.status === 'resolved' ? 'positive' : 'info'}>{item.status.replace('_', ' ')}</StatusBadge><small>{formatAdminDate(item.createdAt)}</small></span></Link>)}</div> : <EmptyState title="Inbox is clear" description="Submitted enquiries will appear here." />}
      </AdminPanel>
    </div>
  </>
}
