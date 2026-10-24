import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock3, Mail, RefreshCw, Search, Send, TimerReset, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { formatAdminDate } from '../../../admin/utils'
import type { EmailQueueItem, EmailQueueStatus } from '../../../types'

type QueueKind = EmailQueueItem['kind']
type QueueSort = 'newest' | 'oldest' | 'subject' | 'status'

export interface EmailQueueDashboardProps {
  items: EmailQueueItem[]
  workingId?: string
  onCancel: (item: EmailQueueItem) => void
  onRetry: (item: EmailQueueItem) => void
}

const statusLabel: Record<EmailQueueStatus, string> = {
  draft: 'Draft', scheduled: 'Scheduled', preparing: 'Sending', queued: 'Accepted by provider', sent: 'Sent to provider',
  delivered: 'Delivered', partially_sent: 'Partially sent', failed: 'Failed', cancelled: 'Cancelled',
}

const kindLabel: Record<QueueKind, string> = {
  campaign: 'Campaign', journal: 'Journal release', newsletter: 'Newsletter', test: 'Test email', transactional: 'Website email',
}

function queueTone(status: EmailQueueStatus) {
  if (status === 'delivered') return 'positive'
  if (status === 'queued' || status === 'sent') return 'info'
  if (status === 'scheduled' || status === 'preparing') return 'warning'
  if (status === 'failed' || status === 'partially_sent') return 'danger'
  return 'neutral'
}

function eventTime(item: EmailQueueItem) {
  return item.scheduledAt ?? item.sentAt ?? item.updatedAt ?? item.createdAt
}

function timeValue(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function DeliveryBar({ item }: { item: EmailQueueItem }) {
  const total = Math.max(item.recipientCount, item.acceptedCount + item.failedCount, 1)
  const acceptedWidth = Math.min(100, (item.acceptedCount / total) * 100)
  const deliveredWidth = Math.min(acceptedWidth, (item.deliveredCount / total) * 100)
  const failedWidth = Math.min(100, (item.failedCount / total) * 100)
  return <div className="email-ops-delivery" aria-label={`${item.acceptedCount} accepted, ${item.deliveredCount} delivered, ${item.failedCount} failed`}>
    <span className="email-ops-delivery-track"><i className="accepted" style={{ width: `${acceptedWidth}%` }} /><i className="delivered" style={{ width: `${deliveredWidth}%` }} /><i className="failed" style={{ width: `${failedWidth}%` }} /></span>
    <small>{item.acceptedCount} accepted · {item.deliveredCount} delivered · {item.failedCount} failed</small>
  </div>
}

export function EmailQueueDashboard({ items, workingId = '', onCancel, onRetry }: EmailQueueDashboardProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | EmailQueueStatus>('all')
  const [kind, setKind] = useState<'all' | QueueKind>('all')
  const [sort, setSort] = useState<QueueSort>('newest')
  const [expanded, setExpanded] = useState('')

  const counts = useMemo(() => ({
    waiting: items.filter((item) => item.status === 'scheduled').length,
    sending: items.filter((item) => item.status === 'preparing').length,
    accepted: items.reduce((sum, item) => sum + item.acceptedCount, 0),
    delivered: items.reduce((sum, item) => sum + item.deliveredCount, 0),
    attention: items.filter((item) => ['failed', 'partially_sent'].includes(item.status)).length,
  }), [items])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => kind === 'all' || item.kind === kind)
      .filter((item) => !query || `${item.subject} ${item.recipientLabel} ${item.providerMessageId ?? ''} ${item.kind}`.toLowerCase().includes(query))
      .sort((left, right) => {
        if (sort === 'oldest') return timeValue(eventTime(left)) - timeValue(eventTime(right))
        if (sort === 'subject') return left.subject.localeCompare(right.subject)
        if (sort === 'status') return statusLabel[left.status].localeCompare(statusLabel[right.status])
        return timeValue(eventTime(right)) - timeValue(eventTime(left))
      })
  }, [items, kind, search, sort, status])

  const filtersActive = Boolean(search || status !== 'all' || kind !== 'all' || sort !== 'newest')
  const clearFilters = () => { setSearch(''); setStatus('all'); setKind('all'); setSort('newest') }

  return <section className="email-ops" aria-labelledby="email-ops-title">
    <header className="email-ops-heading"><div><p className="campaign-dashboard-kicker">Delivery operations</p><h2 id="email-ops-title">Email queue</h2><p>Provider acceptance and confirmed delivery are deliberately shown as separate events.</p></div><span className="email-ops-live"><i /> Live delivery ledger</span></header>

    <div className="email-ops-kpis" aria-label="Email delivery summary">
      <article><CalendarClock /><span><strong>{counts.waiting}</strong>Scheduled</span></article>
      <article><TimerReset /><span><strong>{counts.sending}</strong>Sending</span></article>
      <article><Send /><span><strong>{counts.accepted.toLocaleString('en-AU')}</strong>Provider accepted</span></article>
      <article><CheckCircle2 /><span><strong>{counts.delivered.toLocaleString('en-AU')}</strong>Confirmed delivered</span></article>
      <article className={counts.attention ? 'needs-attention' : ''}><AlertTriangle /><span><strong>{counts.attention}</strong>Needs attention</span></article>
    </div>

    <div className="email-ops-toolbar">
      <label className="email-ops-search"><span className="sr-only">Search email queue</span><Search /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subject, audience or provider ID…" /></label>
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">All email types</option>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as QueueSort)}><option value="newest">Newest event</option><option value="oldest">Oldest event</option><option value="subject">Subject</option><option value="status">Status</option></select></label>
      {filtersActive && <button className="campaign-dashboard-clear" onClick={clearFilters}>Clear</button>}
    </div>

    {filtered.length ? <div className="email-ops-table-wrap"><table className="email-ops-table">
      <thead><tr><th>Email</th><th>Audience</th><th>Delivery</th><th>Status</th><th>Activity</th><th><span className="sr-only">Details</span></th></tr></thead>
      <tbody>{filtered.map((item) => {
        const isExpanded = expanded === item.id
        const detailsId = `email-queue-details-${item.id.replace(/[^A-Za-z0-9_-]/g, '-')}`
        return <Fragment key={item.id}>
          <tr className={isExpanded ? 'expanded' : ''}>
            <td data-label="Email"><span className="email-ops-subject"><span className="email-ops-kind-icon"><Mail /></span><span><strong>{item.subject}</strong><small>{kindLabel[item.kind]}</small></span></span></td>
            <td data-label="Audience"><strong>{item.recipientLabel}</strong><small>{item.recipientCount ? `${item.recipientCount.toLocaleString('en-AU')} recipients` : 'Audience resolves at send time'}</small></td>
            <td data-label="Delivery"><DeliveryBar item={item} /></td>
            <td data-label="Status"><span className={`campaign-status ${queueTone(item.status)}`}>{statusLabel[item.status]}</span></td>
            <td data-label="Activity"><strong>{formatAdminDate(eventTime(item))}</strong>{item.scheduledAt && <small>Scheduled send</small>}</td>
            <td><button className="email-ops-expand" aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => setExpanded(isExpanded ? '' : item.id)}><span className="sr-only">{isExpanded ? 'Hide' : 'Show'} details for {item.subject}</span><ChevronDown /></button></td>
          </tr>
          {isExpanded && <tr className="email-ops-detail-row"><td colSpan={6}><div id={detailsId} className="email-ops-detail">
            <div className="email-ops-detail-summary"><span className={`campaign-status ${queueTone(item.status)}`}>{statusLabel[item.status]}</span><h3>{item.subject}</h3><p>{item.lastError || 'No delivery error has been recorded for this email.'}</p></div>
            <dl>
              <div><dt>Provider reference</dt><dd>{item.providerMessageId || 'Not assigned yet'}</dd></div>
              <div><dt>Source record</dt><dd>{item.sourceId || 'Website generated'}</dd></div>
              <div><dt>Created</dt><dd>{formatAdminDate(item.createdAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{formatAdminDate(item.updatedAt)}</dd></div>
              <div><dt>Sent</dt><dd>{item.sentAt ? formatAdminDate(item.sentAt) : 'Not sent yet'}</dd></div>
              <div><dt>Recipients</dt><dd>{item.recipientCount.toLocaleString('en-AU')}</dd></div>
            </dl>
            <div className="email-ops-timeline" aria-label="Delivery timeline">
              <span className="complete"><Clock3 /><b>Recorded</b><small>{formatAdminDate(item.createdAt)}</small></span>
              <span className={item.acceptedCount || ['queued', 'sent', 'delivered'].includes(item.status) ? 'complete' : ''}><Send /><b>Provider accepted</b><small>{item.acceptedCount ? `${item.acceptedCount} accepted` : 'Awaiting acceptance'}</small></span>
              <span className={item.deliveredCount || item.status === 'delivered' ? 'complete' : ''}><CheckCircle2 /><b>Delivered</b><small>{item.deliveredCount ? `${item.deliveredCount} confirmed` : 'No delivery confirmation yet'}</small></span>
            </div>
            <div className="email-ops-detail-actions">
              {item.kind === 'campaign' && item.status === 'scheduled' && <button disabled={workingId === item.id} onClick={() => onCancel(item)}><X /> Cancel scheduled send</button>}
              {item.kind === 'campaign' && (item.status === 'failed' || item.status === 'partially_sent') && <button disabled={workingId === item.id} onClick={() => onRetry(item)}><RefreshCw /> Retry safely</button>}
            </div>
          </div></td></tr>}
        </Fragment>
      })}</tbody>
    </table></div> : <div className="campaign-dashboard-empty"><Mail /><h3>{items.length ? 'No emails match these filters' : 'No email activity yet'}</h3><p>{items.length ? 'Clear a filter or search for a different recipient or subject.' : 'Scheduled, sent and website-generated emails will appear here.'}</p>{items.length && <button onClick={clearFilters}>Clear filters</button>}</div>}
    <footer className="campaign-dashboard-count">Showing {filtered.length} of {items.length} email records</footer>
  </section>
}
