import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isFirebaseMode } from '../config'
import { demoProducts } from '../data/demo'
import { listPublishedProducts } from '../lib/data'
import type { Product } from '../types'

type CatalogStatus = 'loading' | 'ready' | 'error'

interface CatalogValue {
  products: Product[]
  status: CatalogStatus
  error: string | null
  reload: () => void
}

const localProducts = isFirebaseMode ? [] : demoProducts
const CatalogContext = createContext<CatalogValue>({
  products: localProducts,
  status: isFirebaseMode ? 'loading' : 'ready',
  error: null,
  reload: () => undefined,
})

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(localProducts)
  const [status, setStatus] = useState<CatalogStatus>(isFirebaseMode ? 'loading' : 'ready')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((current) => current + 1), [])

  useEffect(() => {
    if (!isFirebaseMode) return
    let active = true
    const load = async () => {
      setStatus('loading')
      setError(null)
      try {
        const items = await listPublishedProducts()
        if (!active) return
        setProducts(items)
        setStatus('ready')
      } catch {
        if (!active) return
        // Never replace a production catalogue failure with sample products.
        setProducts([])
        setError('The collection could not be loaded right now.')
        setStatus('error')
      }
    }
    void load()
    const handleUpdate = () => void load()
    window.addEventListener('cards:catalog-updated', handleUpdate)
    return () => { active = false; window.removeEventListener('cards:catalog-updated', handleUpdate) }
  }, [revision])

  const value = useMemo(() => ({ products, status, error, reload }), [products, status, error, reload])
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() { return useContext(CatalogContext).products }
export function useCatalogState() { return useContext(CatalogContext) }
