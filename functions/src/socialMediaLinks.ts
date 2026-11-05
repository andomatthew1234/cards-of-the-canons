import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'

const callableOptions = {
  region: 'australia-southeast1',
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 10,
}

const platforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'x'] as const
export type SocialMediaPlatform = typeof platforms[number]

const linkSchema = z.object({
  id: z.enum(platforms),
  label: z.string().trim().min(1).max(40),
  url: z.string().trim().max(2048),
  visible: z.boolean(),
}).strict()

const contentSchema = z.object({
  heading: z.string().trim().min(1).max(60),
  links: z.array(linkSchema).length(platforms.length),
}).strict().superRefine((content, context) => {
  const ids = content.links.map((link) => link.id)
  if (new Set(ids).size !== platforms.length || platforms.some((platform) => !ids.includes(platform))) {
    context.addIssue({ code: 'custom', path: ['links'], message: 'Each supported social platform must appear exactly once.' })
  }
})

const inputSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  content: contentSchema,
}).strict()

const allowedHosts: Record<SocialMediaPlatform, readonly string[]> = {
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  facebook: ['facebook.com'],
  x: ['x.com', 'twitter.com'],
}

export function validSocialDestination(platform: SocialMediaPlatform, value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    const hostAllowed = allowedHosts[platform].some((host) => hostname === host || hostname.endsWith(`.${host}`))
    return hostAllowed && url.pathname !== '/' && url.pathname.length > 1 && !/(?:coming[-_ ]?soon|placeholder|replace[-_ ]?me|todo)/i.test(url.href)
  } catch {
    return false
  }
}

const publishInputSchema = inputSchema.superRefine(({ content }, context) => {
  const visible = content.links.filter((link) => link.visible)
  if (!visible.length) context.addIssue({ code: 'custom', path: ['content', 'links'], message: 'Make at least one completed social profile visible before publishing.' })
  content.links.forEach((link, index) => {
    if (!link.visible) return
    if (!validSocialDestination(link.id, link.url)) {
      context.addIssue({ code: 'custom', path: ['content', 'links', index, 'url'], message: `Enter a complete ${link.label} profile URL.` })
    }
  })
})

const draftRef = db.collection('socialMediaLinkDrafts').doc('current')
const publishedRef = db.collection('socialMediaLinks').doc('published')
const versionsRef = db.collection('socialMediaLinkVersions')

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw new HttpsError('invalid-argument', issue ? `${issue.path.join('.') || 'content'}: ${issue.message}` : 'Please check the social media links.')
}

function storedRevision(data: DocumentData | undefined) {
  return Number.isSafeInteger(data?.revision) && data!.revision >= 0 ? data!.revision as number : 0
}

function isoTimestamp(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return typeof value === 'string' ? value : null
}

export function storedSocialMediaLinks(data: DocumentData | undefined, status: 'draft' | 'published') {
  if (!data || data.status !== status) return null
  const parsed = contentSchema.safeParse({ heading: data.heading, links: data.links })
  if (!parsed.success) return null
  return {
    status,
    revision: storedRevision(data),
    ...parsed.data,
    updatedAt: isoTimestamp(data.updatedAt),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    ...(status === 'published' ? {
      publishedAt: isoTimestamp(data.publishedAt),
      publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : undefined,
    } : {}),
  }
}

export function blankSocialMediaLinks() {
  return {
    status: 'draft' as const,
    revision: 0,
    heading: 'Follow',
    links: [
      { id: 'instagram' as const, label: 'Instagram', url: '', visible: false },
      { id: 'tiktok' as const, label: 'TikTok', url: '', visible: false },
      { id: 'youtube' as const, label: 'YouTube', url: '', visible: false },
      { id: 'facebook' as const, label: 'Facebook', url: '', visible: false },
      { id: 'x' as const, label: 'X', url: '', visible: false },
    ],
    updatedAt: null,
  }
}

async function editorState() {
  const [draftSnapshot, publishedSnapshot] = await Promise.all([draftRef.get(), publishedRef.get()])
  const published = storedSocialMediaLinks(publishedSnapshot.data(), 'published')
  const draft = storedSocialMediaLinks(draftSnapshot.data(), 'draft')
    ?? (published ? { ...published, status: 'draft' as const } : blankSocialMediaLinks())
  return { draft, published }
}

function conflict(): never {
  throw new HttpsError('aborted', 'The social media links changed in another session. Refresh before saving again.')
}

export function socialMediaVersionDocumentId(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Revision must be a positive integer.')
  return `v${String(revision).padStart(10, '0')}`
}

export const getSocialMediaLinksEditorState = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  return editorState()
})

export const saveSocialMediaLinksDraft = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(inputSchema, request.data)
  const revision = await db.runTransaction(async (transaction) => {
    const [draftSnapshot, publishedSnapshot] = await Promise.all([transaction.get(draftRef), transaction.get(publishedRef)])
    const currentRevision = draftSnapshot.exists ? storedRevision(draftSnapshot.data()) : storedRevision(publishedSnapshot.data())
    if (currentRevision !== input.expectedRevision) conflict()
    const nextRevision = currentRevision + 1
    transaction.set(draftRef, {
      status: 'draft', revision: nextRevision, ...input.content,
      createdAt: draftSnapshot.data()?.createdAt ?? FieldValue.serverTimestamp(),
      createdBy: draftSnapshot.data()?.createdBy ?? caller.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid,
    })
    return nextRevision
  })
  const state = await editorState()
  if (state.draft.revision < revision) throw new HttpsError('internal', 'The saved social media links could not be read back.')
  return state
})

export const publishSocialMediaLinks = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(publishInputSchema, request.data)
  const revision = await db.runTransaction(async (transaction) => {
    const [draftSnapshot, publishedSnapshot] = await Promise.all([transaction.get(draftRef), transaction.get(publishedRef)])
    const currentRevision = draftSnapshot.exists ? storedRevision(draftSnapshot.data()) : storedRevision(publishedSnapshot.data())
    if (currentRevision !== input.expectedRevision) conflict()
    const nextRevision = currentRevision + 1
    const versionRef = versionsRef.doc(socialMediaVersionDocumentId(nextRevision))
    const versionSnapshot = await transaction.get(versionRef)
    if (versionSnapshot.exists) throw new HttpsError('already-exists', 'That social-links revision already exists. Refresh before publishing.')
    const now = FieldValue.serverTimestamp()
    const common = { revision: nextRevision, ...input.content, updatedAt: now, updatedBy: caller.uid }
    const publicContent = {
      revision: nextRevision,
      heading: input.content.heading,
      links: input.content.links.map((link) => link.visible ? link : { ...link, url: '' }),
      updatedAt: now,
    }
    transaction.set(draftRef, { ...common, status: 'draft', createdAt: draftSnapshot.data()?.createdAt ?? now, createdBy: draftSnapshot.data()?.createdBy ?? caller.uid })
    // The public projection deliberately excludes administrator identifiers
    // and blanks unfinished profile URLs. Full content and audit identity stay
    // in callable-only draft/version documents.
    transaction.set(publishedRef, { ...publicContent, status: 'published', publishedAt: now })
    transaction.create(versionRef, { ...common, status: 'published', publishedAt: now, publishedBy: caller.uid })
    return nextRevision
  })
  const state = await editorState()
  if (state.draft.revision < revision || !state.published || state.published.revision < revision) {
    throw new HttpsError('internal', 'The published social media links could not be read back.')
  }
  return state
})
