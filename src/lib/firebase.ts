import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'
import { firebaseAppCheckSiteKey, isFirebaseMode, useFirebaseEmulators } from '../config'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // Keep OAuth on Firebase's registered handler. Substituting the current
  // Hosting hostname makes web.app generate an unregistered redirect URI.
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let app: FirebaseApp | undefined
let appCheck: AppCheck | undefined
let auth: Auth | undefined
let db: Firestore | undefined
let storage: FirebaseStorage | undefined
let functions: Functions | undefined
let connected = false

export function getFirebaseServices() {
  if (!isFirebaseMode) throw new Error('Connected services are not available in this environment.')
  if (!config.apiKey || !config.projectId || config.apiKey === 'replace-me') {
    throw new Error('Firebase mode requires the VITE_FIREBASE_* values described in .env.example.')
  }
  app ??= initializeApp(config)

  if (!useFirebaseEmulators && !appCheck) {
    if (!firebaseAppCheckSiteKey || firebaseAppCheckSiteKey === 'replace-me') {
      throw new Error('Connected Firebase mode requires VITE_FIREBASE_APP_CHECK_SITE_KEY.')
    }

    // The debug provider is confined to Vite development builds. Production builds
    // always use reCAPTCHA Enterprise attestation, even when previewed locally.
    if (import.meta.env.DEV && typeof globalThis !== 'undefined') {
      const debugGlobal = globalThis as typeof globalThis & {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string
      }
      debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    }

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(firebaseAppCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  }

  auth ??= getAuth(app)
  db ??= getFirestore(app)
  storage ??= getStorage(app)
  functions ??= getFunctions(app, 'australia-southeast1')
  if (useFirebaseEmulators && !connected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectStorageEmulator(storage, '127.0.0.1', 9199)
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)
    connected = true
  }
  return { app, appCheck, auth, db, storage, functions }
}
