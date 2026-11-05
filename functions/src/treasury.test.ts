import { describe, expect, it } from 'vitest'
import { generateTreasuryCode, hashTreasuryCode, normalizeTreasuryCode, treasuryCardSchema, treasuryEditionSchema } from './treasury'
import {
  advanceTreasuryRedemptionSession,
  evaluatePhysicalRedemptionCodes,
  grantTreasuryAttempts,
  hashPhysicalTreasuryCode,
  nextPhysicalAssignmentCount,
  parsePhysicalTreasuryCode,
  transferHoldingQuantities,
  treasuryAllowance,
  treasurySessionFromOrder,
  type PhysicalRedemptionCodeRecord,
} from './physicalTreasury'

describe('Treasury claim-code primitives', () => {
  it('creates a long, human-readable code from cryptographic bytes', () => {
    const code = generateTreasuryCode((size) => Buffer.alloc(size, 7))
    expect(code).toMatch(/^DXA-(?:[A-HJ-NP-Z2-9]{5}-){4}[A-HJ-NP-Z2-9]{5}$/)
    expect(normalizeTreasuryCode(code.toLowerCase().replaceAll('-', ' '))).toBe(code.replaceAll('-', ''))
  })

  it('rejects incomplete, ambiguous and invented codes', () => {
    expect(normalizeTreasuryCode('DXA-AAAAA')).toBeNull()
    expect(normalizeTreasuryCode('DXA-00000-00000-00000-00000-00000')).toBeNull()
    expect(normalizeTreasuryCode('not a claim code')).toBeNull()
  })

  it('uses a stable one-way digest without preserving plaintext', () => {
    const normalized = 'DXAABCDEFGHJKLMNPQRSTUVWXYZ2'
    const digest = hashTreasuryCode(normalized)
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(digest).not.toContain('DXA')
    expect(hashTreasuryCode(normalized)).toBe(digest)
  })

  it('strictly bounds collection and card authoring data', () => {
    expect(treasuryEditionSchema.safeParse({ title:'First set',description:'',coverImageUrl:'',coverImageAlt:'',status:'draft',sortOrder:1,starterCardCount:12 }).success).toBe(true)
    expect(treasuryEditionSchema.safeParse({ title:'First set',description:'',coverImageUrl:'javascript:alert(1)',coverImageAlt:'',status:'published',sortOrder:1,extra:'pollution' }).success).toBe(false)
    expect(treasuryCardSchema.safeParse({ editionId:'set-1',number:'01',title:'Card 01',teaser:'Preview',story:'Story',imageUrl:'/images/card.jpg',imageAlt:'Card artwork',status:'published',sortOrder:1 }).success).toBe(true)
    expect(treasuryCardSchema.safeParse({ editionId:'../set',number:'01',title:'Card 01',teaser:'',story:'',imageUrl:'',imageAlt:'',status:'published',sortOrder:1 }).success).toBe(false)
    expect(treasuryCardSchema.safeParse({ editionId:'set-1',number:'100',title:'Card 100',teaser:'',story:'',imageUrl:'',imageAlt:'',status:'published',sortOrder:1 }).success).toBe(false)
  })

  it('parses the exact physical-card structure without accepting empty positions or production numbers', () => {
    expect(parsePhysicalTreasuryCode(' a01-0001 ')).toEqual({ normalized:'A010001',setCode:'A',position:'01',productionNumber:1 })
    expect(parsePhysicalTreasuryCode('A000001')).toBeNull()
    expect(parsePhysicalTreasuryCode('A010000')).toBeNull()
    expect(parsePhysicalTreasuryCode('DXA-OLD-CODE')).toBeNull()
  })

  it('hashes physical codes and derives order allowance only from trusted product snapshots', () => {
    const digest = hashPhysicalTreasuryCode('A010001')
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(digest).not.toContain('A010001')
    expect(treasuryAllowance([{ quantity:3,treasuryCardsPerUnit:1 },{ quantity:1,treasuryCardsPerUnit:4 }])).toBe(7)
    expect(treasuryAllowance([{ quantity:1,treasuryCardsPerUnit:51 }])).toBe(0)
    expect(treasuryAllowance([{ quantity:1 }])).toBe(0)
    expect(treasuryAllowance([{ quantity:1,treasuryCardsPerUnit:-1 }])).toBe(0)
    expect(treasuryAllowance([{ quantity:1.5,treasuryCardsPerUnit:1 }])).toBe(0)
    expect(treasuryAllowance([{ quantity:50,treasuryCardsPerUnit:2 }])).toBe(0)
  })
})

describe('physical Treasury lifecycle invariants', () => {
  const orderId = 'ORDER-1001'
  const uid = 'customer-1'
  const record = (code: string, cardId: string, overrides: Partial<PhysicalRedemptionCodeRecord> = {}) => [
    hashPhysicalTreasuryCode(code),
    {
      version: 2,
      status: 'assigned',
      assignedOrderId: orderId,
      assignedUid: uid,
      cardId,
      editionId: 'disciples',
      productionNumber: parsePhysicalTreasuryCode(code)?.productionNumber,
      ...overrides,
    } satisfies PhysicalRedemptionCodeRecord,
  ] as const

  it('enforces assignment capacity from the immutable order allowance', () => {
    const order = { treasuryEligibleCodeCount: 4, treasuryAssignedCodeCount: 1 }
    expect(nextPhysicalAssignmentCount(order, 3)).toBe(4)
    expect(nextPhysicalAssignmentCount(order, 4)).toBeNull()
    expect(nextPhysicalAssignmentCount(order, -1)).toBeNull()
    expect(nextPhysicalAssignmentCount({ items:[{ quantity:1,treasuryCardsPerUnit:4 }],treasuryAssignedCodeCount:0 }, 4)).toBe(4)
  })

  it('accepts valid codes independently while preserving incorrect inputs for correction', () => {
    const records = new Map<string, PhysicalRedemptionCodeRecord | undefined>([
      record('A010001', 'saint-peter'),
      record('A020001', 'saint-andrew'),
      record('A030001', 'saint-james'),
    ])
    const result = evaluatePhysicalRedemptionCodes(
      ['A010001', 'wrong-code', 'A020001', 'A030999'],
      records,
      orderId,
      uid,
    )
    expect(result.accepted.map((item) => item.index)).toEqual([0, 2])
    expect(result.rejected).toEqual([
      { index:1,reason:'Check the seven-character code.' },
      { index:3,reason:'This code does not match the order.' },
    ])
    expect(result.actionableFailure).toBe(true)
  })

  it('persists one failure per submission and locks exactly after the third failed reattempt', () => {
    let session = treasurySessionFromOrder(orderId, {
      treasuryEligibleCodeCount: 4,
      treasuryRedeemedCodeCount: 0,
      treasuryFailedAttempts: 0,
      treasuryAttemptLimit: 3,
    })
    session = advanceTreasuryRedemptionSession(session, 2, true)
    expect(session).toMatchObject({ redeemedCodeCount:2,remainingCodeCount:2,failedAttempts:1,attemptsRemaining:2,locked:false })
    session = advanceTreasuryRedemptionSession(session, 0, true)
    expect(session).toMatchObject({ failedAttempts:2,attemptsRemaining:1,locked:false })
    session = advanceTreasuryRedemptionSession(session, 0, true)
    expect(session).toMatchObject({ failedAttempts:3,attemptsRemaining:0,locked:true })
  })

  it('makes a redeemed-code replay harmless and prevents the same physical code being claimed twice', () => {
    const redeemed = new Map<string, PhysicalRedemptionCodeRecord | undefined>([
      record('A010001', 'saint-peter', { status:'redeemed',redeemedBy:uid,redeemedOrderId:orderId }),
    ])
    const result = evaluatePhysicalRedemptionCodes(['A010001'], redeemed, orderId, uid)
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toEqual([{ index:0,reason:'This code has already been revealed.' }])
    expect(result.actionableFailure).toBe(false)
  })

  it('keeps duplicate Saints individually countable and transfers only one owned copy', () => {
    expect(transferHoldingQuantities(3, 1)).toEqual({ sender:2,receiver:2 })
    expect(transferHoldingQuantities(1, 0)).toEqual({ sender:0,receiver:1 })
    expect(transferHoldingQuantities(0, 2)).toBeNull()
    expect(transferHoldingQuantities('invalid', 0)).toBeNull()
  })

  it('allows an administrator to repair a locked order without resetting its audit history', () => {
    const locked = treasurySessionFromOrder(orderId, {
      treasuryEligibleCodeCount: 4,
      treasuryRedeemedCodeCount: 2,
      treasuryFailedAttempts: 3,
      treasuryAttemptLimit: 3,
      treasuryLocked: true,
    })
    const repaired = grantTreasuryAttempts(locked, 2)
    expect(repaired).toMatchObject({ failedAttempts:3,attemptLimit:5,attemptsRemaining:2,locked:false,redeemedCodeCount:2 })
    expect(grantTreasuryAttempts(locked, 0)).toBeNull()
    expect(grantTreasuryAttempts(locked, 21)).toBeNull()
  })
})
