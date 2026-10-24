import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { Journal, JournalArticle } from '../src/pages/Journal'
import { JournalPage } from '../src/pages/admin/JournalPage'
import { JournalEditorPage } from '../src/pages/admin/JournalEditorPage'
import * as dataApi from '../src/lib/data'
import type { Article } from '../src/types'

vi.mock('../src/lib/data', () => ({
  listPublishedJournalArticles: vi.fn(),
  getPublishedJournalArticle: vi.fn(),
  listJournalArticlesAdminPage: vi.fn(),
  getJournalArticleAdmin: vi.fn(),
  deleteJournalArticle: vi.fn(),
  publishJournalArticle: vi.fn(),
  retryJournalNotification: vi.fn(),
  saveJournalArticle: vi.fn(),
  uploadJournalImage: vi.fn(),
}))

vi.mock('../src/components/PageMeta', () => ({ PageMeta: () => null }))
vi.mock('../src/components/Reveal', () => ({ Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../src/context/AuthContext', () => ({
  friendlyAuthError: (value: unknown) => value instanceof Error ? value.message : 'The request failed.',
  useAuth: () => ({ cancelMfaReauthentication: vi.fn() }),
}))

const article = (id: string, title: string): Article => ({
  id, revision: 1, slug: title.toLowerCase().replace(/\s+/g, '-'), title,
  excerpt: `A considered introduction to ${title}.`, bodyMarkdown: `## ${title}\n\nA complete Journal story.`,
  category: 'Progress update', coverImageUrl: '', coverImageAlt: '', authorName: 'Doxa Treasury',
  seoTitle: '', seoDescription: '', featured: false, status: 'published', publishedAt: '2026-10-24T00:00:00.000Z',
})

describe('public Journal reliability', () => {
  beforeEach(() => {
    vi.mocked(dataApi.listPublishedJournalArticles).mockReset()
    vi.mocked(dataApi.getPublishedJournalArticle).mockReset()
    vi.mocked(dataApi.listJournalArticlesAdminPage).mockReset()
    vi.mocked(dataApi.getJournalArticleAdmin).mockReset()
  })
  afterEach(cleanup)

  it('does not substitute hard-coded stories when the managed archive is empty', async () => {
    vi.mocked(dataApi.listPublishedJournalArticles).mockResolvedValue({ articles: [], nextCursor: null })
    render(<MemoryRouter><Journal /></MemoryRouter>)

    expect(await screen.findByText('No Journal stories have been published yet.')).toBeInTheDocument()
    expect(screen.queryByText('Building the Doxa Treasury')).not.toBeInTheDocument()
  })

  it('shows an unavailable state instead of stale stories when loading fails', async () => {
    vi.mocked(dataApi.listPublishedJournalArticles).mockRejectedValue(new Error('backend unavailable'))
    render(<MemoryRouter><Journal /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not open the Journal')
    expect(screen.queryByText('Building the Doxa Treasury')).not.toBeInTheDocument()
  })

  it('distinguishes a failed direct article lookup from a missing article', async () => {
    vi.mocked(dataApi.getPublishedJournalArticle).mockRejectedValue(new Error('backend unavailable'))
    render(<MemoryRouter initialEntries={['/journal/an-older-story']}><Routes><Route path="/journal/:slug" element={<JournalArticle />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not open this Journal story')
    expect(screen.queryByText(/page could not be found/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(dataApi.getPublishedJournalArticle).toHaveBeenCalledTimes(2)
  })

  it('loads older public stories one cursor page at a time without duplicates', async () => {
    vi.mocked(dataApi.listPublishedJournalArticles)
      .mockResolvedValueOnce({ articles: [article('article-first', 'Newest story')], nextCursor: 'article-first' })
      .mockResolvedValueOnce({ articles: [article('article-older', 'Older story')], nextCursor: null })
    render(<MemoryRouter><Journal /></MemoryRouter>)

    expect(await screen.findByText('Newest story')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load older stories' }))
    expect(await screen.findByText('Older story')).toBeInTheDocument()
    expect(screen.getAllByText('Newest story')).toHaveLength(1)
    expect(dataApi.listPublishedJournalArticles).toHaveBeenNthCalledWith(2, 'article-first')
  })

  it('opens an article through a direct slug lookup rather than an archive page', async () => {
    vi.mocked(dataApi.getPublishedJournalArticle).mockResolvedValue(article('article-older', 'Older story'))
    render(<MemoryRouter initialEntries={['/journal/older-story']}><Routes><Route path="/journal/:slug" element={<JournalArticle />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Older story', level: 1 })).toBeInTheDocument()
    expect(dataApi.getPublishedJournalArticle).toHaveBeenCalledWith('older-story')
    expect(dataApi.listPublishedJournalArticles).not.toHaveBeenCalled()
  })

  it('paginates the administrator list and reports full collection counts', async () => {
    vi.mocked(dataApi.listJournalArticlesAdminPage)
      .mockResolvedValueOnce({ articles: [article('article-first', 'Newest admin story')], nextCursor: 'article-first', counts: { draft: 4, published: 101 } })
      .mockResolvedValueOnce({ articles: [article('article-older', 'Oldest admin story')], nextCursor: null, counts: { draft: 4, published: 101 } })
    render(<MemoryRouter><JournalPage /></MemoryRouter>)

    expect(await screen.findByText('Newest admin story')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load older entries' }))
    expect(await screen.findByText('Oldest admin story')).toBeInTheDocument()
    expect(dataApi.listJournalArticlesAdminPage).toHaveBeenNthCalledWith(2, 'article-first')
  })

  it('does not expose a blank Journal editor after an existing-entry read fails', async () => {
    vi.mocked(dataApi.getJournalArticleAdmin)
      .mockRejectedValueOnce(new Error('Journal entry could not be loaded.'))
      .mockResolvedValueOnce(article('article-older', 'Recovered story'))
    render(<MemoryRouter initialEntries={['/admin/journal/article-older']}><Routes><Route path="/admin/journal/:id" element={<JournalEditorPage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('Journal entry could not be loaded.')
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Recovered story')
    expect(dataApi.getJournalArticleAdmin).toHaveBeenCalledTimes(2)
  })
})
