import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { friendlyAuthError } from '../context/AuthContext'
import { listManagedAccounts } from '../lib/accounts'
import { listAdminOrders, listAdminProducts, listEnquiries, listSubscribers } from '../lib/data'
import type { Enquiry, ManagedAccount, NewsletterSubscriber, Order, Product } from '../types'

type Toast = { id: number; message: string; tone: 'success' | 'error' }
type AdminResource = 'products' | 'orders' | 'accounts' | 'enquiries' | 'subscribers'
type AdminResourceErrors = Partial<Record<AdminResource, string>>

interface AdminDataValue {
  products: Product[]
  orders: Order[]
  accounts: ManagedAccount[]
  enquiries: Enquiry[]
  subscribers: NewsletterSubscriber[]
  loading: boolean
  error: string
  errors: AdminResourceErrors
  busy: string
  toast: Toast | null
  refresh: () => Promise<void>
  runAction: (key: string, action: () => Promise<void>, successMessage?: string) => Promise<boolean>
  dismissToast: () => void
}

const AdminDataContext = createContext<AdminDataValue | null>(null)

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [accounts, setAccounts] = useState<ManagedAccount[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<AdminResourceErrors>({})
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    setErrors({})
    const results = await Promise.allSettled([listAdminProducts(), listAdminOrders(), listManagedAccounts(), listEnquiries(), listSubscribers()])
    const [productResult, orderResult, accountResult, enquiryResult, subscriberResult] = results
    if (productResult.status === 'fulfilled') setProducts(productResult.value)
    if (orderResult.status === 'fulfilled') setOrders(orderResult.value)
    if (accountResult.status === 'fulfilled') setAccounts(accountResult.value)
    if (enquiryResult.status === 'fulfilled') setEnquiries(enquiryResult.value)
    if (subscriberResult.status === 'fulfilled') setSubscribers(subscriberResult.value)
    const resourceNames: AdminResource[] = ['products', 'orders', 'accounts', 'enquiries', 'subscribers']
    const nextErrors: AdminResourceErrors = {}
    results.forEach((result, index) => {
      if (result.status === 'rejected') nextErrors[resourceNames[index]] = friendlyAuthError(result.reason)
    })
    setErrors(nextErrors)
    const firstError = resourceNames.map((resource) => nextErrors[resource]).find(Boolean)
    if (firstError) setError(firstError)
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const runAction = useCallback(async (key: string, action: () => Promise<void>, successMessage = 'Changes saved.') => {
    setBusy(key)
    try {
      await action()
      setToast({ id: Date.now(), message: successMessage, tone: 'success' })
      await refresh()
      return true
    } catch (actionError) {
      setToast({ id: Date.now(), message: friendlyAuthError(actionError), tone: 'error' })
      return false
    } finally {
      setBusy('')
    }
  }, [refresh])

  const value = useMemo(() => ({ products, orders, accounts, enquiries, subscribers, loading, error, errors, busy, toast, refresh, runAction, dismissToast: () => setToast(null) }), [products, orders, accounts, enquiries, subscribers, loading, error, errors, busy, toast, refresh, runAction])
  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const value = useContext(AdminDataContext)
  if (!value) throw new Error('useAdminData must be used inside AdminDataProvider')
  return value
}
