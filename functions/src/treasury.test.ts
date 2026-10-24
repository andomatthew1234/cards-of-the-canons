import { describe, expect, it } from 'vitest'
import { generateTreasuryCode, hashTreasuryCode, normalizeTreasuryCode, treasuryCardSchema, treasuryEditionSchema } from './treasury'

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
  })
})
