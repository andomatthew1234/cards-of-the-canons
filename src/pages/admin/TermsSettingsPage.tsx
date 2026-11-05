import { ExternalLink, FileText, Save, Send } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminData } from '../../admin/AdminContext'
import { AdminPageHeader, AdminPanel, ConfirmDialog, ErrorState, Field, LoadingState, RichTextField, StatusBadge } from '../../admin/components'
import { useUnsavedChanges } from '../../admin/utils'
import { MarkdownContent } from '../../components/MarkdownContent'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { APPROVED_TERMS_POLICY } from '../../legal/approvedTerms'
import { getTermsPolicyEditorState, publishTermsPolicy, saveTermsPolicyDraft } from '../../lib/data'
import type { TermsPolicyContent, TermsPolicyDocument } from '../../types'

function contentOf(policy: TermsPolicyDocument): TermsPolicyContent {
  return {
    title: policy.title,
    description: policy.description,
    bodyMarkdown: policy.bodyMarkdown,
    version: policy.version,
    effectiveDate: policy.effectiveDate,
  }
}

export function TermsSettingsPage() {
  const { busy, runAction } = useAdminData()
  const [content, setContent] = useState<TermsPolicyContent | null>(null)
  const [revision, setRevision] = useState(0)
  const [published, setPublished] = useState<TermsPolicyDocument | null>(null)
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const dirty = content !== null && baseline !== JSON.stringify(content)
  useUnsavedChanges(dirty, 'Leave the Terms and Conditions editor and discard your unsaved changes?')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const state = await getTermsPolicyEditorState()
      const shouldUseApprovedBaseline = state.draft.revision === 0
        && !state.published
        && !state.draft.bodyMarkdown.trim()
      const next = shouldUseApprovedBaseline
        ? contentOf(APPROVED_TERMS_POLICY)
        : contentOf(state.draft)
      setContent(next)
      setRevision(state.draft.revision)
      setPublished(state.published)
      setBaseline(JSON.stringify(next))
    } catch (loadError) {
      setError(friendlyAuthError(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const validForPublish = useMemo(() => Boolean(
    content
    && content.title.trim().length >= 2
    && content.description.trim().length >= 10
    && content.bodyMarkdown.trim().length >= 20
    && content.version.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(content.effectiveDate),
  ), [content])

  if (loading) return <LoadingState label="Loading Terms and Conditions…" />
  if (!content) return <ErrorState message={error || 'The Terms and Conditions editor could not be opened.'} onRetry={() => void load()} />

  const update = <K extends keyof TermsPolicyContent>(field: K, value: TermsPolicyContent[K]) => {
    setContent((current) => current ? { ...current, [field]: value } : current)
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')
    let nextState: Awaited<ReturnType<typeof saveTermsPolicyDraft>> | null = null
    const success = await runAction('save-terms-policy', async () => {
      nextState = await saveTermsPolicyDraft(revision, content)
    }, 'Terms and Conditions draft saved.')
    if (success && nextState) {
      const state = nextState as Awaited<ReturnType<typeof saveTermsPolicyDraft>>
      const next = contentOf(state.draft)
      setContent(next)
      setRevision(state.draft.revision)
      setPublished(state.published)
      setBaseline(JSON.stringify(next))
    }
  }

  const publish = async () => {
    setError('')
    let nextState: Awaited<ReturnType<typeof publishTermsPolicy>> | null = null
    const success = await runAction('publish-terms-policy', async () => {
      nextState = await publishTermsPolicy(revision, content)
    }, 'Terms and Conditions published.')
    if (success && nextState) {
      const state = nextState as Awaited<ReturnType<typeof publishTermsPolicy>>
      const next = contentOf(state.draft)
      setContent(next)
      setRevision(state.draft.revision)
      setPublished(state.published)
      setBaseline(JSON.stringify(next))
    }
    setPublishOpen(false)
  }

  return <>
    <PageMeta title="Terms and Conditions — Admin" description="Draft, review and publish the website Terms and Conditions." />
    <AdminPageHeader
      eyebrow="Settings"
      title="Terms and Conditions"
      description="Write the legal copy in Markdown, save private drafts, then publish explicitly when the wording is approved."
      breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Terms and Conditions' }]}
      actions={<div className="admin-page-actions">
        <Link className="button secondary" to="/policies/terms" target="_blank" rel="noopener noreferrer"><ExternalLink /> View public page</Link>
        <button className="button secondary" type="submit" form="terms-policy-editor" disabled={!dirty || busy === 'save-terms-policy'}><Save />{busy === 'save-terms-policy' ? 'Saving…' : 'Save draft'}</button>
        <button className="button primary" type="button" disabled={!validForPublish || busy === 'publish-terms-policy'} onClick={() => setPublishOpen(true)}><Send /> Publish</button>
      </div>}
    />
    {error && <p className="form-status error" role="alert">{error}</p>}
    <form id="terms-policy-editor" className="admin-editor-layout terms-policy-editor" onSubmit={(event) => void save(event)}>
      <div className="admin-editor-main">
        <AdminPanel title="Policy details" description="These details appear at the top of the public legal page.">
          <div className="admin-form-grid">
            <Field label="Title" wide><input required minLength={2} maxLength={120} value={content.title} onChange={(event) => update('title', event.target.value)} /></Field>
            <Field label="Public summary" hint="A short plain-language description shown beneath the title." wide><textarea required minLength={10} maxLength={500} rows={3} value={content.description} onChange={(event) => update('description', event.target.value)} /></Field>
            <Field label="Version"><input required maxLength={40} value={content.version} onChange={(event) => update('version', event.target.value)} /></Field>
            <Field label="Effective date"><input required type="date" value={content.effectiveDate} onChange={(event) => update('effectiveDate', event.target.value)} /></Field>
          </div>
        </AdminPanel>
        <AdminPanel title="Approved wording" description="Markdown supports headings, links, lists, tables and emphasis. Raw HTML is removed on the public page.">
          <RichTextField label="Terms and Conditions" hint="Paste only wording approved for publication." value={content.bodyMarkdown} onChange={(value) => update('bodyMarkdown', value)} maxLength={100_000} rows={22} required />
        </AdminPanel>
      </div>
      <aside className="admin-editor-aside">
        <AdminPanel title="Publication">
          <div className="admin-form-stack">
            <div className="admin-publish-summary">
              <StatusBadge tone={published ? 'positive' : 'warning'}>{published ? 'Published' : 'Not published'}</StatusBadge>
              <p>{published ? `Version ${published.version} is live. Draft revision ${revision} remains private until you publish again.` : 'The approved baseline is live. Publishing here replaces it with your recorded administrator version.'}</p>
            </div>
            <div className="admin-security-note"><FileText /><p>Saving a draft never changes the public policy. Publishing is a separate, recorded administrator action.</p></div>
          </div>
        </AdminPanel>
        <AdminPanel title="Public preview" description="This preview uses the same safe Markdown renderer as the live page.">
          <div className="terms-policy-preview">
            <h3>{content.title || 'Untitled policy'}</h3>
            <p>{content.description}</p>
            {content.bodyMarkdown.trim() ? <MarkdownContent markdown={content.bodyMarkdown} /> : <p className="muted">Add approved wording to preview it here.</p>}
          </div>
        </AdminPanel>
      </aside>
    </form>
    <ConfirmDialog
      open={publishOpen}
      title="Publish these Terms and Conditions?"
      description="This immediately replaces the live Terms and Conditions page. Confirm that the wording, version and effective date have been approved."
      confirmLabel="Publish Terms and Conditions"
      busy={busy === 'publish-terms-policy'}
      onCancel={() => setPublishOpen(false)}
      onConfirm={() => void publish()}
    />
  </>
}
