import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'

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
  starterCardCount: z.number().int().min(0).max(48).optional(),
}).strict()

export const treasuryCardSchema = z.object({
  id: identifier.optional(),
  editionId: identifier,
  number: z.string().trim().min(1).max(24),
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
  const [editionSnapshot, cardSnapshot, holdingSnapshot] = await Promise.all([
    db.collection('treasuryEditions').limit(40).get(),
    db.collection('treasuryCards').limit(400).get(),
    db.collection('userTreasuries').doc(caller.uid).collection('cards').limit(500).get(),
  ])
  const holdings = new Map(holdingSnapshot.docs.map((document) => [document.id, document.data()]))
  const ownedEditionIds = new Set(cardSnapshot.docs.filter((document) => holdings.has(document.id)).map((document) => String(document.data().editionId || '')))
  const editions = editionSnapshot.docs.map(publicEdition)
    .filter((edition) => edition.status === 'published' || ownedEditionIds.has(edition.id))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title))
  const visibleEditionIds = new Set(editions.map((edition) => edition.id))
  const cards = cardSnapshot.docs.map(adminCard)
    .filter((card) => visibleEditionIds.has(card.editionId) && (card.status === 'published' || holdings.has(card.id)))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.number.localeCompare(right.number, undefined, { numeric: true }))
    .map((card) => customerCard(card, holdings.get(card.id)))
  return { editions, cards }
})

export const saveTreasuryEdition = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = treasuryEditionSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || 'Check the collection set details.')
  const { id, starterCardCount = 0, ...edition } = parsed.data
  const ref = id ? db.collection('treasuryEditions').doc(id) : db.collection('treasuryEditions').doc()
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
  const { id, ...card } = parsed.data
  if (!(await db.collection('treasuryEditions').doc(card.editionId).get()).exists) throw new HttpsError('not-found', 'Collection set not found.')
  const ref = id ? db.collection('treasuryCards').doc(id) : db.collection('treasuryCards').doc()
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
  const [editionSnapshot, cardSnapshot, batchSnapshot] = await Promise.all([
    db.collection('treasuryEditions').limit(100).get(),
    db.collection('treasuryCards').limit(1000).get(),
    db.collection('_treasuryCodeBatches').orderBy('createdAt', 'desc').limit(100).get(),
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
  }
})

export const generateTreasuryCodeBatch = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = generateBatchSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || 'Check the code batch details.')
  await checkRateLimit(`treasury-generate:${caller.uid}`, 20, 60)
  const cardRef = db.collection('treasuryCards').doc(parsed.data.cardId)
  const cardSnapshot = await cardRef.get()
  if (!cardSnapshot.exists) throw new HttpsError('not-found', 'Card not found.')
  const card = adminCard(cardSnapshot)
  const editionSnapshot = await db.collection('treasuryEditions').doc(card.editionId).get()
  if (!editionSnapshot.exists) throw new HttpsError('failed-precondition', 'This card is not attached to a collection set.')
  const batchRef = db.collection('_treasuryCodeBatches').doc()
  const codes = new Set<string>()
  while (codes.size < parsed.data.quantity) codes.add(generateTreasuryCode())
  const write = db.batch()
  const now = FieldValue.serverTimestamp()
  write.create(batchRef, {
    label: parsed.data.label, editionId: card.editionId, cardId: cardRef.id, orderId: parsed.data.orderId || '',
    quantity: parsed.data.quantity, redeemedCount: 0, revokedCount: 0, status: 'active', createdAt: now, createdBy: caller.uid,
  })
  for (const code of codes) {
    const normalized = normalizeTreasuryCode(code)!
    const digest = hashTreasuryCode(normalized)
    write.create(db.collection('_treasuryCodes').doc(digest), {
      version: 1, batchId: batchRef.id, editionId: card.editionId, cardId: cardRef.id, status: 'active',
      maskedSuffix: normalized.slice(-5), createdAt: now, createdBy: caller.uid,
    })
  }
  try { await write.commit() } catch { throw new HttpsError('aborted', 'The code batch could not be created safely. Please try again.') }
  return { batchId: batchRef.id, codes: [...codes] }
})

export const redeemTreasuryCode = onCall(callableOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireVerifiedEmail: true })
  const parsed = redeemSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Enter the complete code printed on your card.')
  const normalized = normalizeTreasuryCode(parsed.data.code)
  if (!normalized) throw new HttpsError('invalid-argument', 'That code could not be recognised. Check it and try again.')
  const source = request.rawRequest.ip?.slice(0, 80) || 'unknown'
  await Promise.all([
    checkRateLimit(`treasury-redeem-user:${caller.uid}`, 12, 10),
    checkRateLimit(`treasury-redeem-source:${source}`, 30, 10),
  ])
  const digest = hashTreasuryCode(normalized)
  const codeRef = db.collection('_treasuryCodes').doc(digest)
  const redemptionRef = db.collection('_treasuryRedemptions').doc(digest)
  const result = await db.runTransaction(async (transaction) => {
    const codeSnapshot = await transaction.get(codeRef)
    const code = codeSnapshot.data()
    if (!codeSnapshot.exists || !code || (code.status !== 'active' && !(code.status === 'redeemed' && code.redeemedBy === caller.uid))) {
      throw new HttpsError('not-found', 'This code is not available. Check it carefully or contact us for help.')
    }
    const cardRef = db.collection('treasuryCards').doc(String(code.cardId || ''))
    const editionRef = db.collection('treasuryEditions').doc(String(code.editionId || ''))
    const holdingRef = db.collection('userTreasuries').doc(caller.uid).collection('cards').doc(cardRef.id)
    const [cardSnapshot, editionSnapshot, holdingSnapshot] = await Promise.all([
      transaction.get(cardRef), transaction.get(editionRef), transaction.get(holdingRef),
    ])
    if (!cardSnapshot.exists || !editionSnapshot.exists) throw new HttpsError('failed-precondition', 'This card is not available right now.')
    const card = adminCard(cardSnapshot)
    const edition = publicEdition(editionSnapshot)
    if (code.status === 'redeemed' && code.redeemedBy === caller.uid) {
      if (!holdingSnapshot.exists) throw new HttpsError('failed-precondition', 'Your collection needs attention. Please contact us.')
      return { card, edition, holding: holdingSnapshot.data()!, newCard: false, retried: true }
    }
    const currentQuantity = holdingSnapshot.exists ? Math.max(1, Number(holdingSnapshot.data()?.quantity || 1)) : 0
    const now = FieldValue.serverTimestamp()
    const holding = {
      editionId: editionRef.id, cardId: cardRef.id, quantity: currentQuantity + 1,
      firstCollectedAt: holdingSnapshot.data()?.firstCollectedAt ?? now, lastCollectedAt: now,
    }
    transaction.set(holdingRef, holding)
    transaction.set(db.collection('userTreasuries').doc(caller.uid), { updatedAt: now }, { merge: true })
    transaction.update(codeRef, { status: 'redeemed', redeemedBy: caller.uid, redeemedAt: now })
    transaction.create(redemptionRef, {
      codeDigest: digest, batchId: code.batchId, editionId: editionRef.id, cardId: cardRef.id,
      accountId: caller.uid, redeemedAt: now, writtenBy: 'server',
    })
    transaction.update(db.collection('_treasuryCodeBatches').doc(String(code.batchId)), { redeemedCount: FieldValue.increment(1) })
    return { card, edition, holding, newCard: !holdingSnapshot.exists, retried: false }
  })
  const holding = { ...result.holding, firstCollectedAt: asDate(result.holding.firstCollectedAt), lastCollectedAt: new Date().toISOString() }
  return { card: customerCard(result.card, holding), edition: result.edition, newCard: result.newCard, retried: result.retried }
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
