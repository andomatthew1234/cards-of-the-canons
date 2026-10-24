import { createHash, randomUUID } from 'node:crypto'
import { FieldPath, FieldValue, Timestamp, type DocumentReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { ADMIN_RECENT_AUTH_SECONDS, authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { beginEmailQueueItem, updateEmailQueueItem } from './emailQueue'
import { publicSiteOriginParam } from './mailTransport'
import {
  ensureNewsletterSegment, listManagedSegmentContacts, newsletterFromParam,
  newsletterReplyToParam, resendApiKey, resendClient, resendConfigured,
  resendWebhookSecret, syncNewsletterContact,
} from './resendProvider'
import { consentEvent, normaliseNewsletterEmail, subscriberIdForEmail } from './newsletter'

const region = 'australia-southeast1'
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const providerOptions = { ...protectedOptions, secrets: [resendApiKey], timeoutSeconds: 300, memory: '512MiB' as const }

const campaignInput = z.object({
  id: z.string().trim().regex(/^[a-zA-Z0-9_-]{10,80}$/).optional(),
  subject: z.string().trim().min(3).max(140),
  previewText: z.string().trim().max(180).default(''),
  heading: z.string().trim().min(3).max(160),
  body: z.string().trim().min(20).max(8000),
  buttonLabel: z.string().trim().max(50).default(''),
  buttonUrl: z.union([z.literal(''), z.string().url().max(500).refine((value) => value.startsWith('https://'), 'Use a secure https:// link.')]).default(''),
}).strict().refine((value) => Boolean(value.buttonLabel) === Boolean(value.buttonUrl), {
  message: 'Provide both a button label and a secure button link.',
})

const campaignIdInput = z.object({ campaignId: z.string().regex(/^[a-zA-Z0-9_-]{10,80}$/) }).strict()
const sendCampaignInput = campaignIdInput.extend({ confirmation: z.literal('SEND NEWSLETTER') }).strict()

type CampaignInput = z.infer<typeof campaignInput>

async function loadNewsletterSubscribers(maximum = 50_000) {
  const documents: QueryDocumentSnapshot[] = []
  let lastDocument: QueryDocumentSnapshot | undefined
  while (documents.length < maximum) {
    const pageSize = Math.min(500, maximum - documents.length)
    let query = db.collection('newsletterSubscribers').orderBy(FieldPath.documentId()).limit(pageSize)
    if (lastDocument) query = query.startAfter(lastDocument)
    const page = await query.get()
    documents.push(...page.docs)
    if (page.size < pageSize) return documents
    lastDocument = page.docs.at(-1)
  }
  if (lastDocument) {
    const overflow = await db.collection('newsletterSubscribers').orderBy(FieldPath.documentId()).startAfter(lastDocument).limit(1).get()
    if (!overflow.empty) throw new HttpsError('resource-exhausted', 'The mailing list is too large to process safely in one request.')
  }
  return documents
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function renderNewsletter(campaign: CampaignInput) {
  const origin = publicSiteOriginParam.value().replace(/\/$/, '')
  const paragraphs = campaign.body.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 18px;line-height:1.7;color:#4b382d">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('')
  const button = campaign.buttonLabel && campaign.buttonUrl
    ? `<p style="margin:28px 0"><a href="${escapeHtml(campaign.buttonUrl)}" style="display:inline-block;background:#4b2f22;color:#fff4da;text-decoration:none;padding:13px 22px;border:1px solid #7f5a35">${escapeHtml(campaign.buttonLabel)}</a></p>`
    : ''
  const html = `<!doctype html><html><body style="margin:0;background:#f3ecdf;font-family:Georgia,serif;color:#2b1b13"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(campaign.previewText)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3ecdf;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf0;border:1px solid #d4b06b"><tr><td style="padding:22px 34px;background:#2d1c15;color:#f7dfaa;font-size:22px">Doxa Cards</td></tr><tr><td style="padding:38px 34px"><h1 style="margin:0 0 22px;font-size:32px;font-weight:normal;color:#2b1b13">${escapeHtml(campaign.heading)}</h1>${paragraphs}${button}<p style="margin:34px 0 0;padding-top:22px;border-top:1px solid #dfccb0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#78695e">You are receiving this because you asked to hear from Doxa Cards. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6f481d">Unsubscribe</a> at any time. Questions? Reply to this email or visit <a href="${origin}" style="color:#6f481d">doxatreasury.com</a>.</p></td></tr></table></td></tr></table></body></html>`
  const text = `${campaign.heading}\n\n${campaign.body}${campaign.buttonLabel && campaign.buttonUrl ? `\n\n${campaign.buttonLabel}: ${campaign.buttonUrl}` : ''}\n\nYou are receiving this because you asked to hear from Doxa Cards. Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}\n${origin}`
  return { html, text }
}

function asIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

function campaignForClient(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    subject: String(data.subject ?? ''), previewText: String(data.previewText ?? ''), heading: String(data.heading ?? ''),
    body: String(data.body ?? ''), buttonLabel: String(data.buttonLabel ?? ''), buttonUrl: String(data.buttonUrl ?? ''),
    status: String(data.status ?? 'draft'), audienceCount: Number(data.audienceCount ?? 0),
    source: data.source === 'journal' ? 'journal' : 'manual',
    providerBroadcastId: typeof data.providerBroadcastId === 'string' ? data.providerBroadcastId : null,
    createdAt: asIso(data.createdAt), updatedAt: asIso(data.updatedAt), sentAt: asIso(data.sentAt),
    lastError: typeof data.lastError === 'string' ? data.lastError : null,
  }
}

export const listNewsletterCampaigns = onCall(providerOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const [campaigns, subscribers] = await Promise.all([
    db.collection('newsletterCampaigns').orderBy('updatedAt', 'desc').limit(50).get(),
    loadNewsletterSubscribers(),
  ])
  const counts = { subscribed: 0, pending: 0, unsubscribed: 0 }
  subscribers.forEach((document) => {
    const status = document.data().status
    if (status === 'subscribed') counts.subscribed += 1
    if (status === 'pending') counts.pending += 1
    if (status === 'unsubscribed') counts.unsubscribed += 1
  })
  return { configured: resendConfigured(), counts, campaigns: campaigns.docs.map((document) => campaignForClient(document.id, document.data())) }
})

export const saveNewsletterCampaign = onCall(protectedOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = campaignInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the newsletter fields.')
  const id = parsed.data.id ?? randomUUID()
  const { id: _discardedId, ...draft } = parsed.data
  const ref = db.collection('newsletterCampaigns').doc(id)
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    if (existing.exists && existing.data()?.source === 'journal') throw new HttpsError('failed-precondition', 'Journal release emails are managed from the Journal editor.')
    if (existing.exists && existing.data()?.status !== 'draft') throw new HttpsError('failed-precondition', 'A queued newsletter can no longer be edited.')
    const now = Timestamp.now()
    transaction.set(ref, {
      ...draft, status: 'draft', updatedAt: now, updatedBy: caller.uid,
      ...(existing.exists ? {} : { createdAt: now, createdBy: caller.uid }),
      lastError: null,
    }, { merge: true })
  })
  return { campaignId: id }
})

export const deleteNewsletterCampaign = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = campaignIdInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid newsletter draft.')
  const ref = db.collection('newsletterCampaigns').doc(parsed.data.campaignId)
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) return
    if (snapshot.data()?.source === 'journal') throw new HttpsError('failed-precondition', 'Journal release emails are part of the publication record and cannot be deleted here.')
    if (snapshot.data()?.status !== 'draft') throw new HttpsError('failed-precondition', 'Only unsent drafts can be deleted.')
    transaction.delete(ref)
  })
  return { deleted: true }
})

export const sendNewsletterTest = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireAdmin: true,
    requireVerifiedEmail: true,
    requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS,
  })
  const parsed = campaignInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the newsletter fields.')
  if (!caller.email) throw new HttpsError('failed-precondition', 'Your administrator account needs a verified email address.')
  const rendered = renderNewsletter(parsed.data)
  const queue = await beginEmailQueueItem({ kind: 'test', subject: `[TEST] ${parsed.data.subject}`, recipientLabel: caller.email, recipientCount: 1, createdBy: caller.uid })
  try {
    const result = await resendClient().emails.send({
      from: newsletterFromParam.value(), replyTo: newsletterReplyToParam.value(), to: caller.email,
      subject: `[TEST] ${parsed.data.subject}`, html: rendered.html.replace('{{{RESEND_UNSUBSCRIBE_URL}}}', `${publicSiteOriginParam.value()}/account/mailing-list`),
      text: rendered.text.replace('{{{RESEND_UNSUBSCRIBE_URL}}}', `${publicSiteOriginParam.value()}/account/mailing-list`),
    }, { idempotencyKey: `newsletter-test-${caller.uid}-${randomUUID()}` })
    if (result.error) throw new Error('Provider rejected the test.')
    await queue.set({ status: 'sent', acceptedCount: 1, sentAt: Timestamp.now(), providerMessageId: result.data?.id ?? null, updatedAt: Timestamp.now() }, { merge: true })
    return { sent: true, to: caller.email, providerMessageId: result.data?.id ?? null }
  } catch {
    await queue.set({ status: 'failed', failedCount: 1, lastError: 'The test email could not be sent.', updatedAt: Timestamp.now() }, { merge: true })
    throw new HttpsError('unavailable', 'The test email could not be sent. Check the sending-domain setup and try again.')
  }
})

async function runWithConcurrency<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 8) {
  let index = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await worker(current)
    }
  }))
}

export async function synchroniseAudience(segmentId: string) {
  const subscribers = await loadNewsletterSubscribers()
  const local = new Map(subscribers.map((document) => [normaliseNewsletterEmail(document.data().email), document.data().status === 'subscribed']))
  const providerEmails = await listManagedSegmentContacts(segmentId)
  const work = [...local.entries()].filter(([email]) => email)
  await runWithConcurrency(work, async ([email, subscribed]) => syncNewsletterContact(email, subscribed, segmentId))
  const unknownProviderEmails = providerEmails.filter((email) => local.get(email) !== true)
  await runWithConcurrency(unknownProviderEmails, async (email) => syncNewsletterContact(email, false, segmentId))
  return work.filter(([, subscribed]) => subscribed).length
}

export async function queueNewsletterCampaign(campaignId: string, actorUid: string) {
  const ref = db.collection('newsletterCampaigns').doc(campaignId)
  const leaseId = randomUUID()
  const now = Timestamp.now()
  const campaign = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new HttpsError('not-found', 'Newsletter draft not found.')
    const data = snapshot.data()!
    if (data.status === 'queued' || data.status === 'sent') return { alreadyQueued: true, data }
    const leaseUntil = data.sendLeaseExpiresAt instanceof Timestamp ? data.sendLeaseExpiresAt.toMillis() : 0
    if (data.status === 'preparing' && leaseUntil > Date.now()) throw new HttpsError('aborted', 'This newsletter is already being prepared.')
    if (!['draft', 'provider_draft', 'preparing'].includes(String(data.status))) throw new HttpsError('failed-precondition', 'This newsletter cannot be sent in its current state.')
    transaction.set(ref, { status: 'preparing', sendLeaseId: leaseId, sendLeaseExpiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), updatedAt: now, updatedBy: actorUid }, { merge: true })
    return { alreadyQueued: false, data }
  })
  const queueId = `newsletter_${campaignId}`
  const queueKind = campaign.data.source === 'journal' ? 'journal' : 'newsletter'
  if (campaign.alreadyQueued) {
    await beginEmailQueueItem({ id: queueId, kind: queueKind, subject: String(campaign.data.subject ?? ''), recipientLabel: 'Everyone on the mailing list', recipientCount: Number(campaign.data.audienceCount ?? 0), sourceId: campaignId, createdBy: actorUid, status: 'queued' })
    await updateEmailQueueItem(queueId, { providerMessageId: campaign.data.providerBroadcastId ?? null, acceptedCount: Number(campaign.data.audienceCount ?? 0), sentAt: campaign.data.sentAt ?? Timestamp.now() })
    return { queued: true, alreadyQueued: true, audienceCount: Number(campaign.data.audienceCount ?? 0) }
  }

  await beginEmailQueueItem({ id: queueId, kind: queueKind, subject: String(campaign.data.subject ?? ''), recipientLabel: 'Everyone on the mailing list', recipientCount: 0, sourceId: campaignId, createdBy: actorUid })

  let providerBroadcastId = typeof campaign.data.providerBroadcastId === 'string' ? campaign.data.providerBroadcastId : ''
  try {
    const segmentId = await ensureNewsletterSegment()
    const audienceCount = await synchroniseAudience(segmentId)
    if (audienceCount === 0) throw new HttpsError('failed-precondition', 'There are no confirmed subscribers to send to.')
    const content = campaignInput.parse({
      id: campaignId, subject: campaign.data.subject, previewText: campaign.data.previewText ?? '', heading: campaign.data.heading,
      body: campaign.data.body, buttonLabel: campaign.data.buttonLabel ?? '', buttonUrl: campaign.data.buttonUrl ?? '',
    })
    if (providerBroadcastId) {
      // A previous attempt may have reached Resend before our final Firestore
      // write. Reconcile the durable provider object before doing anything
      // that could send a second copy.
      const existingBroadcast = await resendClient().broadcasts.get(providerBroadcastId)
      if (existingBroadcast.error || !existingBroadcast.data) throw new Error('The newsletter provider status could not be confirmed safely.')
      if (existingBroadcast.data.status === 'queued' || existingBroadcast.data.status === 'sent') {
        await ref.set({ status: 'queued', audienceCount, sentAt: Timestamp.now(), updatedAt: Timestamp.now(), sentBy: actorUid, sendLeaseId: null, sendLeaseExpiresAt: null, lastError: null }, { merge: true })
        await updateEmailQueueItem(queueId, { status: existingBroadcast.data.status === 'sent' ? 'sent' : 'queued', recipientCount: audienceCount, acceptedCount: audienceCount, providerMessageId: providerBroadcastId, sentAt: Timestamp.now(), lastError: null })
        return { queued: true, alreadyQueued: true, audienceCount, providerBroadcastId }
      }
    } else {
      const rendered = renderNewsletter(content)
      const created = await resendClient().broadcasts.create({
        segmentId, name: `Doxa · ${content.subject}`, from: newsletterFromParam.value(), replyTo: newsletterReplyToParam.value(),
        subject: content.subject, previewText: content.previewText, html: rendered.html, text: rendered.text,
      })
      if (created.error || !created.data?.id) throw new Error('The newsletter provider could not create the broadcast.')
      providerBroadcastId = created.data.id
      await ref.set({ providerBroadcastId, providerSegmentId: segmentId, audienceCount, status: 'provider_draft', updatedAt: Timestamp.now() }, { merge: true })
      await updateEmailQueueItem(queueId, { recipientCount: audienceCount, providerMessageId: providerBroadcastId })
    }
    const sent = await resendClient().broadcasts.send(providerBroadcastId)
    if (sent.error) throw new Error('The newsletter provider did not accept the send request.')
    await ref.set({ status: 'queued', audienceCount, sentAt: Timestamp.now(), updatedAt: Timestamp.now(), sentBy: actorUid, sendLeaseId: null, sendLeaseExpiresAt: null, lastError: null }, { merge: true })
    await updateEmailQueueItem(queueId, { status: 'queued', recipientCount: audienceCount, acceptedCount: audienceCount, providerMessageId: providerBroadcastId, sentAt: Timestamp.now(), lastError: null })
    return { queued: true, alreadyQueued: false, audienceCount, providerBroadcastId }
  } catch (error) {
    const message = error instanceof HttpsError ? error.message : 'The newsletter could not be queued. No new send request was recorded.'
    await ref.set({ status: providerBroadcastId ? 'provider_draft' : 'draft', lastError: message, updatedAt: Timestamp.now(), sendLeaseId: null, sendLeaseExpiresAt: null }, { merge: true })
    await updateEmailQueueItem(queueId, { status: 'failed', providerMessageId: providerBroadcastId || null, lastError: message })
    if (error instanceof HttpsError) throw error
    throw new HttpsError('unavailable', message)
  }
}

export const sendNewsletterCampaign = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireAdmin: true,
    requireVerifiedEmail: true,
    requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS,
  })
  const parsed = sendCampaignInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Confirm that you want to send this newsletter.')
  return queueNewsletterCampaign(parsed.data.campaignId, caller.uid)
})

export const suppressNewsletterSubscriber = onCall(providerOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = z.object({ subscriberId: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid subscriber.')
  const ref = db.collection('newsletterSubscribers').doc(parsed.data.subscriberId)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new HttpsError('not-found', 'Subscriber not found.')
  const email = normaliseNewsletterEmail(snapshot.data()!.email)
  const timestamp = Timestamp.now()
  await ref.set({ status: 'unsubscribed', unsubscribedAt: timestamp, updatedAt: timestamp }, { merge: true })
  await db.collection('newsletterConsentEvents').add(consentEvent(parsed.data.subscriberId, 'unsubscribed', null, timestamp))
  try { await syncNewsletterContact(email, false) } catch { /* Firestore suppression remains authoritative. */ }
  return { suppressed: true, updatedBy: caller.uid }
})

export const resendNewsletterWebhook = onRequest({ region, secrets: [resendApiKey, resendWebhookSecret] }, async (request, response) => {
  if (request.method !== 'POST') { response.status(405).send('Method not allowed'); return }
  const eventId = request.header('svix-id') ?? ''
  const timestamp = request.header('svix-timestamp') ?? ''
  const signature = request.header('svix-signature') ?? ''
  if (!eventId || !timestamp || !signature) { response.status(400).send('Missing signature'); return }
  let event: ReturnType<ReturnType<typeof resendClient>['webhooks']['verify']>
  try {
    event = resendClient().webhooks.verify({ payload: request.rawBody.toString('utf8'), headers: { id: eventId, timestamp, signature }, webhookSecret: resendWebhookSecret.value() })
  } catch {
    response.status(400).send('Invalid signature'); return
  }
  const eventRef = db.collection('_newsletterWebhookEvents').doc(eventId)
  const emails = new Set<string>()
  if (event.type === 'contact.updated' && event.data.unsubscribed === true) emails.add(normaliseNewsletterEmail(event.data.email))
  if (event.type === 'suppression.added') emails.add(normaliseNewsletterEmail(event.data.email))
  if (event.type === 'email.bounced' || event.type === 'email.complained' || event.type === 'email.suppressed') {
    event.data.to.forEach((email) => emails.add(normaliseNewsletterEmail(email)))
  }
  const now = Timestamp.now()
  const subscribers = [...emails].filter(Boolean).map((email) => {
    const subscriberId = subscriberIdForEmail(email)
    return { subscriberId, ref: db.collection('newsletterSubscribers').doc(subscriberId) }
  })
  const outboundEvent = 'email_id' in event.data && event.type !== 'email.received'
  const emailId = 'email_id' in event.data && event.type !== 'email.received' ? event.data.email_id : ''
  const broadcastId = 'email_id' in event.data && event.type !== 'email.received' && 'broadcast_id' in event.data ? event.data.broadcast_id ?? '' : ''
  const deliveredEvent = event.type === 'email.delivered'
  const failedEvent = event.type === 'email.failed' || event.type === 'email.bounced' || event.type === 'email.complained' || event.type === 'email.suppressed'
  const sentEvent = event.type === 'email.sent'
  const deliveryStateRef = outboundEvent ? db.collection('_emailDeliveryStates').doc(createHash('sha256').update(`${broadcastId || 'direct'}:${emailId}`).digest('hex')) : null
  const [directQueue, broadcastQueue, campaignDeliveries] = outboundEvent ? await Promise.all([
    db.collection('emailQueue').where('providerMessageId', '==', emailId).limit(10).get(),
    broadcastId ? db.collection('emailQueue').where('providerMessageId', '==', broadcastId).limit(10).get() : Promise.resolve(null),
    db.collectionGroup('deliveries').where('providerMessageId', '==', emailId).limit(10).get(),
  ]) : [null, null, null]
  const queueRefs = new Map<string, DocumentReference>()
  directQueue?.docs.forEach((document) => queueRefs.set(document.ref.path, document.ref))
  broadcastQueue?.docs.forEach((document) => queueRefs.set(document.ref.path, document.ref))
  campaignDeliveries?.docs.forEach((document) => {
    const campaignRef = document.ref.parent.parent
    if (campaignRef) {
      const queueRef = db.collection('emailQueue').doc(`campaign_${campaignRef.id}`)
      queueRefs.set(queueRef.path, queueRef)
    }
  })
  const processed = await db.runTransaction(async (transaction) => {
    const existingEvent = await transaction.get(eventRef)
    if (existingEvent.exists) return false
    const [subscriberSnapshots, queueSnapshots, deliverySnapshots, deliveryState] = await Promise.all([
      Promise.all(subscribers.map(({ ref }) => transaction.get(ref))),
      Promise.all([...queueRefs.values()].map((ref) => transaction.get(ref))),
      Promise.all((campaignDeliveries?.docs ?? []).map((document) => transaction.get(document.ref))),
      deliveryStateRef ? transaction.get(deliveryStateRef) : Promise.resolve(null),
    ])
    subscribers.forEach(({ subscriberId, ref }, index) => {
      if (!subscriberSnapshots[index].exists) return
      transaction.set(ref, { status: 'unsubscribed', unsubscribedAt: now, updatedAt: now }, { merge: true })
      transaction.create(
        db.collection('newsletterConsentEvents').doc(`provider_${eventId}_${subscriberId.slice(0, 16)}`),
        consentEvent(subscriberId, 'unsubscribed', null, now),
      )
    })
    const firstTerminalEvent = (deliveredEvent || failedEvent) && !deliveryState?.exists
    if (firstTerminalEvent && deliveryStateRef) transaction.create(deliveryStateRef, { status: deliveredEvent ? 'delivered' : 'failed', eventId, createdAt: now })
    deliverySnapshots.forEach((snapshot) => {
      if (!snapshot.exists || (!deliveredEvent && !failedEvent && !sentEvent)) return
      transaction.set(snapshot.ref, {
        status: deliveredEvent ? 'delivered' : failedEvent ? 'failed' : 'sent',
        updatedAt: now,
        ...(deliveredEvent ? { deliveredAt: now } : {}),
        ...(failedEvent ? { failedAt: now, error: 'The provider reported that this message was not delivered.' } : {}),
      }, { merge: true })
    })
    queueSnapshots.forEach((snapshot) => {
      if (!snapshot.exists || (!deliveredEvent && !failedEvent && !sentEvent)) return
      const data = snapshot.data()!
      const directMatch = data.providerMessageId === emailId
      const deliveredCount = Number(data.deliveredCount ?? 0) + (deliveredEvent && firstTerminalEvent ? 1 : 0)
      const failedCount = Number(data.failedCount ?? 0) + (failedEvent && firstTerminalEvent ? 1 : 0)
      const recipientCount = Number(data.recipientCount ?? 0)
      const finished = recipientCount > 0 && deliveredCount + failedCount >= recipientCount
      const status = (deliveredEvent || failedEvent) && !firstTerminalEvent
        ? String(data.status ?? 'sent')
        : deliveredEvent || failedEvent
        ? finished
          ? failedCount === 0 ? 'delivered' : deliveredCount === 0 ? 'failed' : 'partially_sent'
          : failedEvent ? 'partially_sent' : String(data.status ?? 'sent')
        : directMatch && sentEvent ? 'sent' : String(data.status ?? 'queued')
      transaction.set(snapshot.ref, {
        status,
        deliveredCount,
        failedCount,
        updatedAt: now,
        ...(directMatch && sentEvent ? { sentAt: now } : {}),
        ...(failedEvent && firstTerminalEvent ? { lastError: 'The provider reported one or more unsuccessful deliveries.' } : {}),
      }, { merge: true })
    })
    transaction.create(eventRef, { type: event.type, processedAt: now, affectedSubscriberCount: subscribers.length })
    return true
  })
  response.status(200).send(processed ? 'Processed' : 'Already processed')
})
