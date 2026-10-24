import { ArrowRight, BookOpenText, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, SearchField, StatusBadge } from '../../admin/components'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { listJournalArticlesAdminPage } from '../../lib/data'
import type { Article } from '../../types'

function appendUnique(current: Article[], incoming: Article[]) {
  const known = new Set(current.map((article) => article.id))
  return [...current, ...incoming.filter((article) => !known.has(article.id))]
}

export function JournalPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [counts, setCounts] = useState({ draft: 0, published: 0 })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'draft' | 'published'>('all')

  const load = async (cursor?: string | null) => {
    const isNextPage = Boolean(cursor)
    if (isNextPage) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const page = await listJournalArticlesAdminPage(cursor)
      setArticles((current) => isNextPage ? appendUnique(current, page.articles) : page.articles)
      setNextCursor(page.nextCursor)
      setCounts(page.counts)
    } catch (value) {
      setError(friendlyAuthError(value))
      if (!isNextPage) setArticles([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => { void load(null) }, [])
  const filtered = useMemo(() => articles.filter((article) => (status === 'all' || article.status === status) && (!search.trim() || `${article.title} ${article.excerpt} ${article.category}`.toLowerCase().includes(search.toLowerCase()))), [articles, search, status])
  if (loading) return <LoadingState label="Opening the Journal workspace…" />
  return <div className="journal-admin-page">
    <PageMeta title="Journal — Admin" description="Write and publish stories for the Doxa Journal." noIndex />
    <AdminPageHeader eyebrow="Website" title="Journal" description="Write thoughtful progress updates and stories, preview every detail, then publish to readers." actions={<Link className="button primary" to="/admin/journal/new"><Plus /> New Journal entry</Link>} />
    {error && <ErrorState message={error} onRetry={() => void load(null)} />}
    <div className="journal-admin-stats"><div><strong>{counts.published}</strong><span>Published stories</span></div><div><strong>{counts.draft}</strong><span>Drafts in progress</span></div><div><strong>{articles.filter((item) => item.notificationStatus === 'queued').length}</strong><span>Queued emails in loaded entries</span></div></div>
    <AdminPanel className="admin-list-card journal-admin-card"><div className="admin-toolbar journal-admin-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search loaded Journal entries…" label="Search loaded Journal entries" /><label className="journal-status-filter"><span>Status</span><select aria-label="Filter Journal entries by status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
      {filtered.length ? <div className="journal-admin-list">{filtered.map((article) => <article key={article.id}><div className="journal-admin-row-copy"><span className="eyebrow">{article.category}</span><h2><Link to={`/admin/journal/${article.id}`}>{article.title}</Link></h2><p>{article.excerpt}</p></div><div className="journal-admin-row-meta"><StatusBadge tone={article.status === 'published' ? 'positive' : 'neutral'}>{article.status}</StatusBadge>{article.notificationStatus === 'failed' && <StatusBadge tone="danger">Email needs attention</StatusBadge>}<Link className="text-button" to={`/admin/journal/${article.id}`}>Edit <ArrowRight /></Link></div></article>)}</div> : <EmptyState icon={<BookOpenText />} title={articles.length ? 'No matching entries' : 'Your Journal is ready'} description={articles.length ? 'Try a different search or status.' : 'Create your first managed story.'} action={!articles.length && <Link className="button primary" to="/admin/journal/new">Write the first entry</Link>} />}
      {nextCursor && <div className="admin-list-pagination"><button className="button secondary" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? 'Loading older entries…' : 'Load older entries'}</button></div>}
    </AdminPanel>
  </div>
}
