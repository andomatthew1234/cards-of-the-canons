import {
  CalendarClock, ChevronDown, Clock3, Copy, Edit3, Mail, MoreHorizontal, Plus,
  RefreshCw, Search, Send, Trash2, Users, X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatAdminDate } from '../../../admin/utils'
import type { EmailCampaign, EmailCampaignBlock, EmailCampaignStatus } from '../../../types'

type CampaignSort = 'updated_desc' | 'updated_asc' | 'name_asc' | 'scheduled_asc'

export interface CampaignDashboardProps {
  campaigns: EmailCampaign[]
  workingId?: string
  onCreate: () => void
  onEdit: (campaign: EmailCampaign) => void
  onDuplicate: (campaign: EmailCampaign) => void
  onDelete: (campaign: EmailCampaign) => void
  onCancel: (campaign: EmailCampaign) => void
  onRetry: (campaign: EmailCampaign) => void
}

const statusLabel: Record<EmailCampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  preparing: 'Preparing',
  queued: 'Accepted by provider',
  sent: 'Sent to provider',
  partially_sent: 'Partially sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function campaignTone(status: EmailCampaignStatus) {
  if (status === 'queued' || status === 'sent') return 'positive'
  if (status === 'scheduled' || status === 'preparing') return 'warning'
  if (status === 'failed' || status === 'partially_sent') return 'danger'
  return 'neutral'
}

function audienceLabel(campaign: EmailCampaign) {
  if (campaign.audience === 'mailing_list') return 'Mailing list'
  if (campaign.audience === 'all_accounts') return 'Verified accounts'
  return `${campaign.recipientEmails.length} selected ${campaign.recipientEmails.length === 1 ? 'person' : 'people'}`
}

function timeValue(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function CampaignMiniature({ blocks }: { blocks: EmailCampaignBlock[] }) {
  const visible = blocks.flatMap((block) => block.type === 'columns' ? (block.columns ?? []).flat() : [block]).slice(0, 5)
  return <div className="campaign-miniature" aria-hidden="true">
    <div className="campaign-miniature-brand">Doxa</div>
    <div className="campaign-miniature-body">
      {visible.map((block) => {
        if (block.type === 'image') return block.url
          ? <img key={block.id} src={block.url} alt="" />
          : <span key={block.id} className="campaign-miniature-image" />
        if (block.type === 'divider') return <span key={block.id} className="campaign-miniature-divider" />
        if (block.type === 'spacer') return <span key={block.id} className={`campaign-miniature-spacer ${block.size}`} />
        if (block.type === 'button') return <span key={block.id} className="campaign-miniature-button">{block.text || 'Button'}</span>
        if (block.type === 'link') return <span key={block.id} className="campaign-miniature-link">{block.text || 'Link'}</span>
        return <span key={block.id} className={`campaign-miniature-copy ${block.type}`}>{block.text || block.type}</span>
      })}
    </div>
  </div>
}

function CampaignActions({ campaign, working, onEdit, onDuplicate, onDelete, onCancel, onRetry }: {
  campaign: EmailCampaign
  working: boolean
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  return <details className="campaign-action-menu">
    <summary aria-label={`Actions for ${campaign.name}`}><MoreHorizontal aria-hidden="true" /></summary>
    <div role="menu">
      {campaign.status === 'draft' && <button role="menuitem" onClick={onEdit}><Edit3 aria-hidden="true" /> Edit campaign</button>}
      {campaign.status !== 'draft' && <button role="menuitem" onClick={onDuplicate}><Copy aria-hidden="true" /> Duplicate</button>}
      {campaign.status === 'scheduled' && <button role="menuitem" className="danger" disabled={working} onClick={onCancel}><X aria-hidden="true" /> Cancel sending</button>}
      {(campaign.status === 'failed' || campaign.status === 'partially_sent') && <button role="menuitem" disabled={working} onClick={onRetry}><RefreshCw aria-hidden="true" /> Retry safely</button>}
      {(campaign.status === 'draft' || campaign.status === 'cancelled') && <button role="menuitem" className="danger" disabled={working} onClick={onDelete}><Trash2 aria-hidden="true" /> Delete draft</button>}
    </div>
  </details>
}

export function CampaignDashboard({ campaigns, workingId = '', onCreate, onEdit, onDuplicate, onDelete, onCancel, onRetry }: CampaignDashboardProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | EmailCampaignStatus>('all')
  const [audience, setAudience] = useState<'all' | EmailCampaign['audience']>('all')
  const [sort, setSort] = useState<CampaignSort>('updated_desc')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return campaigns
      .filter((campaign) => status === 'all' || campaign.status === status)
      .filter((campaign) => audience === 'all' || campaign.audience === audience)
      .filter((campaign) => !query || `${campaign.name} ${campaign.subject} ${campaign.previewText}`.toLowerCase().includes(query))
      .sort((left, right) => {
        if (sort === 'name_asc') return left.name.localeCompare(right.name)
        if (sort === 'updated_asc') return timeValue(left.updatedAt) - timeValue(right.updatedAt)
        if (sort === 'scheduled_asc') return (timeValue(left.scheduledAt) || Number.MAX_SAFE_INTEGER) - (timeValue(right.scheduledAt) || Number.MAX_SAFE_INTEGER)
        return timeValue(right.updatedAt) - timeValue(left.updatedAt)
      })
  }, [audience, campaigns, search, sort, status])

  const counts = useMemo(() => ({
    drafts: campaigns.filter((campaign) => campaign.status === 'draft').length,
    scheduled: campaigns.filter((campaign) => campaign.status === 'scheduled').length,
    active: campaigns.filter((campaign) => ['preparing', 'queued', 'sent'].includes(campaign.status)).length,
    attention: campaigns.filter((campaign) => ['failed', 'partially_sent'].includes(campaign.status)).length,
  }), [campaigns])

  const filtersActive = Boolean(search || status !== 'all' || audience !== 'all' || sort !== 'updated_desc')
  const clearFilters = () => { setSearch(''); setStatus('all'); setAudience('all'); setSort('updated_desc') }

  return <section className="campaign-dashboard" aria-labelledby="campaign-dashboard-title">
    <header className="campaign-dashboard-heading">
      <div><p className="campaign-dashboard-kicker">Campaign studio</p><h2 id="campaign-dashboard-title">Email campaigns</h2><p>Design, schedule and manage every message from one focused workspace.</p></div>
    </header>

    <div className="campaign-kpi-grid" aria-label="Campaign summary">
      <article><span className="campaign-kpi-icon"><Edit3 /></span><div><strong>{counts.drafts}</strong><span>Drafts</span><small>Ready to keep shaping</small></div></article>
      <article><span className="campaign-kpi-icon"><CalendarClock /></span><div><strong>{counts.scheduled}</strong><span>Scheduled</span><small>Waiting for send time</small></div></article>
      <article><span className="campaign-kpi-icon"><Send /></span><div><strong>{counts.active}</strong><span>In delivery</span><small>Preparing or provider accepted</small></div></article>
      <article className={counts.attention ? 'needs-attention' : ''}><span className="campaign-kpi-icon"><RefreshCw /></span><div><strong>{counts.attention}</strong><span>Needs attention</span><small>Failed or partially sent</small></div></article>
    </div>

    <div className="campaign-dashboard-toolbar">
      <label className="campaign-dashboard-search"><span className="sr-only">Search campaigns</span><Search aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, subject or preview…" /></label>
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>Audience</span><select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="all">All audiences</option><option value="mailing_list">Mailing list</option><option value="all_accounts">Verified accounts</option><option value="individuals">Selected people</option></select></label>
      <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as CampaignSort)}><option value="updated_desc">Recently updated</option><option value="updated_asc">Oldest updated</option><option value="name_asc">Campaign name</option><option value="scheduled_asc">Next scheduled</option></select></label>
      {filtersActive && <button className="campaign-dashboard-clear" onClick={clearFilters}>Clear</button>}
    </div>

    {filtered.length ? <div className="campaign-card-list">
      {filtered.map((campaign) => <article className="campaign-card" key={campaign.id}>
        <CampaignMiniature blocks={campaign.blocks} />
        <div className="campaign-card-copy">
          <div className="campaign-card-status-line"><span className={`campaign-status ${campaignTone(campaign.status)}`}>{statusLabel[campaign.status]}</span><span>{campaign.purpose === 'marketing' ? 'Marketing' : 'Service message'}</span></div>
          <h3>{campaign.name || 'Untitled campaign'}</h3>
          <p>{campaign.subject || 'No inbox subject yet'}</p>
          {campaign.lastError && <p className="campaign-card-error" role="status">{campaign.lastError}</p>}
        </div>
        <dl className="campaign-card-facts">
          <div><dt><Users aria-hidden="true" /> Audience</dt><dd>{audienceLabel(campaign)}</dd></div>
          <div><dt><Mail aria-hidden="true" /> Recipients</dt><dd>{campaign.recipientCount ? campaign.recipientCount.toLocaleString('en-AU') : 'Not calculated'}</dd></div>
          <div><dt><Clock3 aria-hidden="true" /> {campaign.scheduledAt ? 'Scheduled' : 'Updated'}</dt><dd>{formatAdminDate(campaign.scheduledAt ?? campaign.updatedAt)}</dd></div>
        </dl>
        <div className="campaign-card-actions">
          {campaign.status === 'draft' && <button className="campaign-card-edit" onClick={() => onEdit(campaign)}>Open editor <ChevronDown aria-hidden="true" /></button>}
          <CampaignActions campaign={campaign} working={workingId === campaign.id} onEdit={() => onEdit(campaign)} onDuplicate={() => onDuplicate(campaign)} onDelete={() => onDelete(campaign)} onCancel={() => onCancel(campaign)} onRetry={() => onRetry(campaign)} />
        </div>
      </article>)}
    </div> : <div className="campaign-dashboard-empty"><Mail aria-hidden="true" /><h3>{campaigns.length ? 'No campaigns match these filters' : 'Create your first campaign'}</h3><p>{campaigns.length ? 'Clear a filter or try a broader search.' : 'Start with a polished template, then make it distinctly Doxa.'}</p>{campaigns.length ? <button onClick={clearFilters}>Clear filters</button> : <button onClick={onCreate}><Plus /> Create campaign</button>}</div>}
    <footer className="campaign-dashboard-count">Showing {filtered.length} of {campaigns.length} campaigns</footer>
  </section>
}
