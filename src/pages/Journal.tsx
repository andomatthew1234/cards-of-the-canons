import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MarkdownContent } from '../components/MarkdownContent'
import { PageMeta } from '../components/PageMeta'
import { Reveal } from '../components/Reveal'
import { getPublishedJournalArticle, listPublishedJournalArticles } from '../lib/data'
import { absoluteUrl, breadcrumbJsonLd } from '../lib/seo'
import type { Article } from '../types'
import { NotFound } from './NotFound'

function dateValue(value: unknown) {
  if (typeof value === 'string') return new Date(value)
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate()
  return new Date()
}
function dateLabel(value: unknown) { return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(dateValue(value)) }
function readingTime(body: string) { return `${Math.max(1, Math.ceil(body.trim().split(/\s+/).length / 220))} minute read` }

function appendUnique(current: Article[], incoming: Article[]) {
  const known = new Set(current.map((article) => article.id))
  return [...current, ...incoming.filter((article) => !known.has(article.id))]
}

function useJournalArchive() {
  const [entries, setEntries] = useState<Article[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (cursor?: string | null) => {
    const loadingNextPage = Boolean(cursor)
    if (loadingNextPage) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const page = await listPublishedJournalArticles(cursor)
      setEntries((current) => loadingNextPage ? appendUnique(current, page.articles) : page.articles)
      setNextCursor(page.nextCursor)
    } catch {
      if (!loadingNextPage) setEntries([])
      setError(loadingNextPage
        ? 'We could not load older Journal stories. The stories already shown are still available.'
        : 'We could not open the Journal. Please check your connection and try again.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { void load(null) }, [load])
  return { entries, nextCursor, loading, loadingMore, error, load }
}

export function Journal() {
  const { entries, nextCursor, loading, loadingMore, error, load } = useJournalArchive()
  return <>
    <PageMeta title="Journal" description="Progress updates and stories from behind the Doxa Treasury collection." canonicalPath="/journal" />
    <section className="journal-hero"><Reveal><BookOpen aria-hidden="true" /><p className="eyebrow">The Doxa Journal</p><h1>Stories behind the Treasury.</h1><p>Progress updates, collection notes and deeper stories from the history of the Church.</p></Reveal></section>
    <section className="journal-index" aria-label="Journal entries" aria-busy={loading || loadingMore}>
      {loading && <div className="journal-loading" role="status"><span aria-hidden="true" />Opening the Journal…</div>}
      {!loading && error && <div className="journal-notice" role="alert"><p>{error}</p><button className="text-button" onClick={() => void load(null)}><RefreshCw /> Try again</button></div>}
      {!loading && !error && entries.length === 0 && <div className="journal-notice journal-empty"><BookOpen aria-hidden="true" /><p>No Journal stories have been published yet.</p><p>Please check back soon.</p></div>}
      {!loading && entries.map((entry, index) => <Reveal key={entry.id} delay={(index % 12) * 70}><article className="journal-card">
        <Link className="journal-card-image" to={`/journal/${entry.slug}`}><img src={entry.coverImageUrl || '/images/history/byzantine-church-interior.jpg'} alt={entry.coverImageAlt} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" /></Link>
        <div><p className="eyebrow">{entry.category}</p><h2><Link to={`/journal/${entry.slug}`}>{entry.title}</Link></h2><p>{entry.excerpt}</p><time dateTime={dateValue(entry.publishedAt).toISOString()}><CalendarDays aria-hidden="true" /> {dateLabel(entry.publishedAt)} · {readingTime(entry.bodyMarkdown)}</time><Link className="text-link" to={`/journal/${entry.slug}`}>Read the story <ArrowRight aria-hidden="true" /></Link></div>
      </article></Reveal>)}
      {!loading && nextCursor && <div className="journal-pagination"><button className="button secondary" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? 'Opening older stories…' : 'Load older stories'}</button></div>}
    </section>
  </>
}

export function JournalArticle() {
  const { slug = '' } = useParams()
  const [entry, setEntry] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setEntry(await getPublishedJournalArticle(slug)) }
    catch { setEntry(null); setError('We could not open this Journal story. Please check your connection and try again.') }
    finally { setLoading(false) }
  }, [slug])
  useEffect(() => { void load() }, [load])
  const structuredData = useMemo(() => entry ? [{ '@context': 'https://schema.org', '@type': 'Article', headline: entry.title, description: entry.excerpt, image: absoluteUrl(entry.coverImageUrl), datePublished: dateValue(entry.publishedAt).toISOString(), dateModified: dateValue(entry.updatedAt ?? entry.publishedAt).toISOString(), author: { '@type': 'Organization', name: entry.authorName }, mainEntityOfPage: absoluteUrl(`/journal/${entry.slug}`) }, breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Journal', path: '/journal' }, { name: entry.title, path: `/journal/${entry.slug}` }])] : null, [entry])
  if (loading) return <main className="journal-article-loading" role="status">Opening this story…</main>
  if (error) return <main className="journal-article-loading journal-article-error" role="alert"><p>{error}</p><button className="button secondary" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Try again</button></main>
  if (!entry) return <NotFound />
  return <>
    <PageMeta title={entry.seoTitle || entry.title} description={entry.seoDescription || entry.excerpt} canonicalPath={`/journal/${entry.slug}`} image={entry.coverImageUrl} type="article" jsonLd={structuredData} />
    <article className="journal-article">
      <header><Link className="text-link" to="/journal"><ArrowLeft aria-hidden="true" /> Journal</Link><p className="eyebrow">{entry.category}</p><h1>{entry.title}</h1><p>{entry.excerpt}</p><time dateTime={dateValue(entry.publishedAt).toISOString()}><CalendarDays aria-hidden="true" /> {dateLabel(entry.publishedAt)} · {readingTime(entry.bodyMarkdown)}</time></header>
      {entry.coverImageUrl && <figure><img src={entry.coverImageUrl} alt={entry.coverImageAlt} /></figure>}
      <MarkdownContent markdown={entry.bodyMarkdown} className="journal-article-copy" />
      <footer><Link className="button secondary" to="/journal">Return to the Journal</Link></footer>
    </article>
  </>
}
