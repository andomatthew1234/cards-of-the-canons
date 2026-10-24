import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('homepage layout contracts', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/homepage.css'), 'utf8')
  const publicCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

  it('caps the desktop Council chapter instead of letting its portrait image set the height', () => {
    const chapterRule = css.match(/\.home-shell \.home-community-chapter\s*\{([^}]*)\}/)?.[1] ?? ''
    const mediaRule = css.match(/\.home-shell \.home-community-chapter \.home-editorial-media,\s*\.home-shell \.home-community-chapter \.home-editorial-media figure\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(chapterRule).toContain('height: 600px')
    expect(chapterRule).toContain('min-height: 600px')
    expect(mediaRule).toContain('height: 100%')
    expect(mediaRule).toContain('overflow: hidden')
  })

  it('keeps directional product and information motion available', () => {
    expect(css).toContain('.home-product-showcase.is-next')
    expect(css).toContain('.home-information-grid.is-previous')
    expect(css).toContain('@keyframes home-carousel-next')
    expect(css).toContain('@keyframes home-carousel-previous')
  })

  it('allows all three information cards to shrink inside tablet viewports', () => {
    const tabletRules = css.match(/@media \(max-width: 979px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(tabletRules).toContain('.home-information-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }')
    expect(tabletRules).not.toContain('minmax(270px, 1fr)')
  })

  it('does not hide public page headings while route content mounts', () => {
    const entryRule = publicCss.match(/\.shop-enter,\s*\.about-enter,\s*\.contact-enter\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(entryRule).toContain('opacity: 1')
    expect(entryRule).toContain('animation: none')
    expect(entryRule).not.toContain('opacity: 0')
  })
})
