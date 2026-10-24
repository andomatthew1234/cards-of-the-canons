import { createHash } from 'node:crypto'
import { type Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { db } from './firebase'

export async function checkRateLimit(key: string, maximum: number, windowMinutes = 24 * 60) {
  const now = Date.now()
  const windowMs = windowMinutes * 60 * 1000
  const bucket = Math.floor(now / windowMs)
  const id = createHash('sha256').update(`${bucket}:${key}`).digest('hex')
  const ref = db.collection('_abuseCounters').doc(id)
  await db.runTransaction(async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref)
    const count = snapshot.exists ? Number(snapshot.data()?.count ?? 0) : 0
    if (count >= maximum) throw new HttpsError('resource-exhausted', 'Please wait before trying again.')
    transaction.set(ref, {
      count: count + 1,
      bucket,
      expiresAt: new Date(now + Math.max(windowMs * 2, 60 * 60 * 1000)),
    }, { merge: true })
  })
}
