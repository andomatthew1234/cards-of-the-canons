import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db } from './firebase'

// Durable, tombstone-first, resumable account deletion.
//
// The tombstone in accountControls is written first and is never deleted by
// any code path, so a partially finished deletion stays visible to rules and
// to the resumable worker. Orders are commercial records and are always
// preserved. Every step tolerates "already done" so retries are idempotent.

export const pendingDeletionState = 'pending'
export const completeDeletionState = 'complete'

/**
 * Top-level profile documents removed by deletion. Orders are commercial
 * records and the accountControls tombstone is the durable deletion marker,
 * so neither may ever appear here.
 */
export const deletionUserDataCollections = ['usersPrivate', 'accountSecurity', 'accountRoles'] as const
export const preservedDeletionCollections = ['orders', 'accountControls'] as const

export interface DeletionEnvironment {
  loadControl: (uid: string) => Promise<{ exists: boolean; data: Record<string, unknown> | null }>
  writeTombstone: (uid: string, data: Record<string, unknown>) => Promise<void>
  revokeTokens: (uid: string) => Promise<void>
  deleteAuthUser: (uid: string) => Promise<void>
  deleteUserData: (uid: string) => Promise<void>
  markComplete: (uid: string) => Promise<void>
  listPending: (limit: number) => Promise<string[]>
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
}

/** An already removed Auth user is success, not failure. */
function ignoreMissingUser(error: unknown): void {
  const failure = errorCode(error)
  if (failure === 'auth/user-not-found') return
  throw error
}

export async function runAccountDeletion(uid: string, env: DeletionEnvironment): Promise<{ state: 'complete' }> {
  const control = await env.loadControl(uid)
  const tombstoned = control.exists && control.data?.deleted === true
  const finished = tombstoned && control.data?.deletionState === completeDeletionState
  if (!finished) {
    // Tombstone first: if anything below fails, access stays blocked and the
    // scheduled resume can pick the work up again.
    await env.writeTombstone(uid, {
      disabled: true,
      deleted: true,
      deletionState: pendingDeletionState,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await env.revokeTokens(uid).catch(ignoreMissingUser)
    await env.deleteAuthUser(uid).catch(ignoreMissingUser)
    await env.deleteUserData(uid)
    await env.markComplete(uid)
  }
  return { state: 'complete' }
}

export async function resumePendingDeletions(limit: number, env: DeletionEnvironment): Promise<{ processed: number; completed: number }> {
  const pending = await env.listPending(limit)
  let completed = 0
  for (const uid of pending) {
    await runAccountDeletion(uid, env)
    completed += 1
  }
  return { processed: pending.length, completed }
}

export function defaultDeletionEnvironment(): DeletionEnvironment {
  return {
    async loadControl(uid) {
      const snapshot = await db.collection('accountControls').doc(uid).get()
      return { exists: snapshot.exists, data: snapshot.exists ? snapshot.data() ?? null : null }
    },
    async writeTombstone(uid, data) {
      // merge keeps legacy control fields intact while asserting the tombstone.
      await db.collection('accountControls').doc(uid).set(data, { merge: true })
    },
    async revokeTokens(uid) {
      await getAuth().revokeRefreshTokens(uid)
    },
    async deleteAuthUser(uid) {
      await getAuth().deleteUser(uid)
    },
    async deleteUserData(uid) {
      const batch = db.batch()
      for (const collection of deletionUserDataCollections) batch.delete(db.collection(collection).doc(uid))
      await batch.commit()
      // Account activity is a subcollection, so it needs a recursive delete.
      // Orders are deliberately never touched: they are required records.
      await db.recursiveDelete(db.collection('accountActivity').doc(uid))
      // Private collection holdings are customer-owned data. Consumed code and
      // redemption evidence remain immutable so account deletion cannot make a
      // physical claim code reusable.
      await db.recursiveDelete(db.collection('userTreasuries').doc(uid))
    },
    async markComplete(uid) {
      await db.collection('accountControls').doc(uid).set({
        deletionState: completeDeletionState,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    },
    async listPending(limit) {
      const snapshot = await db.collection('accountControls')
        .where('deleted', '==', true)
        .limit(Math.max(1, Math.min(limit, 25)))
        .get()
      return snapshot.docs
        .filter((document) => document.data().deletionState !== completeDeletionState)
        .map((document) => document.id)
    },
  }
}

export const resumeAccountDeletions = onSchedule({
  region: 'australia-southeast1',
  schedule: 'every 6 hours',
  timeZone: 'Australia/Sydney',
}, async () => {
  const result = await resumePendingDeletions(5, defaultDeletionEnvironment())
  if (result.processed) logger.info('Resumed pending account deletions.', result)
})
