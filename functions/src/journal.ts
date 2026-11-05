import { randomUUID } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { ADMIN_RECENT_AUTH_SECONDS, authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { publicSiteOriginParam } from './mailTransport'
import { queueNewsletterCampaign } from './newsletterCampaigns'
import { resendApiKey } from './resendProvider'

const region = 'australia-southeast1'
const protectedOptions = { region, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const providerOptions = { ...protectedOptions, secrets: [resendApiKey], timeoutSeconds: 300, memory: '512MiB' as const }

const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens.')
const articleFields = z.object({
  id: z.string().trim().regex(/^[a-zA-Z0-9_-]{10,80}$/).optional(),
  revision: z.number().int().nonnegative().default(0),
  slug,
  title: z.string().trim().min(2).max(180),
  excerpt: z.string().trim().min(10).max(500),
  bodyMarkdown: z.string().trim().min(20).max(100_000),
  category: z.string().trim().min(2).max(80),
  coverImageUrl: z.string().trim().max(1000).refine((value) => value === '' || value.startsWith('/') || /^https:\/\//i.test(value), 'Use a secure image URL.').default(''),
  coverImageAlt: z.string().trim().max(240).default(''),
  authorName: z.string().trim().min(2).max(100).default('Doxa Treasury'),
  seoTitle: z.string().trim().max(70).default(''),
  seoDescription: z.string().trim().max(180).default(''),
  featured: z.boolean().default(false),
}).strict().refine((value) => !value.coverImageUrl || value.coverImageAlt.length >= 3, { message: 'Describe the cover image for screen readers.' })

const articleId = z.object({ articleId: z.string().regex(/^[a-zA-Z0-9_-]{10,80}$/) }).strict()
const deleteInput = articleId.extend({ revision: z.number().int().nonnegative() }).strict()
const publishInput = articleFields.extend({ sendNotification: z.boolean().default(true) }).strict()
const listInput = z.object({
  cursor: z.string().regex(/^[a-zA-Z0-9_-]{10,80}$/).optional(),
  pageSize: z.number().int().min(1).max(50).default(30),
}).strict()

function iso(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

function markdownPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~|]/g, ' ')
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Produces the short story passage used in Journal release emails. Markdown
 * syntax and raw HTML are removed before truncation, and truncation happens at
 * a word boundary so recipient previews never end with a cut-off word.
 */
export function journalBodyPreview(bodyMarkdown: string, excerpt: string, maxLength = 100) {
  const candidates = [markdownPlainText(bodyMarkdown), markdownPlainText(excerpt)].filter(Boolean)
  for (const candidate of candidates) {
    if (candidate.length <= maxLength) return candidate
    const boundary = candidate.lastIndexOf(' ', maxLength + 1)
    if (boundary > 0) return `${candidate.slice(0, boundary).trimEnd()}…`
  }
  return ''
}

function forClient(document: FirebaseFirestore.DocumentSnapshot) {
  const data = document.data() ?? {}
  return {
    id: document.id, revision: Number(data.revision ?? 0), slug: String(data.slug ?? ''), title: String(data.title ?? ''),
    excerpt: String(data.excerpt ?? ''), bodyMarkdown: String(data.bodyMarkdown ?? ''), category: String(data.category ?? ''),
    coverImageUrl: String(data.coverImageUrl ?? ''), coverImageAlt: String(data.coverImageAlt ?? ''), authorName: String(data.authorName ?? 'Doxa Treasury'),
    seoTitle: String(data.seoTitle ?? ''), seoDescription: String(data.seoDescription ?? ''), featured: data.featured === true,
    status: data.status === 'published' ? 'published' : data.status === 'archived' ? 'archived' : 'draft', createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), publishedAt: iso(data.publishedAt),
    notificationStatus: String(data.notificationStatus ?? 'not_requested'), notificationAudienceCount: Number(data.notificationAudienceCount ?? 0),
    notificationError: typeof data.notificationError === 'string' ? data.notificationError : null,
  }
}

export function assertJournalMutationAllowed(
  currentRevision: number,
  requestedRevision: number,
  status: unknown,
  mode: 'save' | 'publish',
) {
  if (currentRevision !== requestedRevision) {
    throw new HttpsError('aborted', `This entry changed elsewhere. Reload it before ${mode === 'save' ? 'saving again' : 'publishing'}.`)
  }
  if (status === 'archived') throw new HttpsError('failed-precondition', 'This Journal entry was archived and cannot be changed or republished.')
  if (mode === 'save' && status === 'published') throw new HttpsError('failed-precondition', 'Use Publish changes to update a live Journal entry.')
}

async function assertUniqueSlug(articleIdValue: string, slugValue: string) {
  const matches = await db.collection('articles').where('slug', '==', slugValue).limit(2).get()
  if (matches.docs.some((item) => item.id !== articleIdValue)) throw new HttpsError('already-exists', 'Another Journal entry already uses this address.')
}

export const listJournalArticlesAdmin = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = listInput.safeParse(request.data ?? {})
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid Journal page.')
  let pageQuery: FirebaseFirestore.Query = db.collection('articles')
    .where('status', 'in', ['draft', 'published'])
    .orderBy('updatedAt', 'desc')
  if (parsed.data.cursor) {
    const cursor = await db.collection('articles').doc(parsed.data.cursor).get()
    if (!cursor.exists || !['draft', 'published'].includes(String(cursor.data()?.status))) {
      throw new HttpsError('failed-precondition', 'This Journal page changed. Refresh the list and try again.')
    }
    pageQuery = pageQuery.startAfter(cursor)
  }
  const [snapshot, draftCount, publishedCount] = await Promise.all([
    pageQuery.limit(parsed.data.pageSize + 1).get(),
    db.collection('articles').where('status', '==', 'draft').count().get(),
    db.collection('articles').where('status', '==', 'published').count().get(),
  ])
  const visible = snapshot.docs.slice(0, parsed.data.pageSize)
  return {
    articles: visible.map(forClient),
    nextCursor: snapshot.docs.length > parsed.data.pageSize ? visible.at(-1)?.id ?? null : null,
    counts: { draft: draftCount.data().count, published: publishedCount.data().count },
  }
})

export const getJournalArticleAdmin = onCall(protectedOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = articleId.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid Journal entry.')
  const snapshot = await db.collection('articles').doc(parsed.data.articleId).get()
  if (!snapshot.exists || snapshot.data()?.status === 'archived') return { article: null }
  return { article: forClient(snapshot) }
})

export const saveJournalArticle = onCall(protectedOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = articleFields.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the Journal entry.')
  const id = parsed.data.id ?? randomUUID()
  await assertUniqueSlug(id, parsed.data.slug)
  const ref = db.collection('articles').doc(id)
  const now = Timestamp.now()
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    const currentRevision = Number(existing.data()?.revision ?? 0)
    if (existing.exists) assertJournalMutationAllowed(currentRevision, parsed.data.revision, existing.data()?.status, 'save')
    const { id: _id, revision: _revision, ...fields } = parsed.data
    transaction.set(ref, {
      ...fields, status: 'draft', revision: currentRevision + 1,
      updatedAt: now, updatedBy: caller.uid, ...(existing.exists ? {} : { createdAt: now, createdBy: caller.uid, notificationStatus: 'not_requested' }),
    }, { merge: true })
  })
  return { article: forClient(await ref.get()) }
})

export const publishJournalArticle = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireAdmin: true,
    requireVerifiedEmail: true,
    requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS,
  })
  const parsed = publishInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Check the Journal entry.')
  const id = parsed.data.id ?? randomUUID()
  await assertUniqueSlug(id, parsed.data.slug)
  const ref = db.collection('articles').doc(id)
  const now = Timestamp.now()
  const publication = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    const currentRevision = Number(existing.data()?.revision ?? 0)
    if (existing.exists) assertJournalMutationAllowed(currentRevision, parsed.data.revision, existing.data()?.status, 'publish')
    const firstPublication = existing.data()?.status !== 'published'
    const nextRevision = currentRevision + 1
    const campaignId = `journal_${id}_${nextRevision}`.slice(0, 80)
    const { id: _id, revision: _revision, sendNotification, ...fields } = parsed.data
    transaction.set(ref, {
      ...fields, status: 'published', revision: nextRevision, updatedAt: now, updatedBy: caller.uid,
      publishedAt: existing.data()?.publishedAt instanceof Timestamp ? existing.data()?.publishedAt : now,
      publishedBy: caller.uid, ...(existing.exists ? {} : { createdAt: now, createdBy: caller.uid }),
      ...(sendNotification && firstPublication ? { notificationStatus: 'preparing', notificationCampaignId: campaignId, notificationError: null } : {}),
    }, { merge: true })
    if (sendNotification && firstPublication) transaction.set(db.collection('newsletterCampaigns').doc(campaignId), {
      subject: `New from the Doxa Journal: ${fields.title}`.slice(0, 140), previewText: fields.excerpt.slice(0, 180), heading: fields.title,
      body: `${fields.excerpt}\n\n${journalBodyPreview(fields.bodyMarkdown, fields.excerpt)}\n\nContinue reading in the Doxa Journal.`, buttonLabel: 'Read the Journal',
      buttonUrl: `${publicSiteOriginParam.value().replace(/\/$/, '')}/journal/${fields.slug}`, status: 'draft', source: 'journal', articleId: id,
      createdAt: now, updatedAt: now, createdBy: caller.uid, updatedBy: caller.uid, lastError: null,
    })
    return { firstPublication, campaignId, sendNotification }
  })

  if (publication.sendNotification && publication.firstPublication) {
    try {
      const result = await queueNewsletterCampaign(publication.campaignId, caller.uid)
      await ref.set({ notificationStatus: 'queued', notificationAudienceCount: result.audienceCount, notificationError: null, updatedAt: Timestamp.now() }, { merge: true })
    } catch (error) {
      const message = error instanceof HttpsError ? error.message : 'The release email could not be queued.'
      await ref.set({ notificationStatus: 'failed', notificationError: message, updatedAt: Timestamp.now() }, { merge: true })
    }
  }
  return { article: forClient(await ref.get()) }
})

export const deleteJournalArticle = onCall(protectedOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireAdmin: true,
    requireVerifiedEmail: true,
    requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS,
  })
  const parsed = deleteInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid Journal entry.')
  const ref = db.collection('articles').doc(parsed.data.articleId)
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) return 'missing' as const
    if (Number(snapshot.data()?.revision ?? 0) !== parsed.data.revision) {
      throw new HttpsError('aborted', 'This entry changed elsewhere. Reload it before deleting it.')
    }
    if (snapshot.data()?.status === 'published') {
      transaction.update(ref, {
        status: 'archived', archivedAt: Timestamp.now(), archivedBy: caller.uid,
        revision: Number(snapshot.data()?.revision ?? 0) + 1,
        updatedAt: Timestamp.now(), updatedBy: caller.uid,
      })
      return 'archived' as const
    }
    transaction.delete(ref)
    return 'deleted' as const
  })
  return { deleted: result !== 'missing', archived: result === 'archived' }
})

export const retryJournalNotification = onCall(providerOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, {
    requireAdmin: true,
    requireVerifiedEmail: true,
    requireRecentAuthSeconds: ADMIN_RECENT_AUTH_SECONDS,
  })
  const parsed = articleId.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Choose a valid Journal entry.')
  const ref = db.collection('articles').doc(parsed.data.articleId)
  const snapshot = await ref.get()
  const campaignId = snapshot.data()?.notificationCampaignId
  if (!snapshot.exists || snapshot.data()?.status !== 'published' || typeof campaignId !== 'string') throw new HttpsError('failed-precondition', 'This entry does not have a release email to retry.')
  try {
    const result = await queueNewsletterCampaign(campaignId, caller.uid)
    await ref.set({ notificationStatus: 'queued', notificationAudienceCount: result.audienceCount, notificationError: null, updatedAt: Timestamp.now() }, { merge: true })
  } catch (error) {
    const message = error instanceof HttpsError ? error.message : 'The release email could not be queued.'
    await ref.set({ notificationStatus: 'failed', notificationError: message, updatedAt: Timestamp.now() }, { merge: true })
    if (error instanceof HttpsError) throw error
    throw new HttpsError('unavailable', message)
  }
  return { article: forClient(await ref.get()) }
})
