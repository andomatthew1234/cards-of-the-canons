import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { missionTitleLines, ParallaxFigure } from './Home'

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
