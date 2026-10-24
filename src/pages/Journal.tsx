import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MarkdownContent } from '../components/MarkdownContent'
import { PageMeta } from '../components/PageMeta'
import { Reveal } from '../components/Reveal'
import { listPublishedJournalArticles } from '../lib/data'
import { absoluteUrl, breadcrumbJsonLd } from '../lib/seo'
import type { Article } from '../types'
import { NotFound } from './NotFound'

const starterEntries: Article[] = [
  { id: 'starter-building-doxa', revision: 0, slug: 'building-the-doxa-treasury', title: 'Building the Doxa Treasury', excerpt: 'A first look at the ideas shaping Doxa: beautiful objects, carefully told stories and a collection designed to be revisited.', category: 'Progress update', coverImageUrl: '/images/history/hosios-loukas.jpg', coverImageAlt: 'The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia', authorName: 'Doxa Treasury', seoTitle: '', seoDescription: '', featured: true, status: 'published', publishedAt: '2026-10-01T00:00:00.000Z', bodyMarkdown: 'Doxa began with a simple hope: to make the beauty and history of the Church easier to encounter, hold and share. The collection is being shaped around stories worth returning to, with artwork and physical details that invite a closer look.\n\nWe are currently refining the first cards, their presentation and the wider collecting experience. That work includes the Treasury, where collectors will be able to record the cards they own and see their collection grow over time.\n\nThis Journal will hold progress notes, stories behind the collection and longer explorations of the people, places and moments that inspire Doxa. More will be shared as the first release takes shape.' },
  { id: 'starter-history-hands', revision: 0, slug: 'why-history-belongs-in-your-hands', title: 'Why history belongs in your hands', excerpt: 'The thinking behind a tactile collection—and why a physical object can make a story feel newly present.', category: 'From the studio', coverImageUrl: '/images/editorial/doxa-candle-vigil.webp', coverImageAlt: 'Beeswax prayer candles glowing inside an Orthodox Church', authorName: 'Doxa Treasury', seoTitle: '', seoDescription: '', featured: false, status: 'published', publishedAt: '2026-10-01T00:00:00.000Z', bodyMarkdown: 'History can feel distant when it is reduced to dates on a page. A thoughtfully made card creates a different kind of encounter: an image to study, a story to remember and an object that can be shared with somebody else.\n\nThat is why Doxa is being designed as more than a checklist. Each card belongs to a wider treasury of people, places and turning points, with room for a collector to make connections across the life of the Church.\n\nThe physical collection and the online Treasury are intended to work together. The card remains the heart of the experience; the account simply helps collectors recognise what they hold and discover what remains.' },
]

function dateValue(value: unknown) {
  if (typeof value === 'string') return new Date(value)
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate()
  return new Date()
}
function dateLabel(value: unknown) { return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(dateValue(value)) }
function readingTime(body: string) { return `${Math.max(1, Math.ceil(body.trim().split(/\s+/).length / 220))} minute read` }

function useJournal() {
  const [entries, setEntries] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => {
    setLoading(true); setError('')
    void listPublishedJournalArticles().then((managed) => setEntries(managed.length ? managed : starterEntries)).catch(() => { setEntries(starterEntries); setError('We could not check for the latest stories. The Journal archive is still available below.') }).finally(() => setLoading(false))
  }
  useEffect(load, [])
  return { entries, loading, error, load }
}

export function Journal() {
  const { entries, loading, error, load } = useJournal()
  return <>
    <PageMeta title="Journal" description="Progress updates and stories from behind the Doxa Treasury collection." canonicalPath="/journal" />
    <section className="journal-hero"><Reveal><BookOpen aria-hidden="true" /><p className="eyebrow">The Doxa Journal</p><h1>Stories behind the Treasury.</h1><p>Progress updates, collection notes and deeper stories from the history of the Church.</p></Reveal></section>
    <section className="journal-index" aria-label="Journal entries" aria-busy={loading}>
      {loading && <div className="journal-loading" role="status"><span aria-hidden="true" />Opening the Journal…</div>}
      {error && <div className="journal-notice" role="status"><p>{error}</p><button className="text-button" onClick={load}><RefreshCw /> Check again</button></div>}
      {!loading && entries.map((entry, index) => <Reveal key={entry.slug} delay={index * 70}><article className="journal-card">
        <Link className="journal-card-image" to={`/journal/${entry.slug}`}><img src={entry.coverImageUrl || '/images/history/byzantine-church-interior.jpg'} alt={entry.coverImageAlt} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" /></Link>
        <div><p className="eyebrow">{entry.category}</p><h2><Link to={`/journal/${entry.slug}`}>{entry.title}</Link></h2><p>{entry.excerpt}</p><time dateTime={dateValue(entry.publishedAt).toISOString()}><CalendarDays aria-hidden="true" /> {dateLabel(entry.publishedAt)} · {readingTime(entry.bodyMarkdown)}</time><Link className="text-link" to={`/journal/${entry.slug}`}>Read the story <ArrowRight aria-hidden="true" /></Link></div>
      </article></Reveal>)}
    </section>
  </>
}

export function JournalArticle() {
  const { slug } = useParams()
  const { entries, loading } = useJournal()
  const entry = entries.find((item) => item.slug === slug)
  const structuredData = useMemo(() => entry ? [{ '@context': 'https://schema.org', '@type': 'Article', headline: entry.title, description: entry.excerpt, image: absoluteUrl(entry.coverImageUrl), datePublished: dateValue(entry.publishedAt).toISOString(), dateModified: dateValue(entry.updatedAt ?? entry.publishedAt).toISOString(), author: { '@type': 'Organization', name: entry.authorName }, mainEntityOfPage: absoluteUrl(`/journal/${entry.slug}`) }, breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Journal', path: '/journal' }, { name: entry.title, path: `/journal/${entry.slug}` }])] : null, [entry])
  if (loading) return <main className="journal-article-loading" role="status">Opening this story…</main>
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
