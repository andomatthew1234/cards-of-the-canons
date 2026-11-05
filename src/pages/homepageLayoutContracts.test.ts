import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('homepage layout contracts', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/homepage.css'), 'utf8')
  const publicCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
  const homeSource = readFileSync(resolve(process.cwd(), 'src/pages/Home.tsx'), 'utf8')
  const shopSource = readFileSync(resolve(process.cwd(), 'src/pages/Shop.tsx'), 'utf8')

  it('caps the desktop Council chapter instead of letting its portrait image set the height', () => {
    const chapterRule = css.match(/\.home-shell \.home-community-chapter\s*\{([^}]*)\}/)?.[1] ?? ''
    const mediaRule = css.match(/\.home-shell \.home-community-chapter \.home-editorial-media,\s*\.home-shell \.home-community-chapter \.home-editorial-media figure\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(chapterRule).toContain('height: 600px')
    expect(chapterRule).toContain('min-height: 600px')
    expect(mediaRule).toContain('height: 100%')
    expect(mediaRule).toContain('overflow: hidden')
  })

  it('presents the Council invitation without the retired icon or subtitle', () => {
    expect(homeSource).toContain('editorial.council.title')
    expect(homeSource).toContain('editorial.council.body')
    expect(homeSource).toContain('editorial.council.quoteReference')
    expect(homeSource).toContain('editorial.council.quote')
    expect(homeSource).toContain('editorial.council.imageUrl')
    expect(homeSource).toContain("'home-council'")
    expect(homeSource).not.toContain('<UsersRound')
    expect(homeSource).not.toContain('<p className="eyebrow">Join the council</p>')
  })

  it('places the editable How It Began story before the Journal and Socials chapters', () => {
    const genesisRule = css.match(/\.home-shell \.home-genesis-chapter\s*\{([^}]*)\}/)?.[1] ?? ''
    const genesisIndex = homeSource.indexOf('home-genesis-chapter')
    const fromScriptoriumIndex = homeSource.indexOf('home-from-scriptorium-chapter')
    const scriptoriumIndex = homeSource.indexOf('home-scriptorium-chapter')

    expect(genesisIndex).toBeGreaterThan(-1)
    expect(fromScriptoriumIndex).toBeGreaterThan(genesisIndex)
    expect(scriptoriumIndex).toBeGreaterThan(fromScriptoriumIndex)
    expect(homeSource).toContain('editorial.genesis.title')
    expect(homeSource).toContain('editorial.genesis.body')
    expect(homeSource).toContain('editorial.genesis.quoteReference')
    expect(homeSource).toContain('editorial.genesis.quote')
    expect(homeSource).toContain('editorial.genesis.imageUrl')
    expect(homeSource).toContain("'home-genesis'")
    expect(homeSource).toContain('home-genesis-placeholder')
    expect(homeSource).toContain('home-genesis-story-button')
    expect(homeSource).toContain('to="/about">Our Story')
    expect(css).toContain('.home-genesis-verse')
    expect(homeSource).toContain('home-scriptorium-journal-button')
    expect(homeSource).toContain('to="/journal">The Journal')
    expect(homeSource).toContain('home-socials-chapter')
    expect(homeSource).toContain('sections.newsletter.title')
    expect(homeSource).toContain('sections.newsletter.body')
    expect(homeSource).toContain('visibleSocialLinks')
    expect(genesisRule).toContain('height: 600px')
    expect(genesisRule).toContain('min-height: 600px')
  })

  it('keeps the How It Began Scripture panel compact while spanning the editorial panel', () => {
    const verseRule = css.match(/\.home-genesis-verse\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(verseRule).toContain('align-self: stretch')
    expect(verseRule).toContain('max-width: none')
    expect(verseRule).toContain('min-height: clamp(5.75rem, 8vw, 7rem)')
    expect(verseRule).toContain('width: calc(100% + (2 * clamp(2.25rem, 4vw, 4rem)))')
  })

  it('adds a compact From the Scriptorium editorial chapter using the supplied image', () => {
    const chapterRule = css.match(/\.home-shell \.home-from-scriptorium-chapter\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(homeSource).toContain('editorial.scriptorium.title')
    expect(homeSource).toContain('editorial.scriptorium.body')
    expect(homeSource).toContain('editorial.scriptorium.imageUrl')
    expect(homeSource).toContain('editorial.scriptorium.imageAlt')
    expect(homeSource).toContain("'home-from-scriptorium'")
    expect(homeSource).toContain('home-scriptorium-journal-button')
    expect(chapterRule).toContain('height: 600px')
    expect(chapterRule).toContain('min-height: 600px')
    expect(css).toContain('.home-from-scriptorium-copy > .safe-rich-text')
    expect(css).toContain('.home-scriptorium-journal-button')
  })

  it('uses every published footer social profile in the Our Socials chapter', () => {
    const socialChapterRule = css.match(/\.home-shell \.home-socials-chapter\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(homeSource).toContain('socialMedia?.links')
    expect(homeSource).toContain('link.visible && link.url')
    expect(homeSource).toContain('socialIconById[link.id]')
    expect(homeSource).toContain('aria-label="Doxa social media profiles"')
    expect(homeSource).toContain('target="_blank"')
    expect(homeSource).toContain('rel="noopener noreferrer"')
    expect(css).toContain('.home-social-links')
    expect(homeSource).not.toContain('sections.newsletter.eyebrow')
    expect(socialChapterRule).toContain('height: 600px')
    expect(socialChapterRule).toContain('min-height: 600px')
  })

  it('alternates every short chapter image and text block starting with the Council image', () => {
    const chapter = (startClass: string, nextClass: string) => {
      const start = homeSource.indexOf(startClass)
      const end = homeSource.indexOf(nextClass, start + startClass.length)
      return homeSource.slice(start, end === -1 ? undefined : end)
    }
    const council = chapter('home-community-chapter', 'home-genesis-chapter')
    const genesis = chapter('home-genesis-chapter', 'home-from-scriptorium-chapter')
    const fromScriptorium = chapter('home-from-scriptorium-chapter', 'home-scriptorium-chapter')
    const scriptorium = chapter('home-scriptorium-chapter', 'home-origins')

    expect(council.indexOf('home-community-media')).toBeLessThan(council.indexOf('home-community-copy'))
    expect(genesis.indexOf('home-genesis-media')).toBeLessThan(genesis.indexOf('home-genesis-copy'))
    expect(fromScriptorium.indexOf('home-from-scriptorium-media')).toBeLessThan(fromScriptorium.indexOf('home-from-scriptorium-copy'))
    expect(scriptorium.indexOf('home-editorial-media')).toBeLessThan(scriptorium.indexOf('home-scriptorium-copy'))
    expect(publicCss).toContain('.home-genesis-chapter .home-editorial-media { order: 2; }')
    expect(publicCss).toContain('.home-scriptorium-chapter .home-editorial-media { order: 2; }')
    expect(publicCss).toContain('.home-editorial-chapter .home-editorial-media { order: 1; }')
    expect(publicCss).toContain('.home-editorial-chapter .home-editorial-copy')
  })

  it('uses native free-scrolling viewports without whole-grid flashing', () => {
    expect(css).toContain('.home-product-showcase::-webkit-scrollbar')
    expect(css).toContain('.home-information-grid::-webkit-scrollbar')
    expect(css).toContain('overflow-x: auto')
    expect(css).toContain('touch-action: pan-y')
    expect(css).toContain('cursor: grab')
    expect(css).not.toContain('@keyframes home-carousel-slide-next')
    expect(css).not.toContain('@keyframes home-carousel-slide-previous')
    expect(css).not.toContain('transition: opacity')
    expect(css).not.toContain('filter: blur(3px)')
  })

  it('uses visually identical edge clones to wrap both carousels without a reset flash', () => {
    expect(homeSource).toContain("items.length > 1 ? [-1, 0, 1] : [0]")
    expect(homeSource).toContain("products.length > 1 ? [-1, 0, 1] : [0]")
    expect(homeSource).toContain('normaliseLoop')
    expect(homeSource).toContain('home-carousel-clone')
    expect(css).toContain('.home-carousel-clone { pointer-events: none; }')
  })

  it('keeps information tracks fluid inside tablet viewports', () => {
    const tabletRules = css.match(/@media \(max-width: 979px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(css).toContain('grid-auto-columns: calc((100% - (2 * var(--home-carousel-gap))) / 3)')
    expect(tabletRules).not.toContain('minmax(270px, 1fr)')
  })

  it('lets the information track use the full carousel width instead of one legacy grid column', () => {
    const wrapperRule = css.match(/\.home-information-grid\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(wrapperRule).toContain('display: block')
    expect(wrapperRule).toContain('width: 100%')
  })

  it('does not hide public page headings while route content mounts', () => {
    const entryRule = publicCss.match(/\.shop-enter,\s*\.about-enter,\s*\.contact-enter\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(entryRule).toContain('opacity: 1')
    expect(entryRule).toContain('animation: none')
    expect(entryRule).not.toContain('opacity: 0')
  })

  it('omits blank Shop-section copy instead of rendering empty text elements', () => {
    expect(homeSource).toContain("sections.featured.eyebrow && <p")
    expect(homeSource).toContain("sections.featured.title && <h2")
    expect(homeSource).toContain("sections.featured.body && <p")
  })

  it('does not reserve an empty hero when all Shop page introduction copy is blank', () => {
    expect(shopSource).toContain('const hasIntroduction = Boolean(copy.eyebrow || copy.title || copy.body)')
    expect(shopSource).toContain('{hasIntroduction && <header className="page-hero shop-page-hero"')
  })

  it('uses the supplied Journal and Mission artwork in responsive local formats', () => {
    expect(css).toContain("url('/images/journal/journal-header.webp')")
    expect(css).toContain("center calc(52% + clamp(1.25rem, 2vw, 2rem)) / cover no-repeat")
    expect(css).toContain("url('/images/mission-candles-poster.webp')")
    expect(homeSource).toContain('/videos/doxa-mission-candles-mobile.mp4')
    expect(homeSource).toContain('/videos/doxa-mission-candles.mp4')
    expect(homeSource).not.toContain('/videos/doxa-candle-vigil.mp4')
  })

  it('keeps the homepage poster visible until a fully preloaded mobile-safe video can play', () => {
    expect(homeSource).toContain('preload="auto"')
    expect(homeSource).not.toContain('preload="metadata"')
  })

  it('removes retired homepage chrome that competes with the collection', () => {
    expect(homeSource).not.toContain('History held in your hand')
    expect(homeSource).not.toContain('home-product-page')
  })

  it('overlaps adjacent homepage sections by one pixel so compositing cannot expose white seams', () => {
    const seamRule = css.match(/\.home-shell\s*>\s*section\s*\+\s*section\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(seamRule).toContain('margin-top: -1px')
  })

  it('lengthens the Journal image currently crossing the viewport focus line', () => {
    const imageRule = css.match(/(?:^|\n)\.journal-card-image\s*\{([^}]*)\}/)?.[1] ?? ''
    const imageContentRule = css.match(/(?:^|\n)\.journal-card-image img\s*\{([^}]*)\}/)?.[1] ?? ''
    const focusedRule = css.match(/(?:^|\n)\.journal-card\.is-scroll-focused \.journal-card-image img\s*\{([^}]*)\}/)?.[1] ?? ''
    const reducedMotionRules = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((match) => match[1])
      .find((rules) => rules.includes('.journal-card-image img')) ?? ''

    expect(imageRule).toContain('height: clamp(32rem, 72svh, 48rem)')
    expect(imageContentRule).toContain('clip-path: inset(24% 0)')
    expect(imageContentRule).toContain('transition: clip-path .95s')
    expect(focusedRule).toContain('clip-path: inset(0)')
    expect(reducedMotionRules).toContain('.journal-card-image img')
    expect(reducedMotionRules).toContain('transition: none')
  })

  it('keeps the Mission chapter to exactly one screen without creating a nested scrollbar', () => {
    const missionRule = css.match(/\.home-shell \.home-mission\.home-stage\s*\{([^}]*)\}/)?.[1] ?? ''
    const missionContentRule = css.match(/\.home-shell \.home-mission-centre\s*\{([^}]*)\}/)?.[1] ?? ''
    const mobileRules = css.match(/@media \(max-width: 639px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(missionRule).toContain('height: 100svh')
    expect(missionRule).toContain('min-height: 100svh')
    expect(missionRule).toContain('max-height: 100svh')
    expect(missionRule).toContain('box-sizing: border-box')
    expect(missionContentRule).toContain('max-height: calc(100svh - (2 * var(--mission-edge)))')
    expect(missionContentRule).toContain('overflow: visible')
    expect(missionContentRule).not.toContain('overflow-y: auto')
    expect(missionContentRule).not.toContain('overscroll-behavior: contain')
    expect(mobileRules).toContain('height: 100svh')
    expect(mobileRules).toContain('max-height: 100svh')
  })

  it('keeps the Mission body visually dominant over its supporting verse', () => {
    const bodyRule = css.match(/\.home-shell \.home-mission-copy p\s*\{([^}]*)\}/)?.[1] ?? ''
    const verseRule = css.match(/\.home-shell \.home-mission-verse blockquote\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(bodyRule).toContain('clamp(1.2rem, 1.65vw, 1.48rem)')
    expect(bodyRule).toContain('rgba(252, 245, 222, .94)')
    expect(verseRule).toContain('clamp(.92rem, 1.05vw, 1.08rem)')
    expect(verseRule).toContain('rgba(252, 245, 222, .76)')
  })

  it('preserves breathing room around the Mission verse on short screens without a nested scroll area', () => {
    const shortViewportRules = css.match(/@media \(max-height: 740px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

    expect(shortViewportRules).toContain('margin-top: 1rem')
    expect(shortViewportRules).toContain('padding-top: .9rem')
    expect(shortViewportRules).toContain('line-height: 1.55')
    expect(shortViewportRules).not.toContain('overflow-y: auto')
  })

  it('lets the website editor select and order the products shown in the homepage collection', () => {
    const editorSource = readFileSync(resolve(process.cwd(), 'src/pages/admin/WebsiteEditorPage.tsx'), 'utf8')

    expect(homeSource).toContain('orderHomeProducts(products, sections.featured.productSlugs)')
    expect(editorSource).toContain('Homepage products')
    expect(editorSource).toContain('draft.pages.home.sections.featured.productSlugs')
  })

  it('lays the display-card prompt beneath the card instead of overlaying it', () => {
    const promptRule = css.match(/\.home-history-click-prompt\s*\{([^}]*)\}/)?.[1] ?? ''
    const promptArrowRule = css.match(/\.home-history-click-prompt svg\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(promptRule).not.toContain('position: absolute')
    expect(promptRule).toContain('justify-items: center')
    expect(promptRule).toContain('margin-top:')
    expect(promptArrowRule).not.toContain('transform: rotate')
  })

  it('keeps the display-card prompt clear of the mobile clipping boundary', () => {
    const mobileVisualRule = publicCss.match(/@media \(max-width: 600px\)\s*\{\s*\.home-introduction-visual\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(mobileVisualRule).toContain('overflow: visible')
    expect(mobileVisualRule).toContain('padding-bottom: .75rem')
    expect(mobileVisualRule).not.toContain('overflow: clip')
  })

  it('frames a custom rear card image without inheriting the global image crop', () => {
    const rearImageRule = css.match(/\.home-shell \.home-introduction-visual \.home-history-back-image\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rearImageRule).toContain('width: 100%')
    expect(rearImageRule).toContain('height: 100%')
    expect(rearImageRule).toContain('aspect-ratio: auto')
    expect(rearImageRule).toContain('object-fit: contain')
    expect(rearImageRule).toContain('transform: none')
  })
})
