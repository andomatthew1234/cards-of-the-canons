import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { CatalogueEmpty, CatalogueLoading, CatalogueUnavailable } from '../components/CatalogueState'
import { ProductCard } from '../components/ProductCard'
import { Reveal } from '../components/Reveal'
import { useCatalogState } from '../context/CatalogContext'
import { useSiteContent } from '../context/SiteContentContext'
import { trackEvent } from '../lib/analytics'
import { breadcrumbJsonLd, categorySlug, productsMayBeIndexed } from '../lib/seo'

const churchCase = (value: string) => value.replace(/\bchurch\b/g, 'Church')

export function Shop({ previewMode = false }: { previewMode?: boolean }) {
  const { categorySlug: selectedSlug } = useParams()
  const { products: catalogue, status, reload } = useCatalogState()
  const { website } = useSiteContent()
  const copy = website.pages.shop
  const categories = useMemo(() => [...new Set(catalogue.map((product) => product.category))], [catalogue])
  const selectedCategory = selectedSlug ? categories.find((item) => categorySlug(item) === selectedSlug) : undefined
  const products = selectedCategory ? catalogue.filter((product) => product.category === selectedCategory) : catalogue
  const categoryPath = selectedCategory ? `/shop/category/${categorySlug(selectedCategory)}` : '/shop'
  const title = churchCase(selectedCategory ? copy.categoryTitleTemplate.replaceAll('{category}',selectedCategory) : copy.seo.title)
  const description = selectedCategory
    ? copy.categoryBodyTemplate.replaceAll('{category}',selectedCategory)
    : churchCase(copy.seo.description)
  const categoryIndexable = !selectedCategory || productsMayBeIndexed()

  useEffect(() => { if (!previewMode) trackEvent('view_shop', { item_id: selectedSlug || 'all' }) }, [previewMode, selectedSlug])

  return <>
    {!previewMode && <PageMeta title={title} description={description} image={copy.seo.socialImageUrl || undefined} canonicalPath={categoryPath} noIndex={!categoryIndexable || Boolean(selectedSlug && !selectedCategory)} jsonLd={selectedCategory ? breadcrumbJsonLd([
      { name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: selectedCategory, path: categoryPath },
    ]) : undefined} />}
    <header className="page-hero shop-page-hero" data-editor-target={previewMode ? 'shop-introduction' : undefined}><p className="eyebrow shop-enter shop-enter-1">{copy.eyebrow}</p><h1 className="shop-enter shop-enter-2" data-editor-target={previewMode ? 'shop-heading' : undefined}>{churchCase(selectedCategory ? copy.categoryTitleTemplate.replaceAll('{category}',selectedCategory) : copy.title)}</h1><p className="shop-enter shop-enter-3">{churchCase(selectedCategory ? copy.categoryBodyTemplate.replaceAll('{category}',selectedCategory) : copy.body)}</p></header>
    <section className="section shop-section living-shop-section" data-editor-target={previewMode ? 'shop-products' : undefined}>
      {selectedCategory && <nav className="breadcrumbs shop-breadcrumb-enter" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/shop">Shop</Link><span aria-hidden="true">/</span><span aria-current="page">{selectedCategory}</span></nav>}
      <nav className="filter-row shop-filter-enter" aria-label="Browse product categories"><Link className={!selectedCategory ? 'filter active' : 'filter'} to="/shop">All</Link>{categories.map((item) => <Link key={item} className={selectedCategory === item ? 'filter active' : 'filter'} to={`/shop/category/${categorySlug(item)}`}>{item}</Link>)}</nav>
      {status === 'loading' ? <CatalogueLoading /> : status === 'error' ? <CatalogueUnavailable retry={reload} /> : selectedSlug && !selectedCategory ? <div className="catalogue-empty"><h2>Collection not found</h2><p>This collection may have moved or is not currently published.</p><Link className="button secondary" to="/shop">Browse all products</Link></div> : products.length === 0 ? <CatalogueEmpty /> : <><Reveal delay={90} className="shop-count-reveal"><p className="results-count">Showing {products.length} {products.length === 1 ? 'product' : 'products'}</p></Reveal><div className="product-grid shop-product-grid">{products.map((product, index) => <Reveal key={product.id} delay={Math.min(index * 85, 340)}><ProductCard product={product} headingLevel="h2" /></Reveal>)}</div></>}
    </section>
  </>
}
