import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { adminFunctionsAvailable, checkoutMode, isFirebaseMode } from '../config'
import { demoOrders, demoProducts, normaliseProductCopy } from '../data/demo'
import type { AccountMailingListStatus, Article, EmailCampaign, EmailCampaignDraft, EmailCampaignWorkspace, Enquiry, NewsletterAdminOverview, NewsletterCampaignDraft, NewsletterSignupResult, NewsletterSource, NewsletterSubscriber, Order, PageContent, Product, SiteSettings } from '../types'
import { getFirebaseServices } from './firebase'

export const dataMode = isFirebaseMode ? 'firebase' : 'demo'

export async function listPublishedProducts(): Promise<Product[]> {
  if (!isFirebaseMode) return demoProducts
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'products'), where('status', '==', 'published'), orderBy('name'), limit(100)))
  return snap.docs.map((item) => normaliseProductCopy({ id: item.id, ...item.data() } as Product))
}

export async function listPublishedJournalArticles(): Promise<Article[]> {
  if (!isFirebaseMode) return []
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'articles'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(100)))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as Article))
}

export async function listJournalArticlesAdmin(): Promise<Article[]> {
  if (!isFirebaseMode) return []
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, { articles: Article[] }>(functions, 'listJournalArticlesAdmin')({})).data.articles
}

export type JournalArticleDraft = Omit<Article, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'notificationStatus' | 'notificationAudienceCount' | 'notificationError'> & {
  id?: string
  status?: Article['status']
  notificationStatus?: Article['notificationStatus']
  notificationAudienceCount?: number
  notificationError?: string | null
}

function journalDraftPayload(input: JournalArticleDraft) {
  const { id, revision, slug, title, excerpt, bodyMarkdown, category, coverImageUrl, coverImageAlt, authorName, seoTitle, seoDescription, featured } = input
  return { ...(id ? { id } : {}), revision, slug, title, excerpt, bodyMarkdown, category, coverImageUrl, coverImageAlt, authorName, seoTitle, seoDescription, featured }
}

export async function saveJournalArticle(input: JournalArticleDraft): Promise<Article> {
  const { functions } = getFirebaseServices()
  const payload = journalDraftPayload(input)
  return (await httpsCallable<typeof payload, { article: Article }>(functions, 'saveJournalArticle')(payload)).data.article
}

export async function publishJournalArticle(input: JournalArticleDraft & { sendNotification: boolean }): Promise<Article> {
  const { functions } = getFirebaseServices()
  const payload = { ...journalDraftPayload(input), sendNotification: input.sendNotification }
  return (await httpsCallable<typeof payload, { article: Article }>(functions, 'publishJournalArticle')(payload)).data.article
}

export async function deleteJournalArticle(articleId: string, revision: number) {
  const { functions } = getFirebaseServices()
  await httpsCallable<{ articleId: string; revision: number }, { deleted: boolean }>(functions, 'deleteJournalArticle')({ articleId, revision })
}

export async function retryJournalNotification(articleId: string): Promise<Article> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ articleId: string }, { article: Article }>(functions, 'retryJournalNotification')({ articleId })).data.article
}

export async function uploadJournalImage(articleKey: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image smaller than 5 MB.')
  const safeArticle = articleKey.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100)
  if (!safeArticle) throw new Error('Add a URL before uploading an image.')
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-100)
  const { storage, functions, auth } = getFirebaseServices()
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Please sign in to continue.')
  await auth.currentUser.getIdToken(true)
  const objectName = `${Date.now()}-${safeName}`.slice(-120)
  const stagingPath = `image-staging/${uid}/${objectName}`
  await uploadBytes(ref(storage, stagingPath), file, { contentType: file.type })
  const publish = httpsCallable<{ stagingPath: string; destination: string }, { path: string }>(functions, 'publishStagedImage')
  const result = await publish({ stagingPath, destination: `page-images/journal-${safeArticle}/${objectName}` })
  if (!result.data.path.startsWith(`page-images/journal-${safeArticle}/`)) throw new Error('The image service returned an invalid location.')
  return getDownloadURL(ref(storage, result.data.path))
}

export async function saveEnquiry(input: Omit<Enquiry, 'id' | 'status' | 'createdAt'>) {
  if (!isFirebaseMode) return { demo: true as const }
  const { functions } = getFirebaseServices()
  await httpsCallable(functions, 'submitEnquiry')(input)
  return { demo: false as const }
}

/** Requests a double-opt-in newsletter subscription without exposing whether
 * the address already exists, is pending or is suppressed. */
export async function saveNewsletter(email: string, source: NewsletterSource): Promise<NewsletterSignupResult> {
  if (!isFirebaseMode) return { demo: true }
  const { functions } = getFirebaseServices()
  const payload = { email: email.trim().toLowerCase(), consent: true as const, source }
  const response = await httpsCallable<typeof payload, Omit<NewsletterSignupResult, 'demo'>>(functions, 'subscribeNewsletter')(payload)
  return { demo: false, ...response.data }
}

export interface NewsletterConsentResult {
  confirmed?: boolean
  unsubscribed?: boolean
  status?: string
  unsubscribeUrl?: string
}

/** Redeems a confirmation token. Server-side mutation only. */
export async function confirmNewsletterSubscription(token: string): Promise<NewsletterConsentResult> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ token: string }, NewsletterConsentResult>(functions, 'confirmNewsletterSubscription')({ token })).data
}

/** Suppresses an address with a token. Server-side mutation only. */
export async function unsubscribeNewsletter(token: string): Promise<NewsletterConsentResult> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ token: string }, NewsletterConsentResult>(functions, 'unsubscribeNewsletter')({ token })).data
}

export async function getMyMailingListStatus(): Promise<AccountMailingListStatus> {
  if (!isFirebaseMode) return { email: '', emailVerified: true, status: 'not_joined' }
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, AccountMailingListStatus>(functions, 'getMyMailingListStatus')({})).data
}

export async function joinAccountMailingList(source: 'account_registration' | 'account_settings'): Promise<AccountMailingListStatus> {
  if (!isFirebaseMode) return { email: '', emailVerified: true, status: 'subscribed' }
  const { functions } = getFirebaseServices()
  const result = await httpsCallable<{ consent: true; source: typeof source }, AccountMailingListStatus>(functions, 'joinAccountMailingList')({ consent: true, source })
  return result.data
}

export async function leaveAccountMailingList(): Promise<AccountMailingListStatus> {
  if (!isFirebaseMode) return { email: '', emailVerified: true, status: 'unsubscribed' }
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, AccountMailingListStatus>(functions, 'leaveAccountMailingList')({})).data
}

export async function listAdminProducts(): Promise<Product[]> {
  if (!isFirebaseMode) return demoProducts
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'products'), orderBy('name'), limit(100)))
  return snap.docs.map((item) => normaliseProductCopy({ id: item.id, ...item.data() } as Product))
}

export async function upsertProduct(product: Product) {
  if (!isFirebaseMode) throw new Error('Editing is not available in this local environment.')
  const { db } = getFirebaseServices()
  const { id, ...data } = product
  await setDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() }, { merge: true })
  window.dispatchEvent(new Event('cards:catalog-updated'))
}

export async function deleteProduct(id: string) {
  const { db } = getFirebaseServices()
  await deleteDoc(doc(db, 'products', id))
  window.dispatchEvent(new Event('cards:catalog-updated'))
}

export async function uploadProductImage(productId: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP image smaller than 5 MB.')
  }
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-120)
  const { storage, functions, auth } = getFirebaseServices()
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Please sign in to continue.')
  await auth.currentUser.getIdToken(true)
  const objectName = `${Date.now()}-${safeName}`
  const stagingPath = `image-staging/${uid}/${objectName}`
  // Private staging first: the object is only copied into a public path after
  // the server re-validates size, declared type and magic bytes.
  await uploadBytes(ref(storage, stagingPath), file, { contentType: file.type })
  const publish = httpsCallable<{ stagingPath: string; destination: string }, { path: string }>(functions, 'publishStagedImage')
  const result = await publish({ stagingPath, destination: `product-images/${productId}/${objectName}` })
  if (!result.data.path.startsWith('product-images/')) {
    throw new Error('The image service returned an invalid location.')
  }
  return getDownloadURL(ref(storage, result.data.path))
}

export async function uploadPageImage(pageId: PageContent['page'], slot: 'hero' | 'story', file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP image smaller than 5 MB.')
  }
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-100)
  const { storage, functions, auth } = getFirebaseServices()
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Please sign in to continue.')
  await auth.currentUser.getIdToken(true)
  const objectName = `${slot}-${Date.now()}-${safeName}`.slice(-120)
  const stagingPath = `image-staging/${uid}/${objectName}`
  await uploadBytes(ref(storage, stagingPath), file, { contentType: file.type })
  const publish = httpsCallable<{ stagingPath: string; destination: string }, { path: string }>(functions, 'publishStagedImage')
  const result = await publish({ stagingPath, destination: `page-images/${pageId}/${objectName}` })
  if (!result.data.path.startsWith(`page-images/${pageId}/`)) throw new Error('The image service returned an invalid location.')
  return getDownloadURL(ref(storage, result.data.path))
}

export async function listEnquiries(): Promise<Enquiry[]> {
  if (!isFirebaseMode) return []
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'enquiries'), orderBy('createdAt', 'desc'), limit(100)))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as Enquiry))
}

export async function updateEnquiryStatus(id: string, status: Enquiry['status']) {
  if (!isFirebaseMode) throw new Error('Editing is not available in this local environment.')
  const { db } = getFirebaseServices()
  await updateDoc(doc(db, 'enquiries', id), { status, updatedAt: serverTimestamp() })
}

export async function deleteEnquiry(id: string) {
  const { db } = getFirebaseServices()
  await deleteDoc(doc(db, 'enquiries', id))
}

export async function listSubscribers(): Promise<NewsletterSubscriber[]> {
  if (!isFirebaseMode) return []
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'newsletterSubscribers'), orderBy('createdAt', 'desc'), limit(200)))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as NewsletterSubscriber))
}

export async function updateSubscriberStatus(id: string, status: NewsletterSubscriber['status']) {
  const { db } = getFirebaseServices()
  await updateDoc(doc(db, 'newsletterSubscribers', id), { status, updatedAt: serverTimestamp() })
}

export async function deleteSubscriber(id: string) {
  const { db } = getFirebaseServices()
  await deleteDoc(doc(db, 'newsletterSubscribers', id))
}

export async function listNewsletterCampaigns(): Promise<NewsletterAdminOverview> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, NewsletterAdminOverview>(functions, 'listNewsletterCampaigns')({})).data
}

export async function saveNewsletterCampaign(draft: NewsletterCampaignDraft): Promise<{ campaignId: string }> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<NewsletterCampaignDraft, { campaignId: string }>(functions, 'saveNewsletterCampaign')(draft)).data
}

export async function deleteNewsletterCampaign(campaignId: string) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ campaignId: string }, { deleted: boolean }>(functions, 'deleteNewsletterCampaign')({ campaignId })).data
}

export async function sendNewsletterTest(draft: NewsletterCampaignDraft) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<NewsletterCampaignDraft, { sent: boolean; to: string }>(functions, 'sendNewsletterTest')(draft)).data
}

export async function sendNewsletterCampaign(campaignId: string) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ campaignId: string; confirmation: 'SEND NEWSLETTER' }, { queued: boolean; audienceCount: number }>(functions, 'sendNewsletterCampaign')({ campaignId, confirmation: 'SEND NEWSLETTER' })).data
}

export async function suppressNewsletterSubscriber(subscriberId: string) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ subscriberId: string }, { suppressed: boolean }>(functions, 'suppressNewsletterSubscriber')({ subscriberId })).data
}

export async function listEmailCampaignWorkspace(): Promise<EmailCampaignWorkspace> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, EmailCampaignWorkspace>(functions, 'listEmailCampaignWorkspace')({})).data
}

export async function saveEmailCampaign(draft: EmailCampaignDraft): Promise<EmailCampaign> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<EmailCampaignDraft, { campaign: EmailCampaign }>(functions, 'saveEmailCampaign')(draft)).data.campaign
}

export async function deleteEmailCampaign(campaignId: string) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ campaignId: string }, { deleted: boolean }>(functions, 'deleteEmailCampaign')({ campaignId })).data
}

export async function sendEmailCampaignTest(draft: EmailCampaignDraft) {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<EmailCampaignDraft, { sent: boolean; to: string }>(functions, 'sendEmailCampaignTest')(draft)).data
}

export async function queueEmailCampaign(campaignId: string, action: 'send_now' | 'schedule', scheduledAt?: string): Promise<EmailCampaign> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ campaignId: string; action: 'send_now' | 'schedule'; scheduledAt?: string }, { campaign: EmailCampaign }>(functions, 'queueEmailCampaign')({ campaignId, action, ...(scheduledAt ? { scheduledAt } : {}) })).data.campaign
}

export async function cancelScheduledEmailCampaign(campaignId: string): Promise<EmailCampaign> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ campaignId: string }, { campaign: EmailCampaign }>(functions, 'cancelScheduledEmailCampaign')({ campaignId })).data.campaign
}

export async function retryEmailCampaign(campaignId: string): Promise<EmailCampaign> {
  const { functions } = getFirebaseServices()
  return (await httpsCallable<{ campaignId: string }, { campaign: EmailCampaign }>(functions, 'retryEmailCampaign')({ campaignId })).data.campaign
}

export async function uploadEmailCampaignImage(campaignKey: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image smaller than 5 MB.')
  const safeCampaign = campaignKey.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100) || 'new'
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-100)
  const { storage, functions, auth } = getFirebaseServices()
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error('Please sign in to continue.')
  await auth.currentUser.getIdToken(true)
  const objectName = `${Date.now()}-${safeName}`.slice(-120)
  const stagingPath = `image-staging/${uid}/${objectName}`
  await uploadBytes(ref(storage, stagingPath), file, { contentType: file.type })
  const publish = httpsCallable<{ stagingPath: string; destination: string }, { path: string }>(functions, 'publishStagedImage')
  const result = await publish({ stagingPath, destination: `page-images/email-campaign-${safeCampaign}/${objectName}` })
  if (!result.data.path.startsWith(`page-images/email-campaign-${safeCampaign}/`)) throw new Error('The image service returned an invalid location.')
  return getDownloadURL(ref(storage, result.data.path))
}

export async function getPageContent(page: PageContent['page']): Promise<PageContent | null> {
  if (!isFirebaseMode) return null
  const { db } = getFirebaseServices()
  const snap = await getDoc(doc(db, 'pageContent', page))
  return snap.exists() ? snap.data() as PageContent : null
}

export async function savePageContent(content: PageContent) {
  const { db } = getFirebaseServices()
  await setDoc(doc(db, 'pageContent', content.page), { ...content, status: content.status ?? 'published', updatedAt: serverTimestamp() })
  window.dispatchEvent(new Event('cards:content-updated'))
}

export async function getSiteSettings(): Promise<SiteSettings | null> {
  if (!isFirebaseMode) return null
  const { db } = getFirebaseServices()
  const snap = await getDoc(doc(db, 'siteSettings', 'main'))
  return snap.exists() ? snap.data() as SiteSettings : null
}

export async function saveSiteSettings(settings: SiteSettings) {
  const { db } = getFirebaseServices()
  await setDoc(doc(db, 'siteSettings', 'main'), { ...settings, status: settings.status ?? 'published', updatedAt: serverTimestamp() })
  window.dispatchEvent(new Event('cards:content-updated'))
}

export async function listOrdersForUser(userId: string): Promise<Order[]> {
  if (!isFirebaseMode) return demoOrders
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'orders'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50)))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as Order))
}

export async function getOrderForUser(orderId: string): Promise<Order | null> {
  if (!isFirebaseMode) return demoOrders.find((order) => order.id === orderId) ?? null
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, 'orders', orderId))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as Order : null
}

export async function startCheckout(items: Array<{ productId: string; quantity: number }>) {
  if (!isFirebaseMode) throw new Error('Checkout is not available in this local environment.')
  const { functions } = getFirebaseServices()
  const attemptId = crypto.randomUUID()
  const callable = httpsCallable<
    { attemptId: string; expectedPaymentEnvironment: 'test' | 'live'; items: Array<{ productId: string; quantity: number }> },
    { orderId: string; url: string; mode: 'test' | 'live' }
  >(functions, 'createCheckoutSession')
  const result = await callable({ attemptId, expectedPaymentEnvironment: checkoutMode, items })
  if (!result.data.url.startsWith('https://checkout.stripe.com/')) throw new Error('The checkout service returned an invalid address.')
  if (result.data.mode !== checkoutMode) throw new Error('Checkout configuration changed. Refresh the page before trying again.')
  return result.data
}

export async function cancelCheckout(orderId: string) {
  if (!isFirebaseMode) return { cancelled: true }
  const { functions } = getFirebaseServices()
  const callable = httpsCallable<{ orderId: string }, { cancelled: boolean; paid?: boolean; processing?: boolean }>(
    functions,
    'cancelCheckoutSession',
  )
  return (await callable({ orderId })).data
}

export interface CommerceStatus {
  paymentEnvironment: 'test' | 'live'
  livePaymentsEnabled: boolean
  readyForLiveActivation: boolean
  /** A `whsec_` prefix is configuration, not validation — only set with evidence. */
  webhookSecretConfigured?: boolean
  webhookValidated?: boolean
  launchEvidence?: {
    webhookDeliveryId?: string
    webhookEventType?: string
    webhookReceivedAt?: string
    testOrderRef?: string
  } | null
  livePaymentsActuallyAllowed?: boolean
}

export async function getCommerceStatus(): Promise<CommerceStatus> {
  if (!isFirebaseMode) return { paymentEnvironment: 'test', livePaymentsEnabled: false, readyForLiveActivation: false }
  const { functions } = getFirebaseServices()
  return (await httpsCallable<Record<string, never>, CommerceStatus>(functions, 'getCommerceStatus')({})).data
}

export async function setLivePayments(enabled: boolean) {
  if (!isFirebaseMode) throw new Error('Payment settings are not available in this local environment.')
  const { functions } = getFirebaseServices()
  const callable = httpsCallable<{ enabled: boolean; confirmation: string }, { livePaymentsEnabled: boolean }>(functions, 'setLivePaymentsEnabled')
  return (await callable({ enabled, confirmation: enabled ? 'ENABLE LIVE PAYMENTS' : '' })).data
}

export async function listAdminOrders(): Promise<Order[]> {
  if (!isFirebaseMode) return []
  const { db } = getFirebaseServices()
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as Order))
}

export async function updateOrderStatus(orderId: string, status: 'paid' | 'cancelled' | 'fulfilled') {
  const { functions } = getFirebaseServices()
  if (adminFunctionsAvailable) return void await httpsCallable(functions, 'updateOrderFulfilment')({ orderId, status })
  throw new Error('Trusted order administration is not available in this environment.')
}

export async function dismissTestOrder(orderId: string) {
  if (!isFirebaseMode || !adminFunctionsAvailable) throw new Error('Trusted order administration is not available in this environment.')
  const { functions } = getFirebaseServices()
  const callable = httpsCallable<{ orderId: string }, { dismissed: boolean }>(functions, 'dismissTestOrder')
  return (await callable({ orderId })).data
}
