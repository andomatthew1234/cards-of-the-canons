import { ArrowLeft, ImagePlus, Save, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, Field, LoadingState, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { PageMeta } from '../../components/PageMeta'
import { deleteProduct, uploadProductImage, upsertProduct } from '../../lib/data'
import type { Product } from '../../types'
import { useUnsavedChanges } from '../../admin/utils'

const blankProduct: Product = { id: '', slug: '', name: '', shortDescription: '', description: '', priceCents: 0, currency: 'AUD', imageUrl: '/images/card-placeholder.svg', imageAlt: '', category: 'Collectible card', featured: false, stock: null, status: 'draft' }

export function ProductEditorPage({ isNew = false }: { isNew?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { products, loading, busy, runAction } = useAdminData()
  const existing = useMemo(() => products.find((item) => item.id === id), [products, id])
  const [product, setProduct] = useState<Product>(() => ({ ...blankProduct }))
  const [baseline, setBaseline] = useState(JSON.stringify(blankProduct))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    const next = isNew ? { ...blankProduct } : existing
    if (next) { setProduct(next); setBaseline(JSON.stringify(next)) }
  }, [existing, isNew])
  const dirty = JSON.stringify(product) !== baseline
  useUnsavedChanges(dirty, 'Leave the product editor and discard your unsaved changes?')
  if (loading) return <LoadingState label="Loading product…" />
  if (!isNew && !existing) return <EmptyState title="Product not found" description="It may have been deleted or the link is no longer valid." action={<Link className="button secondary" to="/admin/products"><ArrowLeft /> Back to products</Link>} />
  const update = <K extends keyof Product>(key: K, value: Product[K]) => setProduct((current) => ({ ...current, [key]: value }))
  const cancel = () => { if (!dirty || window.confirm('Discard your unsaved product changes?')) navigate('/admin/products') }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const productId = product.id || product.slug
    if (!productId || !product.slug || !product.name.trim()) return
    if (isNew && products.some((item) => item.id === productId)) {
      window.alert('A product already uses this URL slug. Choose a unique slug before saving.')
      return
    }
    const next = { ...product, id: productId }
    const success = await runAction('save-product', () => upsertProduct(next), isNew ? 'Product created.' : 'Product changes saved.')
    if (success) { setProduct(next); setBaseline(JSON.stringify(next)); navigate(`/admin/products/${encodeURIComponent(productId)}`, { replace: isNew }) }
  }
  const remove = async () => {
    const success = await runAction(`delete-product-${product.id}`, () => deleteProduct(product.id), `${product.name} was deleted.`)
    if (success) navigate('/admin/products', { replace: true })
  }
  const upload = async (file?: File) => {
    if (!file) return
    const productId = product.id || product.slug
    if (!productId) return window.alert('Add a URL slug before uploading an image.')
    setUploading(true)
    try { update('imageUrl', await uploadProductImage(productId, file)) } catch (error) { window.alert(error instanceof Error ? error.message : 'The image could not be uploaded.') } finally { setUploading(false) }
  }
  return <>
    <PageMeta title={`${isNew ? 'Add product' : product.name} — Admin`} description="Edit catalogue details and publishing controls." />
    <AdminPageHeader title={isNew ? 'Add product' : product.name} description="Catalogue details, inventory, imagery and publishing controls." breadcrumbs={[{ label: 'Products', to: '/admin/products' }, { label: isNew ? 'Add product' : product.name }]} actions={<div className="admin-page-actions"><button className="button secondary" type="button" onClick={cancel}>Cancel</button><button className="button primary" form="product-editor" disabled={!dirty || busy === 'save-product'}><Save />{busy === 'save-product' ? 'Saving…' : 'Save product'}</button></div>} />
    <form id="product-editor" className="admin-editor-layout" aria-label="Product editor" onSubmit={save}>
      <div className="admin-editor-main"><AdminPanel title="Product information" description="The customer-facing name and description."><div className="admin-form-grid"><Field label="Name" wide><input required minLength={2} maxLength={120} value={product.name} onChange={(event) => update('name', event.target.value)} /></Field><Field label="Short description" wide hint="Used in catalogue cards."><input required minLength={2} maxLength={300} value={product.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} /></Field><Field label="Full description" wide><textarea required minLength={2} maxLength={5000} rows={8} value={product.description} onChange={(event) => update('description', event.target.value)} /></Field></div></AdminPanel>
        <AdminPanel title="Pricing and inventory" description="Prices are stored in Australian dollars."><div className="admin-form-grid"><Field label="Price (AUD)"><input required type="number" min="0" max="1000000" step="0.01" value={product.priceCents / 100} onChange={(event) => update('priceCents', Math.round(Number(event.target.value) * 100))} /></Field><Field label="Stock" hint="Leave blank when stock is not tracked."><input type="number" min="0" max="1000000" value={product.stock ?? ''} onChange={(event) => update('stock', event.target.value === '' ? null : Number(event.target.value))} /></Field></div></AdminPanel>
        <AdminPanel title="Organisation" description="Used by catalogue filters and URLs."><div className="admin-form-grid"><Field label="Category"><input required minLength={2} maxLength={80} value={product.category} onChange={(event) => update('category', event.target.value)} /></Field><Field label="URL slug" hint={isNew ? 'This becomes the product ID when first saved.' : 'Changing this updates the public URL without changing the database ID.'}><input required pattern="[a-z0-9-]+" minLength={2} maxLength={100} value={product.slug} onChange={(event) => update('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></Field><label className="admin-check wide"><input type="checkbox" checked={product.featured} onChange={(event) => update('featured', event.target.checked)} /><span><strong>Featured product</strong><small>Include this product in featured storefront areas.</small></span></label></div></AdminPanel>
      </div>
      <aside className="admin-editor-aside"><AdminPanel title="Publishing"><div className="admin-form-stack"><Field label="Status"><select value={product.status} onChange={(event) => update('status', event.target.value as Product['status'])}><option value="draft">Draft</option><option value="published">Published</option></select></Field><div className="admin-publish-summary"><StatusBadge tone={product.status === 'published' ? 'positive' : 'neutral'}>{product.status}</StatusBadge><p>{product.status === 'published' ? 'Visible in the public catalogue.' : 'Only administrators can view this product.'}</p></div></div></AdminPanel>
        <AdminPanel title="Product image"><div className="admin-image-editor"><div className="admin-image-preview"><img src={product.imageUrl} alt={product.imageAlt || ''} /></div><Field label="Image URL"><input required value={product.imageUrl} onChange={(event) => update('imageUrl', event.target.value)} /></Field><Field label="Alt text"><input maxLength={200} value={product.imageAlt} onChange={(event) => update('imageAlt', event.target.value)} /></Field><label className={`button secondary grow ${uploading ? 'disabled' : ''}`}><ImagePlus />{uploading ? 'Uploading…' : 'Upload image'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} /></label></div></AdminPanel>
        {!isNew && <AdminPanel title="Danger zone" description="Deletion cannot be undone."><div className="admin-danger-zone"><button className="button danger-button grow" type="button" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete product</button></div></AdminPanel>}
      </aside>
    </form>
    <ConfirmDialog open={deleteOpen} title={`Delete ${product.name}?`} description="This permanently removes the product from the catalogue. This action cannot be undone." confirmLabel="Delete product" busy={busy.startsWith('delete-product-')} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} />
  </>
}
