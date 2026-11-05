import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../src/components/Layout'
import { Home } from '../src/pages/Home'

vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../src/context/CartContext', () => ({ useCart: () => ({ count: 0, lines: [], add: vi.fn(), update: vi.fn() }) }))

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

describe('public-site startup and header contract', () => {
  it('makes the first mobile video frame visible as soon as media data is available and starts playback without scrolling', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    render(<MemoryRouter><Home /></MemoryRouter>)

    const video = document.querySelector<HTMLVideoElement>('video.heritage-hero-video')
    expect(video).not.toBeNull()
    fireEvent.loadedData(video!)

    expect(video).toHaveClass('is-ready')
    await waitFor(() => expect(play).toHaveBeenCalled())
  })

  it('uses one header geometry contract and changes only its visual state by route', () => {
    const home = render(<MemoryRouter initialEntries={['/']}><Layout><p>Home</p></Layout></MemoryRouter>)
    expect(screen.getByRole('banner')).toHaveClass('public-header', 'is-overlay')
    home.unmount()

    const about = render(<MemoryRouter initialEntries={['/about']}><Layout><p>About</p></Layout></MemoryRouter>)
    expect(screen.getByRole('banner')).toHaveClass('public-header', 'immersive-header', 'is-overlay')
    about.unmount()

    const shop = render(<MemoryRouter initialEntries={['/shop']}><Layout><p>Shop</p></Layout></MemoryRouter>)
    expect(screen.getByRole('banner')).toHaveClass('public-header', 'is-surface')
    shop.unmount()

    render(<MemoryRouter initialEntries={['/journal/a-story']}><Layout><p>Journal article</p></Layout></MemoryRouter>)
    expect(screen.getByRole('banner')).toHaveClass('public-header', 'is-surface')
  })

  it('blends into integrated Journal artwork, then becomes a raised surface after scrolling', async () => {
    render(<MemoryRouter initialEntries={['/journal']}><Layout><section className="journal-hero">Journal hero</section></Layout></MemoryRouter>)

    const header = screen.getByRole('banner')
    expect(header).toHaveClass('public-header', 'is-overlay')
    expect(header).toHaveClass('immersive-header')
    expect(document.querySelector('.site-shell')).toHaveClass('immersive-shell')

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 80 })
    fireEvent.scroll(window)
    await waitFor(() => expect(header).toHaveClass('is-surface', 'is-scrolled'))

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    fireEvent.scroll(window)
    await waitFor(() => expect(header).toHaveClass('is-overlay'))
  })

  it('keeps the same header transition inside the Website Editor preview scroller', async () => {
    const { container } = render(<MemoryRouter><div className="website-preview-shell"><Layout previewMode previewPath="/about"><section>About preview</section></Layout></div></MemoryRouter>)
    const header = screen.getByRole('banner')
    const previewScroller = container.querySelector<HTMLElement>('.website-preview-shell')!
    expect(header).toHaveClass('is-overlay')

    Object.defineProperty(previewScroller, 'scrollTop', { configurable: true, value: 80 })
    fireEvent.scroll(previewScroller)
    await waitFor(() => expect(header).toHaveClass('is-surface', 'is-scrolled'))
  })

  it('contains mobile-menu focus, closes with Escape and restores the trigger', async () => {
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><Layout><p>Page</p></Layout></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    await user.click(trigger)

    expect(screen.getByRole('dialog', { name: 'Site navigation menu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus()
    expect(container.querySelector('main')).toHaveAttribute('inert')
    expect(container.querySelector('footer')).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')

    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Site navigation menu' })).not.toBeInTheDocument()
    expect(container.querySelector('main')).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })
})
