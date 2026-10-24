import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    render(<MemoryRouter initialEntries={['/shop']}><Layout><p>Shop</p></Layout></MemoryRouter>)
    expect(screen.getByRole('banner')).toHaveClass('public-header', 'is-surface')
  })
})
