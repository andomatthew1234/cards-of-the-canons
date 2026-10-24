import { Check, CircleAlert, ListFilter, Mails, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { AdminPageHeader, ConfirmDialog, ErrorState, LoadingState } from '../../admin/components'
import { PageMeta } from '../../components/PageMeta'
import {
  cancelScheduledEmailCampaign, deleteEmailCampaign, listEmailCampaignWorkspace, retryEmailCampaign,
} from '../../lib/data'
import type { EmailCampaign, EmailCampaignDraft, EmailCampaignWorkspace, EmailQueueItem } from '../../types'
import { CampaignDashboard, EmailQueueDashboard } from './email-campaigns'
import { CampaignStudio, campaignToDraft } from './email-campaigns/CampaignStudio'
import { blankCampaignDraft } from './email-campaigns/editorModel'
import './email-campaigns/dashboard.css'

type WorkspaceTab = 'campaigns' | 'queue'

export { validateCampaignDraft as validateDraft } from './email-campaigns/editorModel'

export function EmailCampaignsPage() {
  const [workspace, setWorkspace] = useState<EmailCampaignWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<WorkspaceTab>('campaigns')
  const [editing, setEditing] = useState<EmailCampaignDraft | null>(null)
  const [working, setWorking] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EmailCampaign | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setWorkspace(await listEmailCampaignWorkspace()) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Email campaigns could not be loaded.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const act = async (key: string, action: () => Promise<unknown>, success: string) => {
    setWorking(key); setError(''); setNotice('')
    try { await action(); setNotice(success); await load() }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'This action could not be completed.') }
    finally { setWorking('') }
  }

  const remove = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    await act(`delete-${target.id}`, () => deleteEmailCampaign(target.id), 'Draft deleted.')
  }

  const cancelCampaign = (campaign: EmailCampaign) => void act(campaign.id, () => cancelScheduledEmailCampaign(campaign.id), 'Scheduled campaign cancelled.')
  const retryCampaign = (campaign: EmailCampaign) => void act(campaign.id, () => retryEmailCampaign(campaign.id), 'Campaign submitted again safely.')
  const cancelQueueItem = (item: EmailQueueItem) => { if (item.kind === 'campaign' && item.sourceId) void act(item.id, () => cancelScheduledEmailCampaign(item.sourceId!), 'Scheduled campaign cancelled.') }
  const retryQueueItem = (item: EmailQueueItem) => { if (item.kind === 'campaign' && item.sourceId) void act(item.id, () => retryEmailCampaign(item.sourceId!), 'Campaign submitted again safely.') }
  const duplicate = (campaign: EmailCampaign) => {
    const draft = campaignToDraft(campaign)
    setEditing({ ...draft, id: undefined, revision: 0, name: `${campaign.name} (copy)` })
  }

  const selectWorkspaceTab = (nextTab: WorkspaceTab) => {
    setTab(nextTab)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextTab: WorkspaceTab | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') nextTab = tab === 'campaigns' ? 'queue' : 'campaigns'
    if (event.key === 'Home') nextTab = 'campaigns'
    if (event.key === 'End') nextTab = 'queue'
    if (!nextTab) return
    event.preventDefault()
    selectWorkspaceTab(nextTab)
    requestAnimationFrame(() => document.getElementById(`email-hub-tab-${nextTab}`)?.focus())
  }

  if (editing && workspace) return <>
    <PageMeta title="Email campaign studio — Admin" description="Design and send a Doxa email campaign." />
    <CampaignStudio initial={editing} workspace={workspace} onClose={() => { setEditing(null); void load() }} onChanged={load} />
  </>

  return <>
    <PageMeta title="Email campaigns and queue — Admin" description="Create campaigns and monitor email delivery from Doxa Cards." />
    <div className="email-hub">
      <AdminPageHeader eyebrow="Customers" title="Email campaigns and queue" description="Design polished emails, choose a consent-backed audience and follow every send from preparation to delivery." actions={<button className="button primary" type="button" onClick={() => { setEditing(blankCampaignDraft()); setTab('campaigns') }}><Plus aria-hidden="true" /> Create campaign</button>} />
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {notice && <div className="admin-info-banner positive" role="status"><Check aria-hidden="true" /><span><strong>{notice}</strong></span></div>}
      <nav className="email-hub-tabs" aria-label="Email workspace sections" role="tablist">
        <button id="email-hub-tab-campaigns" type="button" role="tab" aria-selected={tab === 'campaigns'} aria-controls="email-hub-panel" tabIndex={tab === 'campaigns' ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => selectWorkspaceTab('campaigns')}><Mails aria-hidden="true" /><span>Campaigns</span></button>
        <button id="email-hub-tab-queue" type="button" role="tab" aria-selected={tab === 'queue'} aria-controls="email-hub-panel" tabIndex={tab === 'queue' ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => selectWorkspaceTab('queue')}><ListFilter aria-hidden="true" /><span>Delivery queue</span></button>
      </nav>
      <div id="email-hub-panel" className="email-hub-panel" role="tabpanel" aria-labelledby={`email-hub-tab-${tab}`}>
        {loading ? <LoadingState label="Opening the email workspace…" /> : workspace && <>
          {!workspace.configured && <div className="admin-info-banner warning"><CircleAlert aria-hidden="true" /><span><strong>Sending is safely paused</strong><small>You can keep designing drafts, but sending remains unavailable until the secure provider connection is ready.</small></span></div>}
          {tab === 'campaigns' ? <CampaignDashboard campaigns={workspace.campaigns} workingId={working} onCreate={() => setEditing(blankCampaignDraft())} onEdit={(campaign) => setEditing(campaignToDraft(campaign))} onDuplicate={duplicate} onDelete={setDeleteTarget} onCancel={cancelCampaign} onRetry={retryCampaign} /> : <EmailQueueDashboard items={workspace.queue} workingId={working} onCancel={cancelQueueItem} onRetry={retryQueueItem} />}
        </>}
      </div>
      <ConfirmDialog open={Boolean(deleteTarget)} title="Delete this draft?" description={`“${deleteTarget?.name ?? ''}” will be permanently removed. No recipient or consent records are affected.`} confirmLabel="Delete draft" busy={working.startsWith('delete-')} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </div>
  </>
}
