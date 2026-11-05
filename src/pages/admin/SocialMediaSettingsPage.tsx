import { ExternalLink, Save, Send, Share2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminData } from '../../admin/AdminContext'
import { AdminPageHeader, AdminPanel, ConfirmDialog, ErrorState, Field, LoadingState, StatusBadge } from '../../admin/components'
import { useUnsavedChanges } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { getSocialMediaLinksEditorState, publishSocialMediaLinks, saveSocialMediaLinksDraft } from '../../lib/data'
import type { SocialMediaLink, SocialMediaLinksContent, SocialMediaLinksDocument, SocialMediaPlatform } from '../../types'

const platformHelp: Record<SocialMediaPlatform, { name: string; example: string; hosts: string[] }> = {
  instagram: { name: 'Instagram', example: 'https://www.instagram.com/doxatreasury', hosts: ['instagram.com'] },
  tiktok: { name: 'TikTok', example: 'https://www.tiktok.com/@doxatreasury', hosts: ['tiktok.com'] },
  youtube: { name: 'YouTube', example: 'https://www.youtube.com/@doxatreasury', hosts: ['youtube.com', 'youtu.be'] },
  facebook: { name: 'Facebook', example: 'https://www.facebook.com/doxatreasury', hosts: ['facebook.com'] },
  x: { name: 'X', example: 'https://x.com/doxatreasury', hosts: ['x.com', 'twitter.com'] },
}

function contentOf(settings: SocialMediaLinksDocument): SocialMediaLinksContent {
  return {
    heading: settings.heading,
    links: settings.links.map((link) => ({ ...link })),
  }
}

function validProfileUrl(link: SocialMediaLink) {
  try {
    const url = new URL(link.url)
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.pathname !== '/'
      && platformHelp[link.id].hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export function SocialMediaSettingsPage() {
  const { busy, runAction } = useAdminData()
  const [content, setContent] = useState<SocialMediaLinksContent | null>(null)
  const [revision, setRevision] = useState(0)
  const [published, setPublished] = useState<SocialMediaLinksDocument | null>(null)
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const dirty = content !== null && baseline !== JSON.stringify(content)
  useUnsavedChanges(dirty, 'Leave the social media links editor and discard your unsaved changes?')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const state = await getSocialMediaLinksEditorState()
      const next = contentOf(state.draft)
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

  const visibleLinks = useMemo(() => content?.links.filter((link) => link.visible) ?? [], [content])
  const validForPublish = Boolean(content?.heading.trim() && visibleLinks.length > 0 && visibleLinks.every(validProfileUrl))

  if (loading) return <LoadingState label="Loading social media links…" />
  if (!content) return <ErrorState message={error || 'The social media links editor could not be opened.'} onRetry={() => void load()} />

  const updateLink = (id: SocialMediaPlatform, change: Partial<SocialMediaLink>) => {
    setContent((current) => current ? {
      ...current,
      links: current.links.map((link) => link.id === id ? { ...link, ...change } : link),
    } : current)
  }

  const applyState = (state: Awaited<ReturnType<typeof saveSocialMediaLinksDraft>>) => {
    const next = contentOf(state.draft)
    setContent(next)
    setRevision(state.draft.revision)
    setPublished(state.published)
    setBaseline(JSON.stringify(next))
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')
    let nextState: Awaited<ReturnType<typeof saveSocialMediaLinksDraft>> | null = null
    const success = await runAction('save-social-media-links', async () => {
      nextState = await saveSocialMediaLinksDraft(revision, content)
    }, 'Social media links draft saved.')
    if (success && nextState) applyState(nextState)
  }

  const publish = async () => {
    setError('')
    let nextState: Awaited<ReturnType<typeof publishSocialMediaLinks>> | null = null
    const success = await runAction('publish-social-media-links', async () => {
      nextState = await publishSocialMediaLinks(revision, content)
    }, 'Social media links published to the footer.')
    if (success && nextState) applyState(nextState)
    setPublishOpen(false)
  }

  return <>
    <PageMeta title="Social media links — Admin" description="Manage the social profiles shown in the public footer." />
    <AdminPageHeader
      eyebrow="Settings"
      title="Social media links"
      description="Add the official Doxa profiles, keep unfinished accounts hidden, then publish the approved links to every public footer."
      breadcrumbs={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Social media links' }]}
      actions={<div className="admin-page-actions">
        <Link className="button secondary" to="/" target="_blank" rel="noopener noreferrer"><ExternalLink /> View storefront</Link>
        <button className="button secondary" type="submit" form="social-media-editor" disabled={!dirty || busy === 'save-social-media-links'}><Save />{busy === 'save-social-media-links' ? 'Saving…' : 'Save draft'}</button>
        <button className="button primary" type="button" disabled={!validForPublish || busy === 'publish-social-media-links'} onClick={() => setPublishOpen(true)}><Send /> Publish</button>
      </div>}
    />
    {error && <p className="form-status error" role="alert">{error}</p>}
    <form id="social-media-editor" className="admin-editor-layout social-media-editor" onSubmit={(event) => void save(event)}>
      <div className="admin-editor-main">
        <AdminPanel title="Footer social links" description="Only complete HTTPS profile links for their matching platform can be published.">
          <div className="social-settings-list">
            <Field label="Group heading" hint="Shown above the social links in the footer." wide>
              <input required minLength={1} maxLength={60} value={content.heading} onChange={(event) => setContent((current) => current ? { ...current, heading: event.target.value } : current)} />
            </Field>
            {content.links.map((link) => {
              const details = platformHelp[link.id]
              const invalidVisibleLink = link.visible && !validProfileUrl(link)
              return <section className={`social-settings-row ${link.visible ? 'is-visible' : ''}`} key={link.id}>
                <div className="social-settings-row-header">
                  <div><strong>{details.name}</strong><small>{link.visible ? 'Ready to appear after publishing' : 'Hidden from the public footer'}</small></div>
                  <label className="website-toggle">
                    <span>Show in footer<small>Publish this profile publicly</small></span>
                    <input type="checkbox" checked={link.visible} onChange={(event) => updateLink(link.id, { visible: event.target.checked })} />
                    <i aria-hidden="true" />
                  </label>
                </div>
                <div className="admin-form-grid">
                  <Field label="Link label"><input required minLength={1} maxLength={40} value={link.label} onChange={(event) => updateLink(link.id, { label: event.target.value })} /></Field>
                  <Field label="Profile URL" hint={details.example}><input type="url" inputMode="url" autoComplete="url" spellCheck={false} placeholder={details.example} value={link.url} onChange={(event) => updateLink(link.id, { url: event.target.value })} aria-invalid={invalidVisibleLink || undefined} /></Field>
                </div>
                {invalidVisibleLink && <p className="social-settings-validation" role="alert">Enter the complete public {details.name} profile URL before publishing.</p>}
              </section>
            })}
          </div>
        </AdminPanel>
      </div>
      <aside className="admin-editor-aside">
        <AdminPanel title="Publication">
          <div className="admin-form-stack">
            <div className="admin-publish-summary">
              <StatusBadge tone={published ? 'positive' : 'warning'}>{published ? 'Published' : 'Not published'}</StatusBadge>
              <p>{published ? `Revision ${published.revision} is live. Saving this draft will not alter the footer until you publish again.` : 'No social profiles are live yet. Blank and hidden profiles never appear publicly.'}</p>
            </div>
            <div className="admin-security-note"><Share2 /><p>Only official profile URLs are accepted. The links open in a separate tab without giving the external site access to the Doxa page.</p></div>
          </div>
        </AdminPanel>
        <AdminPanel title="Footer preview" description="This shows the links that the current draft would publish.">
          <div className="social-links-preview">
            <p>{content.heading || 'Follow'}</p>
            {visibleLinks.length ? visibleLinks.map((link) => validProfileUrl(link)
              ? <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<ExternalLink aria-hidden="true" /></a>
              : <span className="is-incomplete" key={link.id}>{link.label} — URL incomplete</span>)
              : <span className="muted">No profiles selected yet.</span>}
          </div>
        </AdminPanel>
      </aside>
    </form>
    <ConfirmDialog
      open={publishOpen}
      title="Publish these social media links?"
      description="The selected profiles will appear in the footer on every public page. Hidden or unfinished profiles will remain private."
      confirmLabel="Publish social links"
      busy={busy === 'publish-social-media-links'}
      onCancel={() => setPublishOpen(false)}
      onConfirm={() => void publish()}
    />
  </>
}
