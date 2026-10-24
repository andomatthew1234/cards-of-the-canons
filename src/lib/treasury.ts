import { httpsCallable } from 'firebase/functions'
import { isFirebaseMode } from '../config'
import type { TreasuryAdminState, TreasuryCard, TreasuryEdition, TreasuryState } from '../types'
import { getFirebaseServices } from './firebase'

const emptyState: TreasuryState = { editions: [], cards: [] }

export async function getMyTreasury(): Promise<TreasuryState> {
  if (!isFirebaseMode) return emptyState
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<Record<string, never>, TreasuryState>(functions, 'getMyTreasury')({})
  return result.data
}

export async function redeemTreasuryCode(code: string) {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<{ code: string }, { card: TreasuryCard; edition: TreasuryEdition; newCard: boolean; retried: boolean }>(functions, 'redeemTreasuryCode')({ code })
  return result.data
}

export async function getTreasuryAdminState(): Promise<TreasuryAdminState> {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<Record<string, never>, TreasuryAdminState>(functions, 'getTreasuryAdminState')({})
  return result.data
}

export async function saveTreasuryEdition(input: Omit<TreasuryEdition, 'id'> & { id?: string; starterCardCount?: number }) {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<typeof input, { id: string }>(functions, 'saveTreasuryEdition')(input)
  return result.data.id
}

export async function saveTreasuryCard(input: Omit<TreasuryCard, 'collected' | 'quantity' | 'firstCollectedAt' | 'lastCollectedAt'>) {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<typeof input, { id: string }>(functions, 'saveTreasuryCard')(input)
  return result.data.id
}

export async function generateTreasuryCodeBatch(input: { cardId: string; quantity: number; label: string; orderId?: string }) {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<typeof input, { batchId: string; codes: string[] }>(functions, 'generateTreasuryCodeBatch')(input)
  return result.data
}

export async function revokeTreasuryCodeBatch(batchId: string, reason: string) {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<{ batchId: string; reason: string }, { revoked: number }>(functions, 'revokeTreasuryCodeBatch')({ batchId, reason })
  return result.data
}
