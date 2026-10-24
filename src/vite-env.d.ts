/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'demo' | 'firebase'
  readonly VITE_USE_FIREBASE_EMULATORS?: string
  readonly VITE_AUTH_ONLY_LOCAL?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string
  // Fail-closed Stripe storefront state. Unset/invalid values disable checkout.
  readonly VITE_CHECKOUT_STATE?: 'disabled' | 'test' | 'live'
  // Analytics is opt-in: unset or anything other than 'true' means off.
  readonly VITE_ANALYTICS_ENABLED?: string
}

interface ImportMeta { readonly env: ImportMetaEnv }
