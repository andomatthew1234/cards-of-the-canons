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

const draftRef = db.collection('legalPolicyDrafts').doc('terms')
const publishedRef = db.collection('legalPolicies').doc('terms')
const versionsRef = db.collection('legalPolicyVersions')

const contentSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(500),
  bodyMarkdown: z.string().trim().max(100_000),
  version: z.string().trim().min(1).max(40),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid effective date.'),
}).strict()

const inputSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  content: contentSchema,
}).strict()

const publishInputSchema = inputSchema.refine(
  ({ content }) => content.bodyMarkdown.length >= 20,
  { path: ['content', 'bodyMarkdown'], message: 'Add the approved Terms and Conditions wording before publishing.' },
)

export type TermsPolicyContent = z.infer<typeof contentSchema>

function issueMessage(error: z.ZodError) {
  const issue = error.issues[0]
  return issue ? `${issue.path.join('.') || 'content'}: ${issue.message}` : 'Please check the Terms and Conditions fields.'
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HttpsError('invalid-argument', issueMessage(parsed.error))
  return parsed.data
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

export function storedPolicy(data: DocumentData | undefined, status: 'draft' | 'published') {
  if (!data) return null
  const parsed = contentSchema.safeParse({
    title: data.title,
    description: data.description,
    bodyMarkdown: data.bodyMarkdown,
    version: data.version,
    effectiveDate: data.effectiveDate,
  })
  if (!parsed.success || data.slug !== 'terms' || data.status !== status) return null
  return {
    slug: 'terms' as const,
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

function blankDraft(revision = 0) {
  return {
    slug: 'terms' as const,
    status: 'draft' as const,
    revision,
    title: 'Terms and Conditions',
    description: 'The terms that apply when you use the Doxa website, create an account or place an order.',
    bodyMarkdown: '',
    version: '1.0',
    effectiveDate: new Date().toISOString().slice(0, 10),
    updatedAt: null,
  }
}

async function editorState() {
  const [draftSnapshot, publishedSnapshot] = await Promise.all([draftRef.get(), publishedRef.get()])
  const published = storedPolicy(publishedSnapshot.data(), 'published')
  const draft = storedPolicy(draftSnapshot.data(), 'draft')
    ?? (published ? { ...published, status: 'draft' as const } : blankDraft())
  return { draft, published }
}

function conflict(): never {
  throw new HttpsError('aborted', 'The Terms and Conditions changed in another session. Refresh before saving again.')
}

export function termsVersionDocumentId(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Revision must be a positive integer.')
  return `terms-v${String(revision).padStart(10, '0')}`
}

export const getTermsPolicyEditorState = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  return editorState()
})

export const saveTermsPolicyDraft = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(inputSchema, request.data)
  const revision = await db.runTransaction(async (transaction) => {
    const [draftSnapshot, publishedSnapshot] = await Promise.all([
      transaction.get(draftRef),
      transaction.get(publishedRef),
    ])
    const currentRevision = draftSnapshot.exists
      ? storedRevision(draftSnapshot.data())
      : storedRevision(publishedSnapshot.data())
    if (input.expectedRevision !== currentRevision) conflict()
    const nextRevision = currentRevision + 1
    transaction.set(draftRef, {
      slug: 'terms', status: 'draft', revision: nextRevision, ...input.content,
      createdAt: draftSnapshot.data()?.createdAt ?? FieldValue.serverTimestamp(),
      createdBy: draftSnapshot.data()?.createdBy ?? caller.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid,
    })
    return nextRevision
  })
  const state = await editorState()
  if (state.draft.revision < revision) throw new HttpsError('internal', 'The saved Terms and Conditions draft could not be read back.')
  return state
})

export const publishTermsPolicy = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(publishInputSchema, request.data)
  const revision = await db.runTransaction(async (transaction) => {
    const [draftSnapshot, publishedSnapshot] = await Promise.all([
      transaction.get(draftRef),
      transaction.get(publishedRef),
    ])
    const currentRevision = draftSnapshot.exists
      ? storedRevision(draftSnapshot.data())
      : storedRevision(publishedSnapshot.data())
    if (input.expectedRevision !== currentRevision) conflict()
    const nextRevision = currentRevision + 1
    const versionRef = versionsRef.doc(termsVersionDocumentId(nextRevision))
    const versionSnapshot = await transaction.get(versionRef)
    if (versionSnapshot.exists) throw new HttpsError('already-exists', 'That policy revision already exists. Refresh before publishing.')
    const now = FieldValue.serverTimestamp()
    const common = {
      slug: 'terms', revision: nextRevision, ...input.content,
      updatedAt: now, updatedBy: caller.uid,
    }
    transaction.set(draftRef, {
      ...common, status: 'draft',
      createdAt: draftSnapshot.data()?.createdAt ?? now,
      createdBy: draftSnapshot.data()?.createdBy ?? caller.uid,
    })
    transaction.set(publishedRef, {
      ...common, status: 'published', publishedAt: now, publishedBy: caller.uid,
    })
    transaction.create(versionRef, {
      ...common, status: 'published', publishedAt: now, publishedBy: caller.uid,
    })
    return nextRevision
  })
  const state = await editorState()
  if (state.draft.revision < revision || !state.published || state.published.revision < revision) {
    throw new HttpsError('internal', 'The published Terms and Conditions could not be read back.')
  }
  return state
})
