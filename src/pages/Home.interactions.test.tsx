import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookOpen, ShieldCheck, Sparkles } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InformationGrid, missionTitleLines, ParallaxFigure } from './Home'

describe('homepage card interaction', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
  })

  it('turns the display card over and back from the same accessible control', async () => {
    const user = userEvent.setup()
    render(<ParallaxFigure src="/images/example-card.webp" />)
    const card = screen.getByRole('button', { name: 'Show the back of the Doxa card' })

    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(card).toHaveAccessibleName('Show the front of the Doxa card')

    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('homepage mission title', () => {
  it('keeps the published mission title to two deliberate lines', () => {
    expect(missionTitleLines("The Church's Light, Is Meant To Be Shared")).toEqual([
      "The Church's Light,",
      'Is Meant To Be Shared',
    ])
  })
})

describe('homepage information carousel', () => {
  it('supports arrow-key navigation and wraps in reduced-motion mode', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    render(<InformationGrid items={[
      { icon: BookOpen, title: 'One', body: 'First' },
      { icon: Sparkles, title: 'Two', body: 'Second' },
      { icon: ShieldCheck, title: 'Three', body: 'Third' },
    ]} />)

    const carousel = screen.getByRole('region', { name: 'Why Doxa information' })
    const retainedCard = screen.getByRole('heading', { name: 'Two' }).closest('article')
    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Information 2 of 3')
    expect(screen.getByRole('heading', { name: 'Two' }).closest('article')).toBe(retainedCard)
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('Information 1 of 3')
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('Information 3 of 3')
  })
})
