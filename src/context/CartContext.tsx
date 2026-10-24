import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartLine, Product } from '../types'
import { trackEvent } from '../lib/analytics'
import { useCatalogState } from './CatalogContext'

interface CartValue {
  lines: CartLine[]
  count: number
  subtotal: number
  products: Product[]
  add: (productId: string, quantity?: number) => void
  update: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
}

const CartContext = createContext<CartValue | null>(null)
const key = 'cards-of-the-canons:demo-cart'

function initialCart(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line): line is CartLine => typeof line === 'object' && line !== null && typeof (line as CartLine).productId === 'string' && Number.isInteger((line as CartLine).quantity) && (line as CartLine).quantity > 0 && (line as CartLine).quantity <= 20)
  } catch { return [] }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(initialCart)
  const { products, status: catalogueStatus } = useCatalogState()
  useEffect(() => localStorage.setItem(key, JSON.stringify(lines)), [lines])
  useEffect(() => {
    if (catalogueStatus !== 'ready') return
    setLines((current) => current.flatMap((line) => {
      const product = products.find((item) => item.id === line.productId)
      const maximum = product?.stock === null ? 20 : Math.min(20, product?.stock ?? 0)
      if (!product || product.priceCents <= 0 || maximum < 1) return []
      return [{ ...line, quantity: Math.min(line.quantity, maximum) }]
    }))
  }, [catalogueStatus, products])
  const value = useMemo<CartValue>(() => ({
    lines,
    products,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + (products.find((product) => product.id === line.productId)?.priceCents ?? 0) * line.quantity, 0),
    add(productId, quantity = 1) {
      const product = products.find((item) => item.id === productId)
      const maximum = product?.stock === null ? 20 : Math.min(20, product?.stock ?? 0)
      if (!product || product.priceCents <= 0 || maximum < 1) return
      setLines((current) => {
        const found = current.find((line) => line.productId === productId)
        return found ? current.map((line) => line.productId === productId ? { ...line, quantity: Math.min(maximum, line.quantity + quantity) } : line) : [...current, { productId, quantity: Math.min(maximum, Math.max(1, quantity)) }]
      })
      trackEvent('add_to_cart', { item_id: productId, quantity })
    },
    update(productId, quantity) {
      const product = products.find((item) => item.id === productId)
      const maximum = product?.stock === null ? 20 : Math.min(20, product?.stock ?? 0)
      setLines((current) => quantity < 1 || !product || product.priceCents <= 0 || maximum < 1 ? current.filter((line) => line.productId !== productId) : current.map((line) => line.productId === productId ? { ...line, quantity: Math.min(maximum, quantity) } : line))
    },
    remove(productId) { setLines((current) => current.filter((line) => line.productId !== productId)) },
    clear() { setLines([]) },
  }), [lines, products])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
