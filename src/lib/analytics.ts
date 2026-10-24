import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { isAnalyticsEnabled, isFirebaseMode } from '../config'
import type { AnalyticsDevice, AnalyticsEvent, AnalyticsEventName } from '../types'
import { getFirebaseServices } from './firebase'

type EventParameters = {
  item_id?: string
  quantity?: number
  value?: number
  currency?: string
  method?: string
}

const sessionKey = 'cards.analytics.session'
const recordedPageKey = 'cards.analytics.pages'
const landingRecordedKey = 'cards.analytics.landing-recorded'

function randomSessionId() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function getSessionId() {
  try {
    const current = sessionStorage.getItem(sessionKey)
    if (current) return current
    const next = randomSessionId()
    sessionStorage.setItem(sessionKey, next)
    return next
  } catch {
    return randomSessionId()
  }
}

function getDevice(): AnalyticsDevice {
  const width = window.innerWidth
  return width < 650 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
}

function shouldRecordPage(path: string) {
  try {
    const recorded = new Set(JSON.parse(sessionStorage.getItem(recordedPageKey) || '[]') as string[])
    if (recorded.has(path)) return false
    recorded.add(path)
    sessionStorage.setItem(recordedPageKey, JSON.stringify([...recorded].slice(-100)))
    return true
  } catch {
    return true
  }
}

export function trackEvent(name: AnalyticsEventName, parameters: EventParameters = {}) {
  // Off unless explicitly enabled *and* running against a real backend, so a
  // demo or test build never records anything.
  if (!isAnalyticsEnabled() || !isFirebaseMode || typeof window === 'undefined') return
  const path = window.location.pathname.slice(0, 512) || '/'
  if (path.startsWith('/admin') || (path.startsWith('/account') && name !== 'sign_up')) return
  if ((name === 'page_view' || name === 'view_product') && !shouldRecordPage(`${name}:${path}`)) return

  const event: Record<string, unknown> = {
    name,
    path,
    sessionId: getSessionId(),
    device: getDevice(),
  }
  if (parameters.item_id) event.itemId = parameters.item_id.slice(0, 128)
  if (Number.isInteger(parameters.quantity)) event.quantity = parameters.quantity
  if (typeof parameters.value === 'number' && Number.isFinite(parameters.value)) event.valueCents = Math.max(0, Math.round(parameters.value * 100))
  if (parameters.currency === 'AUD') event.currency = 'AUD'
  if (parameters.method && ['password', 'google', 'apple'].includes(parameters.method)) event.method = parameters.method
  if (name === 'page_view') {
    try {
      const isLanding = sessionStorage.getItem(landingRecordedKey) !== 'true'
      if (isLanding) {
        event.isLanding = true
        sessionStorage.setItem(landingRecordedKey, 'true')
        const referrerHost = document.referrer ? new URL(document.referrer).hostname : ''
        if (referrerHost && referrerHost !== window.location.hostname) event.referrerHost = referrerHost.slice(0, 160)
      }
    } catch { /* Analytics must never interrupt navigation. */ }
  }

  const { functions } = getFirebaseServices()
  void httpsCallable(functions, 'recordAnalyticsEvent')(event).catch((error) => {
    if (import.meta.env.DEV) console.warn('Analytics event was not recorded.', error)
  })
}

export function trackPageView(path: string) {
  if (!path.startsWith('/admin') && !path.startsWith('/account')) trackEvent('page_view')
}

export async function listAnalyticsEvents(days: 7 | 30 | 90): Promise<AnalyticsEvent[]> {
  const { db } = getFirebaseServices()
  const since = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000)
  const snapshot = await getDocs(query(collection(db, 'analyticsEvents'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(2000)))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AnalyticsEvent))
}
