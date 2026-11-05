import { httpsCallable } from 'firebase/functions'
import { isFirebaseMode } from '../config'
import type { TreasuryAdminCustomerState, TreasuryAdminState, TreasuryCard, TreasuryEdition, TreasuryRedemptionResult, TreasuryRedemptionSession, TreasuryState } from '../types'
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

export async function beginTreasuryRedemption(orderId: string): Promise<TreasuryRedemptionSession> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ orderId: string }, TreasuryRedemptionSession>(functions, 'beginTreasuryRedemption')({ orderId })).data
}

export async function redeemPhysicalTreasuryCards(orderId: string, codes: string[], requestId = crypto.randomUUID()): Promise<TreasuryRedemptionResult> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ orderId: string; codes: string[]; requestId: string }, TreasuryRedemptionResult>(functions, 'redeemPhysicalTreasuryCards')({ orderId, codes, requestId })).data
}

export async function transferTreasuryCard(instanceId: string, recipientEmail: string, requestId = crypto.randomUUID()) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ instanceId: string; recipientEmail: string; requestId: string }, { transferred: boolean; recipientEmail: string }>(functions, 'transferTreasuryCard')({ instanceId, recipientEmail, requestId })).data
}

export async function assignPhysicalCodesToOrder(orderId: string, codes: string[], requestId = crypto.randomUUID()) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ orderId: string; codes: string[]; requestId: string }, { assigned: number; eligible: number }>(functions, 'assignPhysicalCodesToOrder')({ orderId, codes, requestId })).data
}

export async function getTreasuryCustomerAdmin(uid: string): Promise<TreasuryAdminCustomerState> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ uid: string }, TreasuryAdminCustomerState>(functions, 'getTreasuryCustomerAdmin')({ uid })).data
}

export type TreasuryAdminAction =
  | { action: 'ban' | 'unban'; uid: string; reason: string }
  | { action: 'grant_attempts'; uid: string; orderId: string; amount: number; reason: string }
  | { action: 'set_allowance'; uid: string; orderId: string; eligibleCodeCount: number; reason: string }
  | { action: 'unassign_code'; uid: string; orderId: string; code: string; reason: string }
  | { action: 'add_card'; uid: string; cardId: string; reason: string }
  | { action: 'remove_card'; uid: string; instanceId: string; reason: string }

export async function adminManageTreasury(input: TreasuryAdminAction) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<TreasuryAdminAction, { updated: boolean }>(functions, 'adminManageTreasury')(input)).data
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
