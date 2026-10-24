import { describe, expect, it } from 'vitest'
import {
  completeDeletionState,
  deletionUserDataCollections,
  pendingDeletionState,
  preservedDeletionCollections,
  resumePendingDeletions,
  runAccountDeletion,
  type DeletionEnvironment,
} from './accountDeletion'

interface FakeState {
  controls: Map<string, { exists: boolean; data: Record<string, unknown> | null }>
  calls: string[]
  failures: Partial<Record<keyof DeletionEnvironment, () => Error>>
}

function fakeEnvironment(state: FakeState): DeletionEnvironment {
  const record = (step: keyof DeletionEnvironment) => async (...args: unknown[]) => {
    const uid = String(args[0])
    state.calls.push(step === 'listPending' ? step : `${step}:${uid}`)
    const failure = state.failures[step]
    if (failure) throw failure()
    const current = state.controls.get(uid) ?? { exists: false, data: null }
    if (step === 'loadControl') return current
    if (step === 'writeTombstone') {
      const merged = { ...(current.data ?? {}), ...(args[1] as Record<string, unknown>) }
      state.controls.set(uid, { exists: true, data: merged })
      return
    }
    if (step === 'markComplete') {
      state.controls.set(uid, { exists: true, data: { ...(current.data ?? {}), deletionState: completeDeletionState } })
    }
  }
  return {
    loadControl: record('loadControl') as DeletionEnvironment['loadControl'],
    writeTombstone: record('writeTombstone') as DeletionEnvironment['writeTombstone'],
    revokeTokens: record('revokeTokens') as DeletionEnvironment['revokeTokens'],
    deleteAuthUser: record('deleteAuthUser') as DeletionEnvironment['deleteAuthUser'],
    deleteUserData: record('deleteUserData') as DeletionEnvironment['deleteUserData'],
    markComplete: record('markComplete') as DeletionEnvironment['markComplete'],
    listPending: record('listPending') as DeletionEnvironment['listPending'],
  }
}

function state(control?: { exists: boolean; data: Record<string, unknown> | null }): FakeState {
  const controls = new Map<string, { exists: boolean; data: Record<string, unknown> | null }>()
  if (control) controls.set('customer-1', control)
  return { controls, calls: [], failures: {} }
}

describe('resumable account deletion', () => {
  it('writes the tombstone before touching anything else and never removes it', async () => {
    const world = state()
    await runAccountDeletion('customer-1', fakeEnvironment(world))
    // Reading the control record first is fine; the tombstone must be written
    // before any destructive step runs.
    expect(world.calls[0]).toBe('loadControl:customer-1')
    expect(world.calls[1]).toBe('writeTombstone:customer-1')
    expect(world.calls).toContain('revokeTokens:customer-1')
    expect(world.calls).toContain('deleteAuthUser:customer-1')
    expect(world.calls).toContain('deleteUserData:customer-1')
    expect(world.calls.at(-1)).toBe('markComplete:customer-1')
    expect(world.controls.get('customer-1')?.data).toMatchObject({ disabled: true, deleted: true, deletionState: completeDeletionState })
    // No step may delete the control document itself: the tombstone is what
    // keeps a half-finished deletion visible to rules and to the resume job.
    expect(world.calls.some((call) => call.startsWith('deleteTombstone'))).toBe(false)
    expect(world.controls.get('customer-1')?.exists).toBe(true)
  })

  it('treats an already deleted Auth user as success so retries stay idempotent', async () => {
    const world = state()
    world.failures.deleteAuthUser = () => Object.assign(new Error('already gone'), { code: 'auth/user-not-found' })
    await expect(runAccountDeletion('customer-1', fakeEnvironment(world))).resolves.toEqual({ state: 'complete' })
    expect(world.calls).toContain('deleteUserData:customer-1')

    const unexpected = state()
    unexpected.failures.deleteUserData = () => new Error('firestore unavailable')
    await expect(runAccountDeletion('customer-1', fakeEnvironment(unexpected))).rejects.toThrow('firestore unavailable')
    // The failure happens after the tombstone, so access is already blocked.
    expect(unexpected.controls.get('customer-1')?.data).toMatchObject({ deleted: true, deletionState: pendingDeletionState })
  })

  it('is a no-op once the deletion is marked complete', async () => {
    const world = state({ exists: true, data: { disabled: true, deleted: true, deletionState: completeDeletionState } })
    await runAccountDeletion('customer-1', fakeEnvironment(world))
    expect(world.calls).toEqual(['loadControl:customer-1'])
  })

  it('resumes incomplete deletions and skips finished ones', async () => {
    const world = state()
    const env = fakeEnvironment(world)
    const pendingList = ['pending-1', 'pending-2']
    const listing: DeletionEnvironment = { ...env, listPending: async (limit) => { world.calls.push(`listPending:${limit}`); return pendingList } }
    const result = await resumePendingDeletions(5, listing)
    expect(result).toEqual({ processed: 2, completed: 2 })
    expect(world.calls.filter((call) => call === 'writeTombstone:pending-1')).toHaveLength(1)
    expect(world.calls.filter((call) => call === 'writeTombstone:pending-2')).toHaveLength(1)
  })

  it('keeps commercial records and the tombstone out of the deletion targets', () => {
    expect(deletionUserDataCollections).not.toContain('orders')
    expect(deletionUserDataCollections).not.toContain('accountControls')
    expect(preservedDeletionCollections).toEqual(expect.arrayContaining(['orders', 'accountControls']))
    for (const collection of preservedDeletionCollections) {
      expect(deletionUserDataCollections).not.toContain(collection)
    }
  })
})
