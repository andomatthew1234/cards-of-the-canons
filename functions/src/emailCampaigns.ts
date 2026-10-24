import { createHash, randomUUID } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { z } from 'zod'
import { ADMIN_RECENT_AUTH_SECONDS, authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { beginEmailQueueItem, emailQueueItemForClient, updateEmailQueueItem } from './emailQueue'
import { db } from './firebase'
import { publicSiteOriginParam } from './mailTransport'
import { normaliseNewsletterEmail } from './newsletter'
import { synchroniseAudience } from './newsletterCampaigns'
import {
  ensureNewsletterSegment, newsletterFromParam, newsletterReplyToParam,
  resendApiKey, resendClient, resendConfigured, syncNewsletterContact,
} from './resendProvider'

const region = 'australia-southeast1'
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const providerOptions = { ...protectedOptions, secrets: [resendApiKey], timeoutSeconds: 540, memory: '512MiB' as const }
const campaignIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,80}$/)
const secureUrl = z.union([z.literal(''), z.string().url().max(1000).refine((value) => value.startsWith('https://'), 'Use a secure https:// link.')])
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour.')

const blockStyleShape = {
  backgroundColor: colour.default('#fffaf0'),
  textColor: colour.default('#2d1c15'),
  borderColor: colour.default('#d9c29a'),
  borderWidth: z.number().int().min(0).max(8).default(0),
  borderRadius: z.number().int().min(0).max(40).default(0),
  padding: z.number().int().min(0).max(80).default(12),
  fontFamily: z.enum(['serif', 'sans']).default('serif'),
  fontSize: z.number().int().min(10).max(64).optional(),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  lineHeight: z.number().min(1).max(2.4).default(1.6),
  width: z.number().int().min(10).max(100).default(100),
}

const relaxedLeafBlockSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,80}$/),
  type: z.enum(['heading', 'paragraph', 'image', 'button', 'link', 'divider', 'spacer']),
  text: z.string().max(6000).default(''),
  url: secureUrl.default(''),
  alt: z.string().max(240).default(''),
  caption: z.string().max(300).default(''),
  align: z.enum(['left', 'center', 'right']).default('left'),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  ...blockStyleShape,
}).strict()

const relaxedColumnsBlockSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,80}$/),
  type: z.literal('columns'),
  text: z.string().max(6000).default(''),
  url: secureUrl.default(''),
  alt: z.string().max(240).default(''),
  caption: z.string().max(300).default(''),
  align: z.enum(['left', 'center', 'right']).default('left'),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  columns: z.array(z.array(relaxedLeafBlockSchema).min(1).max(12)).min(2).max(3),
  ...blockStyleShape,
}).strict()

const relaxedBlockSchema = z.discriminatedUnion('type', [relaxedLeafBlockSchema, relaxedColumnsBlockSchema])

function validateLeafBlock(block: z.infer<typeof relaxedLeafBlockSchema>, context: z.RefinementCtx) {
  if (['heading', 'paragraph'].includes(block.type) && block.text.trim().length === 0) context.addIssue({ code: 'custom', message: 'Text blocks cannot be empty.' })
  if (['button', 'link'].includes(block.type) && (!block.text.trim() || !block.url)) context.addIssue({ code: 'custom', message: 'Links and buttons need a label and secure URL.' })
  if (block.type === 'image' && (!block.url || block.alt.trim().length < 3)) context.addIssue({ code: 'custom', message: 'Images need a secure URL and description.' })
}

const blockSchema = relaxedBlockSchema.superRefine((block, context) => {
  if (block.type === 'columns') block.columns.flat().forEach((child) => validateLeafBlock(child, context))
  else validateLeafBlock(block, context)
})

const draftSaveSchema = z.object({
  id: campaignIdSchema.optional(),
  revision: z.number().int().nonnegative().default(0),
  name: z.string().trim().max(120).default(''),
  subject: z.string().trim().max(140).default(''),
  previewText: z.string().trim().max(180).default(''),
  blocks: z.array(relaxedBlockSchema).max(40).default([]),
  purpose: z.enum(['marketing', 'service']).default('marketing'),
  audience: z.enum(['mailing_list', 'all_accounts', 'individuals']).default('mailing_list'),
  recipientEmails: z.array(z.string().trim().email().max(160)).max(250).default([]),
}).strict()

const draftSchema = z.object({
  id: campaignIdSchema.optional(),
  revision: z.number().int().nonnegative().default(0),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(140),
  previewText: z.string().trim().max(180).default(''),
  blocks: z.array(blockSchema).min(1).max(40),
  purpose: z.enum(['marketing', 'service']).default('marketing'),
  audience: z.enum(['mailing_list', 'all_accounts', 'individuals']).default('mailing_list'),
  recipientEmails: z.array(z.string().trim().email().max(160)).max(250).default([]),
}).strict().superRefine((campaign, context) => {
  if (campaign.audience === 'all_accounts' && campaign.purpose !== 'service') context.addIssue({ code: 'custom', message: 'Website accounts can only receive necessary service messages.' })
  if (campaign.audience === 'individuals' && campaign.recipientEmails.length === 0) context.addIssue({ code: 'custom', message: 'Choose at least one recipient.' })
})

type CampaignDraft = z.infer<typeof draftSchema>
type EmailBlock = z.infer<typeof blockSchema>

export function parseEmailCampaignDraft(value: unknown) {
  return draftSchema.parse(value)
}

export function parseEmailCampaignSaveDraft(value: unknown) {
  return draftSaveSchema.parse(value)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function boxStyle(block: EmailBlock) {
  const family = block.fontFamily === 'sans' ? 'Arial,sans-serif' : 'Georgia,serif'
  return `background:${block.backgroundColor};color:${block.textColor};padding:${block.padding}px;border:${block.borderWidth}px solid ${block.borderColor};border-radius:${block.borderRadius}px;font-family:${family}`
}

function blockHtml(block: EmailBlock): string {
  const align = `text-align:${block.align}`
  if (block.type === 'columns') {
    const width = Math.floor(100 / block.columns.length)
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;table-layout:fixed;${boxStyle(block)}"><tr>${block.columns.map((column) => `<td width="${width}%" valign="top" style="width:${width}%;padding:8px">${column.map(blockHtml).join('')}</td>`).join('')}</tr></table>`
  }
  if (block.type === 'heading') return `<h2 style="margin:0 0 18px;${align};${boxStyle(block)};font-size:${block.fontSize ?? (block.size === 'large' ? 34 : block.size === 'small' ? 22 : 28)}px;font-weight:${block.fontWeight};line-height:${block.lineHeight}">${escapeHtml(block.text)}</h2>`
  if (block.type === 'paragraph') return `<p style="margin:0 0 18px;${align};${boxStyle(block)};font-size:${block.fontSize ?? 16}px;font-weight:${block.fontWeight};line-height:${block.lineHeight};white-space:pre-line">${escapeHtml(block.text)}</p>`
  if (block.type === 'image') return `<figure style="margin:8px 0 24px;${align};${boxStyle(block)}"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" style="display:inline-block;width:${block.width}%;max-width:560px;height:auto;border-radius:${block.borderRadius}px;border:${block.borderWidth}px solid ${block.borderColor}">${block.caption ? `<figcaption style="margin-top:8px;color:${block.textColor};font:12px/1.5 Arial,sans-serif">${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`
  if (block.type === 'button') return `<p style="margin:24px 0;${align}"><a href="${escapeHtml(block.url)}" style="display:inline-block;${boxStyle(block)};font-size:${block.fontSize ?? 16}px;font-weight:${block.fontWeight};line-height:${block.lineHeight};text-decoration:none">${escapeHtml(block.text)}</a></p>`
  if (block.type === 'link') return `<p style="margin:0 0 18px;${align};padding:${block.padding}px"><a href="${escapeHtml(block.url)}" style="color:${block.textColor};font-size:${block.fontSize ?? 16}px;font-weight:${block.fontWeight};line-height:${block.lineHeight};text-decoration:underline">${escapeHtml(block.text)}</a></p>`
  if (block.type === 'divider') return `<hr style="border:0;border-top:${Math.max(1, block.borderWidth)}px solid ${block.backgroundColor};margin:${block.padding}px 0">`
  return `<div aria-hidden="true" style="height:${block.padding}px;line-height:1px">&nbsp;</div>`
}

function blockText(block: EmailBlock): string {
  if (block.type === 'columns') return block.columns.flat().map(blockText).filter(Boolean).join('\n\n')
  if (block.type === 'heading' || block.type === 'paragraph') return block.text
  if (block.type === 'button' || block.type === 'link') return `${block.text}: ${block.url}`
  if (block.type === 'image') return block.caption || block.alt
  if (block.type === 'divider') return '—'
  return ''
}

export function renderEmailCampaign(campaign: Pick<CampaignDraft, 'previewText' | 'blocks' | 'purpose'>) {
  const origin = publicSiteOriginParam.value().replace(/\/$/, '')
  const footer = campaign.purpose === 'marketing'
    ? `You are receiving this because you asked to hear from Doxa Cards. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#6f481d">Unsubscribe</a> at any time.`
    : `This service message relates to your Doxa Cards account. Review your settings at <a href="${origin}/account" style="color:#6f481d">doxatreasury.com/account</a>.`
  const html = `<!doctype html><html><body style="margin:0;background:#f3ecdf;font-family:Georgia,serif;color:#2b1b13"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(campaign.previewText)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3ecdf;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf0;border:1px solid #d4b06b"><tr><td style="padding:22px 34px;background:#2d1c15;color:#f7dfaa;font-size:22px">Doxa Cards</td></tr><tr><td style="padding:38px 34px">${campaign.blocks.map(blockHtml).join('')}<p style="margin:34px 0 0;padding-top:22px;border-top:1px solid #dfccb0;font:12px/1.6 Arial,sans-serif;color:#78695e">${footer}</p></td></tr></table></td></tr></table></body></html>`
  const textFooter = campaign.purpose === 'marketing'
    ? 'You are receiving this because you asked to hear from Doxa Cards. Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}'
    : `This service message relates to your Doxa Cards account. Settings: ${origin}/account`
  return { html, text: `${campaign.blocks.map(blockText).filter(Boolean).join('\n\n')}\n\n${textFooter}` }
}

function iso(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

function campaignForClient(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    revision: Number(data.revision ?? 0),
    name: String(data.name ?? ''),
    subject: String(data.subject ?? ''),
    previewText: String(data.previewText ?? ''),
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    purpose: data.purpose === 'service' ? 'service' : 'marketing',
    audience: ['all_accounts', 'individuals'].includes(data.audience) ? data.audience : 'mailing_list',
    recipientEmails: Array.isArray(data.recipientEmails) ? data.recipientEmails : [],
    status: String(data.status ?? 'draft'),
    recipientCount: Number(data.recipientCount ?? 0),
    acceptedCount: Number(data.acceptedCount ?? 0),
    failedCount: Number(data.failedCount ?? 0),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    scheduledAt: iso(data.scheduledAt),
    sentAt: iso(data.sentAt),
    lastError: typeof data.lastError === 'string' ? data.lastError : null,
  }
}

function storedDraft(id: string, data: FirebaseFirestore.DocumentData): CampaignDraft {
  const parsed = draftSchema.safeParse({
    id,
    revision: Number(data.revision ?? 0),
    name: data.name,
    subject: data.subject,
    previewText: data.previewText ?? '',
    blocks: data.blocks,
    purpose: data.purpose ?? 'marketing',
    audience: data.audience ?? 'mailing_list',
    recipientEmails: data.recipientEmails ?? [],
  })
  if (!parsed.success) throw new HttpsError('failed-precondition', parsed.error.issues[0]?.message ?? 'Complete the campaign before sending it.')
  return parsed.data
}

async function subscribedEmails() {
  const snapshot = await db.collection('newsletterSubscribers').where('status', '==', 'subscribed').limit(50_000).get()
  return snapshot.docs.map((document) => normaliseNewsletterEmail(document.data().email)).filter(Boolean)
}

async function verifiedAccountEmails() {
  const emails: string[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 50; page += 1) {
    const result = await getAuth().listUsers(1000, pageToken)
    emails.push(...result.users.filter((user) => !user.disabled && user.emailVerified && user.email).map((user) => normaliseNewsletterEmail(user.email)))
    pageToken = result.pageToken
    if (!pageToken) return emails
  }
  throw new HttpsError('resource-exhausted', 'The account audience is too large to prepare safely in one request.')
}

async function resolveRecipients(campaign: CampaignDraft) {
  if (campaign.audience === 'mailing_list') return [...new Set(await subscribedEmails())]
  if (campaign.audience === 'all_accounts') return [...new Set(await verifiedAccountEmails())]
  const requested = [...new Set(campaign.recipientEmails.map(normaliseNewsletterEmail).filter(Boolean))]
  if (campaign.purpose === 'marketing') {
    const allowed = new Set(await subscribedEmails())
    const denied = requested.filter((email) => !allowed.has(email))
    if (denied.length) throw new HttpsError('failed-precondition', 'Marketing campaigns can only be sent to confirmed subscribers.')
    return requested
  }
  const allowed = new Set([...(await verifiedAccountEmails()), ...(await subscribedEmails())])
  const denied = requested.filter((email) => !allowed.has(email))
  if (denied.length) throw new HttpsError('failed-precondition', 'One or more selected recipients is not an active verified account or confirmed subscriber.')
  return requested
}

async function prepareBroadcast(campaignId: string, campaign: CampaignDraft, recipients: string[], existingProviderId: string) {
  if (existingProviderId) {
    const existing = await resendClient().broadcasts.get(existingProviderId)
    if (existing.error || !existing.data) throw new Error('The email provider status could not be confirmed safely.')
    if (existing.data.status === 'queued' || existing.data.status === 'sent') return { providerBroadcastId: existingProviderId, alreadySent: true }
    const existingSegmentId = existing.data.segment_id
    if (!existingSegmentId) throw new Error('The email provider draft is missing its audience.')
    if (campaign.audience === 'mailing_list') await synchroniseAudience(existingSegmentId)
    else for (const email of recipients) await syncNewsletterContact(email, true, existingSegmentId)
    return { providerBroadcastId: existingProviderId, alreadySent: false }
  }

  let segmentId = ''
  if (campaign.audience === 'mailing_list') {
    segmentId = await ensureNewsletterSegment()
    await synchroniseAudience(segmentId)
  } else {
    const segment = await resendClient().segments.create({ name: `Doxa campaign ${campaignId}`.slice(0, 100) })
    if (segment.error || !segment.data?.id) throw new Error('The email provider could not create the selected audience.')
    segmentId = segment.data.id
    for (const email of recipients) await syncNewsletterContact(email, true, segmentId)
  }
  const rendered = renderEmailCampaign(campaign)
  const created = await resendClient().broadcasts.create({
    segmentId,
    name: `Doxa · ${campaign.name}`.slice(0, 120),
    from: newsletterFromParam.value(),
    replyTo: newsletterReplyToParam.value(),
    subject: campaign.subject,
    previewText: campaign.previewText,
    html: rendered.html,
    text: rendered.text,
  })
  if (created.error || !created.data?.id) throw new Error('The email provider could not prepare the campaign.')
  return { providerBroadcastId: created.data.id, alreadySent: false }
}

async function sendDirect(campaignId: string, campaign: CampaignDraft, recipients: string[]) {
  const rendered = renderEmailCampaign(campaign)
  let acceptedCount = 0
  let failedCount = 0
  let index = 0
  await Promise.all(Array.from({ length: Math.min(8, recipients.length) }, async () => {
    while (index < recipients.length) {
      const email = recipients[index]
      index += 1
      const recipientHash = createHash('sha256').update(email).digest('hex')
      const deliveryRef = db.collection('emailCampaigns').doc(campaignId).collection('deliveries').doc(recipientHash)
      const existing = await deliveryRef.get()
      if (existing.data()?.status === 'accepted') { acceptedCount += 1; continue }
      const accountUrl = `${publicSiteOriginParam.value().replace(/\/$/, '')}/account`
      const result = await resendClient().emails.send({
        from: newsletterFromParam.value(),
        replyTo: newsletterReplyToParam.value(),
        to: email,
        subject: campaign.subject,
        html: rendered.html.replace('{{{RESEND_UNSUBSCRIBE_URL}}}', accountUrl),
        text: rendered.text.replace('{{{RESEND_UNSUBSCRIBE_URL}}}', accountUrl),
      }, { idempotencyKey: `campaign-${campaignId}-${recipientHash}`.slice(0, 256) })
      if (result.error) {
        failedCount += 1
        await deliveryRef.set({ email, status: 'failed', updatedAt: Timestamp.now(), error: 'Provider rejected this recipient.' }, { merge: true })
      } else {
        acceptedCount += 1
        await deliveryRef.set({ email, status: 'accepted', providerMessageId: result.data?.id ?? null, updatedAt: Timestamp.now() }, { merge: true })
      }
    }
  }))
  return { acceptedCount, failedCount }
}

async function deliverCampaign(campaignId: string, actorUid: string) {
  const ref = db.collection('emailCampaigns').doc(campaignId)
  const leaseId = randomUUID()
  const queueId = `campaign_${campaignId}`
  const snapshot = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref)
    if (!current.exists) throw new HttpsError('not-found', 'Email campaign not found.')
    const data = current.data()!
    if (data.status === 'sent' || data.status === 'queued') return current
    const leaseUntil = data.leaseExpiresAt instanceof Timestamp ? data.leaseExpiresAt.toMillis() : 0
    if (data.status === 'preparing' && leaseUntil > Date.now()) throw new HttpsError('aborted', 'This campaign is already being prepared.')
    if (!['draft', 'scheduled', 'failed', 'partially_sent', 'preparing'].includes(String(data.status))) throw new HttpsError('failed-precondition', 'This campaign cannot be sent in its current state.')
    storedDraft(current.id, data)
    transaction.set(ref, { status: 'preparing', leaseId, leaseExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), updatedAt: Timestamp.now(), updatedBy: actorUid }, { merge: true })
    return current
  })
  if (snapshot.data()?.status === 'sent' || snapshot.data()?.status === 'queued') return campaignForClient(snapshot.id, snapshot.data()!)
  const campaign = storedDraft(snapshot.id, snapshot.data()!)
  await beginEmailQueueItem({ id: queueId, kind: 'campaign', subject: campaign.subject, recipientLabel: campaign.audience === 'mailing_list' ? 'Everyone on the mailing list' : campaign.audience === 'all_accounts' ? 'All verified website accounts' : 'Selected recipients', recipientCount: 0, sourceId: campaignId, createdBy: actorUid })
  try {
    const recipients = await resolveRecipients(campaign)
    if (!recipients.length) throw new HttpsError('failed-precondition', 'There are no eligible recipients in this audience.')
    let providerMessageId = typeof snapshot.data()?.providerMessageId === 'string' ? snapshot.data()!.providerMessageId : ''
    let acceptedCount = 0
    let failedCount = 0
    let status: 'queued' | 'sent' | 'partially_sent'
    if (campaign.purpose === 'marketing') {
      const prepared = await prepareBroadcast(campaignId, campaign, recipients, providerMessageId)
      providerMessageId = prepared.providerBroadcastId
      // Persist the provider draft before sending. If execution stops after
      // this write, a retry reconciles or sends this exact provider object.
      await ref.set({ providerMessageId, updatedAt: Timestamp.now() }, { merge: true })
      await updateEmailQueueItem(queueId, { providerMessageId, recipientCount: recipients.length })
      if (!prepared.alreadySent) {
        const sent = await resendClient().broadcasts.send(providerMessageId)
        if (sent.error) throw new Error('The email provider did not accept the campaign.')
      }
      acceptedCount = recipients.length
      status = 'queued'
    } else {
      const result = await sendDirect(campaignId, campaign, recipients)
      acceptedCount = result.acceptedCount
      failedCount = result.failedCount
      status = failedCount ? 'partially_sent' : 'sent'
    }
    const now = Timestamp.now()
    await ref.set({ status, recipientCount: recipients.length, acceptedCount, failedCount, providerMessageId: providerMessageId || null, sentAt: now, updatedAt: now, sentBy: actorUid, leaseId: null, leaseExpiresAt: null, lastError: failedCount ? `${failedCount} recipient${failedCount === 1 ? '' : 's'} could not be accepted.` : null }, { merge: true })
    await updateEmailQueueItem(queueId, { status, recipientCount: recipients.length, acceptedCount, failedCount, providerMessageId: providerMessageId || null, sentAt: now, lastError: failedCount ? `${failedCount} recipient${failedCount === 1 ? '' : 's'} could not be accepted.` : null })
    return campaignForClient(campaignId, (await ref.get()).data()!)
  } catch (error) {
    const message = error instanceof HttpsError ? error.message : 'The campaign could not be sent. No new delivery was recorded.'
    await ref.set({ status: 'failed', lastError: message, leaseId: null, leaseExpiresAt: null, updatedAt: Timestamp.now() }, { merge: true })
    await updateEmailQueueItem(queueId, { status: 'failed', lastError: message })
    if (error instanceof HttpsError) throw error
    throw new HttpsError('unavailable', message)
  }
}

async function reconcileQueuedBroadcasts(documents: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const candidates = documents
    .filter((document) => document.data().status === 'queued' && typeof document.data().providerMessageId === 'string')
    .filter((document) => ['campaign', 'journal', 'newsletter'].includes(String(document.data().kind)))
    .slice(0, 20)
  if (!candidates.length) return false
  let changed = false
  await Promise.allSettled(candidates.map(async (document) => {
    const data = document.data()
    const result = await resendClient().broadcasts.get(String(data.providerMessageId))
    if (result.error || result.data?.status !== 'sent') return
    changed = true
    const sentAt = result.data.sent_at ? Timestamp.fromDate(new Date(result.data.sent_at)) : Timestamp.now()
    await document.ref.set({ status: 'sent', sentAt, updatedAt: Timestamp.now() }, { merge: true })
    if (data.kind === 'campaign' && typeof data.sourceId === 'string') {
      await db.collection('emailCampaigns').doc(data.sourceId).set({ status: 'sent', sentAt, updatedAt: Timestamp.now() }, { merge: true })
    }
    if ((data.kind === 'journal' || data.kind === 'newsletter') && typeof data.sourceId === 'string') {
      await db.collection('newsletterCampaigns').doc(data.sourceId).set({ status: 'sent', sentAt, updatedAt: Timestamp.now() }, { merge: true })
    }
  }))
  return changed
}

export const listEmailCampaignWorkspace = onCall(providerOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const [initialCampaigns, initialQueue, subscriberCount, accountEmails] = await Promise.all([
    db.collection('emailCampaigns').orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection('emailQueue').orderBy('createdAt', 'desc').limit(250).get(),
    db.collection('newsletterSubscribers').where('status', '==', 'subscribed').count().get(),
    verifiedAccountEmails(),
  ])
  const changed = resendConfigured() ? await reconcileQueuedBroadcasts(initialQueue.docs) : false
  const [campaigns, queue] = changed ? await Promise.all([
    db.collection('emailCampaigns').orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection('emailQueue').orderBy('createdAt', 'desc').limit(250).get(),
  ]) : [initialCampaigns, initialQueue]
  return {
    configured: resendConfigured(),
    audienceCounts: {
      mailingList: subscriberCount.data().count,
      verifiedAccounts: new Set(accountEmails).size,
    },
    campaigns: campaigns.docs.map((document) => campaignForClient(document.id, document.data())),
    queue: queue.docs.map((document) => emailQueueItemForClient(document.id, document.data())),
  }
})

export const saveEmailCampaign = onCall(protectedOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = draftSaveSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the email campaign.')
  const id = parsed.data.id ?? randomUUID()
  const ref = db.collection('emailCampaigns').doc(id)
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    const currentRevision = Number(existing.data()?.revision ?? 0)
    if (existing.exists && currentRevision !== parsed.data.revision) throw new HttpsError('aborted', 'This campaign changed elsewhere. Reload it before saving again.')
    if (existing.exists && String(existing.data()?.status) !== 'draft') throw new HttpsError('failed-precondition', 'Cancel a scheduled campaign before editing it. Sent campaigns are locked as delivery records.')
    const { id: _id, revision: _revision, ...draft } = parsed.data
    const now = Timestamp.now()
    transaction.set(ref, { ...draft, status: 'draft', revision: currentRevision + 1, updatedAt: now, updatedBy: caller.uid, scheduledAt: null, lastError: null, ...(existing.exists ? {} : { createdAt: now, createdBy: caller.uid }) }, { merge: true })
  })
  return { campaign: campaignForClient(id, (await ref.get()).data()!) }
})

export const deleteEmailCampaign = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = z.object({ campaignId: campaignIdSchema }).strict().safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid campaign.')
  const ref = db.collection('emailCampaigns').doc(parsed.data.campaignId)
  const snapshot = await ref.get()
  if (!snapshot.exists) return { deleted: true }
  if (!['draft', 'cancelled'].includes(String(snapshot.data()?.status))) throw new HttpsError('failed-precondition', 'Only unsent drafts can be deleted.')
  await ref.delete()
  return { deleted: true }
})

export const sendEmailCampaignTest = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireAdmin: true, requireVerifiedEmail: true, requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS })
  const parsed = draftSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the email campaign.')
  if (!caller.email) throw new HttpsError('failed-precondition', 'Your administrator account needs a verified email address.')
  const rendered = renderEmailCampaign(parsed.data)
  const accountUrl = `${publicSiteOriginParam.value().replace(/\/$/, '')}/account`
  const queue = await beginEmailQueueItem({ kind: 'test', subject: `[TEST] ${parsed.data.subject}`, recipientLabel: caller.email, recipientCount: 1, createdBy: caller.uid })
  try {
    const result = await resendClient().emails.send({ from: newsletterFromParam.value(), replyTo: newsletterReplyToParam.value(), to: caller.email, subject: `[TEST] ${parsed.data.subject}`, html: rendered.html.replace('{{{RESEND_UNSUBSCRIBE_URL}}}', accountUrl), text: rendered.text.replace('{{{RESEND_UNSUBSCRIBE_URL}}}', accountUrl) }, { idempotencyKey: `campaign-test-${caller.uid}-${randomUUID()}` })
    if (result.error) throw new Error('Provider rejected the test.')
    await queue.set({ status: 'sent', acceptedCount: 1, sentAt: Timestamp.now(), providerMessageId: result.data?.id ?? null, updatedAt: Timestamp.now() }, { merge: true })
    return { sent: true, to: caller.email }
  } catch {
    await queue.set({ status: 'failed', failedCount: 1, lastError: 'The test email could not be sent.', updatedAt: Timestamp.now() }, { merge: true })
    throw new HttpsError('unavailable', 'The test email could not be sent.')
  }
})

const actionSchema = z.object({ campaignId: campaignIdSchema, action: z.enum(['send_now', 'schedule']), scheduledAt: z.string().datetime().optional() }).strict()

export const queueEmailCampaign = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireAdmin: true, requireVerifiedEmail: true, requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS })
  const parsed = actionSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose whether to send now or schedule a valid date and time.')
  const ref = db.collection('emailCampaigns').doc(parsed.data.campaignId)
  if (parsed.data.action === 'schedule') {
    const scheduledMs = Date.parse(parsed.data.scheduledAt ?? '')
    if (!Number.isFinite(scheduledMs) || scheduledMs < Date.now() + 60_000 || scheduledMs > Date.now() + 366 * 24 * 60 * 60 * 1000) throw new HttpsError('invalid-argument', 'Choose a sending time between one minute and one year from now.')
    const snapshot = await ref.get()
    if (!snapshot.exists || snapshot.data()?.status !== 'draft') throw new HttpsError('failed-precondition', 'Save this campaign as a draft before scheduling it.')
    const scheduledAt = Timestamp.fromMillis(scheduledMs)
    await ref.set({ status: 'scheduled', scheduledAt, updatedAt: Timestamp.now(), updatedBy: caller.uid }, { merge: true })
    await beginEmailQueueItem({ id: `campaign_${parsed.data.campaignId}`, kind: 'campaign', subject: String(snapshot.data()?.subject ?? ''), recipientLabel: 'Scheduled campaign audience', recipientCount: 0, sourceId: parsed.data.campaignId, createdBy: caller.uid, status: 'scheduled', scheduledAt })
    return { campaign: campaignForClient(parsed.data.campaignId, (await ref.get()).data()!) }
  }
  return { campaign: await deliverCampaign(parsed.data.campaignId, caller.uid) }
})

export const cancelScheduledEmailCampaign = onCall(protectedOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = z.object({ campaignId: campaignIdSchema }).strict().safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid campaign.')
  const ref = db.collection('emailCampaigns').doc(parsed.data.campaignId)
  const snapshot = await ref.get()
  if (!snapshot.exists || snapshot.data()?.status !== 'scheduled') throw new HttpsError('failed-precondition', 'Only a scheduled campaign can be cancelled.')
  await ref.set({ status: 'cancelled', scheduledAt: null, updatedAt: Timestamp.now(), updatedBy: caller.uid }, { merge: true })
  await updateEmailQueueItem(`campaign_${parsed.data.campaignId}`, { status: 'cancelled', scheduledAt: null })
  return { campaign: campaignForClient(parsed.data.campaignId, (await ref.get()).data()!) }
})

export const retryEmailCampaign = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireAdmin: true, requireVerifiedEmail: true, requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS })
  const parsed = z.object({ campaignId: campaignIdSchema }).strict().safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid campaign.')
  const snapshot = await db.collection('emailCampaigns').doc(parsed.data.campaignId).get()
  if (!snapshot.exists || !['failed', 'partially_sent'].includes(String(snapshot.data()?.status))) throw new HttpsError('failed-precondition', 'Only a failed campaign can be retried.')
  return { campaign: await deliverCampaign(parsed.data.campaignId, caller.uid) }
})

export const processScheduledEmailCampaigns = onSchedule({ region, schedule: 'every 1 minutes', timeZone: 'Australia/Sydney', secrets: [resendApiKey], timeoutSeconds: 540, memory: '512MiB' }, async () => {
  const due = await db.collection('emailCampaigns').where('status', '==', 'scheduled').where('scheduledAt', '<=', Timestamp.now()).orderBy('scheduledAt', 'asc').limit(20).get()
  await Promise.allSettled(due.docs.map((document) => deliverCampaign(document.id, 'scheduler')))
})
