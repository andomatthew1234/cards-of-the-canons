import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getStorage } from 'firebase-admin/storage'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { authorizeRequest, type CallableRequestLike } from './authorization'
import { publishImageSchema } from './validation'

const region = 'australia-southeast1'

export const maxImageBytes = 5 * 1024 * 1024
export const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const

const stagingPattern = /^image-staging\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9._-]{1,120})$/
const destinationPattern = /^(product-images|page-images)\/([A-Za-z0-9._-]{1,120})\/([A-Za-z0-9._-]{1,120})$/
const listProductMediaSchema = z.object({ limit: z.number().int().min(1).max(100).optional() }).strict()

export interface DownloadableImageMetadata {
  cacheControl?: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface DownloadableImageFile {
  setMetadata: (metadata: { cacheControl?: string; metadata: Record<string, string | number | boolean | null> }) => Promise<unknown>
}

export interface StagingPath {
  uid: string
  fileName: string
}

/**
 * Firebase Web SDK download URLs require an object-level download token even
 * when Storage Rules allow public reads. Keep that token server-generated so
 * newly published media can be selected immediately in the admin library.
 */
export function publicImageMetadata(contentType: string, downloadToken = randomUUID()) {
  return {
    contentType,
    cacheControl: 'public,max-age=31536000,immutable',
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  }
}

/**
 * Repairs media uploaded before download-token publication was introduced.
 * This makes every existing Media Library thumbnail selectable through the
 * Firebase Web SDK without replacing the file or changing its public URL
 * after the first repair.
 */
export async function ensurePublicImageDownloadToken(file: DownloadableImageFile, metadata: DownloadableImageMetadata, downloadToken = randomUUID()) {
  const existingMetadata = metadata.metadata ?? {}
  if (typeof existingMetadata.firebaseStorageDownloadTokens === 'string' && existingMetadata.firebaseStorageDownloadTokens.trim()) return false
  await file.setMetadata({
    cacheControl: metadata.cacheControl || 'public,max-age=31536000,immutable',
    metadata: { ...existingMetadata, firebaseStorageDownloadTokens: downloadToken },
  })
  return true
}

/** Strict parse of a private staging object path. Returns null on anything unexpected. */
export function parseStagingPath(raw: unknown): StagingPath | null {
  if (typeof raw !== 'string') return null
  const match = stagingPattern.exec(raw.trim())
  if (!match) return null
  return { uid: match[1], fileName: match[2] }
}

/** Strict parse of a public destination path: only approved prefixes. */
export function parseDestinationPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const match = destinationPattern.exec(raw.trim())
  if (!match) return null
  // Dots cannot be used as path segments, so `..` escapes are impossible.
  if (match[2] === '.' || match[2] === '..' || match[3] === '.' || match[3] === '..') return null
  return `${match[1]}/${match[2]}/${match[3]}`
}

/**
 * Leading-byte validation of a staged image.
 *
 * This checks the declared content type, the object size and the magic bytes
 * that every file of that type must begin with. It does **not** decode or
 * render the image: a full pixel decode is out of scope here, and this is
 * documented as a signature check, not MIME decoding.
 */
export function validateImageBytes(bytes: Uint8Array, declaredType: unknown): { ok: true; type: string } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length > maxImageBytes) return { ok: false, reason: 'too-large' }
  if (typeof declaredType !== 'string' || !(allowedImageTypes as readonly string[]).includes(declaredType)) {
    return { ok: false, reason: 'unsupported-type' }
  }
  const startsWith = (...expected: number[]) => expected.every((value, index) => bytes[index] === value)
  if (declaredType === 'image/jpeg' && !startsWith(0xff, 0xd8, 0xff)) return { ok: false, reason: 'signature-mismatch' }
  if (declaredType === 'image/png' && !startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ok: false, reason: 'signature-mismatch' }
  if (declaredType === 'image/webp') {
    const riff = startsWith(0x52, 0x49, 0x46, 0x46)
    const webp = bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    if (!riff || !webp) return { ok: false, reason: 'signature-mismatch' }
  }
  return { ok: true, type: declaredType }
}

/**
 * Lists reusable catalogue imagery without exposing bucket enumeration to the
 * public client. This deliberately includes both the central website Media
 * Library and the legacy product-image library so an administrator uploads an
 * image once and can then select it for a shop item. The caller is
 * re-authorised server-side on every request.
 */
export const listProductMedia = onCall({
  region,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 4,
}, async (request) => {
  await authorizeRequest(request as CallableRequestLike, { requireAdmin: true })
  const parsed = listProductMediaSchema.safeParse(request.data ?? {})
  if (!parsed.success) throw new HttpsError('invalid-argument', 'The media-library request is invalid.')
  const limit = parsed.data.limit ?? 100
  const bucket = getStorage().bucket()
  const [[productFiles], [websiteLibraryFiles]] = await Promise.all([
    bucket.getFiles({ prefix: 'product-images/', autoPaginate: false, maxResults: limit }),
    bucket.getFiles({ prefix: 'page-images/library/', autoPaginate: false, maxResults: limit }),
  ])
  const files = [...productFiles, ...websiteLibraryFiles]
  const items = await Promise.all(files
    .filter((file) => !file.name.endsWith('/'))
    .map(async (file) => {
      const [metadata] = await file.getMetadata()
      await ensurePublicImageDownloadToken(file, metadata)
      return {
        path: file.name,
        size: Number(metadata.size ?? 0),
        contentType: metadata.contentType ?? null,
        createdAt: metadata.timeCreated ?? null,
        updatedAt: metadata.updated ?? null,
      }
    }))
  return {
    items: items.sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''))),
  }
})

/**
 * Publication boundary: clients may only write to their private staging area.
 * This server function is the only path from staging to a publicly readable
 * `product-images`/`page-images` object, and it re-validates size, declared
 * type and magic bytes with the caller's own session checked for revocation.
 */
export const publishStagedImage = onCall({
  region,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 4,
}, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike, { requireAdmin: true })
  const parsed = publishImageSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'The image request is invalid.')

  const staging = parseStagingPath(parsed.data.stagingPath)
  if (!staging) throw new HttpsError('invalid-argument', 'The image request is invalid.')
  // An administrator only ever publishes objects staged under their own UID.
  if (staging.uid !== caller.uid) throw new HttpsError('permission-denied', 'This staged image belongs to another account.')

  const destination = parseDestinationPath(parsed.data.destination)
  if (!destination) throw new HttpsError('invalid-argument', 'The image destination is not an approved location.')

  const bucket = getStorage().bucket()
  const source = bucket.file(parsed.data.stagingPath)
  const [exists, metadata] = await Promise.all([source.exists(), source.getMetadata()])
  if (!exists[0]) throw new HttpsError('not-found', 'The staged image no longer exists.')
  const size = Number(metadata[0]?.size ?? 0)
  if (!Number.isFinite(size) || size <= 0 || size > maxImageBytes) {
    throw new HttpsError('invalid-argument', 'The staged image is not within the accepted size range.')
  }

  const [bytes] = await source.download()
  const verdict = validateImageBytes(bytes, metadata[0]?.contentType)
  if (!verdict.ok) throw new HttpsError('invalid-argument', 'The staged image failed validation.')

  const target = bucket.file(destination)
  await target.save(bytes, { resumable: false, metadata: publicImageMetadata(verdict.type) })
  // The staging object never survives publication, so nothing unpublishable
  // lingers in a readable location.
  await source.delete({ ignoreNotFound: true })
  return { path: destination }
})
