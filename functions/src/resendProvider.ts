import { logger } from 'firebase-functions'
import { defineSecret, defineString } from 'firebase-functions/params'
import { Resend } from 'resend'
import { db } from './firebase'
import { beginEmailQueueItem } from './emailQueue'
import { registerTransactionalTransport } from './mailTransport'

export const resendApiKey = defineSecret('RESEND_API_KEY')
export const resendWebhookSecret = defineSecret('RESEND_WEBHOOK_SECRET')
export const defaultNewsletterFrom = 'Doxa Cards <info@doxatreasury.com>'
export const defaultNewsletterReplyTo = 'info@doxatreasury.com'
export const newsletterFromParam = defineString('NEWSLETTER_FROM', {
  default: defaultNewsletterFrom,
})
export const newsletterReplyToParam = defineString('NEWSLETTER_REPLY_TO', {
  default: defaultNewsletterReplyTo,
})

const providerConfigRef = db.collection('_newsletterProvider').doc('resend')
const managedSegmentName = 'Doxa newsletter subscribers'

function client() {
  const key = resendApiKey.value()
  if (!key || !key.startsWith('re_')) throw new Error('Resend is not configured.')
  return new Resend(key)
}

function providerFailure(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message.slice(0, 300))
  }
  return new Error(fallback)
}

export function resendConfigured() {
  try {
    return resendApiKey.value().startsWith('re_')
  } catch {
    return false
  }
}

export function shouldUpdateContactSubscription(
  currentlyUnsubscribed: boolean,
  targetSubscribed: boolean,
  allowResubscribe = false,
) {
  return !targetSubscribed || !currentlyUnsubscribed || allowResubscribe
}

export async function ensureNewsletterSegment(): Promise<string> {
  const stored = await providerConfigRef.get()
  const storedId = stored.exists && typeof stored.data()?.segmentId === 'string' ? String(stored.data()!.segmentId) : ''
  if (storedId) return storedId

  const resend = client()
  const listed = await resend.segments.list({ limit: 100 })
  if (listed.error) throw providerFailure(listed.error, 'Could not list newsletter segments.')
  const existing = listed.data?.data.find((segment) => segment.name === managedSegmentName)
  const segmentId = existing?.id ?? (await (async () => {
    const created = await resend.segments.create({ name: managedSegmentName })
    if (created.error || !created.data?.id) throw providerFailure(created.error, 'Could not create the newsletter segment.')
    return created.data.id
  })())

  await providerConfigRef.set({ provider: 'resend', segmentId, segmentName: managedSegmentName, updatedAt: new Date() }, { merge: true })
  return segmentId
}

async function getContact(email: string) {
  const result = await client().contacts.get(email)
  if (result.data) return result.data
  if (result.error?.statusCode === 404) return null
  throw providerFailure(result.error, 'Could not read a newsletter contact.')
}

export async function syncNewsletterContact(
  email: string,
  subscribed: boolean,
  segmentId?: string,
  options: { allowResubscribe?: boolean } = {},
) {
  const resend = client()
  const contact = await getContact(email)
  if (!contact) {
    const created = await resend.contacts.create({
      email,
      unsubscribed: !subscribed,
      ...(subscribed && segmentId ? { segments: [{ id: segmentId }] } : {}),
    })
    if (created.error) throw providerFailure(created.error, 'Could not create a newsletter contact.')
    return
  }

  // Provider opt-outs are authoritative during routine campaign preparation.
  // Only a fresh, explicit consent action may clear a contact's unsubscribe.
  const shouldUpdateSubscription = shouldUpdateContactSubscription(
    contact.unsubscribed,
    subscribed,
    options.allowResubscribe === true,
  )
  if (shouldUpdateSubscription) {
    const updated = await resend.contacts.update({ email, unsubscribed: !subscribed })
    if (updated.error) throw providerFailure(updated.error, 'Could not update a newsletter contact.')
  }
  if (subscribed && segmentId) {
    const memberships = await resend.contacts.segments.list({ email })
    if (memberships.error) throw providerFailure(memberships.error, 'Could not read newsletter contact membership.')
    if (!memberships.data?.data.some((segment) => segment.id === segmentId)) {
      const added = await resend.contacts.segments.add({ email, segmentId })
      if (added.error) throw providerFailure(added.error, 'Could not add a newsletter contact to the sending segment.')
    }
  }
}

export async function listManagedSegmentContacts(segmentId: string) {
  const resend = client()
  const emails: string[] = []
  let after: string | undefined
  for (let page = 0; page < 1_000; page += 1) {
    const result = await resend.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) })
    if (result.error) throw providerFailure(result.error, 'Could not read the newsletter audience.')
    const contacts = result.data?.data ?? []
    emails.push(...contacts.map((contact) => contact.email.trim().toLowerCase()))
    if (!result.data?.has_more || contacts.length === 0) break
    if (page === 999) throw new Error('The provider audience is too large to process safely in one request.')
    after = contacts[contacts.length - 1].id
  }
  return emails
}

export function resendClient() {
  return client()
}

// Transactional confirmation messages use the same authenticated sending
// domain, while marketing campaigns remain on the Broadcast API.
registerTransactionalTransport('resend', async (message) => {
  const queue = await beginEmailQueueItem({ kind: 'transactional', subject: message.subject, recipientLabel: message.to, recipientCount: 1 })
  try {
    const sent = await client().emails.send({
      from: newsletterFromParam.value(),
      replyTo: newsletterReplyToParam.value(),
      to: message.to,
      subject: message.subject,
      text: message.text,
    })
    if (sent.error) throw providerFailure(sent.error, 'The email provider rejected the message.')
    await queue.set({ status: 'sent', acceptedCount: 1, providerMessageId: sent.data?.id ?? null, sentAt: new Date(), updatedAt: new Date() }, { merge: true })
    logger.info('Transactional email accepted by provider.', { provider: 'resend', messageId: sent.data?.id })
  } catch (error) {
    await queue.set({ status: 'failed', failedCount: 1, lastError: 'The email provider rejected the message.', updatedAt: new Date() }, { merge: true })
    throw error
  }
})
