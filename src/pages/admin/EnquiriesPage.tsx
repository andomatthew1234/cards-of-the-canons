import { ArrowRight, Inbox } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, SearchField, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { formatAdminDate, truncate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import type { Enquiry } from '../../types'

export function EnquiriesPage() {
  const { enquiries, loading, errors, refresh } = useAdminData()
  const error = errors.enquiries
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const status = (searchParams.get('status') || 'all') as 'all' | Enquiry['status']
  const kind = (searchParams.get('kind') || 'all') as 'all' | Enquiry['kind']
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(searchParams); value === 'all' ? next.delete(key) : next.set(key, value); setSearchParams(next, { replace: true }) }
  const filtered = enquiries.filter((item) => {
    const term = search.trim().toLowerCase()
    return (!term || `${item.name} ${item.email} ${item.message} ${item.organisation ?? ''}`.toLowerCase().includes(term)) && (status === 'all' || item.status === status) && (kind === 'all' || item.kind === kind)
  })
  if (loading) return <LoadingState label="Loading enquiries…" />
  return <>
    <PageMeta title="Enquiries — Admin" description="Manage general enquiries and quote requests." />
    <AdminPageHeader eyebrow="Customers" title="Enquiries" description="A central inbox for general messages and quote requests." />
    {error && <ErrorState message={error} onRetry={() => void refresh()} />}
    <AdminPanel className="admin-list-card"><div className="admin-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search sender or message…" label="Search enquiries" /><div className="admin-filters"><select aria-label="Filter enquiries by type" value={kind} onChange={(event) => setFilter('kind', event.target.value)}><option value="all">All types</option><option value="general">General</option><option value="quote">Quote request</option></select><select aria-label="Filter enquiries by status" value={status} onChange={(event) => setFilter('status', event.target.value)}><option value="all">All statuses</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></div></div>
      {filtered.length ? <div className="admin-inbox-list">{filtered.map((item) => <Link to={`/admin/enquiries/${encodeURIComponent(item.id ?? '')}`} className={item.status === 'new' ? 'unread' : ''} key={item.id}><span className="admin-inbox-sender"><strong>{item.name}</strong><small>{item.email}</small></span><span className="admin-inbox-preview"><strong>{item.kind === 'quote' ? 'Quote request' : 'General enquiry'}</strong><small>{truncate(item.message, 120)}</small></span><span className="admin-inbox-meta"><StatusBadge tone={item.status === 'new' ? 'warning' : item.status === 'resolved' ? 'positive' : 'info'}>{item.status.replace('_', ' ')}</StatusBadge><small>{formatAdminDate(item.createdAt)}</small></span><ArrowRight aria-hidden="true" /></Link>)}</div> : <EmptyState icon={<Inbox />} title={enquiries.length ? 'No matching enquiries' : 'Inbox is clear'} description={enquiries.length ? 'Try a different search or filter.' : 'Submitted enquiries will appear here. No example messages have been created.'} />}
      <footer className="admin-list-footer">Showing {filtered.length} of {enquiries.length} enquiries</footer>
    </AdminPanel>
  </>
}
