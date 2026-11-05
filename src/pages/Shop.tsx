import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageMeta } from '../components/PageMeta'
import { CatalogueEmpty, CatalogueLoading, CatalogueUnavailable } from '../components/CatalogueState'
import { ProductCard } from '../components/ProductCard'
import { Reveal } from '../components/Reveal'
import { useCatalogState } from '../context/CatalogContext'
import { useSiteContent } from '../context/SiteContentContext'
import { trackEvent } from '../lib/analytics'
import { orderProductsForDisplay, productStorefrontSection } from '../lib/productOrder'
import type { Product } from '../types'

const churchCase = (value: string) => value.replace(/\bchurch\b/g, 'Church')

export function groupShopProducts(products: Product[]) {
  const published = orderProductsForDisplay(products.filter((product) => product.status === 'published'))
  return {
    cardPacks: published.filter((product) => productStorefrontSection(product) === 'card-packs'),
    accessories: published.filter((product) => productStorefrontSection(product) === 'accessories'),
  }
}

function ProductRail({ id, title, description, products }: { id: string; title: string; description: string; products: Product[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [edges, setEdges] = useState({ start: true, end: false })
  const headingId = `${id}-title`

  const updateEdges = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const items = Array.from(viewport.querySelectorAll<HTMLElement>('.shop-product-rail-item'))
    if (!items.length) return
    const active = items.reduce((nearest, item, index) => (
      Math.abs(item.offsetLeft - viewport.scrollLeft) < Math.abs(items[nearest].offsetLeft - viewport.scrollLeft)
        ? index
        : nearest
    ), 0)
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    setActiveIndex(active)
    setEdges({
      start: active === 0 || viewport.scrollLeft <= 2,
      end: active === items.length - 1 || maximum <= 2 || viewport.scrollLeft >= maximum - 2,
    })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    updateEdges()
    viewport.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges)
    observer?.observe(viewport)
    return () => {
      viewport.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
      observer?.disconnect()
    }
  }, [products.length, updateEdges])

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const items = Array.from(viewport.querySelectorAll<HTMLElement>('.shop-product-rail-item'))
    if (!items.length) return
    const targetIndex = Math.max(0, Math.min(items.length - 1, activeIndex + direction))
    const target = items[targetIndex]
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    setActiveIndex(targetIndex)
    setEdges({ start: targetIndex === 0, end: targetIndex === items.length - 1 })
    viewport.scrollTo({ left: target.offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  if (!products.length) return null
  return <section className="shop-product-collection" role="region" aria-labelledby={headingId}>
    <header className="shop-product-collection-header">
      <div><p className="eyebrow">The collection</p><h2 id={headingId}>{title}</h2><p>{description}</p></div>
      {products.length > 1 && <div className="shop-product-rail-controls" aria-label={`${title} carousel controls`}>
        <button type="button" aria-label={`Scroll ${title} left`} disabled={edges.start} onClick={() => move(-1)}><ArrowLeft aria-hidden="true" /></button>
        <button type="button" aria-label={`Scroll ${title} right`} disabled={edges.end} onClick={() => move(1)}><ArrowRight aria-hidden="true" /></button>
      </div>}
    </header>
    <div ref={viewportRef} className="shop-product-rail-viewport" role="group" aria-label={`${title} products — scroll horizontally`} tabIndex={0}>
      <div className="shop-product-grid shop-product-rail-track">
        {products.map((product) => <div className="shop-product-rail-item" key={product.id}><ProductCard product={product} headingLevel="h3" /></div>)}
      </div>
    </div>
  </section>
}

export function Shop({ previewMode = false }: { previewMode?: boolean }) {
  const { products: catalogue, status, reload } = useCatalogState()
  const { website } = useSiteContent()
  const copy = website.pages.shop
  const groups = groupShopProducts(catalogue)
  const productCount = groups.cardPacks.length + groups.accessories.length
  const hasIntroduction = Boolean(copy.eyebrow || copy.title || copy.body)

  useEffect(() => { if (!previewMode) trackEvent('view_shop', { item_id: 'all' }) }, [previewMode])

  return <>
    {!previewMode && <PageMeta title={churchCase(copy.seo.title)} description={churchCase(copy.seo.description)} image={copy.seo.socialImageUrl || undefined} canonicalPath="/shop" />}
    {hasIntroduction && <header className="page-hero shop-page-hero" data-editor-target={previewMode ? 'shop-introduction' : undefined}>
      {copy.eyebrow && <p className="eyebrow shop-enter shop-enter-1">{copy.eyebrow}</p>}
      {copy.title && <h1 className="shop-enter shop-enter-2" data-editor-target={previewMode ? 'shop-heading' : undefined}>{churchCase(copy.title)}</h1>}
      {copy.body && <p className="shop-enter shop-enter-3">{churchCase(copy.body)}</p>}
    </header>}
    <section className="section shop-section living-shop-section" data-editor-target={previewMode ? 'shop-products' : undefined}>
      {status === 'loading' ? <CatalogueLoading /> : status === 'error' ? <CatalogueUnavailable retry={reload} /> : productCount === 0 ? <CatalogueEmpty /> : <div className="shop-collections">
        <Reveal delay={90} className="shop-count-reveal"><p className="results-count">Explore {productCount} {productCount === 1 ? 'piece' : 'pieces'} across the Doxa collection.</p></Reveal>
        <ProductRail id="shop-card-packs" title="Card packs" description="Begin a collection or add new cards with individual packs, bundles, collector boxes and binders." products={groups.cardPacks} />
        <ProductRail id="shop-accessories" title="Doxa accessories" description="Bookmarks, apparel and considered pieces made to accompany the collection." products={groups.accessories} />
      </div>}
    </section>
  </>
}
