import { randomUUID } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase'

export type EmailQueueStatus = 'scheduled' | 'preparing' | 'queued' | 'sent' | 'delivered' | 'partially_sent' | 'failed' | 'cancelled'

export interface EmailQueueStart {
  id?: string
  kind: 'campaign' | 'journal' | 'newsletter' | 'test' | 'transactional'
  subject: string
  recipientLabel: string
  recipientCount: number
  sourceId?: string | null
  createdBy?: string | null
  status?: EmailQueueStatus
  scheduledAt?: Timestamp | null
}

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)
}

export async function beginEmailQueueItem(input: EmailQueueStart) {
  const id = safeId(input.id || randomUUID())
  const ref = db.collection('emailQueue').doc(id)
  const now = Timestamp.now()
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    transaction.set(ref, {
      kind: input.kind,
      subject: input.subject.slice(0, 180),
      recipientLabel: input.recipientLabel.slice(0, 240),
      recipientCount: Math.max(0, Math.floor(input.recipientCount)),
      sourceId: input.sourceId ?? null,
      createdBy: input.createdBy ?? null,
      status: input.status ?? 'preparing',
      scheduledAt: input.scheduledAt ?? null,
      updatedAt: now,
      ...(!existing.exists ? {
        createdAt: now,
        sentAt: null,
        providerMessageId: null,
        acceptedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        lastError: null,
      } : {}),
    }, { merge: true })
  })
  return ref
}

export async function updateEmailQueueItem(id: string, values: Record<string, unknown>) {
  await db.collection('emailQueue').doc(safeId(id)).set({ ...values, updatedAt: Timestamp.now() }, { merge: true })
}

export function emailQueueItemForClient(id: string, data: FirebaseFirestore.DocumentData) {
  const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null
  return {
    id,
    kind: String(data.kind ?? 'transactional'),
    subject: String(data.subject ?? ''),
    recipientLabel: String(data.recipientLabel ?? ''),
    recipientCount: Number(data.recipientCount ?? 0),
    acceptedCount: Number(data.acceptedCount ?? 0),
    deliveredCount: Number(data.deliveredCount ?? 0),
    failedCount: Number(data.failedCount ?? 0),
    status: String(data.status ?? 'failed'),
    sourceId: typeof data.sourceId === 'string' ? data.sourceId : null,
    providerMessageId: typeof data.providerMessageId === 'string' ? data.providerMessageId : null,
    lastError: typeof data.lastError === 'string' ? data.lastError : null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    scheduledAt: iso(data.scheduledAt),
    sentAt: iso(data.sentAt),
  }
}
