import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookOpen, ShieldCheck, Sparkles } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CartProvider } from '../context/CartContext'
import { demoProducts } from '../data/demo'
import { HomeIntroductionBody, HomeProductCarousel, InformationGrid, missionTitleLines, ParallaxFigure } from './Home'

describe('homepage history copy', () => {
  it('renders bold and italic formatting instead of exposing markdown markers', () => {
    const { container } = render(<HomeIntroductionBody value="History is **carefully made** and *collected*." />)

    expect(container.querySelector('strong')).toHaveTextContent('carefully made')
    expect(container.querySelector('em')).toHaveTextContent('collected')
    expect(container).not.toHaveTextContent('**carefully made**')
    expect(container).not.toHaveTextContent('*collected*')
  })
})

describe('homepage card interaction', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
  })

  it('waits for the rear artwork to decode before starting a requested flip', async () => {
    let finishDecode: (() => void) | undefined
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => new Promise<void>((resolve) => { finishDecode = resolve })),
    })

    const user = userEvent.setup()
    const { container } = render(<ParallaxFigure
      src="/images/example-card.webp"
      alt="Front artwork"
      backSrc="/images/example-card-back.webp"
      backAlt="Rear artwork"
    />)
    const card = screen.getByRole('button', { name: 'Show the back of the Doxa card' })
    expect(screen.getByAltText('Front artwork')).toHaveAttribute('src', '/images/example-card.webp')
    const rearArtwork = screen.getByAltText('Rear artwork')
    expect(rearArtwork).toHaveAttribute('src', '/images/example-card-back.webp')
    expect(rearArtwork).toHaveAttribute('loading', 'eager')
    expect(rearArtwork).toHaveAttribute('fetchpriority', 'high')
    const prompt = container.querySelector('.home-history-click-prompt')
    expect(prompt).toHaveTextContent('Click me')
    expect(prompt?.previousElementSibling).toHaveClass('home-history-image')
    expect(prompt?.querySelector('.lucide-arrow-up')).toBeInTheDocument()

    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'false')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).not.toHaveClass('is-flipped')

    fireEvent.load(rearArtwork)
    await act(async () => finishDecode?.())

    await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'true'))
    expect(card).toHaveAttribute('aria-busy', 'false')
    expect(card).toHaveAccessibleName('Show the front of the Doxa card')

    await user.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns immediately when the rear artwork is already decoded', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    const user = userEvent.setup()
    render(<ParallaxFigure src="/images/front.webp" backSrc="/images/back.webp" />)
    const card = screen.getByRole('button', { name: 'Show the back of the Doxa card' })

    fireEvent.load(document.querySelector('.home-history-back-image') as HTMLImageElement)
    await waitFor(() => expect(card).toHaveAttribute('aria-busy', 'false'))
    await user.click(card)

    expect(card).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the branded rear face for website content saved before rear images existed', () => {
    const { container } = render(<ParallaxFigure src="/images/example-card.webp" />)
    expect(container.querySelector('.home-history-back')).not.toHaveClass('has-custom-image')
    expect(screen.getByText('Doxa')).toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false')
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
  const items = [
    { icon: BookOpen, title: 'One', body: 'First' },
    { icon: Sparkles, title: 'Two', body: 'Second' },
    { icon: ShieldCheck, title: 'Three', body: 'Third' },
    { icon: BookOpen, title: 'Four', body: 'Fourth' },
  ]

  it('renders title-only selling points without empty flavour-text paragraphs', () => {
    render(<InformationGrid items={[
      { icon: BookOpen, title: 'Tested for child safety', body: '' },
      { icon: Sparkles, title: 'Reverently produced', body: '' },
      { icon: ShieldCheck, title: 'No AI', body: '' },
    ]} />)

    const card = screen.getByRole('heading', { name: 'Tested for child safety' }).closest('article')
    expect(card?.querySelector('p')).toBeNull()
  })

  it('keeps every bubble in the free-scrolling track and arrows select one at a time', () => {
    render(<InformationGrid items={items} />)

    const carousel = screen.getByRole('region', { name: 'Why Doxa information' })
    const next = screen.getByRole('button', { name: 'Next information' })
    const retainedCard = screen.getByRole('heading', { name: 'Two' }).closest('article')

    fireEvent.click(next)
    expect(screen.getByRole('status')).toHaveTextContent('Information 2 of 4')
    expect(screen.getByRole('heading', { name: 'Two' }).closest('article')).toBe(retainedCard)
    expect(screen.getByRole('heading', { name: 'One' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Four' })).toBeInTheDocument()
  })

  it('supports mouse dragging without snapping the free-scroll position', () => {
    const { container } = render(<InformationGrid items={items} />)
    const viewport = container.querySelector('.home-information-grid') as HTMLElement
    Object.defineProperty(viewport, 'scrollLeft', { value: 0, writable: true })

    fireEvent.pointerDown(viewport, { button: 0, pointerId: 7, clientX: 220 })
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 120 })

    expect(viewport.scrollLeft).toBe(100)
    expect(viewport).toHaveClass('is-dragging')

    fireEvent.pointerUp(viewport, { pointerId: 7, clientX: 120 })
    expect(viewport).not.toHaveClass('is-dragging')
  })

  it('supports arrow-key navigation and wraps in reduced-motion mode', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    render(<InformationGrid items={items.slice(0, 3)} />)

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

describe('homepage product carousel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 })
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
  })

  it('renders every product for free scrolling and advances one product per arrow press on mobile', () => {
    const products = demoProducts.slice(0, 4)
    render(<MemoryRouter><CartProvider><HomeProductCarousel products={products} /></CartProvider></MemoryRouter>)

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByRole('status')).toHaveTextContent('Product 1 of 4')

    fireEvent.click(screen.getByRole('button', { name: 'Next product' }))
    expect(screen.getByRole('status')).toHaveTextContent('Product 2 of 4')
    fireEvent.click(screen.getByRole('button', { name: 'Previous product' }))
    expect(screen.getByRole('status')).toHaveTextContent('Product 1 of 4')
    fireEvent.click(screen.getByRole('button', { name: 'Previous product' }))
    expect(screen.getByRole('status')).toHaveTextContent('Product 4 of 4')
  })
})
