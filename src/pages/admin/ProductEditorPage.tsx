import { ArrowLeft, ImagePlus, Images, RefreshCw, Save, Trash2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, ErrorState, Field, LoadingState, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { PageMeta } from '../../components/PageMeta'
import { deleteProduct, listProductMedia, uploadProductImage, upsertProduct, type ProductMediaItem } from '../../lib/data'
import { normaliseProductCategory } from '../../lib/productOrder'
import type { Product } from '../../types'
import { useUnsavedChanges } from '../../admin/utils'

const blankProduct: Product = { id: '', slug: '', name: '', shortDescription: '', description: '', priceCents: 0, currency: 'AUD', imageUrl: '/images/card-placeholder.svg', imageAlt: '', category: 'Collectible card', sortOrder: 10, featured: false, stock: null, treasuryCardsPerUnit: 0, status: 'draft' }

function mediaName(path: string) {
  return (path.split('/').at(-1) ?? 'Product image')
    .replace(/^\d+-[a-f0-9]{8}-/i, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Product image'
}

function productSlug(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'product'
}

function availableProductSlug(name: string, products: Product[]) {
  const base = productSlug(name)
  const used = new Set(products.flatMap((item) => [item.id, item.slug]))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function prepareProductForSave(product: Product, generatedSlug: string): Product {
  return {
    ...product,
    id: product.id || generatedSlug,
    slug: generatedSlug,
    category: normaliseProductCategory(product.category),
    sortOrder: Number.isSafeInteger(product.sortOrder)
      ? Math.max(0, Math.min(10000, Number(product.sortOrder)))
      : 1000,
    treasuryCardsPerUnit: Number.isSafeInteger(product.treasuryCardsPerUnit)
      ? Math.max(0, Math.min(50, Number(product.treasuryCardsPerUnit)))
      : 0,
  }
}

export function ProductEditorPage({ isNew = false }: { isNew?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { products, loading, errors, busy, runAction, refresh } = useAdminData()
  const existing = useMemo(() => products.find((item) => item.id === id), [products, id])
  const categories = useMemo(() => {
    const names = new Map<string, string>()
    products.forEach((item) => {
      const category = normaliseProductCategory(item.category)
      if (category) names.set(category.toLocaleLowerCase('en-AU'), category)
    })
    return [...names.values()].sort((left, right) => left.localeCompare(right, 'en-AU'))
  }, [products])
  const nextSortOrder = useMemo(() => Math.min(10000, Math.max(0, ...products.map((item) => Number.isSafeInteger(item.sortOrder) ? Number(item.sortOrder) : 0)) + 10), [products])
  const [product, setProduct] = useState<Product>(() => ({ ...blankProduct }))
  const [baseline, setBaseline] = useState(JSON.stringify(blankProduct))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [media, setMedia] = useState<ProductMediaItem[]>([])
  const [mediaLoading, setMediaLoading] = useState(true)
  const [mediaError, setMediaError] = useState('')
  const [mediaSearch, setMediaSearch] = useState('')
  const loadMedia = useCallback(async () => {
    setMediaLoading(true)
    setMediaError('')
    try { setMedia(await listProductMedia()) }
    catch (error) { setMediaError(error instanceof Error ? error.message : 'The product media library could not be loaded.') }
    finally { setMediaLoading(false) }
  }, [])
  useEffect(() => { void loadMedia() }, [loadMedia])
  useEffect(() => {
    const next = isNew ? { ...blankProduct, sortOrder: nextSortOrder } : existing
    if (next) {
      setProduct(next)
      setBaseline(JSON.stringify(next))
    }
  }, [existing, isNew, nextSortOrder])
  const dirty = JSON.stringify(product) !== baseline
  const visibleMedia = useMemo(() => {
    const query = mediaSearch.trim().toLowerCase()
    return query ? media.filter((item) => item.path.toLowerCase().includes(query)) : media
  }, [media, mediaSearch])
  const selectedCategory = useMemo(() => categories.find((item) => (
    item.toLocaleLowerCase('en-AU') === normaliseProductCategory(product.category).toLocaleLowerCase('en-AU')
  )), [categories, product.category])
  const categoryChoice = selectedCategory ?? '__new__'
  const generatedSlug = useMemo(() => product.slug || availableProductSlug(product.name, products), [product.name, product.slug, products])
  const allowNextNavigation = useUnsavedChanges(dirty, 'Leave the product editor and discard your unsaved changes?')
  if (loading) return <LoadingState label="Loading product…" />
  if (errors.products) return <ErrorState message={errors.products} onRetry={() => void refresh()} />
  if (!isNew && !existing) return <EmptyState title="Product not found" description="It may have been deleted or the link is no longer valid." action={<Link className="button secondary" to="/admin/products"><ArrowLeft /> Back to products</Link>} />
  const update = <K extends keyof Product>(key: K, value: Product[K]) => setProduct((current) => ({ ...current, [key]: value }))
  const cancel = () => { if (!dirty || window.confirm('Discard your unsaved product changes?')) { allowNextNavigation(); navigate('/admin/products') } }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!product.name.trim()) return
    const next = prepareProductForSave(product, generatedSlug)
    const productId = next.id
    const success = await runAction('save-product', () => upsertProduct(next), isNew ? 'Product created.' : 'Product changes saved.')
    if (success) { setProduct(next); setBaseline(JSON.stringify(next)); if (isNew) { allowNextNavigation(); navigate(`/admin/products/${encodeURIComponent(productId)}`, { replace: true }) } }
  }
  const remove = async () => {
    const success = await runAction(`delete-product-${product.id}`, () => deleteProduct(product.id), `${product.name} was deleted.`)
    if (success) { allowNextNavigation(); navigate('/admin/products', { replace: true }) }
  }
  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const imageUrl = await uploadProductImage(file)
      setProduct((current) => ({ ...current, imageUrl, imageAlt: current.imageAlt || mediaName(file.name) }))
      await loadMedia()
    } catch (error) { window.alert(error instanceof Error ? error.message : 'The image could not be uploaded.') }
    finally { setUploading(false) }
  }
  const selectMedia = (item: ProductMediaItem) => {
    if (!item.url) return
    setProduct((current) => ({ ...current, imageUrl: item.url!, imageAlt: current.imageAlt || mediaName(item.path) }))
  }
  return <>
    <PageMeta title={`${isNew ? 'Add product' : product.name} — Admin`} description="Edit catalogue details and publishing controls." />
    <AdminPageHeader title={isNew ? 'Add product' : product.name} description="Catalogue details, inventory, imagery and publishing controls." breadcrumbs={[{ label: 'Products', to: '/admin/products' }, { label: isNew ? 'Add product' : product.name }]} actions={<div className="admin-page-actions"><button className="button secondary" type="button" onClick={cancel}>Cancel</button><button className="button primary" form="product-editor" disabled={!dirty || busy === 'save-product'}><Save />{busy === 'save-product' ? 'Saving…' : 'Save product'}</button></div>} />
    <form id="product-editor" className="admin-editor-layout" aria-label="Product editor" onSubmit={save}>
      <div className="admin-editor-main"><AdminPanel title="Product information" description="The customer-facing name and description."><div className="admin-form-grid"><Field label="Name" wide><input required minLength={2} maxLength={120} value={product.name} onChange={(event) => update('name', event.target.value)} /></Field><Field label="Short description" wide hint="Used in catalogue cards."><input required minLength={2} maxLength={300} value={product.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} /></Field><Field label="Full description" wide><textarea required minLength={2} maxLength={5000} rows={8} value={product.description} onChange={(event) => update('description', event.target.value)} /></Field></div></AdminPanel>
        <AdminPanel title="Pricing and inventory" description="Prices are stored in Australian dollars."><div className="admin-form-grid"><Field label="Price (AUD)"><input required type="number" min="0" max="1000000" step="0.01" value={product.priceCents / 100} onChange={(event) => update('priceCents', Math.round(Number(event.target.value) * 100))} /></Field><Field label="Stock" hint="Leave blank when stock is not tracked."><input type="number" min="0" max="1000000" value={product.stock ?? ''} onChange={(event) => update('stock', event.target.value === '' ? null : Number(event.target.value))} /></Field><Field label="Treasury cards per item" hint="How many physical card codes this product contains. Use 0 for accessories."><input required type="number" min="0" max="50" step="1" value={product.treasuryCardsPerUnit ?? 0} onChange={(event) => update('treasuryCardsPerUnit', Math.max(0, Math.min(50, Math.trunc(Number(event.target.value))))) } /></Field></div></AdminPanel>
        <AdminPanel title="Organisation" description="Choose or create a category and control where this product appears in the storefront."><div className="admin-form-grid"><Field label="Category" hint="Choose a saved category or select Create a new category."><select required aria-label="Category" value={categoryChoice} onChange={(event) => update('category', event.target.value === '__new__' ? '' : event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}<option value="__new__">Create a new category…</option></select></Field><Field label="New category name" hint="Typing here creates a category and assigns this product to it."><input required={categoryChoice === '__new__'} minLength={2} maxLength={80} placeholder="Only needed for a new category" value={selectedCategory ? '' : product.category} onChange={(event) => update('category', event.target.value)} /></Field><Field label="Storefront order" hint="Lower numbers appear first within each Shop row."><input required type="number" min={0} max={10000} step={1} value={product.sortOrder ?? 1000} onChange={(event) => update('sortOrder', Math.max(0, Math.min(10000, Math.trunc(Number(event.target.value) || 0))))} /></Field><div className="admin-generated-product-url"><span>Public URL</span><code>/product/{generatedSlug}</code><small>Generated automatically from the product name.</small></div><label className="admin-check wide"><input type="checkbox" checked={product.featured} onChange={(event) => update('featured', event.target.checked)} /><span><strong>Featured product</strong><small>Include this product in featured storefront areas.</small></span></label></div></AdminPanel>
      </div>
      <aside className="admin-editor-aside"><AdminPanel title="Publishing"><div className="admin-form-stack"><Field label="Status"><select value={product.status} onChange={(event) => update('status', event.target.value as Product['status'])}><option value="draft">Draft</option><option value="published">Published</option></select></Field><div className="admin-publish-summary"><StatusBadge tone={product.status === 'published' ? 'positive' : 'neutral'}>{product.status}</StatusBadge><p>{product.status === 'published' ? 'Visible in the public catalogue.' : 'Only administrators can view this product.'}</p></div></div></AdminPanel>
        <AdminPanel title="Product image" description="Choose an image from Media Library, or upload a new one. No URL or slug is needed."><div className="admin-image-editor product-media-editor">
          <div className="admin-image-preview"><img src={product.imageUrl} alt={product.imageAlt || ''} /></div>
          <Field label="Image description" hint="Describe the image for customers using screen readers."><input maxLength={200} value={product.imageAlt} onChange={(event) => update('imageAlt', event.target.value)} /></Field>
          <label className={`button primary grow ${uploading ? 'disabled' : ''}`}><ImagePlus />{uploading ? 'Uploading and selecting…' : 'Upload new image'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} /></label>
          <section className="product-media-library" aria-labelledby="product-media-library-title">
            <header><div><Images aria-hidden="true" /><span><strong id="product-media-library-title">Media Library</strong><small>Select an existing image to use for this product.</small></span></div><button type="button" className="icon-button" aria-label="Refresh Media Library" disabled={mediaLoading} onClick={() => void loadMedia()}><RefreshCw aria-hidden="true" /></button></header>
            {media.length > 6 && <label className="product-media-search"><span className="sr-only">Search Media Library</span><input type="search" placeholder="Search Media Library…" value={mediaSearch} onChange={(event) => setMediaSearch(event.target.value)} /></label>}
            {mediaError && <p className="form-status error" role="alert">{mediaError}</p>}
            {mediaLoading ? <p className="product-media-state">Loading uploaded images…</p> : visibleMedia.length ? <div className="product-media-grid">
              {visibleMedia.map((item) => {
                const name = mediaName(item.path)
                const selected = Boolean(item.url && item.url === product.imageUrl)
                return <button type="button" key={item.path} disabled={!item.url} className={selected ? 'selected' : ''} aria-label={`${selected ? 'Selected' : 'Select'} ${name}`} aria-pressed={selected} onClick={() => selectMedia(item)}>
                  {item.url ? <img src={item.url} alt="" loading="lazy" /> : <span className="product-media-unavailable"><Images aria-hidden="true" /></span>}
                  <small>{name}</small>
                </button>
              })}
            </div> : <p className="product-media-state">{mediaSearch ? 'No Media Library images match that search.' : 'No images have been uploaded to Media Library yet.'}</p>}
          </section>
        </div></AdminPanel>
        {!isNew && <AdminPanel title="Danger zone" description="Deletion cannot be undone."><div className="admin-danger-zone"><button className="button danger-button grow" type="button" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete product</button></div></AdminPanel>}
      </aside>
    </form>
    <ConfirmDialog open={deleteOpen} title={`Delete ${product.name}?`} description="This permanently removes the product from the catalogue. This action cannot be undone." confirmLabel="Delete product" busy={busy.startsWith('delete-product-')} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} />
  </>
}
