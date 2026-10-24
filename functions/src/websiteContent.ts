import { createHash } from 'node:crypto'
import { FieldValue, type DocumentData, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { defaultWebsiteContent, homeSectionsSchema, parseWebsiteContent, websiteContentSchema, type WebsiteContent } from './websiteContentSchema'

const callableOptions = { region: 'australia-southeast1', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true', maxInstances: 10 }
const publishedRef = db.collection('websiteContent').doc('published')
const draftRef = db.collection('websiteContentDrafts').doc('current')
const versions = db.collection('websiteContentVersions')
const mediaLocks = db.collection('websiteMediaLocks')
const MAX_VERSIONS = 25
const legacyHomeSectionsSchema = homeSectionsSchema.omit({ newsletter: true })

type ListedStorageFile = {
  name: string
  getMetadata: () => Promise<[{
    size?: string | number
    contentType?: string
    timeCreated?: string
    updated?: string
    generation?: string | number
  }]>
}

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const saveDraftSchema = z.object({ expectedRevision: revision, content: websiteContentSchema }).strict()
const publishSchema = z.object({ expectedDraftRevision: revision, expectedPublishedRevision: revision }).strict()
const listVersionsSchema = z.object({ limit: z.number().int().min(1).max(MAX_VERSIONS).optional() }).strict()
const restoreVersionSchema = z.object({ revision: revision.min(1), expectedDraftRevision: revision, expectedPublishedRevision: revision }).strict()
const listMediaSchema = z.object({ pageToken: z.string().trim().min(1).max(2000).optional(), limit: z.number().int().min(1).max(100).optional() }).strict()
const deleteMediaSchema = z.object({ path: z.string().trim().min(1).max(300).regex(/^page-images\/[A-Za-z0-9._-]{1,120}\/[A-Za-z0-9._-]{1,120}$/), generation: z.string().regex(/^[0-9]{1,30}$/) }).strict()

export type WebsiteEditorState = {
  published: { revision: number; content: WebsiteContent; publishedAt: string | null } | null
  draft: { revision: number; basedOnPublishedRevision: number; content: WebsiteContent; updatedAt: string | null; restoredFromRevision?: number }
}

function issueMessage(error: z.ZodError) {
  const issue = error.issues[0]
  return issue ? `${issue.path.join('.') || 'content'}: ${issue.message}` : 'Please check the website content.'
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HttpsError('invalid-argument', issueMessage(parsed.error))
  return parsed.data
}

function storedRevision(data: DocumentData | undefined): number {
  return Number.isSafeInteger(data?.revision) && data!.revision >= 0 ? data!.revision : 0
}

function storedContent(data: DocumentData | undefined): WebsiteContent | null {
  try {
    return parseWebsiteContent(data?.content)
  } catch {
    return null
  }
}

function isoTimestamp(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return null
}

function safeLegacyString(value: unknown, fallback: string, maximum: number, minimum = 0) {
  return typeof value === 'string' && value.trim().length >= minimum && value.length <= maximum ? value.trim() : fallback
}

/** Builds a safe first editor state without mutating legacy content. */
export function legacyWebsiteContent(homeValue: unknown, aboutValue: unknown, settingsValue: unknown): WebsiteContent {
  const home = homeValue && typeof homeValue === 'object' ? homeValue as Record<string, unknown> : {}
  const about = aboutValue && typeof aboutValue === 'object' ? aboutValue as Record<string, unknown> : {}
  const settings = settingsValue && typeof settingsValue === 'object' ? settingsValue as Record<string, unknown> : {}
  const next: WebsiteContent = structuredClone(defaultWebsiteContent)
  next.branding.businessName = safeLegacyString(settings.businessName, next.branding.businessName, 100, 2)
  next.branding.footerName = next.branding.businessName
  next.branding.publicContactEmail = typeof settings.contactEmail === 'string' && z.string().email().max(160).safeParse(settings.contactEmail).success
    ? (settings.contactEmail.trim().toLowerCase() === 'notifications@doxatreasury.com'
      ? 'info@doxatreasury.com'
      : settings.contactEmail.trim().toLowerCase())
    : next.branding.publicContactEmail
  next.header.announcementText = safeLegacyString(settings.announcement, '', 240)
  next.header.announcementEnabled = Boolean(next.header.announcementText)
  next.pages.home.eyebrow = safeLegacyString(home.eyebrow, next.pages.home.eyebrow, 80)
  next.pages.home.title = safeLegacyString(home.title, next.pages.home.title, 160, 2)
  next.pages.home.body = safeLegacyString(home.body, next.pages.home.body, 10_000, 2)
  const sections = legacyHomeSectionsSchema.safeParse(home.sections)
  if (sections.success) next.pages.home.sections = { ...sections.data, newsletter: next.pages.home.sections.newsletter }
  next.pages.about.eyebrow = safeLegacyString(about.eyebrow, next.pages.about.eyebrow, 80)
  next.pages.about.title = safeLegacyString(about.title, next.pages.about.title, 160, 2)
  next.pages.about.body = safeLegacyString(about.body, next.pages.about.body, 10_000, 2)
  if (typeof about.imageUrl === 'string' && typeof about.imageAlt === 'string') {
    const candidate = { ...next, pages: { ...next.pages, about: { ...next.pages.about, image: { imageUrl: about.imageUrl, imageAlt: about.imageAlt, imageCredit: '' } } } }
    const parsed = websiteContentSchema.safeParse(candidate)
    if (parsed.success) next.pages.about.image = parsed.data.pages.about.image
  }
  const legacyTheme = settings.theme && typeof settings.theme === 'object' ? settings.theme as Record<string, unknown> : null
  if (legacyTheme) {
    const candidate = { typography: legacyTheme.typography, palette: legacyTheme.palette, logo: legacyTheme.logo }
    const parsed = websiteContentSchema.shape.theme.safeParse(candidate)
    if (parsed.success) next.theme = parsed.data
  }
  return parseWebsiteContent(next)
}

function conflict(message: string): never {
  throw new HttpsError('aborted', message)
}

export function versionDocumentId(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Version must be a positive integer.')
  return `v${String(value).padStart(10, '0')}`
}

export function publishedDraftDocument(
  draft: DocumentData,
  revision: number,
  basedOnPublishedRevision: number,
  content: WebsiteContent,
  updatedBy: string,
  updatedAt: FieldValue,
): DocumentData {
  const { restoredFromRevision: _restoredFromRevision, ...preservedDraft } = draft
  return {
    ...preservedDraft,
    revision,
    basedOnPublishedRevision,
    content,
    updatedAt,
    updatedBy,
  }
}

export function storagePathFromImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com') return null
    const match = /^\/v0\/b\/[^/]+\/o\/([^?]+)$/.exec(parsed.pathname)
    if (!match) return null
    const path = decodeURIComponent(match[1])
    return /^page-images\/[A-Za-z0-9._-]{1,120}\/[A-Za-z0-9._-]{1,120}$/.test(path) ? path : null
  } catch {
    return null
  }
}

export function referencedWebsiteMedia(value: unknown): string[] {
  const paths = new Set<string>()
  const visit = (current: unknown) => {
    if (typeof current === 'string') {
      const path = storagePathFromImageUrl(current)
      if (path) paths.add(path)
      return
    }
    if (Array.isArray(current)) return void current.forEach(visit)
    if (current && typeof current === 'object') Object.values(current as Record<string, unknown>).forEach(visit)
  }
  visit(value)
  return [...paths].sort()
}

export function mediaLockId(path: string) {
  return createHash('sha256').update(path, 'utf8').digest('hex')
}

async function rejectDeletedMedia(transaction: Transaction, content: WebsiteContent) {
  const paths = referencedWebsiteMedia(content)
  const snapshots = await Promise.all(paths.map((path) => transaction.get(mediaLocks.doc(mediaLockId(path)))))
  if (snapshots.some((snapshot) => snapshot.exists)) {
    throw new HttpsError('failed-precondition', 'One or more selected images are no longer available. Choose another image.')
  }
}

function compatibleHomePage(content: WebsiteContent) {
  const home = content.pages.home
  const { newsletter: _newsletter, ...sections } = home.sections
  return {
    page: 'home', eyebrow: home.eyebrow, title: home.title, body: home.body,
    imageUrl: home.sections.hero.imageUrl, imageAlt: home.sections.hero.imageAlt,
    contentVersion: 2, sections, status: 'published', updatedAt: FieldValue.serverTimestamp(),
  }
}

function compatibleAboutPage(content: WebsiteContent) {
  const about = content.pages.about
  return {
    page: 'about', eyebrow: about.eyebrow, title: about.title, body: about.body,
    ...(about.image ? { imageUrl: about.image.imageUrl, imageAlt: about.image.imageAlt } : {}),
    status: 'published', updatedAt: FieldValue.serverTimestamp(),
  }
}

function navigationLabel(content: WebsiteContent, path: string, fallback: string) {
  return content.navigation.primary.find((item) => item.path === path)?.label ?? fallback
}

function footerLabel(content: WebsiteContent, path: string, fallback: string) {
  return content.footer.groups.flatMap((group) => group.links).find((item) => item.path === path)?.label ?? fallback
}

function compatibleSettings(content: WebsiteContent) {
  const explore = content.footer.groups[0]
  const account = content.footer.groups[1]
  return {
    businessName: content.branding.businessName,
    announcement: content.header.announcementEnabled ? content.header.announcementText : '',
    contactEmail: content.branding.publicContactEmail,
    currency: 'AUD', status: 'published', updatedAt: FieldValue.serverTimestamp(),
    theme: {
      version: 1, ...content.theme,
      header: { brandName: content.branding.headerName, navigation: {
        home: navigationLabel(content, '/', 'Home'), shop: navigationLabel(content, '/shop', 'Shop'),
        about: navigationLabel(content, '/about', 'About'), contact: navigationLabel(content, '/contact', 'Contact'),
      } },
      footer: {
        brandName: content.branding.footerName, description: content.footer.description,
        exploreHeading: explore?.heading ?? 'Explore', accountHeading: account?.heading ?? 'Account', copyrightText: content.footer.copyrightText,
        navigation: {
          shop: footerLabel(content, '/shop', 'Browse the collection'), about: footerLabel(content, '/about', 'Our purpose'),
          contact: footerLabel(content, '/contact', 'Enquiries & quotes'), account: footerLabel(content, '/account', 'Account Centre'),
          orders: footerLabel(content, '/account/orders', 'Orders & purchases'), security: footerLabel(content, '/account/security', 'Security & sign-in'),
          administrator: footerLabel(content, '/admin', 'Administrator'),
        },
      },
    },
  }
}

export const getWebsiteContentEditorState = onCall(callableOptions, async (request): Promise<WebsiteEditorState> => {
  await requireAdminContext(request as CallableRequestLike)
  const [published, draft, home, about, settings] = await Promise.all([
    publishedRef.get(), draftRef.get(), db.collection('pageContent').doc('home').get(),
    db.collection('pageContent').doc('about').get(), db.collection('siteSettings').doc('main').get(),
  ])
  const publishedContent = published.exists ? storedContent(published.data()) : null
  if (published.exists && !publishedContent) throw new HttpsError('failed-precondition', 'Published website content is invalid and requires operator review.')
  const fallback = publishedContent ?? legacyWebsiteContent(home.data(), about.data(), settings.data())
  const draftContent = draft.exists ? storedContent(draft.data()) : null
  if (draft.exists && !draftContent) throw new HttpsError('failed-precondition', 'The website draft is invalid and requires operator review.')
  const publishedRevision = published.exists ? storedRevision(published.data()) : 0
  return {
    published: publishedContent ? { revision: publishedRevision, content: publishedContent, publishedAt: isoTimestamp(published.data()?.publishedAt) } : null,
    draft: draftContent ? {
      revision: storedRevision(draft.data()), basedOnPublishedRevision: storedRevision({ revision: draft.data()?.basedOnPublishedRevision }),
      content: draftContent, updatedAt: isoTimestamp(draft.data()?.updatedAt),
      ...(Number.isSafeInteger(draft.data()?.restoredFromRevision) ? { restoredFromRevision: draft.data()!.restoredFromRevision as number } : {}),
    } : { revision: 0, basedOnPublishedRevision: publishedRevision, content: fallback, updatedAt: null },
  }
})
export const saveWebsiteContentDraft = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(saveDraftSchema, request.data)
  return db.runTransaction(async (transaction) => {
    const [draft, published] = await Promise.all([transaction.get(draftRef), transaction.get(publishedRef)])
    const currentRevision = draft.exists ? storedRevision(draft.data()) : 0
    if (currentRevision !== input.expectedRevision) conflict('This draft changed in another session. Refresh before saving again.')
    await rejectDeletedMedia(transaction, input.content)
    const nextRevision = currentRevision + 1
    const basedOnPublishedRevision = draft.exists
      ? storedRevision({ revision: draft.data()?.basedOnPublishedRevision })
      : storedRevision(published.data())
    transaction.set(draftRef, {
      schemaVersion: 1, revision: nextRevision, basedOnPublishedRevision, content: input.content,
      createdAt: draft.data()?.createdAt ?? FieldValue.serverTimestamp(), createdBy: draft.data()?.createdBy ?? caller.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid,
    })
    return { revision: nextRevision, basedOnPublishedRevision }
  })
})

export const publishWebsiteContent = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(publishSchema, request.data)
  return db.runTransaction(async (transaction) => {
    const [draft, published] = await Promise.all([transaction.get(draftRef), transaction.get(publishedRef)])
    if (!draft.exists) throw new HttpsError('failed-precondition', 'Save a website draft before publishing.')
    const currentDraftRevision = storedRevision(draft.data())
    const currentPublishedRevision = storedRevision(published.data())
    if (currentDraftRevision !== input.expectedDraftRevision || currentPublishedRevision !== input.expectedPublishedRevision) {
      conflict('The website changed in another session. Refresh before publishing.')
    }
    const content = storedContent(draft.data())
    if (!content) throw new HttpsError('failed-precondition', 'The website draft is invalid and cannot be published.')
    await rejectDeletedMedia(transaction, content)
    const nextPublishedRevision = currentPublishedRevision + 1
    const nextDraftRevision = currentDraftRevision + 1
    const now = FieldValue.serverTimestamp()
    transaction.set(publishedRef, { schemaVersion: 1, revision: nextPublishedRevision, content, publishedAt: now })
    transaction.set(versions.doc(versionDocumentId(nextPublishedRevision)), { schemaVersion: 1, revision: nextPublishedRevision, content, publishedAt: now, publishedBy: caller.uid })
    if (nextPublishedRevision > MAX_VERSIONS) transaction.delete(versions.doc(versionDocumentId(nextPublishedRevision - MAX_VERSIONS)))
    transaction.set(draftRef, publishedDraftDocument(
      draft.data()!, nextDraftRevision, nextPublishedRevision, content, caller.uid, now,
    ))
    transaction.set(db.collection('pageContent').doc('home'), compatibleHomePage(content))
    transaction.set(db.collection('pageContent').doc('about'), compatibleAboutPage(content))
    transaction.set(db.collection('siteSettings').doc('main'), compatibleSettings(content), { merge: true })
    return { publishedRevision: nextPublishedRevision, draftRevision: nextDraftRevision }
  })
})

export const listWebsiteContentVersions = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(listVersionsSchema, request.data ?? {})
  const snapshot = await versions.orderBy('revision', 'desc').limit(input.limit ?? MAX_VERSIONS).get()
  return { versions: snapshot.docs.map((document) => ({
    revision: storedRevision(document.data()), publishedAt: isoTimestamp(document.data().publishedAt),
    publishedBy: typeof document.data().publishedBy === 'string' ? document.data().publishedBy : null,
  })) }
})

export const restoreWebsiteContentVersion = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(restoreVersionSchema, request.data)
  return db.runTransaction(async (transaction) => {
    const [selected, draft, published] = await Promise.all([
      transaction.get(versions.doc(versionDocumentId(input.revision))), transaction.get(draftRef), transaction.get(publishedRef),
    ])
    if (!selected.exists) throw new HttpsError('not-found', 'That website version is no longer available.')
    const currentDraftRevision = draft.exists ? storedRevision(draft.data()) : 0
    const currentPublishedRevision = storedRevision(published.data())
    if (currentDraftRevision !== input.expectedDraftRevision || currentPublishedRevision !== input.expectedPublishedRevision) {
      conflict('The website changed in another session. Refresh before restoring this version.')
    }
    const content = storedContent(selected.data())
    if (!content) throw new HttpsError('failed-precondition', 'That website version is invalid and cannot be restored.')
    await rejectDeletedMedia(transaction, content)
    const nextDraftRevision = currentDraftRevision + 1
    transaction.set(draftRef, {
      schemaVersion: 1, revision: nextDraftRevision, basedOnPublishedRevision: currentPublishedRevision, content,
      createdAt: draft.data()?.createdAt ?? FieldValue.serverTimestamp(), createdBy: draft.data()?.createdBy ?? caller.uid,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid, restoredFromRevision: input.revision,
    })
    return { draftRevision: nextDraftRevision, basedOnPublishedRevision: currentPublishedRevision, restoredFromRevision: input.revision }
  })
})

async function contentReferenceLocations() {
  const [published, draft, history, home, about, settings, products] = await Promise.all([
    publishedRef.get(), draftRef.get(), versions.orderBy('revision', 'desc').limit(MAX_VERSIONS).get(),
    db.collection('pageContent').doc('home').get(), db.collection('pageContent').doc('about').get(),
    db.collection('siteSettings').doc('main').get(), db.collection('products').get(),
  ])
  const locations = new Map<string, string[]>()
  const add = (label: string, value: unknown) => referencedWebsiteMedia(value).forEach((path) => locations.set(path, [...(locations.get(path) ?? []), label]))
  if (published.exists) add('Published website', published.data()?.content)
  if (draft.exists) add('Current draft', draft.data()?.content)
  history.docs.forEach((document) => add(`Version ${storedRevision(document.data())}`, document.data().content))
  if (home.exists) add('Legacy home page', home.data())
  if (about.exists) add('Legacy about page', about.data())
  if (settings.exists) add('Legacy site settings', settings.data())
  products.docs.forEach((document) => add(`Product ${document.id}`, document.data()))
  return locations
}

export const listWebsiteMedia = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(listMediaSchema, request.data ?? {})
  const [files, nextQuery] = await getStorage().bucket().getFiles({ prefix: 'page-images/', autoPaginate: false, maxResults: input.limit ?? 50, ...(input.pageToken ? { pageToken: input.pageToken } : {}) })
  const references = await contentReferenceLocations()
  const items = await Promise.all(files.map(async (file: ListedStorageFile) => {
    const [metadata] = await file.getMetadata()
    const locations = references.get(file.name) ?? []
    const lock = await mediaLocks.doc(mediaLockId(file.name)).get()
    return {
      path: file.name, size: Number(metadata.size ?? 0), contentType: metadata.contentType ?? null,
      createdAt: metadata.timeCreated ?? null, updatedAt: metadata.updated ?? null, generation: String(metadata.generation ?? ''),
      referenced: locations.length > 0, references: locations, deletionAvailable: locations.length === 0 && !lock.exists,
    }
  }))
  const token = nextQuery && typeof nextQuery === 'object' && 'pageToken' in nextQuery ? String(nextQuery.pageToken ?? '') : ''
  return { items, ...(token ? { nextPageToken: token } : {}) }
})

export const deleteWebsiteMedia = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const input = parseInput(deleteMediaSchema, request.data)
  const lockRef = mediaLocks.doc(mediaLockId(input.path))
  await db.runTransaction(async (transaction) => {
    const [lock, published, draft, history, home, about, settings, products] = await Promise.all([
      transaction.get(lockRef), transaction.get(publishedRef), transaction.get(draftRef),
      transaction.get(versions.orderBy('revision', 'desc').limit(MAX_VERSIONS)),
      transaction.get(db.collection('pageContent').doc('home')), transaction.get(db.collection('pageContent').doc('about')),
      transaction.get(db.collection('siteSettings').doc('main')), transaction.get(db.collection('products')),
    ])
    if (lock.exists) throw new HttpsError('failed-precondition', 'This image has already been removed or is being removed.')
    const sources: unknown[] = [
      published.data()?.content, draft.data()?.content, home.data(), about.data(), settings.data(),
      ...history.docs.map((document) => document.data().content), ...products.docs.map((document) => document.data()),
    ]
    if (sources.some((source) => referencedWebsiteMedia(source).includes(input.path))) {
      throw new HttpsError('failed-precondition', 'This image is still used by website content or version history.')
    }
    transaction.create(lockRef, { path: input.path, generation: input.generation, status: 'deleting', requestedAt: FieldValue.serverTimestamp(), requestedBy: caller.uid })
  })
  const file = getStorage().bucket().file(input.path)
  try {
    const [metadata] = await file.getMetadata()
    if (String(metadata.generation ?? '') !== input.generation) throw new HttpsError('aborted', 'The image changed. Refresh the media list before deleting it.')
    await file.delete({ ifGenerationMatch: Number(input.generation) })
    await lockRef.set({ status: 'deleted', deletedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { deleted: true as const }
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'aborted') await lockRef.delete()
    else {
      const code = typeof error === 'object' && error && 'code' in error ? Number((error as { code: unknown }).code) : 0
      if (code === 404) {
        await lockRef.set({ status: 'deleted', deletedAt: FieldValue.serverTimestamp() }, { merge: true })
        return { deleted: true as const }
      }
      await lockRef.delete()
    }
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'The image could not be removed safely. Try again.')
  }
})
