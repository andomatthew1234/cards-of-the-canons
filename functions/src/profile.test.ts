import { describe, expect, it } from 'vitest'
import { applyProfileUpdate, profileUpdateSchema, type ProfileEnvironment } from './profile'

interface Scenario {
  account?: { email?: string | null; displayName?: string | null }
  current?: Record<string, unknown> | null
  rateLimit?: () => Promise<void>
}

function scenario(options: Scenario = {}) {
  const saves: Array<{ uid: string; data: Record<string, unknown> }> = []
  const limits: Array<{ key: string; maximum: number; windowMinutes: number }> = []
  const env: ProfileEnvironment = {
    async loadAuthUser() { return options.account ?? { email: 'customer@example.com', displayName: 'Customer' } },
    async loadProfile() { return options.current ?? null },
    async saveProfile(uid, data) { saves.push({ uid, data }) },
    async rateLimit(key, maximum, windowMinutes) {
      limits.push({ key, maximum, windowMinutes })
      await options.rateLimit?.()
    },
  }
  return { env, saves, limits }
}

describe('server-owned profile mutation', () => {
  it('accepts only bounded profile fields and never a client email', () => {
    expect(profileUpdateSchema.safeParse({ displayName: 'Ada', phone: '0400 000 000' }).success).toBe(true)
    expect(profileUpdateSchema.safeParse({ phone: null }).success).toBe(true)
    // The email address is derived from the Auth record; a caller cannot
    // supply one, and unknown keys are rejected outright.
    expect(profileUpdateSchema.safeParse({ email: 'attacker@example.com' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ displayName: 'x'.repeat(81) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ phone: 'x'.repeat(31) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ role: 'owner' }).success).toBe(false)
  })

  it('skips the write and the rate limit when nothing changed', async () => {
    const { env, saves, limits } = scenario({ current: { displayName: 'Ada', email: 'customer@example.com', phone: '' } })
    const result = await applyProfileUpdate('uid-1', { displayName: 'Ada' }, env)
    expect(result).toEqual({ updated: false })
    expect(saves).toHaveLength(0)
    expect(limits).toHaveLength(0)
  })

  it('creates a missing profile with server-derived values', async () => {
    const { env, saves, limits } = scenario({ account: { email: 'new@example.com', displayName: 'Ignored' } })
    const result = await applyProfileUpdate('uid-1', { displayName: 'Ada' }, env)
    expect(result).toEqual({ updated: true })
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ uid: 'uid-1', data: { displayName: 'Ada', email: 'new@example.com' } })
    expect(saves[0].data.createdAt).toBeDefined()
    expect(limits).toEqual([{ key: 'profile:uid-1', maximum: 12, windowMinutes: 60 }])
  })

  it('takes the email address from the Auth record, not from stored or client data', async () => {
    const { env, saves } = scenario({
      account: { email: 'moved@example.com' },
      current: { displayName: 'Ada', email: 'old@example.com', phone: '' },
    })
    await applyProfileUpdate('uid-1', {}, env)
    expect(saves).toHaveLength(1)
    expect(saves[0].data.email).toBe('moved@example.com')
  })

  it('clears a removed phone number instead of storing an empty string', async () => {
    const { env, saves } = scenario({ current: { displayName: 'Ada', email: 'customer@example.com', phone: '0400 000 000' } })
    await applyProfileUpdate('uid-1', { phone: null }, env)
    expect(saves).toHaveLength(1)
    expect(typeof saves[0].data.phone).not.toBe('string')
  })

  it('fails closed when the rate limit rejects the change', async () => {
    const { env, saves, limits } = scenario({
      current: { displayName: 'Ada', email: 'customer@example.com', phone: '' },
      rateLimit: async () => { throw Object.assign(new Error('slow down'), { code: 'resource-exhausted' }) },
    })
    await expect(applyProfileUpdate('uid-1', { displayName: 'Grace' }, env)).rejects.toThrow('slow down')
    expect(limits).toHaveLength(1)
    expect(saves).toHaveLength(0)
  })
})
