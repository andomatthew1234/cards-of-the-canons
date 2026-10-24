import { ImagePlus, Save } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, Field, LoadingState, RichTextField, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { useUnsavedChanges } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { defaultPageContent, normalisePageContent } from '../../context/SiteContentContext'
import { getPageContent, savePageContent, uploadPageImage } from '../../lib/data'
import type { HomePageSections, PageContent } from '../../types'

export function ContentEditorPage() {
  const { page } = useParams()
  const navigate = useNavigate()
  const { busy, runAction } = useAdminData()
  const validPage = page === 'home' || page === 'about' ? page : null
  const [content, setContent] = useState<PageContent | null>(null)
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)

  useEffect(() => {
    if (!validPage) { setLoading(false); return }
    let active = true
    void getPageContent(validPage).then((stored) => {
      if (!active) return
      const next = normalisePageContent(stored ?? defaultPageContent[validPage])
      setContent(next); setBaseline(JSON.stringify(next)); setLoading(false)
    }).catch(() => { if (active) { const next = normalisePageContent(defaultPageContent[validPage]); setContent(next); setBaseline(JSON.stringify(next)); setLoading(false) } })
    return () => { active = false }
  }, [validPage])

  const dirty = Boolean(content && JSON.stringify(content) !== baseline)
  useUnsavedChanges(dirty, 'Leave the content editor and discard your unsaved changes?')
  if (!validPage) return <EmptyState title="Content page not found" description="This content area is not supported by the current site model." action={<Link className="button secondary" to="/admin/content">Back to content</Link>} />
  if (loading || !content) return <LoadingState label={`Loading ${validPage} content…`} />

  const title = validPage === 'home' ? 'Home page' : 'About page'
  const update = <K extends keyof PageContent>(key: K, value: PageContent[K]) => setContent((current) => current ? { ...current, [key]: value } : current)
  const updateHome = <K extends keyof HomePageSections>(section: K, values: Partial<HomePageSections[K]>) => setContent((current) => {
    if (!current) return current
    const sections = current.sections ?? defaultPageContent.home.sections!
    return { ...current, contentVersion: 2, sections: { ...sections, [section]: { ...sections[section], ...values } } }
  })
  const upload = async (slot: 'hero' | 'story', file?: File) => {
    if (!file) return
    setUploading(slot)
    try {
      const url = await uploadPageImage(validPage, slot, file)
      if (validPage === 'home') updateHome(slot === 'hero' ? 'hero' : 'story', { imageUrl: url })
      else update('imageUrl', url)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The image could not be uploaded.')
    } finally { setUploading(null) }
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const success = await runAction(`page-${validPage}`, () => savePageContent(content), `${title} content saved.`)
    if (success) setBaseline(JSON.stringify(content))
  }
  const cancel = () => { if (!dirty || window.confirm('Discard your unsaved content changes?')) navigate('/admin/content') }
  const sections = content.sections ?? defaultPageContent.home.sections!

  return <>
    <PageMeta title={`${title} content — Admin`} description={`Edit the ${validPage} page content and imagery.`} />
    <AdminPageHeader title={title} description={`Edit the public ${validPage} page copy, imagery and presentation content.`} breadcrumbs={[{ label: 'Content', to: '/admin/content' }, { label: title }]} actions={<div className="admin-page-actions"><button className="button secondary" onClick={cancel}>Cancel</button><button className="button primary" form="content-editor" disabled={!dirty || busy === `page-${validPage}`}><Save /> {busy === `page-${validPage}` ? 'Saving…' : 'Save changes'}</button></div>} />
    <form id="content-editor" className="admin-editor-layout" onSubmit={save}>
      <div className="admin-editor-main">
        <AdminPanel title={validPage === 'home' ? 'Hero introduction' : 'Page introduction'} description="The first message visitors see on this page."><div className="admin-form-grid"><Field label="Eyebrow" wide><input maxLength={80} value={content.eyebrow} onChange={(event) => update('eyebrow', event.target.value)} /></Field><Field label="Title" wide><input required minLength={2} maxLength={160} value={content.title} onChange={(event) => update('title', event.target.value)} /></Field>{validPage === 'home' && <Field label="Gold italic phrase" hint="Use a phrase that appears exactly within the title." wide><input maxLength={80} value={sections.hero.accent} onChange={(event) => updateHome('hero', { accent: event.target.value })} /></Field>}<RichTextField label="Body" hint="Use the toolbar for safe bold, italic, links and lists." required maxLength={10000} rows={6} value={content.body} onChange={(value) => update('body', value)} />{validPage === 'home' && <><Field label="Primary button"><input required maxLength={60} value={sections.hero.primaryActionLabel} onChange={(event) => updateHome('hero', { primaryActionLabel: event.target.value })} /></Field><Field label="Secondary button"><input required maxLength={60} value={sections.hero.secondaryActionLabel} onChange={(event) => updateHome('hero', { secondaryActionLabel: event.target.value })} /></Field></>}</div></AdminPanel>

        {validPage === 'home' && <>
          <AdminPanel title="Moving values" description="The animated line and three principles immediately below the hero."><div className="admin-form-grid"><Field label="Moving line" hint="Separate phrases with ·" wide><input required maxLength={320} value={sections.values.marquee} onChange={(event) => updateHome('values', { marquee: event.target.value })} /></Field>{(['first', 'second', 'third'] as const).map((position, index) => <div className="admin-field-pair" key={position}><strong>Value {index + 1}</strong><Field label="Title"><input required maxLength={80} value={sections.values[`${position}Title`]} onChange={(event) => updateHome('values', { [`${position}Title`]: event.target.value })} /></Field><Field label="Supporting text"><input required maxLength={160} value={sections.values[`${position}Body`]} onChange={(event) => updateHome('values', { [`${position}Body`]: event.target.value })} /></Field></div>)}</div></AdminPanel>
          <AdminPanel title="Featured collection" description="The introduction above the products selected as featured."><div className="admin-form-grid"><Field label="Eyebrow" wide><input required maxLength={80} value={sections.featured.eyebrow} onChange={(event) => updateHome('featured', { eyebrow: event.target.value })} /></Field><Field label="Heading" wide><input required maxLength={160} value={sections.featured.title} onChange={(event) => updateHome('featured', { title: event.target.value })} /></Field><Field label="Supporting text" wide><textarea required maxLength={1000} rows={4} value={sections.featured.body} onChange={(event) => updateHome('featured', { body: event.target.value })} /></Field></div></AdminPanel>
          <AdminPanel title="Story section" description="The large editorial image and story near the end of the homepage."><div className="admin-form-grid"><Field label="Eyebrow" wide><input required maxLength={80} value={sections.story.eyebrow} onChange={(event) => updateHome('story', { eyebrow: event.target.value })} /></Field><Field label="Heading" wide><input required maxLength={160} value={sections.story.title} onChange={(event) => updateHome('story', { title: event.target.value })} /></Field><RichTextField label="Story" hint="Formatting is stored as safe plain text, never HTML." required maxLength={3000} value={sections.story.body} onChange={(value) => updateHome('story', { body: value })} /><Field label="Button label"><input required maxLength={60} value={sections.story.actionLabel} onChange={(event) => updateHome('story', { actionLabel: event.target.value })} /></Field><Field label="Image credit"><input maxLength={240} value={sections.story.imageCredit} onChange={(event) => updateHome('story', { imageCredit: event.target.value })} /></Field></div></AdminPanel>
        </>}
      </div>

      <aside className="admin-editor-aside">
        <AdminPanel title="Publishing"><div className="admin-form-stack"><Field label="Status"><select value={content.status ?? 'published'} onChange={(event) => update('status', event.target.value as PageContent['status'])}><option value="draft">Draft</option><option value="published">Published</option></select></Field><div className="admin-publish-summary"><StatusBadge tone={content.status === 'draft' ? 'neutral' : 'positive'}>{content.status ?? 'published'}</StatusBadge><p>{content.status === 'draft' ? 'Only administrators can retrieve this content.' : 'This content is available to the public site.'}</p></div></div></AdminPanel>
        <AdminPanel title={validPage === 'home' ? 'Hero image' : 'Page image'}><div className="admin-image-editor"><div className="admin-image-preview admin-page-image-preview"><img src={validPage === 'home' ? sections.hero.imageUrl : content.imageUrl} alt={validPage === 'home' ? sections.hero.imageAlt : content.imageAlt ?? ''} /></div><Field label="Image URL"><input required value={validPage === 'home' ? sections.hero.imageUrl : content.imageUrl ?? ''} onChange={(event) => validPage === 'home' ? updateHome('hero', { imageUrl: event.target.value }) : update('imageUrl', event.target.value)} /></Field><Field label="Alt text"><input required maxLength={200} value={validPage === 'home' ? sections.hero.imageAlt : content.imageAlt ?? ''} onChange={(event) => validPage === 'home' ? updateHome('hero', { imageAlt: event.target.value }) : update('imageAlt', event.target.value)} /></Field>{validPage === 'home' && <Field label="Image credit"><input maxLength={240} value={sections.hero.imageCredit} onChange={(event) => updateHome('hero', { imageCredit: event.target.value })} /></Field>}<label className={`button secondary grow ${uploading === 'hero' ? 'disabled' : ''}`}><ImagePlus />{uploading === 'hero' ? 'Uploading…' : 'Replace image'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading !== null} onChange={(event) => void upload('hero', event.target.files?.[0])} /></label><p className="admin-help">JPG, PNG or WebP. Maximum 5 MB. Add useful alt text for visitors using screen readers.</p></div></AdminPanel>
        {validPage === 'home' && <AdminPanel title="Story image"><div className="admin-image-editor"><div className="admin-image-preview admin-page-image-preview"><img src={sections.story.imageUrl} alt={sections.story.imageAlt} /></div><Field label="Image URL"><input required value={sections.story.imageUrl} onChange={(event) => updateHome('story', { imageUrl: event.target.value })} /></Field><Field label="Alt text"><input required maxLength={200} value={sections.story.imageAlt} onChange={(event) => updateHome('story', { imageAlt: event.target.value })} /></Field><label className={`button secondary grow ${uploading === 'story' ? 'disabled' : ''}`}><ImagePlus />{uploading === 'story' ? 'Uploading…' : 'Replace story image'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading !== null} onChange={(event) => void upload('story', event.target.files?.[0])} /></label></div></AdminPanel>}
        <AdminPanel title="Page preview" description="A compact representation of the page introduction."><div className="admin-content-preview"><p className="eyebrow">{content.eyebrow || 'Eyebrow'}</p><h2>{content.title || 'Page title'}</h2><p>{content.body || 'Page copy'}</p></div></AdminPanel>
      </aside>
    </form>
  </>
}
