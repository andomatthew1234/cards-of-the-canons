import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, ClipboardList, Inbox, PackageSearch, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAdminData } from '../../admin/AdminContext'
import { AdminPageHeader, ErrorState, LoadingState, OrderEnvironmentBadge, StatusBadge } from '../../admin/components'
import { buildAdminNotifications, notificationCount, type AdminNotificationGroupKey } from '../../admin/notifications'
import { formatAdminDate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'

const groupIcons = {
  orders: ShoppingBag,
  enquiries: Inbox,
  inventory: PackageSearch,
  publishing: ClipboardList,
} satisfies Record<AdminNotificationGroupKey, typeof ShoppingBag>

export function NotificationsPage() {
  const { products, orders, enquiries, loading, errors, refresh } = useAdminData()
  const error = errors.products || errors.orders || errors.enquiries
  if (loading) return <LoadingState label="Loading notifications…" />
  const groups = buildAdminNotifications({ products, orders, enquiries })
  const total = notificationCount(groups)
  const urgent = groups.flatMap((group) => group.items).filter((item) => item.tone === 'danger').length
  const action = groups.flatMap((group) => group.items).filter((item) => item.tone === 'warning').length
  const review = total - urgent - action

  return <>
    <PageMeta title="Notifications — Admin" description="A structured overview of store activity that may require attention." />
    <AdminPageHeader eyebrow="Overview" title="Notifications" description="A consolidated view of orders, enquiries, inventory and publishing items that may require attention." />
    {error && <ErrorState message={error} onRetry={() => void refresh()} />}
    <section className="admin-notification-summary" aria-label="Notification summary">
      <div className="admin-notification-summary-card"><CircleAlert aria-hidden="true" /><span><small>Total</small><strong>{total}</strong></span><p>Items across the store</p></div>
      <div className="admin-notification-summary-card danger"><AlertTriangle aria-hidden="true" /><span><small>Urgent</small><strong>{urgent}</strong></span><p>Out-of-stock items or payments requiring review</p></div>
      <div className="admin-notification-summary-card warning"><CircleAlert aria-hidden="true" /><span><small>Action required</small><strong>{action}</strong></span><p>New messages, fulfilment tasks or low stock</p></div>
      <div className="admin-notification-summary-card info"><ClipboardList aria-hidden="true" /><span><small>For review</small><strong>{review}</strong></span><p>Ongoing, failed or draft items</p></div>
    </section>
    {total === 0 && <div className="admin-notifications-clear" role="status"><CheckCircle2 aria-hidden="true" /><div><h2>Everything is up to date</h2><p>There are no current notifications across orders, enquiries, inventory or publishing.</p></div></div>}
    <div className="admin-notification-groups">
      {groups.map((group) => {
        const Icon = groupIcons[group.key]
        return <section className="admin-card admin-notification-group" key={group.key}>
          <header className="admin-card-header"><div className="admin-notification-group-heading"><span className="admin-notification-group-icon"><Icon aria-hidden="true" /></span><div><h2>{group.title}</h2><p>{group.description}</p></div></div><span className="admin-notification-count" aria-label={`${group.items.length} notifications`}>{group.items.length}</span></header>
          {group.items.length ? <div className="admin-notification-list">{group.items.map((item) => <Link to={item.to} className={item.paymentEnvironment === 'test' ? 'admin-test-order-row' : ''} key={item.id}><span className={`admin-notification-marker ${item.tone}`} aria-hidden="true" /><span className="admin-notification-copy"><strong>{item.title}</strong><small>{item.description}</small></span><span className="admin-notification-meta">{item.paymentEnvironment && <OrderEnvironmentBadge environment={item.paymentEnvironment} />}<StatusBadge tone={item.tone}>{item.meta}</StatusBadge>{item.createdAt ? <small>{formatAdminDate(item.createdAt)}</small> : null}</span><ArrowRight aria-hidden="true" /></Link>)}</div> : <div className="admin-notification-empty"><CheckCircle2 aria-hidden="true" /><span>{group.emptyMessage}</span></div>}
        </section>
      })}
    </div>
  </>
}
