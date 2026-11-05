import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { AccountSecurityCapabilities, AccountSecurityPolicy, ManagedAccount, UserProfile } from '../types'
import { getFirebaseServices } from './firebase'
import { adminFunctionsAvailable, authOnlyLocalMode } from '../config'

// Profile mutations are server-owned (S10): the client never writes
// usersPrivate directly. The callable rate-limits changes, derives the email
// address from the Auth record instead of trusting the caller, and skips the
// write when nothing changed, so profile and email synchronisation stay
// usable without leaving a client-writable path behind.
async function updateMyProfile(values: { displayName?: string; phone?: string | null; checkoutAndEnquiryAutofill?: boolean }) {
  const { functions } = getFirebaseServices()
  const callable = httpsCallable<typeof values, { updated: boolean }>(functions, 'updateMyProfile')
  return (await callable(values)).data
}

export async function ensureUserProfile(_uid: string, profile: Pick<UserProfile, 'displayName' | 'email'>) {
  if (authOnlyLocalMode) return
  if (!profile.displayName) return
  await updateMyProfile({ displayName: profile.displayName })
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (authOnlyLocalMode) return null
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, 'usersPrivate', uid))
  return snapshot.exists() ? snapshot.data() as UserProfile : null
}

export async function isAccountAccessBlocked(uid: string) {
  if (authOnlyLocalMode) return false
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, 'accountControls', uid))
  return snapshot.exists() && (snapshot.data().disabled === true || snapshot.data().deleted === true)
}

export async function saveUserProfile(_uid: string, values: Pick<UserProfile, 'displayName' | 'phone'>) {
  if (authOnlyLocalMode) return
  await updateMyProfile({
    displayName: values.displayName,
    ...(values.phone === undefined ? {} : { phone: values.phone }),
  })
}

export async function saveCheckoutAndEnquiryAutofillPreference(_uid: string, enabled: boolean) {
  if (authOnlyLocalMode) return { updated: false }
  return updateMyProfile({ checkoutAndEnquiryAutofill: enabled })
}

export async function syncUserProfileEmail(_uid: string, _email: string) {
  // The server re-reads the Auth record, so a client-supplied address is
  // deliberately ignored: it can only request a synchronisation.
  if (authOnlyLocalMode) return
  await updateMyProfile({})
}

export interface AccountOnboardingChoices {
  termsAccepted: true
  termsVersion: 'account-terms-v1'
  autofillConsent: true
  mailingListSelected: boolean
  recoveryPhone: string | null
}

export async function beginAccountOnboarding() {
  if (authOnlyLocalMode) return { required: true }
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, { required: boolean }>(functions, 'beginAccountOnboarding')({})).data
}

export async function completeAccountOnboarding(choices: AccountOnboardingChoices) {
  if (authOnlyLocalMode) return { completed: true }
  const { functions } = getFirebaseServices()
  return (await httpsCallable<AccountOnboardingChoices, { completed: boolean }>(functions, 'completeAccountOnboarding')(choices)).data
}

export async function getAccountSecurityPolicy(): Promise<{ policy: AccountSecurityPolicy; capabilities: AccountSecurityCapabilities }> {
  const { functions } = getFirebaseServices()
  const callable = httpsCallable<undefined, { policy: AccountSecurityPolicy; capabilities: AccountSecurityCapabilities }>(functions, 'getAccountSecurityPolicy')
  return (await callable()).data
}

export async function deleteAuthenticatedAccount() {
  const { functions } = getFirebaseServices()
  const callable = httpsCallable<undefined, { deleted: boolean }>(functions, 'deleteMyAccount')
  return (await callable()).data
}

export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  const { db, functions } = getFirebaseServices()
  if (adminFunctionsAvailable) {
    // The Auth listing is paginated server-side; fetch a bounded number of
    // pages instead of asking for an unbounded result set.
    const accounts: ManagedAccount[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 5; page += 1) {
      // Firebase callable payloads reject explicit `undefined` values before a
      // request reaches the server. Omit the token entirely on the first page.
      const input = pageToken ? { pageToken } : {}
      const result = await httpsCallable<{ pageToken?: string }, { accounts: ManagedAccount[]; nextPageToken: string | null }>(functions, 'listUserAccounts')(input)
      accounts.push(...result.data.accounts)
      pageToken = result.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
    return accounts
  }
  const [profiles, controls, roles] = await Promise.all([
    getDocs(collection(db, 'usersPrivate')),
    getDocs(collection(db, 'accountControls')),
    // Server-owned role records replace every mailbox allowlist; under the
    // deployed rules only an administrator can read them at all.
    getDocs(collection(db, 'accountRoles')),
  ])
  const disabled = new Map(controls.docs.map((item) => [item.id, item.data().disabled === true || item.data().deleted === true]))
  const roleOf = new Map(roles.docs.map((item) => [item.id, item.data().role]))
  return profiles.docs.map((item) => {
    const profile = item.data() as UserProfile
    const role = roleOf.get(item.id)
    return {
      uid: item.id,
      email: profile.email || null,
      displayName: profile.displayName || null,
      disabled: disabled.get(item.id) === true,
      emailVerified: true,
      providers: [],
      createdAt: '',
      lastSignInAt: null,
      admin: role === 'owner' || role === 'admin',
      owner: role === 'owner',
    }
  })
}

export type AccountAdminAction = 'disable' | 'enable' | 'delete' | 'grantAdmin' | 'revokeAdmin'

export async function manageAccount(uid: string, action: AccountAdminAction) {
  const { db, functions } = getFirebaseServices()
  if (adminFunctionsAvailable) return void await httpsCallable(functions, 'manageUserAccount')({ uid, action })
  if (action === 'grantAdmin' || action === 'revokeAdmin') throw new Error('Administrator roles are managed by trusted server tooling only.')
  if (action === 'delete') {
    // Best-effort tombstone only. Profile data, Auth records and orders are
    // removed by the resumable server deletion routine, never by a client.
    await setDoc(doc(db, 'accountControls', uid), { disabled: true, deleted: true, updatedAt: serverTimestamp() }, { merge: true })
    return
  }
  await setDoc(doc(db, 'accountControls', uid), { disabled: action === 'disable', updatedAt: serverTimestamp() }, { merge: true })
}
