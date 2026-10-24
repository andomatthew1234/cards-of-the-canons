import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Landmark, ScrollText, ShieldCheck, Sparkles, UsersRound, type LucideIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type TransitionEvent as ReactTransitionEvent } from 'react'
import { Link } from 'react-router-dom'
import { CatalogueEmpty, CatalogueLoading, CatalogueUnavailable } from '../components/CatalogueState'
import { Newsletter } from '../components/Newsletter'
import { PageMeta } from '../components/PageMeta'
import { ProductCard } from '../components/ProductCard'
import { carouselTrackWindow, wrapIndex } from '../lib/carousel'
import { Reveal } from '../components/Reveal'
import { SafeRichText } from '../components/SafeRichText'
import { useCatalogState } from '../context/CatalogContext'
import { defaultPageContent, useSiteContent } from '../context/SiteContentContext'
import { organizationJsonLd, websiteJsonLd } from '../lib/seo'
import { orderHomeProducts } from '../lib/homeProducts'
import type { Product } from '../types'

type StoryPoint = { icon: LucideIcon; title: string; body: string }
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } }
type CarouselDirection = -1 | 1
type CarouselMotion = { direction: CarouselDirection; active: boolean }

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

export function missionTitleLines(value: string) {
  const normalised = value.trim()
  if (/^the Church's light,\s*is meant to be shared$/i.test(normalised)) {
    return ["The Church's Light,", 'Is Meant To Be Shared']
  }
  return normalised.split(/\n|\|/).map((line) => line.trim()).filter(Boolean)
}

export function ParallaxFigure({ src }: { src: string }) {
  const frameRef = useRef<HTMLElement>(null)
  const pointerFrame = useRef(0)
  const [flipped, setFlipped] = useState(false)

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

  return <figure ref={frameRef} onPointerMove={move} onPointerLeave={reset} aria-label="Interactive Doxa card artwork">
    <div className="home-history-image">
      <button className={`home-history-flip${flipped ? ' is-flipped' : ''}`} type="button" aria-pressed={flipped} aria-label={flipped ? 'Show the front of the Doxa card' : 'Show the back of the Doxa card'} onClick={() => setFlipped((current) => !current)}>
        <span className="home-history-flip-inner">
          <span className="home-history-face home-history-front"><img src={src} alt="" loading="lazy" decoding="async" /></span>
          <span className="home-history-face home-history-back" aria-hidden="true"><span className="home-card-back-mark">D</span><strong>Doxa</strong><small>Treasury</small><span className="home-card-back-rule" /></span>
        </span>
      </button>
    </div>
    <figcaption className="sr-only">Select the card to turn it over.</figcaption>
  </figure>
}

function CandlePanel({ side }: { side: 'left' | 'right' }) {
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
  return <div className={`home-candle-panel home-candle-${side}`} aria-hidden="true">
    <video ref={videoRef} autoPlay muted loop playsInline preload="metadata" poster="/images/editorial/doxa-candle-vigil.webp" tabIndex={-1} onLoadedData={play} onCanPlay={play}>
      <source src="/videos/doxa-candle-vigil.mp4" type="video/mp4" />
    </video>
  </div>
}

function prefersReducedCarouselMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useSlidingCarousel(itemCount: number, visibleCount: number, rotateWhenAllVisible = false) {
  const [start, setStart] = useState(0)
  const [motion, setMotion] = useState<CarouselMotion | null>(null)
  const motionRef = useRef<CarouselMotion | null>(null)

  const finish = useCallback(() => {
    const current = motionRef.current
    if (!current) return
    motionRef.current = null
    setStart((value) => value + current.direction)
    setMotion(null)
  }, [itemCount])

  useEffect(() => {
    motionRef.current = null
    setMotion(null)
    setStart((current) => wrapIndex(current, itemCount))
  }, [itemCount, visibleCount])

  useEffect(() => {
    if (!motion || motion.active) return
    const frame = window.requestAnimationFrame(() => {
      setMotion((current) => {
        if (!current) return null
        const activeMotion = { ...current, active: true }
        motionRef.current = activeMotion
        return activeMotion
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [motion])

  useEffect(() => {
    if (!motion?.active) return
    const fallback = window.setTimeout(finish, 720)
    return () => window.clearTimeout(fallback)
  }, [finish, motion?.active])

  const move = useCallback((direction: CarouselDirection) => {
    if (itemCount <= 1 || (!rotateWhenAllVisible && itemCount <= visibleCount) || motionRef.current) return
    if (prefersReducedCarouselMotion()) {
      setStart((current) => current + direction)
      return
    }
    const nextMotion = { direction, active: false }
    motionRef.current = nextMotion
    setMotion(nextMotion)
  }, [itemCount, rotateWhenAllVisible, visibleCount])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? -1 : 1)
  }, [move])

  const onTransitionEnd = useCallback((event: ReactTransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && event.propertyName === 'transform') finish()
  }, [finish])

  return { start, motion, move, onKeyDown, onTransitionEnd }
}

function carouselTrackClass(base: string, motion: CarouselMotion | null) {
  if (!motion) return base
  return `${base} is-${motion.direction > 0 ? 'next' : 'previous'}${motion.active ? ' is-active' : ''}`
}

export function InformationGrid({ items }: { items: StoryPoint[] }) {
  const [visibleCount, setVisibleCount] = useState(3)
  useEffect(() => {
    const update = () => setVisibleCount(window.innerWidth < 640 ? 1 : 3)
    update()
    window.addEventListener('resize', update, { passive: true })
    return () => window.removeEventListener('resize', update)
  }, [])
  const carousel = useSlidingCarousel(items.length, visibleCount, true)
  const trackItems = carouselTrackWindow(items, carousel.start, visibleCount, carousel.motion?.direction ?? null)
  const at = (offset: number) => items[wrapIndex(carousel.start + offset, items.length)]
  const extraIndex = carousel.motion?.direction === -1 ? 0 : trackItems.length - 1
  const trackStart = carousel.start + (carousel.motion?.direction === -1 ? -1 : 0)

  return <section className="home-information home-stage home-texture home-texture-terra" aria-label="Why Doxa">
    <div className="home-information-carousel" role="region" aria-roledescription="carousel" aria-label="Why Doxa information" tabIndex={0} onKeyDown={carousel.onKeyDown}>
      <article className="home-information-card home-information-ghost is-left" aria-hidden="true"><h3>{churchCase(at(-1).title)}</h3><p>{churchCase(at(-1).body)}</p></article>
      <div className="home-information-grid">
        <div
          className={carouselTrackClass('home-information-track', carousel.motion)}
          data-visible-count={visibleCount}
          onTransitionEnd={carousel.onTransitionEnd}
        >
          {trackItems.map((item, index) => {
            const Icon = item.icon
            const itemNumber = items.indexOf(item) + 1
            return <article className="home-information-card" key={`${items.indexOf(item)}-${trackStart + index}`} aria-hidden={carousel.motion ? index === extraIndex : undefined}>
              <span className="home-information-number" aria-hidden="true">0{itemNumber}</span>
              <span className="home-information-icon"><Icon aria-hidden="true" /></span>
              <h3>{churchCase(item.title)}</h3>
              <p>{churchCase(item.body)}</p>
            </article>
          })}
        </div>
      </div>
      <article className="home-information-card home-information-ghost is-right" aria-hidden="true"><h3>{churchCase(at(visibleCount).title)}</h3><p>{churchCase(at(visibleCount).body)}</p></article>
      <button className="home-information-arrow previous" type="button" aria-label="Previous information" disabled={Boolean(carousel.motion)} onClick={() => carousel.move(-1)}><ArrowLeft aria-hidden="true" /></button>
      <button className="home-information-arrow next" type="button" aria-label="Next information" disabled={Boolean(carousel.motion)} onClick={() => carousel.move(1)}><ArrowRight aria-hidden="true" /></button>
      <span className="sr-only" role="status" aria-live="polite">Information {wrapIndex(carousel.start, items.length) + 1} of {items.length}</span>
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
  const carousel = useSlidingCarousel(products.length, visibleCount)
  const trackProducts = carouselTrackWindow(products, carousel.start, visibleCount, carousel.motion?.direction ?? null)
  const canRotate = products.length > Math.min(visibleCount, products.length)
  const extraIndex = carousel.motion?.direction === -1 ? 0 : trackProducts.length - 1
  const trackStart = carousel.start + (carousel.motion?.direction === -1 ? -1 : 0)

  return <div className="home-product-carousel" role="region" aria-roledescription="carousel" aria-label="Explore the collection" tabIndex={0} onKeyDown={carousel.onKeyDown}>
    <div className="home-product-showcase">
      <div
        className={carouselTrackClass('home-product-track', carousel.motion)}
        data-visible-count={visibleCount}
        onTransitionEnd={carousel.onTransitionEnd}
      >
        {trackProducts.map((product, index) => {
          const isTransitionOnlySlide = Boolean(carousel.motion) && index === extraIndex
          return <div className="home-product-slide" key={`${product.id}-${trackStart + index}`} aria-hidden={isTransitionOnlySlide || undefined} inert={isTransitionOnlySlide || undefined}><ProductCard product={product} variant="compact" /></div>
        })}
      </div>
    </div>
    {canRotate && <>
      <button className="home-product-arrow previous" type="button" aria-label="Previous product" disabled={Boolean(carousel.motion)} onClick={() => carousel.move(-1)}><ArrowLeft aria-hidden="true" /></button>
      <button className="home-product-arrow next" type="button" aria-label="Next product" disabled={Boolean(carousel.motion)} onClick={() => carousel.move(1)}><ArrowRight aria-hidden="true" /></button>
      <span className="home-product-page" aria-hidden="true">{wrapIndex(carousel.start, products.length) + 1} / {products.length}</span>
      <span className="sr-only" role="status" aria-live="polite">Product {wrapIndex(carousel.start, products.length) + 1} of {products.length}</span>
    </>}
  </div>
}

export function Home({ previewMode = false }: { previewMode?: boolean }) {
  const { products, status, reload } = useCatalogState()
  const { pages, website } = useSiteContent()
  const [heroVideoReady, setHeroVideoReady] = useState(false)
  const home = pages.home
  const sections = home.sections ?? defaultPageContent.home.sections!
  // Production catalogue data is authoritative. Demo products stay confined
  // to CatalogContext's explicit local demo mode and are never merged here.
  const featuredProducts = orderHomeProducts(products)
  const information: StoryPoint[] = [
    { icon: BookOpen, title: sections.values.firstTitle, body: sections.values.firstBody },
    { icon: Sparkles, title: sections.values.secondTitle, body: sections.values.secondBody },
    { icon: ShieldCheck, title: sections.values.thirdTitle, body: sections.values.thirdBody },
  ]
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
          <p>{introductionBody}</p>
          <div className="button-row"><Link className="button primary" data-editor-target={previewMode ? 'home-hero-primary' : undefined} to="/shop">{sections.hero.primaryActionLabel} <ArrowRight aria-hidden="true" /></Link><Link className="button secondary" data-editor-target={previewMode ? 'home-hero-secondary' : undefined} to="/about">About us</Link></div>
        </Reveal>
        <Reveal className="home-introduction-visual" delay={100}>
          <ParallaxFigure src={sections.hero.imageUrl} />
        </Reveal>
      </section>
    </>
    if (section === 'story') return <section className="home-mission home-stage" data-editor-target={previewMode ? 'home-story' : undefined}>
      <CandlePanel side="left" />
      <div className="home-mission-centre">
        <Reveal className="home-mission-heading"><p className="eyebrow">Our mission</p><h2>{missionTitleLines(missionTitle).map((line) => <span key={line}>{line}</span>)}</h2></Reveal>
        <Reveal className="home-mission-copy" delay={100}><SafeRichText value={missionBody} /><Link className="text-link" to="/about">Read our story <ArrowRight aria-hidden="true" /></Link></Reveal>
        <Reveal className="home-mission-verse" delay={170}><span aria-hidden="true">“</span><blockquote><strong>14</strong> You are the light of the world. A city that is set on a hill cannot be hidden… <strong>16</strong> Let your light so shine before men, that they may see your good works and glorify your Father in heaven.</blockquote><cite>Matthew 5:14, 16</cite></Reveal>
      </div>
      <CandlePanel side="right" />
    </section>
    if (section === 'featured') return <section id="collection" className="section home-collection home-stage home-texture home-texture-cream" data-editor-target={previewMode ? 'home-featured' : undefined}>
      <Reveal><div className="section-heading"><div><p className="eyebrow">{sections.featured.eyebrow}</p><h2>{sections.featured.title}</h2></div><p>{churchCase(sections.featured.body)}</p></div></Reveal>
      {status === 'loading' ? <CatalogueLoading /> : status === 'error' ? <CatalogueUnavailable retry={reload} /> : featuredProducts.length === 0 ? <CatalogueEmpty /> : <><HomeProductCarousel products={featuredProducts} /><Reveal><div className="centred"><Link className="text-link" to="/shop">{website.copy.homeViewAllLabel} <ArrowRight size={18} /></Link></div></Reveal></>}
    </section>
    if (section === 'values') return <div data-editor-target={previewMode ? 'home-values' : undefined}><InformationGrid items={information} /></div>
    return <>
      <section className="home-editorial-chapter home-community-chapter" aria-labelledby="home-community-title">
        <Reveal className="home-editorial-copy"><UsersRound aria-hidden="true" /><p className="eyebrow">Join the council</p><h2 id="home-community-title">Collect with a community.</h2><p>Create an account to follow orders, take part in community polls and build a Treasury that grows with every card you collect.</p><Link className="button primary" to="/account">Create your account <ArrowRight aria-hidden="true" /></Link></Reveal>
        <Reveal className="home-editorial-media" delay={100}><figure><img src={sections.story.imageUrl} alt={sections.story.imageAlt} loading="lazy" decoding="async" /><figcaption>Follow the collection as it grows</figcaption></figure></Reveal>
      </section>
      <section className="home-editorial-chapter home-scriptorium-chapter" aria-labelledby="newsletter-title">
        <Reveal className="home-editorial-media"><figure><img src="/images/history/hosios-loukas.jpg" alt="The Byzantine monastery of Hosios Loukas beneath the mountains of Boeotia" loading="lazy" decoding="async" /><figcaption>Stories from the living history of the Church</figcaption></figure></Reveal>
        <Reveal className="home-scriptorium-copy" delay={100}><ScrollText aria-hidden="true" /><Newsletter /></Reveal>
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
