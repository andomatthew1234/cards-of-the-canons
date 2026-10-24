import { ArrowRight, MessageSquarePlus, Plus, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, SearchField, StatusBadge } from '../../admin/components'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { listAdminCommunitySurveys } from '../../lib/community'
import type { CommunitySurvey, CommunitySurveyStatus } from '../../types'

export function CommunityPage() {
  const [surveys, setSurveys] = useState<CommunitySurvey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | CommunitySurveyStatus>('all')
  const load = () => {
    setLoading(true); setError('')
    void listAdminCommunitySurveys().then(setSurveys).catch((loadError) => setError(friendlyAuthError(loadError))).finally(() => setLoading(false))
  }
  useEffect(load, [])
  const filtered = useMemo(() => surveys.filter((survey) => {
    const term = search.trim().toLowerCase()
    return (status === 'all' || survey.status === status) && (!term || `${survey.title} ${survey.description}`.toLowerCase().includes(term))
  }), [search, status, surveys])
  if (loading) return <LoadingState label="Loading community surveys…" />
  return <>
    <PageMeta title="Community — Admin" description="Create surveys and review community responses." />
    <AdminPageHeader eyebrow="Customers" title="Community" description="Create polls and surveys, publish them to customer accounts, and review every response." actions={<Link className="button primary" to="/admin/community/new"><Plus /> Create survey</Link>} />
    <aside className="admin-info-banner community-email-later"><MessageSquarePlus aria-hidden="true" /><div><strong>Account delivery is active</strong><p>Published surveys appear in each signed-in customer’s Community area. Email reminders will be added later when the mail service is configured.</p></div></aside>
    {error && <ErrorState message={error} onRetry={load} />}
    <AdminPanel className="admin-list-card">
      <div className="admin-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search surveys…" label="Search surveys" /><div className="admin-filters"><label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Open</option><option value="closed">Closed</option></select></label></div></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Survey</th><th>Status</th><th>Questions</th><th>Responses</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((survey) => <tr key={survey.id}><td><Link className="admin-community-title" to={`/admin/community/${encodeURIComponent(survey.id)}`}><strong>{survey.title}</strong><small>{survey.description || 'No introduction added'}</small></Link></td><td><StatusBadge tone={survey.status === 'published' ? 'positive' : survey.status === 'closed' ? 'warning' : 'neutral'}>{survey.status === 'published' ? 'Open' : survey.status}</StatusBadge></td><td>{survey.questions.length}</td><td><span className="admin-community-response-count"><UsersRound aria-hidden="true" /> {survey.responseCount ?? 0}</span></td><td><Link className="text-button" to={`/admin/community/${encodeURIComponent(survey.id)}`}>{survey.responseCount ? 'Results' : 'Manage'} <ArrowRight /></Link></td></tr>)}</tbody></table></div> : <EmptyState title={surveys.length ? 'No matching surveys' : 'No community surveys yet'} description={surveys.length ? 'Try a different search or filter.' : 'Create a poll or survey, then publish it to signed-in customer accounts.'} icon={<MessageSquarePlus aria-hidden="true" />} action={!surveys.length && <Link className="button primary" to="/admin/community/new">Create the first survey</Link>} />}
      <footer className="admin-list-footer">Showing {filtered.length} of {surveys.length} surveys</footer>
    </AdminPanel>
  </>
}
