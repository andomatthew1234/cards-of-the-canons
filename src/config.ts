import type { SiteSettings } from './types'
import { BRAND_NAME } from './lib/brand'
import { DEFAULT_SITE_THEME } from './lib/siteTheme'

export const siteSettings: SiteSettings = {
  businessName: BRAND_NAME,
  announcement: 'Discover collectible stories from Christian and Church history.',
  contactEmail: 'info@doxatreasury.com',
  currency: 'AUD',
  theme: DEFAULT_SITE_THEME,
}

// Unit tests stay isolated from the live Firebase project unless a test
// explicitly mocks this flag and the Firebase services it needs.
export const isFirebaseMode = import.meta.env.MODE !== 'test' && import.meta.env.VITE_DATA_MODE === 'firebase'
export const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false'
export const authOnlyLocalMode = import.meta.env.VITE_AUTH_ONLY_LOCAL === 'true'
export const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH !== 'false'
export const appleAuthEnabled = import.meta.env.VITE_ENABLE_APPLE_AUTH === 'true'
export const adminFunctionsAvailable = import.meta.env.VITE_ADMIN_FUNCTIONS_AVAILABLE !== 'false'
export const firebaseAppCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY
export type CheckoutState = 'disabled' | 'test' | 'live'
const configuredCheckoutState = import.meta.env.VITE_CHECKOUT_STATE
// Checkout is fail-closed. A missing or mistyped build-time value can never
// silently enable Stripe, and test/live builds state their intent explicitly.
export const checkoutState: CheckoutState = configuredCheckoutState === 'test' || configuredCheckoutState === 'live'
  ? configuredCheckoutState
  : 'disabled'
export const checkoutEnabled = checkoutState !== 'disabled'
export const checkoutMode: 'test' | 'live' = checkoutState === 'live' ? 'live' : 'test'

/**
 * Analytics is opt-in: nothing is recorded unless an operator explicitly sets
 * VITE_ANALYTICS_ENABLED=true (the server rejects events while its own
 * ANALYTICS_ENABLED parameter is unset, so both sides default to off).
 */
export function isAnalyticsEnabled(): boolean {
  return import.meta.env.VITE_ANALYTICS_ENABLED === 'true'
}

export const formatMoney = (cents: number, currency = siteSettings.currency) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
