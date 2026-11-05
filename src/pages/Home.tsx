import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Landmark, ScrollText, ShieldCheck, Sparkles, UsersRound, type LucideIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { CatalogueEmpty, CatalogueLoading, CatalogueUnavailable } from '../components/CatalogueState'
import { PageMeta } from '../components/PageMeta'
import { socialIconById } from '../components/SocialPlatformIcon'
import { ProductCard } from '../components/ProductCard'
import { wrapIndex } from '../lib/carousel'
import { Reveal } from '../components/Reveal'
import { SafeRichText } from '../components/SafeRichText'
import { useCatalogState } from '../context/CatalogContext'
import { useSiteContent } from '../context/SiteContentContext'
import { defaultHomepageEditorialPanels } from '../cms/websiteContent'
import { organizationJsonLd, websiteJsonLd } from '../lib/seo'
import { orderHomeProducts } from '../lib/homeProducts'
import type { Product } from '../types'

type StoryPoint = { id?: string; icon: LucideIcon; title: string; body: string; imageUrl?: string; imageAlt?: string }
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } }
type CarouselDirection = -1 | 1

function canPlayHeroVideo() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const prefersReducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const savesData = (navigator as NavigatorWithConnection).connection?.saveData === true
  return !prefersReducedMotion && !savesData
}

const heroPoster = '/images/doxa-home-hero-poster.webp'
const desktopHeroVideo = '/videos/doxa-home-hero-boomerang.mp4'
const mobileHeroVideo = '/videos/doxa-home-hero-boomerang-mobile.mp4'
const mobileHeroQuery = '(max-width: 700px) and (orientation: portrait)'

function responsiveHeroVideoSource() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return desktopHeroVideo
  return window.matchMedia(mobileHeroQuery).matches ? mobileHeroVideo : desktopHeroVideo
}

function HomeHeroVideo({ onReadyChange }: { onReadyChange: (ready: boolean) => void }) {
  const [enabled, setEnabled] = useState(canPlayHeroVideo)
  const [ready, setReady] = useState(false)
  const [source, setSource] = useState(responsiveHeroVideoSource)
  const videoRef = useRef<HTMLVideoElement>(null)

  const markReady = useCallback(() => {
    setReady(true)
    onReadyChange(true)
  }, [onReadyChange])

  const attemptPlayback = useCallback(() => {
    const video = videoRef.current
    if (!video || !enabled) return
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    void video.play().then(markReady).catch(() => {
      // The decoded poster/first frame remains visible. Pageshow and visibility
      // listeners below retry playback when a mobile browser permits it.
    })
  }, [enabled, markReady])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobilePreference = window.matchMedia(mobileHeroQuery)
    const updatePreference = () => {
      setEnabled(canPlayHeroVideo())
      setReady(false)
      onReadyChange(false)
    }
    const updateSource = () => {
      setSource(mobilePreference.matches ? mobileHeroVideo : desktopHeroVideo)
      setReady(false)
      onReadyChange(false)
    }

    motionPreference.addEventListener?.('change', updatePreference)
    mobilePreference.addEventListener?.('change', updateSource)
    return () => {
      motionPreference.removeEventListener?.('change', updatePreference)
      mobilePreference.removeEventListener?.('change', updateSource)
      onReadyChange(false)
    }
  }, [onReadyChange])

  useEffect(() => {
    if (!enabled) return
    const frame = window.requestAnimationFrame(attemptPlayback)
    const retry = () => attemptPlayback()
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') attemptPlayback()
    }
    window.addEventListener('pageshow', retry)
    document.addEventListener('visibilitychange', retryWhenVisible)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pageshow', retry)
      document.removeEventListener('visibilitychange', retryWhenVisible)
    }
  }, [attemptPlayback, enabled, source])

  if (!enabled) return null

  return <video
    ref={videoRef}
    className={`heritage-hero-video${ready ? ' is-ready' : ''}`}
    src={source}
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    poster={heroPoster}
    aria-hidden="true"
    tabIndex={-1}
    onLoadedData={() => {
      markReady()
      attemptPlayback()
    }}
    onCanPlay={attemptPlayback}
    onPlaying={markReady}
    onError={() => {
      setReady(false)
      onReadyChange(false)
    }}
  />
}

function churchCase(value: string) {
  return value.replace(/\bchurch\b/g, 'Church')
}

export function HomeIntroductionBody({ value }: { value: string }) {
  return <SafeRichText value={value} className="home-introduction-body" />
}

export function missionTitleLines(value: string) {
  const normalised = value.trim()
  if (/^the Church's light,\s*is meant to be shared$/i.test(normalised)) {
    return ["The Church's Light,", 'Is Meant To Be Shared']
  }
  return normalised.split(/\n|\|/).map((line) => line.trim()).filter(Boolean)
}

export function ParallaxFigure({
  src,
  alt = '',
  backSrc = '',
  backAlt = '',
}: {
  src: string
  alt?: string
  backSrc?: string
  backAlt?: string
}) {
  const frameRef = useRef<HTMLElement>(null)
  const backImageRef = useRef<HTMLImageElement>(null)
  const backLoadVersion = useRef(0)
  const pointerFrame = useRef(0)
  const [flipped, setFlipped] = useState(false)
  const [backReady, setBackReady] = useState(!backSrc)
  const [flipQueued, setFlipQueued] = useState(false)

  const prepareBackImage = useCallback(async (image: HTMLImageElement, version: number) => {
    try {
      if (typeof image.decode === 'function') await image.decode()
    } catch {
      // Some browsers reject decode() for an otherwise usable cached image.
      if (!image.complete || image.naturalWidth === 0) return
    }
    if (version === backLoadVersion.current) setBackReady(true)
  }, [])

  useEffect(() => {
    const version = backLoadVersion.current + 1
    backLoadVersion.current = version
    setFlipped(false)
    setFlipQueued(false)
    setBackReady(!backSrc)
    const image = backImageRef.current
    if (backSrc && image?.complete && image.naturalWidth > 0) void prepareBackImage(image, version)
  }, [backSrc, prepareBackImage])

  useEffect(() => {
    if (!backReady || !flipQueued) return
    setFlipped(true)
    setFlipQueued(false)
  }, [backReady, flipQueued])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches) return
    let scrollFrame = 0
    const updateScroll = () => {
      window.cancelAnimationFrame(scrollFrame)
      scrollFrame = window.requestAnimationFrame(() => {
        const bounds = frame.getBoundingClientRect()
        const progress = ((bounds.top + bounds.height / 2) - window.innerHeight / 2) / window.innerHeight
        frame.style.setProperty('--history-scroll-y', `${Math.max(-24, Math.min(24, progress * -30))}px`)
      })
    }
    updateScroll()
    window.addEventListener('scroll', updateScroll, { passive: true })
    window.addEventListener('resize', updateScroll)
    return () => {
      window.cancelAnimationFrame(scrollFrame)
      window.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', updateScroll)
    }
  }, [])

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const frame = frameRef.current
    if (!frame || event.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = frame.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
    window.cancelAnimationFrame(pointerFrame.current)
    pointerFrame.current = window.requestAnimationFrame(() => {
      frame.style.setProperty('--history-pointer-x', `${x * 13}px`)
      frame.style.setProperty('--history-pointer-y', `${y * 10}px`)
      frame.style.setProperty('--history-tilt-x', `${y * -1.5}deg`)
      frame.style.setProperty('--history-tilt-y', `${x * 1.8}deg`)
    })
  }

  const reset = () => {
    const frame = frameRef.current
    if (!frame) return
    frame.style.setProperty('--history-pointer-x', '0px')
    frame.style.setProperty('--history-pointer-y', '0px')
    frame.style.setProperty('--history-tilt-x', '0deg')
    frame.style.setProperty('--history-tilt-y', '0deg')
  }

  const toggleFlip = () => {
    if (backSrc && !backReady && !flipped) {
      setFlipQueued(true)
      return
    }
    setFlipQueued(false)
    setFlipped((current) => !current)
  }

  return <figure ref={frameRef} onPointerMove={move} onPointerLeave={reset} aria-label="Interactive Doxa card artwork">
    <div className="home-history-image">
      <button className={`home-history-flip${flipped ? ' is-flipped' : ''}${flipQueued ? ' is-preparing' : ''}`} type="button" aria-pressed={flipped} aria-busy={backSrc ? !backReady : false} aria-label={flipped ? 'Show the front of the Doxa card' : 'Show the back of the Doxa card'} onClick={toggleFlip}>
        <span className="home-history-flip-inner">
          <span className="home-history-face home-history-front" aria-hidden={flipped || undefined}><img src={src} alt={alt} loading="lazy" decoding="async" /></span>
          <span className={`home-history-face home-history-back${backSrc ? ' has-custom-image' : ''}`} aria-hidden={!flipped || undefined}>
            {backSrc
              ? <img ref={backImageRef} className="home-history-back-image" src={backSrc} alt={backAlt} loading="eager" fetchPriority="high" decoding="async" onLoad={(event) => void prepareBackImage(event.currentTarget, backLoadVersion.current)} />
              : <><span className="home-card-back-mark">D</span><strong>Doxa</strong><small>Treasury</small><span className="home-card-back-rule" /></>}
          </span>
        </span>
      </button>
    </div>
    <span className="home-history-click-prompt" aria-hidden="true">
      <ArrowUp />
      <span>Click me</span>
    </span>
    <figcaption className="sr-only">Select the card to turn it over.</figcaption>
  </figure>
}

function MissionBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const play = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const video = videoRef.current
    if (!video) return
    video.muted = true
    video.playsInline = true
    void video.play().catch(() => undefined)
  }, [])
  useEffect(() => {
    const frame = window.requestAnimationFrame(play)
    window.addEventListener('pageshow', play)
    document.addEventListener('visibilitychange', play)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pageshow', play)
      document.removeEventListener('visibilitychange', play)
    }
  }, [play])
  return <video className="home-mission-background" ref={videoRef} autoPlay muted loop playsInline preload="metadata" poster="/images/mission-candles-poster.webp" tabIndex={-1} aria-hidden="true" onLoadedData={play} onCanPlay={play}>
    <source media="(max-width: 700px)" src="/videos/doxa-mission-candles-mobile.mp4" type="video/mp4" />
    <source src="/videos/doxa-mission-candles.mp4" type="video/mp4" />
  </video>
}

function prefersReducedCarouselMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useFreeScrollCarousel(itemCount: number) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLElement | null>>([])
  const dragRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0, moved: false })
  const suppressClickRef = useRef(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragging, setDragging] = useState(false)

  const registerSlide = useCallback((index: number, node: HTMLElement | null) => {
    slideRefs.current[index] = node
  }, [])

  const nearestIndex = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport || itemCount <= 0) return 0
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    slideRefs.current.slice(0, itemCount).forEach((slide, index) => {
      if (!slide) return
      const distance = Math.abs(slide.offsetLeft - viewport.scrollLeft)
      if (distance < nearestDistance) {
        nearest = index
        nearestDistance = distance
      }
    })
    return nearest
  }, [itemCount])

  const onScroll = useCallback(() => {
    setActiveIndex(nearestIndex())
  }, [nearestIndex])

  const scrollToIndex = useCallback((index: number) => {
    if (itemCount <= 0) return
    const next = wrapIndex(index, itemCount)
    const viewport = viewportRef.current
    const slide = slideRefs.current[next]
    if (!viewport || !slide) return
    const options: ScrollToOptions = {
      left: slide.offsetLeft,
      behavior: prefersReducedCarouselMotion() ? 'auto' : 'smooth',
    }
    if (typeof viewport.scrollTo === 'function') viewport.scrollTo(options)
    else viewport.scrollLeft = options.left ?? 0
    setActiveIndex(next)
  }, [itemCount])

  const move = useCallback((direction: CarouselDirection) => {
    if (itemCount <= 1) return
    scrollToIndex(activeIndex + direction)
  }, [activeIndex, itemCount, scrollToIndex])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? -1 : 1)
  }, [move])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || itemCount <= 1) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    }
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [itemCount])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag.pointerId !== event.pointerId) return
    const distance = event.clientX - drag.startX
    if (!drag.moved && Math.abs(distance) < 7) return
    drag.moved = true
    suppressClickRef.current = true
    setDragging(true)
    event.preventDefault()
    event.currentTarget.scrollLeft = drag.startScrollLeft - distance
    setActiveIndex(nearestIndex())
  }, [nearestIndex])

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current.pointerId = -1
    setDragging(false)
    setActiveIndex(nearestIndex())
  }, [nearestIndex])

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }, [])

  useEffect(() => {
    slideRefs.current.length = itemCount
    setActiveIndex((current) => itemCount > 0 ? wrapIndex(current, itemCount) : 0)
  }, [itemCount])

  useEffect(() => {
    const alignCurrentSlide = () => {
      const viewport = viewportRef.current
      const slide = slideRefs.current[activeIndex]
      if (viewport && slide) viewport.scrollLeft = slide.offsetLeft
    }
    window.addEventListener('resize', alignCurrentSlide, { passive: true })
    return () => window.removeEventListener('resize', alignCurrentSlide)
  }, [activeIndex])

  return {
    activeIndex,
    dragging,
    viewportRef,
    registerSlide,
    move,
    onKeyDown,
    onScroll,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onClickCapture,
  }
}

export function InformationGrid({ items }: { items: StoryPoint[] }) {
  const [visibleCount, setVisibleCount] = useState(3)
  useEffect(() => {
    const update = () => setVisibleCount(window.innerWidth < 640 ? 1 : 3)
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])
  const carousel = useFreeScrollCarousel(items.length)
  const at = (offset: number) => items[wrapIndex(carousel.activeIndex + offset, items.length)]

  return <section className="home-information home-stage home-texture home-texture-terra" aria-label="Why Doxa">
    <div className="home-information-carousel" role="region" aria-roledescription="carousel" aria-label="Why Doxa information" tabIndex={0} onKeyDown={carousel.onKeyDown}>
      <article className="home-information-card home-information-ghost is-left" aria-hidden="true"><h3>{churchCase(at(-1).title)}</h3>{at(-1).body && <p>{churchCase(at(-1).body)}</p>}</article>
      <div
        className={`home-information-grid${carousel.dragging ? ' is-dragging' : ''}`}
        ref={carousel.viewportRef}
        onScroll={carousel.onScroll}
        onPointerDown={carousel.onPointerDown}
        onPointerMove={carousel.onPointerMove}
        onPointerUp={carousel.onPointerUp}
        onPointerCancel={carousel.onPointerCancel}
        onClickCapture={carousel.onClickCapture}
      >
        <div
          className="home-information-track"
          data-visible-count={visibleCount}
        >
          {items.map((item, index) => {
            const Icon = item.icon
            const itemNumber = index + 1
            return <article
              className={`home-information-card${item.imageUrl ? ' has-background' : ''}`}
              key={item.id ?? index}
              ref={(node) => carousel.registerSlide(index, node)}
              style={item.imageUrl ? { backgroundImage: `linear-gradient(145deg, rgba(252, 245, 222, .94), rgba(232, 216, 183, .88)), url(${item.imageUrl})` } : undefined}
            >
              <span className="home-information-number" aria-hidden="true">0{itemNumber}</span>
              <span className="home-information-icon"><Icon aria-hidden="true" /></span>
              <h3>{churchCase(item.title)}</h3>
              {item.body && <p>{churchCase(item.body)}</p>}
            </article>
          })}
        </div>
      </div>
      <article className="home-information-card home-information-ghost is-right" aria-hidden="true"><h3>{churchCase(at(visibleCount).title)}</h3>{at(visibleCount).body && <p>{churchCase(at(visibleCount).body)}</p>}</article>
      <button className="home-information-arrow previous" type="button" aria-label="Previous information" onClick={() => carousel.move(-1)}><ArrowLeft aria-hidden="true" /></button>
      <button className="home-information-arrow next" type="button" aria-label="Next information" onClick={() => carousel.move(1)}><ArrowRight aria-hidden="true" /></button>
      <span className="sr-only" role="status" aria-live="polite">Information {carousel.activeIndex + 1} of {items.length}</span>
    </div>
  </section>
}

export function HomeProductCarousel({ products }: { products: Product[] }) {
  const [visibleCount, setVisibleCount] = useState(3)
  useEffect(() => {
    const update = () => setVisibleCount(window.innerWidth < 640 ? 1 : window.innerWidth < 980 ? 2 : 3)
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    // Warm every catalogue image once so an incoming card cannot reveal a
    // blank frame while the browser begins fetching or decoding its artwork.
    if (typeof Image === 'undefined') return
    products.forEach((product) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = product.imageUrl
      void image.decode?.().catch(() => undefined)
    })
  }, [products])
  const carousel = useFreeScrollCarousel(products.length)
  const canRotate = products.length > Math.min(visibleCount, products.length)

  return <div className="home-product-carousel" role="region" aria-roledescription="carousel" aria-label="Explore the collection" tabIndex={0} onKeyDown={carousel.onKeyDown}>
    <div
      className={`home-product-showcase${carousel.dragging ? ' is-dragging' : ''}`}
      ref={carousel.viewportRef}
      onScroll={carousel.onScroll}
      onPointerDown={carousel.onPointerDown}
      onPointerMove={carousel.onPointerMove}
      onPointerUp={carousel.onPointerUp}
      onPointerCancel={carousel.onPointerCancel}
      onClickCapture={carousel.onClickCapture}
    >
      <div
        className="home-product-track"
        data-visible-count={visibleCount}
      >
        {products.map((product, index) => <div className="home-product-slide" key={product.id} ref={(node) => carousel.registerSlide(index, node)}><ProductCard product={product} variant="compact" /></div>)}
      </div>
    </div>
    {canRotate && <>
      <button className="home-product-arrow previous" type="button" aria-label="Previous product" onClick={() => carousel.move(-1)}><ArrowLeft aria-hidden="true" /></button>
      <button className="home-product-arrow next" type="button" aria-label="Next product" onClick={() => carousel.move(1)}><ArrowRight aria-hidden="true" /></button>
      <span className="home-product-page" aria-hidden="true">{carousel.activeIndex + 1} / {products.length}</span>
      <span className="sr-only" role="status" aria-live="polite">Product {carousel.activeIndex + 1} of {products.length}</span>
    </>}
  </div>
}

export function Home({ previewMode = false }: { previewMode?: boolean }) {
  const { products, status, reload } = useCatalogState()
  const { pages, website, socialMedia } = useSiteContent()
  const [heroVideoReady, setHeroVideoReady] = useState(false)
  const home = pages.home
  const sections = website.pages.home.sections
  const editorial = sections.editorial ?? defaultHomepageEditorialPanels
  const visibleSocialLinks = (socialMedia?.links ?? []).filter((link) => link.visible && link.url)
  // Production catalogue data is authoritative. Demo products stay confined
  // to CatalogContext's explicit local demo mode and are never merged here.
  const featuredProducts = orderHomeProducts(products)
  const legacyInformation: StoryPoint[] = [
    { id: 'rich-context', icon: BookOpen, title: sections.values.firstTitle, body: sections.values.firstBody },
    { id: 'collectible-format', icon: Sparkles, title: sections.values.secondTitle, body: sections.values.secondBody },
    { id: 'considered-detail', icon: ShieldCheck, title: sections.values.thirdTitle, body: sections.values.thirdBody },
  ]
  const informationIcons = [BookOpen, Sparkles, ShieldCheck, Landmark, ScrollText, UsersRound]
  const information: StoryPoint[] = sections.values.bubbles?.length
    ? sections.values.bubbles.map((bubble, index) => ({
      ...bubble,
      icon: informationIcons[index % informationIcons.length],
    }))
    : legacyInformation
  const introductionTitle = home.title === 'Stories of faith, carefully collected.' ? 'The Glory of the Church' : churchCase(home.title)
  const introductionBody = home.body.startsWith('Discover remarkable people')
    ? 'Discover the beauty, history and living witness of the Church through stories created to collect, revisit and share.'
    : churchCase(home.body)
  const legacyMissionTitles = ['The cards begin in real places.', 'Sharing the beauty of the Church.']
  const missionTitle = legacyMissionTitles.includes(sections.story.title) ? "The Church's Light,\nIs Meant To Be Shared" : churchCase(sections.story.title)
  const missionBody = sections.story.body.startsWith('Behind every council')
    ? 'Doxa exists to make the beauty and history of the Church tangible. Through considered artwork and collectible stories, we hope to help people encounter an inheritance that is alive, luminous and worth sharing.'
    : churchCase(sections.story.body)
  const legacyOrder = ['hero', 'values', 'featured', 'story', 'newsletter']
  const requestedOrder = ['hero', 'story', 'featured', 'values', 'newsletter'] as const
  const configuredOrder = website.pages.home.layout.order
  const sectionOrder = configuredOrder.every((section, index) => section === legacyOrder[index]) ? requestedOrder : configuredOrder

  const renderSection = (section: typeof website.pages.home.layout.order[number]) => {
    if (section === 'hero') return <>
      <section className="hero heritage-hero immersive-hero doxa-landing" data-editor-target={previewMode ? 'home-hero' : undefined}>
        <picture className="heritage-hero-picture" data-editor-target={previewMode ? 'home-hero-image' : undefined}>
          <source media="(max-width: 700px) and (orientation: portrait)" srcSet="/images/doxa-home-hero-poster-mobile.webp" />
          <img className="heritage-hero-image" src={heroPoster} alt="Interior of the Church of the Holy Sepulchre in Jerusalem" width="1440" height="810" fetchPriority="high" decoding="async" />
        </picture>
        <HomeHeroVideo onReadyChange={setHeroVideoReady} />
        <div className="heritage-hero-shade" aria-hidden="true" />
        <div className="doxa-landing-wordmark">
          <h1 className="hero-enter hero-enter-1">Doxa</h1>
          <p className="hero-enter hero-enter-2">Treasury</p>
        </div>
        <p className="photo-credit hero-credit">Church of the Holy Sepulchre, Jerusalem{heroVideoReady ? '' : ' · Still image'}</p>
        <a className="hero-scroll" href="#home-introduction"><span>Enter the treasury</span><ArrowDown aria-hidden="true" /></a>
      </section>
      <section id="home-introduction" className="home-introduction home-stage home-texture home-texture-cherry" data-editor-target={previewMode ? 'home-hero-heading' : undefined}>
        <Reveal className="home-introduction-copy">
          <p className="eyebrow">History held in your hand</p>
          <h2>{introductionTitle}</h2>
          <HomeIntroductionBody value={introductionBody} />
          <div className="button-row"><Link className="button primary" data-editor-target={previewMode ? 'home-hero-primary' : undefined} to="/shop">{sections.hero.primaryActionLabel} <ArrowRight aria-hidden="true" /></Link><Link className="button secondary" data-editor-target={previewMode ? 'home-hero-secondary' : undefined} to="/about">About us</Link></div>
        </Reveal>
        <Reveal className="home-introduction-visual" delay={100}>
          <ParallaxFigure
            src={sections.hero.imageUrl}
            alt={sections.hero.imageAlt}
            backSrc={sections.hero.backImageUrl}
            backAlt={sections.hero.backImageAlt}
          />
        </Reveal>
      </section>
    </>
    if (section === 'story') return <section className="home-mission home-stage" data-editor-target={previewMode ? 'home-story' : undefined}>
      <MissionBackground />
      <div className="home-mission-shade" aria-hidden="true" />
      <div className="home-mission-centre">
        <Reveal className="home-mission-heading"><p className="eyebrow">Our mission</p><h2>{missionTitleLines(missionTitle).map((line) => <span key={line}>{line}</span>)}</h2></Reveal>
        <Reveal className="home-mission-copy" delay={100}><SafeRichText value={missionBody} /><Link className="button home-mission-story-button" to="/about">About Our Story <ArrowRight aria-hidden="true" /></Link></Reveal>
        <Reveal className="home-mission-verse" delay={170}><span aria-hidden="true">“</span><blockquote><strong>14</strong> You are the light of the world. A city that is set on a hill cannot be hidden… <strong>16</strong> Let your light so shine before men, that they may see your good works and glorify your Father in heaven.</blockquote><cite>Matthew 5:14, 16</cite></Reveal>
      </div>
    </section>
    if (section === 'featured') return <section id="collection" className="section home-collection home-stage home-texture home-texture-cream" data-editor-target={previewMode ? 'home-featured' : undefined}>
      {(sections.featured.eyebrow || sections.featured.title || sections.featured.body) && <Reveal><div className="section-heading">
        {(sections.featured.eyebrow || sections.featured.title) && <div>
          {sections.featured.eyebrow && <p className="eyebrow">{sections.featured.eyebrow}</p>}
          {sections.featured.title && <h2>{sections.featured.title}</h2>}
        </div>}
        {sections.featured.body && <p>{churchCase(sections.featured.body)}</p>}
      </div></Reveal>}
      {status === 'loading' ? <CatalogueLoading /> : status === 'error' ? <CatalogueUnavailable retry={reload} /> : featuredProducts.length === 0 ? <CatalogueEmpty /> : <><HomeProductCarousel products={featuredProducts} /><Reveal><div className="centred"><Link className="text-link" to="/shop">{website.copy.homeViewAllLabel} <ArrowRight size={18} /></Link></div></Reveal></>}
    </section>
    if (section === 'values') return <div data-editor-target={previewMode ? 'home-values' : undefined}><InformationGrid items={information} /></div>
    return <>
      <section className="home-editorial-chapter home-community-chapter" aria-labelledby="home-community-title" data-editor-target={previewMode ? 'home-council' : undefined}>
        <Reveal className="home-editorial-media home-community-media"><figure>{editorial.council.imageUrl
          ? <img src={editorial.council.imageUrl} alt={editorial.council.imageAlt} loading="lazy" decoding="async" />
          : <div className="home-genesis-placeholder" role="img" aria-label="Join the Council image to be added"><span>Image</span><strong>TBD</strong></div>}
        </figure></Reveal>
        <Reveal className="home-editorial-copy home-community-copy">
          <h2 id="home-community-title">{editorial.council.title}</h2>
          {editorial.council.body && <SafeRichText value={editorial.council.body} />}
          {(editorial.council.quoteReference || editorial.council.quote) && <blockquote className="home-community-verse">
            {editorial.council.quoteReference && <strong>{editorial.council.quoteReference}</strong>}
            {editorial.council.quote && <span>{editorial.council.quote}</span>}
          </blockquote>}
          <Link className="button home-community-account-button" to="/account?mode=register">Make an Account <ArrowRight aria-hidden="true" /></Link>
        </Reveal>
      </section>
      <section className="home-editorial-chapter home-genesis-chapter" aria-labelledby="home-genesis-title" data-editor-target={previewMode ? 'home-genesis' : undefined}>
        <Reveal className="home-editorial-media home-genesis-media">
          <figure>{editorial.genesis.imageUrl
            ? <img src={editorial.genesis.imageUrl} alt={editorial.genesis.imageAlt} loading="lazy" decoding="async" />
            : <div className="home-genesis-placeholder" role="img" aria-label="How It Began image to be added"><span>Image</span><strong>TBD</strong></div>}
          </figure>
        </Reveal>
        <Reveal className="home-editorial-copy home-genesis-copy" delay={100}>
          <h2 id="home-genesis-title">{editorial.genesis.title}</h2>
          {editorial.genesis.body && <SafeRichText value={editorial.genesis.body} />}
          <Link className="button home-genesis-story-button" to="/about">Our Story <ArrowRight aria-hidden="true" /></Link>
          {(editorial.genesis.quoteReference || editorial.genesis.quote) && <blockquote className="home-genesis-verse">
            {editorial.genesis.quoteReference && <strong>{editorial.genesis.quoteReference}</strong>}
            {editorial.genesis.quote && <SafeRichText value={editorial.genesis.quote} className="home-genesis-verse-lines" />}
          </blockquote>}
        </Reveal>
      </section>
      <section className="home-editorial-chapter home-from-scriptorium-chapter" aria-labelledby="home-from-scriptorium-title" data-editor-target={previewMode ? 'home-from-scriptorium' : undefined}>
        <Reveal className="home-editorial-media home-from-scriptorium-media">
          <figure>{editorial.scriptorium.imageUrl
            ? <img src={editorial.scriptorium.imageUrl} alt={editorial.scriptorium.imageAlt} loading="lazy" decoding="async" />
            : <div className="home-genesis-placeholder" role="img" aria-label="From the Scriptorium image to be added"><span>Image</span><strong>TBD</strong></div>}
          </figure>
        </Reveal>
        <Reveal className="home-editorial-copy home-from-scriptorium-copy" delay={100}>
          <h2 id="home-from-scriptorium-title">{editorial.scriptorium.title}</h2>
          {editorial.scriptorium.body && <SafeRichText value={editorial.scriptorium.body} />}
          <Link className="button home-scriptorium-journal-button" to="/journal">The Journal <ArrowRight aria-hidden="true" /></Link>
        </Reveal>
      </section>
      <section className="home-editorial-chapter home-scriptorium-chapter home-socials-chapter" aria-labelledby="home-socials-title">
        <Reveal className="home-editorial-media home-socials-media"><figure><img src="/images/history/hosios-loukas.jpg" alt="The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia" loading="lazy" decoding="async" /><figcaption>Follow the Doxa journey</figcaption></figure></Reveal>
        <Reveal className="home-scriptorium-copy home-socials-copy" delay={100}>
          <h2 id="home-socials-title">{sections.newsletter.title}</h2>
          <p>{sections.newsletter.body}</p>
          {visibleSocialLinks.length > 0
            ? <div className="home-social-links" aria-label="Doxa social media profiles">{visibleSocialLinks.map((link) => {
              const Icon = socialIconById[link.id]
              return <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label}><Icon aria-hidden="true" /><span>{link.label}</span></a>
            })}</div>
            : <p className="home-socials-empty">Social profiles will appear here when published.</p>}
        </Reveal>
      </section>
      <section className="home-origins" aria-labelledby="home-origins-title">
        <Reveal><Landmark aria-hidden="true" /><p className="eyebrow">Humble beginnings</p><h2 id="home-origins-title">Made to share what is worth remembering.</h2><p>Doxa began with a simple conviction: the beauty and history of the Church should be easier to encounter, hold and pass on.</p><Link className="button secondary" to="/about">Our story <ArrowRight aria-hidden="true" /></Link></Reveal>
      </section>
    </>
  }

  return <>
    {!previewMode && <PageMeta title={website.pages.home.seo.title} description={churchCase(website.pages.home.seo.description)} canonicalPath="/" image={website.pages.home.seo.socialImageUrl || undefined} jsonLd={[organizationJsonLd(), websiteJsonLd()]} />}
    {sectionOrder.map((section) => website.pages.home.layout.visibility[section] ? <Fragment key={section}>{renderSection(section)}</Fragment> : null)}
  </>
}
