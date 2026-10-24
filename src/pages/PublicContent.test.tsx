import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { About } from './About'
import { Home } from './Home'

vi.mock('../context/CartContext', () => ({
  useCart: () => ({ count: 0, lines: [], add: vi.fn(), update: vi.fn() }),
}))

describe('public release content', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  })

  it('does not expose unfinished social or review placeholders on About', () => {
    render(<MemoryRouter><About /></MemoryRouter>)

    expect(screen.getByRole('link', { name: /read the journal/i })).toHaveAttribute('href', '/journal')
    expect(screen.queryByText(/links coming soon/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reviews coming soon/i)).not.toBeInTheDocument()
  })

  it('does not expose the unfinished review carousel on Home', () => {
    render(<MemoryRouter><Home /></MemoryRouter>)

    expect(screen.queryByText(/reviews coming soon/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /stories from collectors/i })).not.toBeInTheDocument()
  })
})
