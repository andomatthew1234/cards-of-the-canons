import { ArrowRight, CheckCircle2, Minus, Plus, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../config'
import { useCart } from '../context/CartContext'
import type { Product } from '../types'

export function ProductCard({ product, headingLevel = 'h3', variant = 'default' }: { product: Product; headingLevel?: 'h2' | 'h3'; variant?: 'default' | 'showcase' | 'compact' }) {
  const { add, lines, update } = useCart()
  const quantity = lines.find((line) => line.productId === product.id)?.quantity ?? 0
  const maxQuantity = product.stock === null ? 20 : Math.min(20, product.stock)
  const canPurchase = product.priceCents > 0 && maxQuantity > 0
  const productPath = variant === 'compact' && product.priceCents <= 0 ? '/shop' : `/product/${product.slug}`
  const Heading = headingLevel
  return <article className={`product-card product-card-${variant}${quantity > 0 ? ' in-cart' : ''}`}>
    <Link to={productPath} className="product-image"><img src={product.imageUrl} alt={product.imageAlt} width="800" height="920" loading="lazy" decoding="async" /></Link>
    <div className="product-card-content">
      <p className="eyebrow">{product.category}</p>
      <Heading><Link to={productPath}>{product.name}</Link></Heading>
      <p>{product.shortDescription}</p>
      <div className="product-card-footer">
        <strong>{product.priceCents > 0 ? formatMoney(product.priceCents) : 'Coming soon'}</strong>
        {!canPurchase ? <button className="product-add-button unavailable" type="button" disabled aria-label={`${product.name} is not available to purchase`}><span>{product.priceCents <= 0 ? 'Coming soon' : 'Currently unavailable'}</span></button> : quantity === 0 ? <button className="product-add-button" type="button" aria-label={`Add to cart — ${product.name}`} onClick={() => add(product.id)}><span className="product-add-icon"><ShoppingBag aria-hidden="true" /></span><span>Add to cart</span></button> : <div className="product-added-control">
          <div className="product-added-top">
            <span className="product-added-label" aria-live="polite"><CheckCircle2 aria-hidden="true" /> Added to cart</span>
            <div className="product-card-quantity" aria-label={`${product.name} quantity in cart`}>
              <button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => update(product.id, quantity - 1)}><Minus aria-hidden="true" /></button>
              <output aria-live="polite" aria-label={`${product.name} quantity`}>{quantity}</output>
              <button type="button" aria-label={`Add another ${product.name}`} disabled={quantity >= maxQuantity} onClick={() => add(product.id)}><Plus aria-hidden="true" /></button>
            </div>
          </div>
          <Link className="product-go-cart" to="/cart"><ShoppingBag aria-hidden="true" /><span>Go to cart</span><ArrowRight aria-hidden="true" /></Link>
        </div>}
      </div>
    </div>
  </article>
}
