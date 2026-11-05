import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'
import { loadTreasuryStateFor } from './physicalTreasury'

const callableOptions = { region: 'australia-southeast1', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)
const imageUrl = z.string().trim().max(1000).refine((value) => value === '' || value.startsWith('/') || /^https:\/\//i.test(value), 'Use a secure image URL or site path.')
const status = z.enum(['draft', 'published', 'archived'])

export const treasuryEditionSchema = z.object({
  id: identifier.optional(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1500),
  coverImageUrl: imageUrl,
  coverImageAlt: z.string().trim().max(180),
  status,
  sortOrder: z.number().int().min(0).max(10_000),
  codePrefix: z.string().trim().toUpperCase().regex(/^[A-Z]$/, 'Use one letter, such as A.').optional(),
  starterCardCount: z.number().int().min(0).max(48).optional(),
}).strict()

export const treasuryCardSchema = z.object({
  id: identifier.optional(),
  editionId: identifier,
  number: z.string().trim().regex(/^(?:0?[1-9]|[1-9][0-9])$/, 'Use a card position from 01 to 99.'),
  title: z.string().trim().min(2).max(140),
  teaser: z.string().trim().max(400),
  story: z.string().trim().max(12_000),
  imageUrl,
  imageAlt: z.string().trim().max(180),
  status,
  sortOrder: z.number().int().min(0).max(10_000),
}).strict()

const generateBatchSchema = z.object({
  cardId: identifier,
  quantity: z.number().int().min(1).max(100),
  label: z.string().trim().min(2).max(120),
  orderId: z.string().trim().max(160).optional(),
}).strict()

const redeemSchema = z.object({ code: z.string().trim().min(10).max(80) }).strict()
const revokeBatchSchema = z.object({ batchId: identifier, reason: z.string().trim().min(4).max(300) }).strict()

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_GROUPS = 5
const CODE_GROUP_LENGTH = 5
const CODE_BODY_LENGTH = CODE_GROUPS * CODE_GROUP_LENGTH

export function generateTreasuryCode(bytes = randomBytes): string {
  const random = bytes(32)
  let body = ''
  for (let index = 0; index < CODE_BODY_LENGTH; index += 1) body += CODE_ALPHABET[random[index] & 31]
  return `DXA-${body.match(new RegExp(`.{1,${CODE_GROUP_LENGTH}}`, 'g'))!.join('-')}`
}

export function normalizeTreasuryCode(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  const pattern = new RegExp(`^DXA[${CODE_ALPHABET}]{${CODE_BODY_LENGTH}}$`)
  return pattern.test(normalized) ? normalized : null
}

export function hashTreasuryCode(normalizedCode: string): string {
  return createHash('sha256').update(`doxa-treasury-v1:${normalizedCode}`).digest('hex')
}

function formatCode(normalizedCode: string) {
  const body = normalizedCode.slice(3)
  return `DXA-${body.match(new RegExp(`.{1,${CODE_GROUP_LENGTH}}`, 'g'))!.join('-')}`
}

function asDate(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

function publicEdition(document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = document.data() || {}
  return {
    id: document.id,
    title: String(data.title || ''),
    description: String(data.description || ''),
    coverImageUrl: String(data.coverImageUrl || ''),
    coverImageAlt: String(data.coverImageAlt || ''),
    status: data.status,
    sortOrder: Number(data.sortOrder || 0),
    codePrefix: String(data.codePrefix || ''),
  }
}

function adminCard(document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) {
  const data = document.data() || {}
  return {
    id: document.id,
    editionId: String(data.editionId || ''),
    number: String(data.number || ''),
    title: String(data.title || ''),
    teaser: String(data.teaser || ''),
    story: String(data.story || ''),
    imageUrl: String(data.imageUrl || ''),
    imageAlt: String(data.imageAlt || ''),
    status: data.status,
    sortOrder: Number(data.sortOrder || 0),
  }
}

function customerCard(card: ReturnType<typeof adminCard>, holding?: Record<string, unknown>) {
  const collected = Boolean(holding)
  return {
    id: card.id,
    editionId: card.editionId,
    number: card.number,
    title: card.title,
    teaser: card.teaser,
    status: card.status,
    sortOrder: card.sortOrder,
    collected,
    quantity: collected ? Math.max(1, Number(holding?.quantity || 1)) : 0,
    firstCollectedAt: collected ? asDate(holding?.firstCollectedAt) : null,
    lastCollectedAt: collected ? asDate(holding?.lastCollectedAt) : null,
    story: collected ? card.story : '',
    imageUrl: collected ? card.imageUrl : '',
    imageAlt: collected ? card.imageAlt : '',
  }
}

export const getMyTreasury = onCall(callableOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  return loadTreasuryStateFor(caller.uid)
})

export const saveTreasuryEdition = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = treasuryEditionSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || 'Check the collection set details.')
  const { id, starterCardCount = 0, ...rawEdition } = parsed.data
  const edition = { ...rawEdition, codePrefix: rawEdition.codePrefix || 'A' }
  const ref = id ? db.collection('treasuryEditions').doc(id) : db.collection('treasuryEditions').doc()
  const allEditions = await db.collection('treasuryEditions').limit(100).get()
  const orderedEditions = [...allEditions.docs].sort((left, right) => Number(left.data().sortOrder || 0) - Number(right.data().sortOrder || 0))
  const prefixConflict = orderedEditions.some((document, index) => document.id !== ref.id
    && String(document.data().codePrefix || (index === 0 ? 'A' : '')).toUpperCase() === edition.codePrefix)
  if (prefixConflict) throw new HttpsError('already-exists', 'That physical card set letter is already in use.')
  const existing = await ref.get()
  const batch = db.batch()
  batch.set(ref, {
    ...edition,
    createdAt: existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
    createdBy: existing.data()?.createdBy ?? caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  })
  if (!existing.exists && starterCardCount) {
    for (let index = 1; index <= starterCardCount; index += 1) {
      const card = db.collection('treasuryCards').doc()
      batch.create(card, {
        editionId: ref.id,
        number: String(index).padStart(2, '0'),
        title: `Card ${String(index).padStart(2, '0')}`,
        teaser: 'This card is waiting for its approved title and preview.',
        story: '', imageUrl: '', imageAlt: '', status: 'draft', sortOrder: index,
        createdAt: FieldValue.serverTimestamp(), createdBy: caller.uid,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid,
      })
    }
  }
  await batch.commit()
  return { id: ref.id }
})

export const saveTreasuryCard = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = treasuryCardSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || 'Check the card details.')
  const { id, ...rawCard } = parsed.data
  const card = { ...rawCard, number: String(Number(rawCard.number)).padStart(2, '0') }
  if (!(await db.collection('treasuryEditions').doc(card.editionId).get()).exists) throw new HttpsError('not-found', 'Collection set not found.')
  const ref = id ? db.collection('treasuryCards').doc(id) : db.collection('treasuryCards').doc()
  const editionCards = await db.collection('treasuryCards').where('editionId', '==', card.editionId).limit(200).get()
  const numberConflict = editionCards.docs.some((document) => document.id !== ref.id
    && String(Number(document.data().number)).padStart(2, '0') === card.number)
  if (numberConflict) throw new HttpsError('already-exists', 'That card position is already used in this collection set.')
  const existing = await ref.get()
  await ref.set({
    ...card,
    createdAt: existing.data()?.createdAt ?? FieldValue.serverTimestamp(),
    createdBy: existing.data()?.createdBy ?? caller.uid,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid,
  })
  return { id: ref.id }
})

export const getTreasuryAdminState = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const [editionSnapshot, cardSnapshot, batchSnapshot, transactionSnapshot] = await Promise.all([
    db.collection('treasuryEditions').limit(100).get(),
    db.collection('treasuryCards').limit(1000).get(),
    db.collection('_treasuryCodeBatches').orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('_treasuryTransactions').orderBy('createdAt', 'desc').limit(200).get(),
  ])
  return {
    editions: editionSnapshot.docs.map(publicEdition).sort((a, b) => a.sortOrder - b.sortOrder),
    cards: cardSnapshot.docs.map(adminCard).sort((a, b) => a.sortOrder - b.sortOrder),
    batches: batchSnapshot.docs.map((document) => {
      const data = document.data()
      return {
        id: document.id, label: String(data.label || ''), editionId: String(data.editionId || ''), cardId: String(data.cardId || ''),
        orderId: String(data.orderId || ''), quantity: Number(data.quantity || 0), redeemedCount: Number(data.redeemedCount || 0),
        revokedCount: Number(data.revokedCount || 0), status: data.status, createdAt: asDate(data.createdAt),
      }
    }),
    transactions: transactionSnapshot.docs.map((document) => ({ id: document.id, ...document.data(), createdAt: asDate(document.data().createdAt) })),
  }
})

export const generateTreasuryCodeBatch = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  throw new HttpsError('failed-precondition', 'Manual redemption keys have been retired. Assign the seven-character codes printed on the physical cards from the order page.')
})

export const redeemTreasuryCode = onCall(callableOptions, async (request) => {
  await authorizeRequest(request as CallableRequestLike, { requireVerifiedEmail: true })
  throw new HttpsError('failed-precondition', 'Single redemption keys have been retired. Open My Treasury, choose Redeem Cards, and enter your order number first.')
})

export const revokeTreasuryCodeBatch = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = revokeBatchSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a batch and add a reason for revoking it.')
  const batchRef = db.collection('_treasuryCodeBatches').doc(parsed.data.batchId)
  const batchSnapshot = await batchRef.get()
  if (!batchSnapshot.exists) throw new HttpsError('not-found', 'Code batch not found.')
  const codes = await db.collection('_treasuryCodes').where('batchId', '==', batchRef.id).limit(200).get()
  const active = codes.docs.filter((document) => document.data().status === 'active')
  const write = db.batch()
  const now = FieldValue.serverTimestamp()
  for (const code of active) write.update(code.ref, { status: 'revoked', revokedAt: now, revokedBy: caller.uid, revokeReason: parsed.data.reason })
  write.update(batchRef, { status: 'closed', revokedCount: FieldValue.increment(active.length), closedAt: now, closedBy: caller.uid })
  await write.commit()
  return { revoked: active.length }
})
