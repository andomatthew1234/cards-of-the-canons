import { ArrowRight, Download, Mail, Send, ShieldCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminData } from '../../admin/AdminContext'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, SearchField, StatusBadge } from '../../admin/components'
import { downloadCsv, formatAdminDate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { listNewsletterCampaigns, suppressNewsletterSubscriber } from '../../lib/data'
import type { NewsletterAdminOverview, NewsletterSubscriber } from '../../types'

export function MailingListPage() {
  const { subscribers, loading, errors, refresh, busy, runAction } = useAdminData()
  const [overview, setOverview] = useState<NewsletterAdminOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | NewsletterSubscriber['status']>('all')

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError('')
    try { setOverview(await listNewsletterCampaigns()) }
    catch (error) { setOverviewError(error instanceof Error ? error.message : 'Mailing-list totals could not be loaded.') }
    finally { setOverviewLoading(false) }
  }, [])

  useEffect(() => { void loadOverview() }, [loadOverview])

  const sourceLabel = (source: string) => ({
    account_registration: 'Account registration', account_settings: 'Account settings', home: 'Home page',
    footer: 'Website footer', checkout: 'Checkout', contact: 'Contact page',
  })[source] ?? source

  const filtered = useMemo(() => subscribers.filter((item) => {
    const matchesSearch = !search.trim() || `${item.email} ${item.source}`.toLowerCase().includes(search.trim().toLowerCase())
    return matchesSearch && (status === 'all' || item.status === status)
  }), [search, status, subscribers])

  const exportSubscribers = () => downloadCsv(
    `doxa-mailing-list-${new Date().toISOString().slice(0, 10)}.csv`,
    [['Email', 'Status', 'Consent', 'Source', 'Joined'], ...filtered.map((item) => [item.email, item.status, item.consent, sourceLabel(item.source), formatAdminDate(item.createdAt, '')])],
  )

  const subscriberError = errors.subscribers ?? ''
  const retry = () => { void refresh(); void loadOverview() }

  return <>
    <PageMeta title="Mailing list — Admin" description="View subscribers and manage mailing consent for Doxa Cards." />
    <AdminPageHeader
      eyebrow="Customers"
      title="Mailing list"
      description="View the people who have asked to hear from Doxa Cards, understand their consent status and safely suppress an address when needed."
      actions={<Link className="button secondary" to="/admin/email-campaigns"><Mail /> Compose or view email queue <ArrowRight /></Link>}
    />

    {(overviewError || subscriberError) && <ErrorState message={overviewError || subscriberError} onRetry={retry} />}

    <div className="newsletter-admin-stats" aria-label="Mailing-list summary">
      <article><Users /><span><strong>{overviewLoading ? '—' : overview?.counts.subscribed ?? 0}</strong><small>Active subscribers</small></span></article>
      <article><Mail /><span><strong>{overviewLoading ? '—' : overview?.counts.pending ?? 0}</strong><small>Legacy pending records</small></span></article>
      <article><ShieldCheck /><span><strong>{overviewLoading ? '—' : overview?.counts.unsubscribed ?? 0}</strong><small>Suppressed addresses</small></span></article>
      <article className={overview?.configured ? 'ready' : 'attention'}><Send /><span><strong>{overviewLoading ? 'Checking…' : overview?.configured ? 'Ready' : 'Setup required'}</strong><small>info@doxatreasury.com</small></span></article>
    </div>

    {!overviewLoading && overview && !overview.configured && <div className="admin-info-banner warning"><ShieldCheck /><span><strong>Email sending is safely paused</strong><small>Subscriber records remain available, but campaigns cannot send until the secure provider connection is ready.</small></span></div>}

    <AdminPanel
      className="admin-list-card mailing-list-people"
      title="People and consent"
      description="Active subscribers receive marketing campaigns immediately after consent. Suppressed addresses cannot be restored by an administrator; the person must consent again themselves."
      action={<button className="button secondary" disabled={!filtered.length} onClick={exportSubscribers}><Download /> Export visible records</button>}
    >
      {loading ? <LoadingState label="Loading mailing-list subscribers…" /> : <>
        <div className="admin-toolbar">
          <SearchField value={search} onChange={setSearch} placeholder="Search email or signup source…" label="Search mailing-list subscribers" />
          <div className="admin-filters"><select aria-label="Filter subscribers by consent status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All consent statuses</option><option value="pending">Legacy pending</option><option value="subscribed">Active</option><option value="unsubscribed">Suppressed</option></select></div>
        </div>
        {filtered.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Person</th><th>Joined</th><th>Consent record</th><th>Signup source</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id ?? item.email}><td><strong>{item.email}</strong></td><td>{formatAdminDate(item.createdAt)}</td><td>{item.consent ? 'Recorded' : 'Not recorded'}</td><td>{sourceLabel(item.source || 'Unknown')}</td><td><StatusBadge tone={item.status === 'subscribed' ? 'positive' : item.status === 'pending' ? 'warning' : 'neutral'}>{item.status === 'pending' ? 'Legacy pending' : item.status === 'subscribed' ? 'Active' : 'Suppressed'}</StatusBadge></td><td>{item.status !== 'unsubscribed' ? <button className="text-button danger" disabled={!item.id || busy === `subscriber-${item.id}`} onClick={() => void runAction(`subscriber-${item.id}`, () => suppressNewsletterSubscriber(item.id!).then(() => undefined), 'The address was removed and future marketing email was suppressed.')}>{busy === `subscriber-${item.id}` ? 'Suppressing…' : 'Remove & suppress'}</button> : <span className="admin-cell-muted">No action needed</span>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<Mail />} title={subscribers.length ? 'No matching people' : 'No subscribers yet'} description={subscribers.length ? 'Try a different email, signup source or consent status.' : 'People will appear here after they choose to join the mailing list.'} />}
        <footer className="admin-list-footer">Showing {filtered.length} of {subscribers.length} people</footer>
      </>}
    </AdminPanel>
  </>
}
