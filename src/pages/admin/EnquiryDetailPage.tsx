import { ArrowLeft, Mail, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { formatAdminDate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { deleteEnquiry, updateEnquiryStatus } from '../../lib/data'
import type { Enquiry } from '../../types'

export function EnquiryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { enquiries, loading, busy, runAction } = useAdminData()
  const [deleteOpen, setDeleteOpen] = useState(false)
  if (loading) return <LoadingState label="Loading enquiry…" />
  const enquiry = enquiries.find((item) => item.id === id)
  if (!enquiry || !enquiry.id) return <EmptyState title="Enquiry not found" description="It may have been deleted or the link is invalid." action={<Link className="button secondary" to="/admin/enquiries"><ArrowLeft /> Back to enquiries</Link>} />
  const remove = async () => {
    const success = await runAction(`enquiry-${enquiry.id}`, () => deleteEnquiry(enquiry.id!), 'Enquiry deleted.')
    if (success) navigate('/admin/enquiries', { replace: true })
  }
  return <>
    <PageMeta title={`${enquiry.name} — Enquiries`} description="Review and manage an enquiry." />
    <AdminPageHeader title={enquiry.kind === 'quote' ? 'Quote request' : 'General enquiry'} description={`Received ${formatAdminDate(enquiry.createdAt)} from ${enquiry.name}.`} breadcrumbs={[{ label: 'Enquiries', to: '/admin/enquiries' }, { label: enquiry.name }]} actions={<StatusBadge tone={enquiry.status === 'new' ? 'warning' : enquiry.status === 'resolved' ? 'positive' : 'info'}>{enquiry.status.replace('_', ' ')}</StatusBadge>} />
    <div className="admin-detail-grid"><div className="admin-editor-main"><AdminPanel><article className="admin-message-detail"><header><div className="admin-avatar">{enquiry.name.trim().charAt(0).toUpperCase()}</div><div><strong>{enquiry.name}</strong><a href={`mailto:${enquiry.email}`}>{enquiry.email}</a></div><time>{formatAdminDate(enquiry.createdAt)}</time></header><div className="admin-message-body">{enquiry.message.split('\n').map((paragraph, index) => <p key={index}>{paragraph || <br />}</p>)}</div></article></AdminPanel></div>
      <aside className="admin-editor-aside"><AdminPanel title="Enquiry details"><dl className="admin-detail-list"><div><dt>Type</dt><dd>{enquiry.kind === 'quote' ? 'Quote request' : 'General'}</dd></div>{enquiry.organisation && <div><dt>Organisation</dt><dd>{enquiry.organisation}</dd></div>}<div><dt>Consent recorded</dt><dd>{enquiry.consent ? 'Yes' : 'No'}</dd></div><div><dt>Received</dt><dd>{formatAdminDate(enquiry.createdAt)}</dd></div></dl></AdminPanel>
        <AdminPanel title="Workflow"><div className="admin-form-stack"><label className="admin-field"><span>Status</span><select value={enquiry.status} disabled={busy === `enquiry-${enquiry.id}`} onChange={(event) => void runAction(`enquiry-${enquiry.id}`, () => updateEnquiryStatus(enquiry.id!, event.target.value as Enquiry['status']), 'Enquiry status updated.')}><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label><a className="button secondary grow" href={`mailto:${enquiry.email}`}><Mail /> Reply by email</a><button className="button danger-button grow" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete enquiry</button></div></AdminPanel></aside></div>
    <ConfirmDialog open={deleteOpen} title="Delete this enquiry?" description="The stored message and its contact details will be permanently removed. This action cannot be undone." confirmLabel="Delete enquiry" busy={busy === `enquiry-${enquiry.id}`} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} />
  </>
}
