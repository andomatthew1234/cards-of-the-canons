import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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

const JOURNAL_PAGE_SIZE = 10

function paginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const visible = [...new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1].filter((page) => page >= 1 && page <= totalPages))].sort((a, b) => a - b)
  const items: Array<number | string> = []
  visible.forEach((page, index) => {
    if (index > 0 && page - visible[index - 1] > 1) items.push(`ellipsis-${page}`)
    items.push(page)
  })
  return items
}

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
  const [pagesLoaded, setPagesLoaded] = useState(0)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const activeRequest = useRef<string | null>(null)

  const load = useCallback(async (cursor?: string | null) => {
    const requestKey = cursor || 'first-page'
    if (activeRequest.current === requestKey) return
    activeRequest.current = requestKey
    const loadingNextPage = Boolean(cursor)
    if (loadingNextPage) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const page = await listPublishedJournalArticles(cursor)
      setEntries((current) => loadingNextPage ? appendUnique(current, page.articles) : page.articles)
      setNextCursor(page.nextCursor)
      setPagesLoaded((current) => loadingNextPage ? current + 1 : 1)
      if (typeof page.totalCount === 'number') setTotalCount(page.totalCount)
    } catch {
      if (!loadingNextPage) setEntries([])
      setError(loadingNextPage
        ? 'We could not load older Journal stories. The stories already shown are still available.'
        : 'We could not open the Journal. Please check your connection and try again.')
    } finally {
      if (activeRequest.current === requestKey) activeRequest.current = null
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { void load(null) }, [load])
  return { entries, nextCursor, loading, loadingMore, error, pagesLoaded, totalCount, load }
}

function JournalArchiveCard({ entry, index }: { entry: Article; index: number }) {
  const cardRef = useRef<HTMLElement>(null)
  const [scrollFocused, setScrollFocused] = useState(false)

  useEffect(() => {
    const card = cardRef.current
    if (!card || !('IntersectionObserver' in window)) {
      setScrollFocused(true)
      return
    }

    const observer = new IntersectionObserver(([intersection]) => {
      setScrollFocused(intersection.isIntersecting)
    }, {
      rootMargin: '-46% 0px -46% 0px',
      threshold: 0,
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  return <article ref={cardRef} className={`journal-card ${scrollFocused ? 'is-scroll-focused' : ''}`.trim()}>
    <Link className="journal-card-image" to={`/journal/${entry.slug}`}><img src={entry.coverImageUrl || '/images/history/byzantine-church-interior.jpg'} alt={entry.coverImageAlt} loading={index === 0 ? 'eager' : 'lazy'} decoding="async" /></Link>
    <div><p className="eyebrow">{entry.category}</p><h2><Link to={`/journal/${entry.slug}`}>{entry.title}</Link></h2><p>{entry.excerpt}</p><time dateTime={dateValue(entry.publishedAt).toISOString()}><CalendarDays aria-hidden="true" /> {dateLabel(entry.publishedAt)} · {readingTime(entry.bodyMarkdown)}</time><Link className="text-link" to={`/journal/${entry.slug}`}>Read the story <ArrowRight aria-hidden="true" /></Link></div>
  </article>
}

export function Journal() {
  const { entries, nextCursor, loading, loadingMore, error, pagesLoaded, totalCount, load } = useJournalArchive()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawPage = searchParams.get('page')
  const requestedPage = rawPage && /^[1-9]\d*$/.test(rawPage) ? Math.min(9999, Number(rawPage)) : 1
  const search = searchParams.get('q') ?? ''
  const searchQuery = search.trim().toLocaleLowerCase()
  const requestedCategory = searchParams.get('category')?.trim() ?? ''
  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.category.trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second)), [entries])
  const selectedCategory = categories.includes(requestedCategory) ? requestedCategory : ''
  const filteringArchive = Boolean((searchQuery || selectedCategory) && nextCursor && !error)
  const matchingEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesSearch = !searchQuery || `${entry.title} ${entry.excerpt} ${entry.category} ${entry.authorName} ${entry.slug} ${entry.seoTitle} ${entry.seoDescription} ${entry.bodyMarkdown}`.toLocaleLowerCase().includes(searchQuery)
      return matchesSearch && (!selectedCategory || entry.category.trim() === selectedCategory)
    })
  }, [entries, searchQuery, selectedCategory])
  const knownNormalPages = Math.max(1, totalCount === null ? pagesLoaded + (nextCursor ? 1 : 0) : Math.ceil(totalCount / JOURNAL_PAGE_SIZE))
  const hasActiveFilter = Boolean(searchQuery || selectedCategory)
  const totalPages = hasActiveFilter ? Math.max(1, Math.ceil(matchingEntries.length / JOURNAL_PAGE_SIZE)) : knownNormalPages
  const pageStart = (requestedPage - 1) * JOURNAL_PAGE_SIZE
  const visibleEntries = matchingEntries.slice(pageStart, pageStart + JOURNAL_PAGE_SIZE)
  const awaitingRequestedPage = !hasActiveFilter && requestedPage > pagesLoaded && Boolean(nextCursor)

  const setPage = useCallback((page: number, replace = false) => {
    const next = new URLSearchParams(searchParams)
    if (page <= 1) next.delete('page')
    else next.set('page', String(page))
    setSearchParams(next, { replace })
  }, [searchParams, setSearchParams])

  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams)
    const query = value.trimStart()
    if (query) next.set('q', query)
    else next.delete('q')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const setCategory = (category: string) => {
    const next = new URLSearchParams(searchParams)
    if (category) next.set('category', category)
    else next.delete('category')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!hasActiveFilter || !nextCursor || loading || loadingMore || error) return
    void load(nextCursor)
  }, [error, hasActiveFilter, load, loading, loadingMore, nextCursor])

  useEffect(() => {
    if (!rawPage || (/^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 9999)) return
    setPage(1, true)
  }, [rawPage, setPage])

  useEffect(() => {
    if (hasActiveFilter || loading || loadingMore || error || pagesLoaded === 0) return
    if (totalCount !== null && requestedPage > knownNormalPages) {
      setPage(knownNormalPages, true)
      return
    }
    if (requestedPage > pagesLoaded && nextCursor) void load(nextCursor)
  }, [error, hasActiveFilter, knownNormalPages, load, loading, loadingMore, nextCursor, pagesLoaded, requestedPage, setPage, totalCount])

  useEffect(() => {
    if (!hasActiveFilter || filteringArchive || loading || loadingMore || error) return
    if (requestedPage > totalPages) setPage(totalPages, true)
  }, [error, filteringArchive, hasActiveFilter, loading, loadingMore, requestedPage, setPage, totalPages])

  const pageStatus = hasActiveFilter
    ? filteringArchive
      ? `Searching the complete Journal… ${matchingEntries.length} ${matchingEntries.length === 1 ? 'match' : 'matches'} so far`
      : `${matchingEntries.length} ${matchingEntries.length === 1 ? 'story' : 'stories'} found · Page ${requestedPage} of ${totalPages}`
    : totalCount === null
      ? `${entries.length} ${entries.length === 1 ? 'story' : 'stories'} available · Page ${requestedPage}`
      : `Showing ${totalCount === 0 ? 0 : pageStart + 1}–${Math.min(pageStart + visibleEntries.length, totalCount)} of ${totalCount} · Page ${requestedPage} of ${totalPages}`

  return <>
    <PageMeta title="Journal" description="Progress updates and stories from behind the Doxa Treasury collection." canonicalPath="/journal" />
    <section className="journal-hero"><Reveal><BookOpen aria-hidden="true" /><p className="eyebrow">The Doxa Journal</p><h1>Stories behind the Treasury.</h1><p>Progress updates, collection notes and deeper stories from the history of the Church.</p></Reveal></section>
    <section className="journal-index" aria-label="Journal entries" aria-busy={loading || loadingMore}>
      <div className="journal-search-tools" role="search">
        <label className="journal-search"><Search aria-hidden="true" /><span className="sr-only">Search the Journal</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the Journal" autoComplete="off" /></label>
        {categories.length > 1 && <div className="journal-category-filters" aria-label="Filter Journal by category">
          <button type="button" aria-pressed={!selectedCategory} onClick={() => setCategory('')}>All stories</button>
          {categories.map((category) => <button type="button" key={category} aria-pressed={selectedCategory === category} onClick={() => setCategory(category)}>{category}</button>)}
        </div>}
        <p className="journal-search-status" aria-live="polite">{pageStatus}</p>
      </div>
      {loading && <div className="journal-loading" role="status"><span aria-hidden="true" />Opening the Journal…</div>}
      {!loading && error && <div className="journal-notice" role="alert"><p>{error}</p><button className="text-button" onClick={() => void load(nextCursor)}><RefreshCw /> Try again</button></div>}
      {!loading && !error && entries.length === 0 && <div className="journal-notice journal-empty"><BookOpen aria-hidden="true" /><p>No Journal stories have been published yet.</p><p>Please check back soon.</p></div>}
      {!loading && !error && entries.length > 0 && matchingEntries.length === 0 && !filteringArchive && <div className="journal-notice journal-empty"><Search aria-hidden="true" /><p>{selectedCategory ? `No Journal stories are in “${selectedCategory}”.` : `No Journal stories match “${search.trim()}”.`}</p><button className="text-button" onClick={() => selectedCategory ? setCategory('') : setSearch('')}>{selectedCategory ? 'Clear category' : 'Clear search'}</button></div>}
      {!loading && !error && awaitingRequestedPage && <div className="journal-loading journal-page-loading" role="status"><span aria-hidden="true" />Opening page {requestedPage}…</div>}
      {!loading && !error && filteringArchive && visibleEntries.length === 0 && <div className="journal-loading journal-page-loading" role="status"><span aria-hidden="true" />Searching older stories…</div>}
      {!loading && !error && !awaitingRequestedPage && visibleEntries.map((entry, index) => <Reveal key={entry.id} delay={(index % 10) * 70}><JournalArchiveCard entry={entry} index={index} /></Reveal>)}
      {!loading && !error && !filteringArchive && totalPages > 1 && <nav className="journal-pagination" aria-label="Journal pages">
        <button type="button" className="journal-pagination-direction" aria-label="Previous Journal page" disabled={requestedPage <= 1 || loadingMore} onClick={() => setPage(requestedPage - 1)}><ArrowLeft aria-hidden="true" /> Previous</button>
        <div className="journal-pagination-pages">{paginationItems(requestedPage, totalPages).map((item) => typeof item === 'number'
          ? <button type="button" key={item} aria-label={`Go to Journal page ${item}`} aria-current={item === requestedPage ? 'page' : undefined} disabled={item === requestedPage || loadingMore} onClick={() => setPage(item)}>{item}</button>
          : <span key={item} aria-hidden="true">…</span>)}</div>
        <button type="button" className="journal-pagination-direction" aria-label="Next Journal page" disabled={requestedPage >= totalPages || loadingMore} onClick={() => setPage(requestedPage + 1)}>Next <ArrowRight aria-hidden="true" /></button>
      </nav>}
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
