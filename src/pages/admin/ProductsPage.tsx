import { ArrowDown, ArrowRight, ArrowUp, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, ErrorState, LoadingState, SearchField, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { PageMeta } from '../../components/PageMeta'
import { formatMoney, isFirebaseMode, useFirebaseEmulators } from '../../config'
import { demoProducts } from '../../data/demo'
import { deleteProduct, upsertProduct } from '../../lib/data'
import { normaliseProductCategory, orderProductsForDisplay, productSortOrder, productStorefrontSection } from '../../lib/productOrder'
import type { Product } from '../../types'

export function ProductsPage() {
  const { products, loading, errors, refresh, busy, runAction } = useAdminData()
  const error = errors.products
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | Product['status']>('all')
  const [category, setCategory] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const categories = useMemo(() => {
    const names = new Map<string, string>()
    products.forEach((item) => {
      const productCategory = normaliseProductCategory(item.category)
      if (productCategory) names.set(productCategory.toLocaleLowerCase('en-AU'), productCategory)
    })
    return [...names.values()].sort((left, right) => left.localeCompare(right, 'en-AU'))
  }, [products])
  const filtered = orderProductsForDisplay(products.filter((product) => {
    const term = search.trim().toLowerCase()
    return (!term || `${product.name} ${product.category} ${product.slug}`.toLowerCase().includes(term)) && (status === 'all' || product.status === status) && (category === 'all' || normaliseProductCategory(product.category).toLocaleLowerCase('en-AU') === category.toLocaleLowerCase('en-AU'))
  }))
  const canLoadPreviewCatalogue = !isFirebaseMode || useFirebaseEmulators
  if (loading) return <LoadingState label="Loading products…" />
  const confirmDelete = async () => {
    if (!deleteTarget) return
    const success = await runAction(`delete-product-${deleteTarget.id}`, () => deleteProduct(deleteTarget.id), `${deleteTarget.name} was deleted.`)
    if (success) setDeleteTarget(null)
  }
  const moveProduct = async (product: Product, direction: -1 | 1) => {
    const sectionProducts = orderProductsForDisplay(products.filter((item) => productStorefrontSection(item) === productStorefrontSection(product)))
    const currentIndex = sectionProducts.findIndex((item) => item.id === product.id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sectionProducts.length) return
    const reordered = [...sectionProducts]
    ;[reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]]
    const updates = reordered
      .map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }))
      .filter((item, index) => productSortOrder(sectionProducts[index]) !== item.sortOrder || sectionProducts[index].id !== item.id)
    await runAction('reorder-products', async () => {
      await Promise.all(updates.map((item) => upsertProduct(item)))
    }, `${product.name} moved ${direction < 0 ? 'up' : 'down'}.`)
  }
  const orderPosition = (product: Product) => {
    const sectionProducts = orderProductsForDisplay(products.filter((item) => productStorefrontSection(item) === productStorefrontSection(product)))
    const index = sectionProducts.findIndex((item) => item.id === product.id)
    return { index, count: sectionProducts.length }
  }
  return <>
    <PageMeta title="Products — Admin" description="Manage the Doxa catalogue." />
    <AdminPageHeader eyebrow="Commerce" title="Products" description="Search the catalogue, manage publishing and open a product to edit its details." actions={<Link className="button primary" to="/admin/products/new"><Plus /> Add product</Link>} />
    {error && <ErrorState message={error} onRetry={() => void refresh()} />}
    <AdminPanel className="admin-list-card">
      <div className="admin-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search products…" label="Search products" /><div className="admin-filters"><label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select></label><label><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Product</th><th>Category</th><th>Order</th><th>Status</th><th>Price</th><th>Featured</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map((product) => { const position = orderPosition(product); return <tr key={product.id}><td><Link className="admin-product-cell" to={`/admin/products/${encodeURIComponent(product.id)}`}><img src={product.imageUrl} alt="" /><span><strong>{product.name}</strong><small>/{product.slug}</small></span></Link></td><td>{product.category}</td><td><div className="admin-product-order"><span>{productSortOrder(product)}</span><div><button type="button" aria-label={`Move ${product.name} up`} title="Move up" disabled={position.index <= 0 || busy === 'reorder-products'} onClick={() => void moveProduct(product, -1)}><ArrowUp aria-hidden="true" /></button><button type="button" aria-label={`Move ${product.name} down`} title="Move down" disabled={position.index < 0 || position.index >= position.count - 1 || busy === 'reorder-products'} onClick={() => void moveProduct(product, 1)}><ArrowDown aria-hidden="true" /></button></div></div></td><td><StatusBadge tone={product.status === 'published' ? 'positive' : 'neutral'}>{product.status}</StatusBadge></td><td>{formatMoney(product.priceCents, product.currency)}</td><td>{product.featured ? 'Yes' : '—'}</td><td><div className="admin-row-actions"><Link className="text-button" to={`/admin/products/${encodeURIComponent(product.id)}`}>Edit <ArrowRight /></Link><button className="text-button danger" onClick={() => setDeleteTarget(product)}>Delete</button></div></td></tr>})}</tbody></table></div> : <EmptyState title={products.length ? 'No matching products' : 'No products yet'} description={products.length ? 'Try a different search or filter.' : canLoadPreviewCatalogue ? 'Create the first catalogue product, or load the preview catalogue for local review.' : 'Create the first production catalogue product.'} action={!products.length && <div className="button-row centred"><Link className="button primary" to="/admin/products/new">Add product</Link>{canLoadPreviewCatalogue && <button className="button secondary" disabled={busy === 'seed-products'} onClick={() => void runAction('seed-products', async () => { for (const product of demoProducts) await upsertProduct(product) }, 'Preview catalogue added.')}>Add preview catalogue</button>}</div>} />}
      <footer className="admin-list-footer">Showing {filtered.length} of {products.length} products</footer>
    </AdminPanel>
    <ConfirmDialog open={Boolean(deleteTarget)} title={`Delete ${deleteTarget?.name ?? 'product'}?`} description="This permanently removes the product from the catalogue. This action cannot be undone." confirmLabel="Delete product" busy={busy.startsWith('delete-product-')} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
  </>
}
