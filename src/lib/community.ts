import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { isFirebaseMode } from '../config'
import type { CommunityAnswer, CommunityResponse, CommunitySurvey } from '../types'
import { getFirebaseServices } from './firebase'

function surveyFromDoc(snapshot: { id: string; data: () => unknown }): CommunitySurvey {
  return { id: snapshot.id, ...(snapshot.data() as Omit<CommunitySurvey, 'id'>) }
}

function millis(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

export async function listCommunitySurveys(): Promise<CommunitySurvey[]> {
  if (!isFirebaseMode) return []
  const { db } = getFirebaseServices()
  const snapshot = await getDocs(query(collection(db, 'communitySurveys'), where('status', 'in', ['published', 'closed']), limit(100)))
  return snapshot.docs.map(surveyFromDoc).sort((left, right) => millis(right.updatedAt) - millis(left.updatedAt))
}

let attentionCache: { userId: string; count: number; expiresAt: number } | null = null

/** Counts open surveys this account has not answered without reading anybody else's response. */
export async function getCommunityAttentionCount(userId: string, force = false): Promise<number> {
  if (!isFirebaseMode) return 0
  if (!force && attentionCache?.userId === userId && attentionCache.expiresAt > Date.now()) return attentionCache.count
  const { db } = getFirebaseServices()
  const surveys = await getDocs(query(collection(db, 'communitySurveys'), where('status', '==', 'published'), limit(100)))
  const responses = await Promise.all(surveys.docs.map((survey) => getDoc(doc(db, 'communitySurveys', survey.id, 'responses', userId))))
  const count = responses.filter((response) => !response.exists()).length
  attentionCache = { userId, count, expiresAt: Date.now() + 30_000 }
  return count
}

export function clearCommunityAttentionCache() {
  attentionCache = null
}

export async function getMyCommunityResponse(surveyId: string, userId: string): Promise<CommunityResponse | null> {
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, 'communitySurveys', surveyId, 'responses', userId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as CommunityResponse : null
}

export async function submitCommunityAnswers(surveyId: string, answers: CommunityAnswer[]) {
  const { functions } = getFirebaseServices()
  await httpsCallable<{ surveyId: string; answers: CommunityAnswer[] }, { submitted: boolean }>(functions, 'submitCommunityResponse')({ surveyId, answers })
  clearCommunityAttentionCache()
  window.dispatchEvent(new Event('cards:community-updated'))
}

export async function listAdminCommunitySurveys(): Promise<CommunitySurvey[]> {
  const { db } = getFirebaseServices()
  const snapshot = await getDocs(query(collection(db, 'communitySurveys'), orderBy('updatedAt', 'desc'), limit(100)))
  return snapshot.docs.map(surveyFromDoc)
}

export async function getAdminCommunitySurvey(surveyId: string): Promise<CommunitySurvey | null> {
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, 'communitySurveys', surveyId))
  return snapshot.exists() ? surveyFromDoc(snapshot) : null
}

export async function listCommunityResponses(surveyId: string): Promise<CommunityResponse[]> {
  const { db } = getFirebaseServices()
  const snapshot = await getDocs(query(collection(db, 'communitySurveys', surveyId, 'responses'), orderBy('updatedAt', 'desc'), limit(500)))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as CommunityResponse))
}

export async function saveCommunitySurvey(input: Omit<CommunitySurvey, 'id' | 'responseCount' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'closedAt'> & { id?: string }) {
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<typeof input, { id: string }>(functions, 'saveCommunitySurvey')(input)
  return result.data.id
}

export async function deleteCommunitySurvey(surveyId: string) {
  const { functions } = getFirebaseServices()
  await httpsCallable<{ surveyId: string }, { deleted: boolean }>(functions, 'deleteCommunitySurvey')({ surveyId })
}
