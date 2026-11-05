import { createHash } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp, type DocumentData, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'

const callableOptions = { region: 'australia-southeast1', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const MAX_CODES_PER_ORDER = 50
const physicalCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{6}$/)
const orderIdSchema = z.preprocess(
  (value) => typeof value === 'string' ? value.trim().replace(/^#/, '') : value,
  z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
)
const requestIdSchema = z.string().uuid()
const redeemSchema = z.object({
  orderId: orderIdSchema,
  requestId: requestIdSchema,
  codes: z.array(z.string().trim().max(24)).min(1).max(MAX_CODES_PER_ORDER),
}).strict()
const assignSchema = z.object({
  orderId: orderIdSchema,
  requestId: requestIdSchema,
  codes: z.array(z.string().trim().max(24)).min(1).max(MAX_CODES_PER_ORDER),
}).strict()
const transferSchema = z.object({
  instanceId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  requestId: requestIdSchema,
}).strict()
const customerSchema = z.object({ uid: z.string().trim().min(1).max(128) }).strict()
const adminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['ban', 'unban']), uid: z.string().min(1).max(128), reason: z.string().trim().min(4).max(300) }).strict(),
  z.object({ action: z.literal('grant_attempts'), uid: z.string().min(1).max(128), orderId: orderIdSchema, amount: z.number().int().min(1).max(20), reason: z.string().trim().min(4).max(300) }).strict(),
  z.object({ action: z.literal('set_allowance'), uid: z.string().min(1).max(128), orderId: orderIdSchema, eligibleCodeCount: z.number().int().min(0).max(MAX_CODES_PER_ORDER), reason: z.string().trim().min(4).max(300) }).strict(),
  z.object({ action: z.literal('unassign_code'), uid: z.string().min(1).max(128), orderId: orderIdSchema, code: z.string().trim().max(24), reason: z.string().trim().min(4).max(300) }).strict(),
  z.object({ action: z.literal('add_card'), uid: z.string().min(1).max(128), cardId: z.string().min(1).max(128), reason: z.string().trim().min(4).max(300) }).strict(),
  z.object({ action: z.literal('remove_card'), uid: z.string().min(1).max(128), instanceId: z.string().min(1).max(128), reason: z.string().trim().min(4).max(300) }).strict(),
])

export interface ParsedPhysicalCode {
  normalized: string
  setCode: string
  position: string
  productionNumber: number
}

export function parsePhysicalTreasuryCode(value: string): ParsedPhysicalCode | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '')
  if (!physicalCodeSchema.safeParse(normalized).success) return null
  const position = normalized.slice(1, 3)
  const productionNumber = Number(normalized.slice(3))
  if (position === '00' || productionNumber < 1) return null
  return { normalized, setCode: normalized[0], position, productionNumber }
}

export function hashPhysicalTreasuryCode(normalized: string) {
  return createHash('sha256').update(`doxa-physical-card-v2:${normalized}`).digest('hex')
}

export function treasuryAllowance(items: unknown): number {
  if (!Array.isArray(items)) return 0
  const total = items.reduce((sum, raw) => {
    const item = raw as Record<string, unknown>
    const quantity = Number(item.quantity)
    const perUnit = Number(item.treasuryCardsPerUnit)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(perUnit) || perUnit < 0 || perUnit > 100) return sum
    return sum + quantity * perUnit
  }, 0)
  return Number.isSafeInteger(total) && total <= MAX_CODES_PER_ORDER ? total : 0
}

function asDate(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

export interface PhysicalTreasurySession {
  orderId: string
  eligibleCodeCount: number
  redeemedCodeCount: number
  remainingCodeCount: number
  failedAttempts: number
  attemptLimit: number
  attemptsRemaining: number
  locked: boolean
}

export function treasurySessionFromOrder(orderId: string, data: DocumentData): PhysicalTreasurySession {
  const eligibleCodeCount = Number.isSafeInteger(data.treasuryEligibleCodeCount)
    ? Math.max(0, Number(data.treasuryEligibleCodeCount))
    : treasuryAllowance(data.items)
  const redeemedCodeCount = Number.isSafeInteger(data.treasuryRedeemedCodeCount) ? Math.max(0, Number(data.treasuryRedeemedCodeCount)) : 0
  const failedAttempts = Number.isSafeInteger(data.treasuryFailedAttempts) ? Math.max(0, Number(data.treasuryFailedAttempts)) : 0
  const attemptLimit = Number.isSafeInteger(data.treasuryAttemptLimit) ? Math.max(3, Number(data.treasuryAttemptLimit)) : 3
  const locked = data.treasuryLocked === true || failedAttempts >= attemptLimit
  return {
    orderId,
    eligibleCodeCount,
    redeemedCodeCount,
    remainingCodeCount: Math.max(0, eligibleCodeCount - redeemedCodeCount),
    failedAttempts,
    attemptLimit,
    attemptsRemaining: Math.max(0, attemptLimit - failedAttempts),
    locked,
  }
}

function assignedCodeCount(data: DocumentData) {
  return Number.isSafeInteger(data.treasuryAssignedCodeCount) ? Math.max(0, Number(data.treasuryAssignedCodeCount)) : 0
}

function assertCodesPrepared(data: DocumentData, session: PhysicalTreasurySession) {
  if (assignedCodeCount(data) < session.eligibleCodeCount) {
    throw new HttpsError('failed-precondition', 'The printed cards for this order have not all been prepared yet. Please contact Doxa for help.')
  }
}

export function nextPhysicalAssignmentCount(orderData: DocumentData, newCodeCount: number): number | null {
  if (!Number.isSafeInteger(newCodeCount) || newCodeCount < 0) return null
  const session = treasurySessionFromOrder('', orderData)
  const next = assignedCodeCount(orderData) + newCodeCount
  return next <= session.eligibleCodeCount ? next : null
}

export interface PhysicalRedemptionCodeRecord extends DocumentData {
  version?: unknown
  assignedOrderId?: unknown
  assignedUid?: unknown
  status?: unknown
  redeemedBy?: unknown
  redeemedOrderId?: unknown
}

export interface EvaluatedPhysicalCode {
  index: number
  parsed: ParsedPhysicalCode
  digest: string
  data: PhysicalRedemptionCodeRecord
}

export function evaluatePhysicalRedemptionCodes(
  rawCodes: string[],
  recordsByDigest: ReadonlyMap<string, PhysicalRedemptionCodeRecord | undefined>,
  orderId: string,
  uid: string,
) {
  const rejected: Array<{ index: number; reason: string }> = []
  const accepted: EvaluatedPhysicalCode[] = []
  const seenDigests = new Set<string>()
  let actionableFailure = false
  rawCodes.forEach((raw, index) => {
    const parsed = parsePhysicalTreasuryCode(raw)
    if (!parsed) {
      rejected.push({ index, reason: 'Check the seven-character code.' })
      actionableFailure = true
      return
    }
    const digest = hashPhysicalTreasuryCode(parsed.normalized)
    if (seenDigests.has(digest)) {
      rejected.push({ index, reason: 'This code was entered more than once.' })
      actionableFailure = true
      return
    }
    seenDigests.add(digest)
    const data = recordsByDigest.get(digest)
    if (!data || data.version !== 2 || data.assignedOrderId !== orderId || data.assignedUid !== uid) {
      rejected.push({ index, reason: 'This code does not match the order.' })
      actionableFailure = true
      return
    }
    if (data.status === 'redeemed' && data.redeemedBy === uid && data.redeemedOrderId === orderId) {
      rejected.push({ index, reason: 'This code has already been revealed.' })
      return
    }
    if (data.status !== 'assigned') {
      rejected.push({ index, reason: 'This code is not available.' })
      actionableFailure = true
      return
    }
    accepted.push({ index, parsed, digest, data })
  })
  return { accepted, rejected, actionableFailure }
}

export function advanceTreasuryRedemptionSession(
  session: PhysicalTreasurySession,
  acceptedCount: number,
  actionableFailure: boolean,
): PhysicalTreasurySession {
  const accepted = Number.isSafeInteger(acceptedCount) ? Math.max(0, Math.min(session.remainingCodeCount, acceptedCount)) : 0
  const failedAttempts = session.failedAttempts + (actionableFailure ? 1 : 0)
  return treasurySessionFromOrder(session.orderId, {
    treasuryEligibleCodeCount: session.eligibleCodeCount,
    treasuryRedeemedCodeCount: session.redeemedCodeCount + accepted,
    treasuryFailedAttempts: failedAttempts,
    treasuryAttemptLimit: session.attemptLimit,
    treasuryLocked: failedAttempts >= session.attemptLimit,
  })
}

export function transferHoldingQuantities(senderQuantity: unknown, receiverQuantity: unknown) {
  const sender = Number(senderQuantity)
  const receiver = Number(receiverQuantity)
  if (!Number.isSafeInteger(sender) || sender < 1 || !Number.isSafeInteger(receiver) || receiver < 0) return null
  return { sender: sender - 1, receiver: receiver + 1 }
}

export function grantTreasuryAttempts(session: PhysicalTreasurySession, amount: number): PhysicalTreasurySession | null {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 20) return null
  return treasurySessionFromOrder(session.orderId, {
    treasuryEligibleCodeCount: session.eligibleCodeCount,
    treasuryRedeemedCodeCount: session.redeemedCodeCount,
    treasuryFailedAttempts: session.failedAttempts,
    treasuryAttemptLimit: session.attemptLimit + amount,
    treasuryLocked: false,
  })
}

function assertRedeemableOrder(data: DocumentData, uid: string) {
  if (data.userId !== uid) throw new HttpsError('not-found', 'That order is not available for this account.')
  const paymentState = data.paymentState
  if (!['paid', 'fulfilled'].includes(String(data.status || '')) || (paymentState !== undefined && paymentState !== 'paid')) {
    throw new HttpsError('failed-precondition', 'Only a paid order can reveal Saints.')
  }
  if (data.refundStatus === 'full' || data.inventoryScope === 'sandbox' || data.paymentEnvironment === 'test') {
    throw new HttpsError('failed-precondition', 'This order is not eligible for Treasury redemption.')
  }
}

function transactionRef() {
  return db.collection('_treasuryTransactions').doc()
}

function transactionDocument(input: Record<string, unknown>) {
  return { ...input, createdAt: FieldValue.serverTimestamp(), writtenBy: 'server' }
}

function holdingValues(data: DocumentData | undefined, quantity: number, now: FirebaseFirestore.FieldValue) {
  return {
    editionId: String(data?.editionId || ''),
    cardId: String(data?.cardId || ''),
    quantity,
    firstCollectedAt: data?.firstCollectedAt ?? now,
    lastCollectedAt: now,
  }
}

/**
 * Converts legacy aggregate holdings into individually transferable records.
 * Deterministic IDs make this safe to repeat and preserve every existing copy.
 */
export async function materializeLegacyTreasuryInstances(uid: string) {
  const [holdings, instances] = await Promise.all([
    db.collection('userTreasuries').doc(uid).collection('cards').limit(500).get(),
    db.collection('_treasuryCardInstances').where('ownerId', '==', uid).get(),
  ])
  const byCard = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>()
  for (const document of instances.docs) {
    const cardId = String(document.data().cardId || '')
    byCard.set(cardId, [...(byCard.get(cardId) || []), document])
  }
  const missing: Array<{ id: string; cardId: string; editionId: string }> = []
  for (const holding of holdings.docs) {
    const data = holding.data()
    const expected = Math.max(0, Math.min(500, Number(data.quantity || 0)))
    const present = byCard.get(holding.id)?.length || 0
    for (let index = present; index < expected; index += 1) {
      const id = `legacy_${createHash('sha256').update(`${uid}:${holding.id}:${index}`).digest('hex').slice(0, 40)}`
      missing.push({ id, cardId: holding.id, editionId: String(data.editionId || '') })
    }
  }
  if (missing.length) {
    for (let offset = 0; offset < missing.length; offset += 400) {
      const batch = db.batch()
      for (const item of missing.slice(offset, offset + 400)) {
        batch.set(db.collection('_treasuryCardInstances').doc(item.id), {
          cardId: item.cardId, editionId: item.editionId, ownerId: uid,
          productionNumber: null, source: 'legacy_migration', transferable: true,
          acquiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      await batch.commit()
    }
  }
  return db.collection('_treasuryCardInstances').where('ownerId', '==', uid).get()
}

export const beginTreasuryRedemption = onCall(callableOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireVerifiedEmail: true })
  const parsed = z.object({ orderId: orderIdSchema }).strict().safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Enter the order number from your receipt.')
  await checkRateLimit(`treasury-order:${caller.uid}`, 20, 10)
  const [order, treasury] = await Promise.all([
    db.collection('orders').doc(parsed.data.orderId).get(),
    db.collection('userTreasuries').doc(caller.uid).get(),
  ])
  if (!order.exists) throw new HttpsError('not-found', 'That order is not available for this account.')
  if (treasury.data()?.banned === true) throw new HttpsError('permission-denied', 'Treasury access is unavailable. Please contact Doxa for help.')
  const data = order.data()!
  assertRedeemableOrder(data, caller.uid)
  const session = treasurySessionFromOrder(order.id, data)
  if (session.eligibleCodeCount === 0) throw new HttpsError('failed-precondition', 'This order does not contain any configured Treasury cards. Please contact Doxa if this looks wrong.')
  assertCodesPrepared(data, session)
  return session
})

export const assignPhysicalCodesToOrder = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = assignSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Check the order number and every seven-character physical card code.')
  await checkRateLimit(`treasury-assign:${caller.uid}`, 30, 10)
  const parsedCodes = parsed.data.codes.map(parsePhysicalTreasuryCode)
  if (parsedCodes.some((code) => !code)) throw new HttpsError('invalid-argument', 'Every physical card code must use the format A010001.')
  const normalizedCodes = parsedCodes.map((code) => code!.normalized)
  if (new Set(normalizedCodes).size !== normalizedCodes.length) throw new HttpsError('invalid-argument', 'Each physical card code can appear only once.')

  const editions = await db.collection('treasuryEditions').limit(100).get()
  const cards = await db.collection('treasuryCards').limit(1000).get()
  const sortedEditions = [...editions.docs].sort((left, right) => Number(left.data().sortOrder || 0) - Number(right.data().sortOrder || 0))
  const editionByPrefix = new Map(sortedEditions.map((document, index) => [String(document.data().codePrefix || (index === 0 ? 'A' : '')).toUpperCase(), document]))
  const resolved = parsedCodes.map((code) => {
    const edition = editionByPrefix.get(code!.setCode)
    const card = edition && cards.docs.find((document) => document.data().editionId === edition.id && document.data().status === 'published' && String(document.data().number).padStart(2, '0') === code!.position)
    if (!edition || edition.data().status !== 'published' || !card) throw new HttpsError('failed-precondition', `No published Saint is configured for ${code!.setCode}${code!.position}.`)
    return { code: code!, edition, card, digest: hashPhysicalTreasuryCode(code!.normalized) }
  })

  return db.runTransaction(async (transaction) => {
    const orderRef = db.collection('orders').doc(parsed.data.orderId)
    const requestRef = db.collection('_treasuryOrderAttempts').doc(createHash('sha256').update(`assign:${parsed.data.orderId}:${parsed.data.requestId}`).digest('hex'))
    const [order, replay, ...codeSnapshots] = await Promise.all([
      transaction.get(orderRef), transaction.get(requestRef),
      ...resolved.map((item) => transaction.get(db.collection('_treasuryCodes').doc(item.digest))),
    ])
    if (replay.exists) return replay.data()?.result
    if (!order.exists) throw new HttpsError('not-found', 'Order not found.')
    const data = order.data()!
    assertRedeemableOrder(data, String(data.userId || ''))
    const session = treasurySessionFromOrder(order.id, data)
    const newCount = codeSnapshots.filter((snapshot) => !snapshot.exists).length
    const nextAssigned = nextPhysicalAssignmentCount(data, newCount)
    if (nextAssigned === null) throw new HttpsError('failed-precondition', 'This order does not have enough unassigned Treasury card places.')
    const now = FieldValue.serverTimestamp()
    resolved.forEach((item, index) => {
      const existing = codeSnapshots[index]
      if (existing.exists) {
        const existingData = existing.data()!
        if (existingData.assignedOrderId !== order.id) throw new HttpsError('already-exists', `The code ending ${item.code.normalized.slice(-4)} is already assigned elsewhere.`)
        return
      }
      transaction.create(db.collection('_treasuryCodes').doc(item.digest), {
        version: 2, status: 'assigned', assignedOrderId: order.id, assignedUid: String(data.userId),
        editionId: item.edition.id, cardId: item.card.id, setCode: item.code.setCode,
        position: item.code.position, productionNumber: item.code.productionNumber,
        maskedSuffix: item.code.normalized.slice(-4), assignedAt: now, assignedBy: caller.uid,
      })
      transaction.create(transactionRef(), transactionDocument({
        type: 'code_assignment', accountId: String(data.userId), actorId: caller.uid, orderId: order.id,
        cardId: item.card.id, codeSuffix: item.code.normalized.slice(-4), detail: 'Physical card assigned during fulfilment.',
      }))
    })
    const result = { assigned: nextAssigned, eligible: session.eligibleCodeCount }
    transaction.update(orderRef, { treasuryAssignedCodeCount: nextAssigned, updatedAt: now })
    transaction.create(requestRef, { result, createdAt: now })
    return result
  })
})

export const redeemPhysicalTreasuryCards = onCall(callableOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireVerifiedEmail: true })
  const parsed = redeemSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Check the order number and the physical card codes.')
  const source = request.rawRequest.ip?.slice(0, 80) || 'unknown'
  await Promise.all([
    checkRateLimit(`treasury-redeem-user:${caller.uid}`, 12, 10),
    checkRateLimit(`treasury-redeem-source:${source}`, 30, 10),
  ])
  const candidates = parsed.data.codes.map((raw, index) => ({ index, raw, parsed: parsePhysicalTreasuryCode(raw) }))
  const validCandidates = candidates.filter((candidate): candidate is typeof candidate & { parsed: ParsedPhysicalCode } => Boolean(candidate.parsed))
  return db.runTransaction(async (transaction) => {
    const orderRef = db.collection('orders').doc(parsed.data.orderId)
    const treasuryRef = db.collection('userTreasuries').doc(caller.uid)
    const requestRef = db.collection('_treasuryOrderAttempts').doc(createHash('sha256').update(`redeem:${parsed.data.orderId}:${parsed.data.requestId}`).digest('hex'))
    const [order, treasury, replay, ...codeDocuments] = await Promise.all([
      transaction.get(orderRef), transaction.get(treasuryRef), transaction.get(requestRef),
      ...validCandidates.map((candidate) => transaction.get(db.collection('_treasuryCodes').doc(hashPhysicalTreasuryCode(candidate.parsed.normalized)))),
    ])
    if (!order.exists) throw new HttpsError('not-found', 'That order is not available for this account.')
    const orderData = order.data()!
    assertRedeemableOrder(orderData, caller.uid)
    if (treasury.data()?.banned === true) throw new HttpsError('permission-denied', 'Treasury access is unavailable. Please contact Doxa for help.')
    if (replay.exists) return replay.data()?.result
    const session = treasurySessionFromOrder(order.id, orderData)
    if (session.locked) throw new HttpsError('failed-precondition', 'This order has no redemption attempts remaining. Please contact Doxa for help.')
    assertCodesPrepared(orderData, session)
    if (parsed.data.codes.length > session.remainingCodeCount) throw new HttpsError('failed-precondition', `This order has ${session.remainingCodeCount} Saint${session.remainingCodeCount === 1 ? '' : 's'} left to reveal.`)

    const codeRecords = new Map<string, PhysicalRedemptionCodeRecord | undefined>()
    validCandidates.forEach((candidate, index) => {
      codeRecords.set(hashPhysicalTreasuryCode(candidate.parsed.normalized), codeDocuments[index]?.data())
    })
    const evaluation = evaluatePhysicalRedemptionCodes(parsed.data.codes, codeRecords, order.id, caller.uid)
    const { accepted: acceptedMeta, rejected, actionableFailure } = evaluation

    const uniqueCardIds = [...new Set(acceptedMeta.map((item) => String(item.data.cardId || '')))]
    const cardDocs = await Promise.all(uniqueCardIds.map((cardId) => transaction.get(db.collection('treasuryCards').doc(cardId))))
    const cardById = new Map(cardDocs.map((document) => [document.id, document]))
    const holdingRefs = uniqueCardIds.map((cardId) => db.collection('userTreasuries').doc(caller.uid).collection('cards').doc(cardId))
    const holdingDocs = await Promise.all(holdingRefs.map((ref) => transaction.get(ref)))
    const holdingByCard = new Map(holdingDocs.map((document) => [document.id, document]))
    for (const item of acceptedMeta) {
      if (!cardById.get(String(item.data.cardId))?.exists) throw new HttpsError('failed-precondition', 'A Saint in this order is not configured. Please contact Doxa.')
    }

    const grouped = new Map<string, typeof acceptedMeta>()
    for (const item of acceptedMeta) grouped.set(String(item.data.cardId), [...(grouped.get(String(item.data.cardId)) || []), item])
    const now = FieldValue.serverTimestamp()
    const accepted: Array<{ index: number; cardId: string; title: string; instanceId: string }> = []
    for (const [cardId, items] of grouped) {
      const holding = holdingByCard.get(cardId)
      const current = holding?.exists ? Math.max(0, Number(holding.data()?.quantity || 0)) : 0
      const first = items[0]
      transaction.set(holdingRefs[uniqueCardIds.indexOf(cardId)], {
        ...holdingValues(holding?.data(), current + items.length, now),
        editionId: String(first.data.editionId), cardId,
      })
      for (const item of items) {
        const codeRef = db.collection('_treasuryCodes').doc(item.digest)
        const card = cardById.get(cardId)!
        transaction.update(codeRef, { status: 'redeemed', redeemedBy: caller.uid, redeemedOrderId: order.id, redeemedAt: now })
        transaction.create(db.collection('_treasuryCardInstances').doc(item.digest), {
          cardId, editionId: String(item.data.editionId), ownerId: caller.uid,
          codeDigest: item.digest, productionNumber: Number(item.data.productionNumber), source: 'physical_code',
          orderId: order.id, transferable: true, acquiredAt: now, updatedAt: now,
        })
        transaction.set(db.collection('_treasuryRedemptions').doc(item.digest), {
          version: 2, codeDigest: item.digest, editionId: String(item.data.editionId), cardId,
          accountId: caller.uid, orderId: order.id, redeemedAt: now, writtenBy: 'server',
        })
        transaction.create(transactionRef(), transactionDocument({
          type: 'redemption', accountId: caller.uid, orderId: order.id, cardId, instanceId: item.digest,
          codeSuffix: item.parsed.normalized.slice(-4), detail: 'Physical card revealed.',
        }))
        accepted.push({ index: item.index, cardId, title: String(card.data()?.title || 'Saint'), instanceId: item.digest })
      }
    }

    for (const rejection of rejected) {
      transaction.create(transactionRef(), transactionDocument({
        type: 'failed_code', accountId: caller.uid, orderId: order.id,
        codeSuffix: parsePhysicalTreasuryCode(parsed.data.codes[rejection.index])?.normalized.slice(-4) || '',
        detail: rejection.reason,
      }))
    }
    const nextSession = advanceTreasuryRedemptionSession(session, accepted.length, actionableFailure)
    transaction.update(orderRef, {
      treasuryEligibleCodeCount: nextSession.eligibleCodeCount,
      treasuryRedeemedCodeCount: nextSession.redeemedCodeCount,
      treasuryFailedAttempts: nextSession.failedAttempts,
      treasuryAttemptLimit: nextSession.attemptLimit,
      treasuryLocked: nextSession.locked,
      updatedAt: now,
    })
    transaction.set(treasuryRef, { updatedAt: now }, { merge: true })
    const result = {
      ...nextSession,
      accepted: accepted.sort((a, b) => a.index - b.index),
      rejected: rejected.sort((a, b) => a.index - b.index),
    }
    transaction.create(requestRef, { result, createdAt: now })
    return result
  })
})

export const transferTreasuryCard = onCall(callableOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireVerifiedEmail: true })
  const parsed = transferSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a collected card and enter a valid account email address.')
  await checkRateLimit(`treasury-transfer:${caller.uid}`, 10, 60)
  const recipient = await getAuth().getUserByEmail(parsed.data.recipientEmail).catch(() => null)
  if (!recipient || recipient.disabled || !recipient.emailVerified) throw new HttpsError('not-found', 'No eligible Doxa account was found for that email address.')
  if (recipient.uid === caller.uid) throw new HttpsError('invalid-argument', 'Choose another Doxa account for this transfer.')
  await materializeLegacyTreasuryInstances(caller.uid)
  return db.runTransaction(async (transaction) => {
    const instanceRef = db.collection('_treasuryCardInstances').doc(parsed.data.instanceId)
    const senderRoot = db.collection('userTreasuries').doc(caller.uid)
    const recipientRoot = db.collection('userTreasuries').doc(recipient.uid)
    const recipientControlRef = db.collection('accountControls').doc(recipient.uid)
    const replayRef = db.collection('_treasuryOrderAttempts').doc(createHash('sha256').update(`transfer:${caller.uid}:${parsed.data.requestId}`).digest('hex'))
    const [instance, sender, receiver, recipientControl, replay] = await Promise.all([
      transaction.get(instanceRef), transaction.get(senderRoot), transaction.get(recipientRoot), transaction.get(recipientControlRef), transaction.get(replayRef),
    ])
    if (replay.exists) return replay.data()?.result
    if (!instance.exists || instance.data()?.ownerId !== caller.uid || instance.data()?.transferable === false) throw new HttpsError('not-found', 'That collected card is no longer available to transfer.')
    if (sender.data()?.banned === true || receiver.data()?.banned === true) throw new HttpsError('permission-denied', 'This transfer cannot be completed. Please contact Doxa for help.')
    if (recipientControl.data()?.disabled === true || recipientControl.data()?.deleted === true) throw new HttpsError('not-found', 'No eligible Doxa account was found for that email address.')
    const data = instance.data()!
    const cardId = String(data.cardId)
    const senderHoldingRef = senderRoot.collection('cards').doc(cardId)
    const receiverHoldingRef = recipientRoot.collection('cards').doc(cardId)
    const [senderHolding, receiverHolding] = await Promise.all([transaction.get(senderHoldingRef), transaction.get(receiverHoldingRef)])
    const quantities = transferHoldingQuantities(senderHolding.data()?.quantity, receiverHolding.exists ? receiverHolding.data()?.quantity : 0)
    if (!senderHolding.exists || !quantities) throw new HttpsError('failed-precondition', 'Your collection record needs attention. Please contact Doxa.')
    const now = FieldValue.serverTimestamp()
    if (quantities.sender === 0) transaction.delete(senderHoldingRef)
    else transaction.update(senderHoldingRef, { quantity: quantities.sender, lastCollectedAt: now })
    transaction.set(receiverHoldingRef, {
      editionId: String(data.editionId), cardId, quantity: quantities.receiver,
      firstCollectedAt: receiverHolding.data()?.firstCollectedAt ?? now, lastCollectedAt: now,
    })
    transaction.update(instanceRef, { ownerId: recipient.uid, transferredAt: now, transferredBy: caller.uid, updatedAt: now })
    transaction.set(senderRoot, { updatedAt: now }, { merge: true })
    transaction.set(recipientRoot, { updatedAt: now }, { merge: true })
    const result = { transferred: true, recipientEmail: recipient.email || parsed.data.recipientEmail }
    transaction.create(transactionRef(), transactionDocument({
      type: 'transfer', accountId: caller.uid, otherAccountId: recipient.uid, cardId,
      instanceId: instance.id, detail: 'Card transferred between registered accounts.',
    }))
    transaction.create(replayRef, { result, createdAt: now })
    return result
  })
})

function publicCard(document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot, holding?: DocumentData, copies: DocumentData[] = []) {
  const data = document.data() || {}
  const collected = copies.length > 0 || Boolean(holding)
  return {
    id: document.id, editionId: String(data.editionId || ''), number: String(data.number || ''), title: String(data.title || ''),
    teaser: String(data.teaser || ''), story: collected ? String(data.story || '') : '', imageUrl: collected ? String(data.imageUrl || '') : '',
    imageAlt: collected ? String(data.imageAlt || '') : '', status: data.status, sortOrder: Number(data.sortOrder || 0), collected,
    quantity: copies.length || (collected ? Math.max(1, Number(holding?.quantity || 1)) : 0),
    firstCollectedAt: collected ? asDate(holding?.firstCollectedAt ?? copies[0]?.acquiredAt) : null,
    lastCollectedAt: collected ? asDate(holding?.lastCollectedAt ?? copies.at(-1)?.updatedAt) : null,
    copies: copies.map((copy) => ({
      id: String(copy.id), cardId: document.id, editionId: String(copy.editionId || data.editionId || ''),
      productionNumber: Number.isSafeInteger(copy.productionNumber) ? Number(copy.productionNumber) : null,
      acquiredAt: asDate(copy.acquiredAt), source: copy.source || 'legacy_migration', transferable: copy.transferable !== false,
    })),
  }
}

export async function loadTreasuryStateFor(uid: string) {
  const instances = await materializeLegacyTreasuryInstances(uid)
  const [editionSnapshot, cardSnapshot, holdingSnapshot, root] = await Promise.all([
    db.collection('treasuryEditions').limit(100).get(), db.collection('treasuryCards').limit(1000).get(),
    db.collection('userTreasuries').doc(uid).collection('cards').limit(500).get(), db.collection('userTreasuries').doc(uid).get(),
  ])
  const holdings = new Map(holdingSnapshot.docs.map((document) => [document.id, document.data()]))
  const copiesByCard = new Map<string, DocumentData[]>()
  for (const document of instances.docs) {
    const copy: DocumentData = { id: document.id, ...document.data() }
    const cardId = String(copy.cardId || '')
    copiesByCard.set(cardId, [...(copiesByCard.get(cardId) || []), copy])
  }
  const ownedIds = new Set([...holdings.keys(), ...copiesByCard.keys()])
  const ownedEditionIds = new Set(cardSnapshot.docs.filter((document) => ownedIds.has(document.id)).map((document) => String(document.data().editionId || '')))
  const editions = editionSnapshot.docs.map((document) => {
    const data = document.data()
    return {
      id: document.id, title: String(data.title || ''), description: String(data.description || ''),
      coverImageUrl: String(data.coverImageUrl || ''), coverImageAlt: String(data.coverImageAlt || ''),
      status: String(data.status || 'draft'), sortOrder: Number(data.sortOrder || 0),
      codePrefix: String(data.codePrefix || ''),
    }
  })
    .filter((edition) => edition.status === 'published' || ownedEditionIds.has(edition.id))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const visibleEditionIds = new Set(editions.map((edition) => edition.id))
  const cards = cardSnapshot.docs.filter((document) => visibleEditionIds.has(String(document.data().editionId || '')) && (document.data().status === 'published' || ownedIds.has(document.id)))
    .sort((a, b) => Number(a.data().sortOrder || 0) - Number(b.data().sortOrder || 0))
    .map((document) => publicCard(document, holdings.get(document.id), copiesByCard.get(document.id) || []))
  const published = cards.filter((card) => card.status === 'published')
  const uniqueCollected = published.filter((card) => card.collected).length
  return {
    editions, cards, uniqueCollected, totalAvailable: published.length,
    completionPercentage: published.length ? Math.round((uniqueCollected / published.length) * 100) : 0,
    treasuryBanned: root.data()?.banned === true,
  }
}

export const getTreasuryCustomerAdmin = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = customerSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a customer account.')
  const [state, orders, transactions] = await Promise.all([
    loadTreasuryStateFor(parsed.data.uid),
    db.collection('orders').where('userId', '==', parsed.data.uid).limit(100).get(),
    db.collection('_treasuryTransactions').where('accountId', '==', parsed.data.uid).orderBy('createdAt', 'desc').limit(200).get(),
  ])
  return {
    ...state, accountId: parsed.data.uid, banned: state.treasuryBanned,
    orders: orders.docs.map((document) => ({ ...treasurySessionFromOrder(document.id, document.data()), status: document.data().status }))
      .filter((order) => order.eligibleCodeCount > 0 || order.redeemedCodeCount > 0),
    transactions: transactions.docs.map((document) => ({ id: document.id, ...document.data(), createdAt: asDate(document.data().createdAt) }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  }
})

export const adminManageTreasury = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = adminActionSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Check the Treasury action and include a clear reason.')
  const input = parsed.data
  const rootRef = db.collection('userTreasuries').doc(input.uid)
  if (input.action === 'ban' || input.action === 'unban') {
    const now = FieldValue.serverTimestamp()
    await db.runTransaction(async (transaction) => {
      transaction.set(rootRef, { banned: input.action === 'ban', updatedAt: now, updatedBy: caller.uid }, { merge: true })
      transaction.create(transactionRef(), transactionDocument({ type: input.action, accountId: input.uid, actorId: caller.uid, detail: input.reason }))
    })
    return { updated: true }
  }
  if (input.action === 'grant_attempts' || input.action === 'set_allowance') {
    const orderRef = db.collection('orders').doc(input.orderId)
    await db.runTransaction(async (transaction) => {
      const order = await transaction.get(orderRef)
      if (!order.exists || order.data()?.userId !== input.uid) throw new HttpsError('not-found', 'Order not found for this customer.')
      const session = treasurySessionFromOrder(order.id, order.data()!)
      const now = FieldValue.serverTimestamp()
      if (input.action === 'grant_attempts') {
        const repaired = grantTreasuryAttempts(session, input.amount)
        if (!repaired) throw new HttpsError('invalid-argument', 'Choose a valid number of additional attempts.')
        transaction.update(orderRef, { treasuryAttemptLimit: repaired.attemptLimit, treasuryLocked: repaired.locked, updatedAt: now })
        transaction.create(transactionRef(), transactionDocument({ type: 'attempt_grant', accountId: input.uid, actorId: caller.uid, orderId: order.id, detail: `${input.reason} (+${input.amount})` }))
      } else {
        if (input.eligibleCodeCount < session.redeemedCodeCount) throw new HttpsError('failed-precondition', 'The allowance cannot be lower than the number already redeemed.')
        if (input.eligibleCodeCount < assignedCodeCount(order.data()!)) throw new HttpsError('failed-precondition', 'The allowance cannot be lower than the number of printed codes already assigned.')
        transaction.update(orderRef, { treasuryEligibleCodeCount: input.eligibleCodeCount, treasuryLocked: false, updatedAt: now })
        transaction.create(transactionRef(), transactionDocument({ type: 'allowance_change', accountId: input.uid, actorId: caller.uid, orderId: order.id, detail: `${input.reason} (${session.eligibleCodeCount} → ${input.eligibleCodeCount})` }))
      }
    })
    return { updated: true }
  }
  if (input.action === 'unassign_code') {
    const parsedCode = parsePhysicalTreasuryCode(input.code)
    if (!parsedCode) throw new HttpsError('invalid-argument', 'Enter a seven-character physical card code such as A010001.')
    const orderRef = db.collection('orders').doc(input.orderId)
    const codeRef = db.collection('_treasuryCodes').doc(hashPhysicalTreasuryCode(parsedCode.normalized))
    await db.runTransaction(async (transaction) => {
      const [order, code] = await Promise.all([transaction.get(orderRef), transaction.get(codeRef)])
      if (!order.exists || order.data()?.userId !== input.uid) throw new HttpsError('not-found', 'Order not found for this customer.')
      if (!code.exists || code.data()?.assignedOrderId !== order.id || code.data()?.assignedUid !== input.uid) {
        throw new HttpsError('not-found', 'That physical card code is not assigned to this order.')
      }
      if (code.data()?.status !== 'assigned') {
        throw new HttpsError('failed-precondition', 'A code that has already been redeemed cannot be unassigned.')
      }
      const orderData = order.data()!
      const now = FieldValue.serverTimestamp()
      const nextAssigned = Math.max(treasurySessionFromOrder(order.id, orderData).redeemedCodeCount, assignedCodeCount(orderData) - 1)
      transaction.delete(codeRef)
      transaction.update(orderRef, { treasuryAssignedCodeCount: nextAssigned, updatedAt: now })
      transaction.create(transactionRef(), transactionDocument({
        type: 'code_unassignment', accountId: input.uid, actorId: caller.uid, orderId: order.id,
        cardId: String(code.data()?.cardId || ''), codeSuffix: parsedCode.normalized.slice(-4),
        detail: input.reason,
      }))
    })
    return { updated: true }
  }
  if (input.action === 'add_card') {
    const cardRef = db.collection('treasuryCards').doc(input.cardId)
    const holdingRef = rootRef.collection('cards').doc(input.cardId)
    const instanceRef = db.collection('_treasuryCardInstances').doc()
    await db.runTransaction(async (transaction) => {
      const [card, holding] = await Promise.all([transaction.get(cardRef), transaction.get(holdingRef)])
      if (!card.exists) throw new HttpsError('not-found', 'Card not found.')
      const quantity = holding.exists ? Math.max(0, Number(holding.data()?.quantity || 0)) : 0
      const now = FieldValue.serverTimestamp()
      transaction.create(instanceRef, { cardId: card.id, editionId: String(card.data()?.editionId), ownerId: input.uid, productionNumber: null, source: 'admin', transferable: true, acquiredAt: now, updatedAt: now })
      transaction.set(holdingRef, { editionId: String(card.data()?.editionId), cardId: card.id, quantity: quantity + 1, firstCollectedAt: holding.data()?.firstCollectedAt ?? now, lastCollectedAt: now })
      transaction.set(rootRef, { updatedAt: now }, { merge: true })
      transaction.create(transactionRef(), transactionDocument({ type: 'admin_add', accountId: input.uid, actorId: caller.uid, cardId: card.id, instanceId: instanceRef.id, detail: input.reason }))
    })
    return { updated: true }
  }
  if (input.action !== 'remove_card') throw new HttpsError('internal', 'Unsupported Treasury action.')
  await materializeLegacyTreasuryInstances(input.uid)
  const instanceRef = db.collection('_treasuryCardInstances').doc(input.instanceId)
  await db.runTransaction(async (transaction) => {
    const instance = await transaction.get(instanceRef)
    if (!instance.exists || instance.data()?.ownerId !== input.uid) throw new HttpsError('not-found', 'Collected card not found for this customer.')
    const cardId = String(instance.data()?.cardId)
    const holdingRef = rootRef.collection('cards').doc(cardId)
    const holding = await transaction.get(holdingRef)
    const quantity = Math.max(0, Number(holding.data()?.quantity || 0))
    const now = FieldValue.serverTimestamp()
    transaction.delete(instanceRef)
    if (quantity <= 1) transaction.delete(holdingRef)
    else transaction.update(holdingRef, { quantity: quantity - 1, lastCollectedAt: now })
    transaction.set(rootRef, { updatedAt: now }, { merge: true })
    transaction.create(transactionRef(), transactionDocument({ type: 'admin_remove', accountId: input.uid, actorId: caller.uid, cardId, instanceId: input.instanceId, detail: input.reason }))
  })
  return { updated: true }
})
