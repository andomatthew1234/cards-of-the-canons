import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { isFirebaseMode } from '../config'
import type { AccountActivityEvent, AccountActivityType } from '../types'
import { getFirebaseServices } from './firebase'

export async function listAccountActivity(uid: string): Promise<AccountActivityEvent[]> {
  if (!isFirebaseMode) return []
  const { db } = getFirebaseServices()
  const snapshot = await getDocs(query(
    collection(db, 'accountActivity', uid, 'activityEvents'),
    orderBy('createdAt', 'desc'),
    limit(50),
  ))
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as AccountActivityEvent)
}

export async function recordLoginActivity() {
  if (!isFirebaseMode) return
  const { functions } = getFirebaseServices()
  await httpsCallable<undefined, { recorded: boolean; locationRecorded: boolean }>(functions, 'recordLoginActivity')()
}

export async function recordSecurityActivity(type: Extract<AccountActivityType, 'password_changed' | 'mfa_enrolled' | 'mfa_removed'>, factorName?: string) {
  if (!isFirebaseMode) return
  const { functions } = getFirebaseServices()
  await httpsCallable<{ type: typeof type; factorName?: string }, { recorded: boolean }>(functions, 'recordSecurityActivity')({
    type,
    ...(factorName ? { factorName } : {}),
  })
}
