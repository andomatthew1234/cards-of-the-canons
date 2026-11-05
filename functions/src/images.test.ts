import { describe, expect, it, vi } from 'vitest'
import { ensurePublicImageDownloadToken, parseDestinationPath, parseStagingPath, publicImageMetadata, validateImageBytes } from './images'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const text = new TextEncoder().encode('<?php echo "hi"; ?>')

describe('staging and destination path parsing', () => {
  it('accepts only bounded, approved paths', () => {
    expect(parseStagingPath('image-staging/admin-1/1712-photo.png')).toEqual({ uid: 'admin-1', fileName: '1712-photo.png' })
    expect(parseDestinationPath('product-images/demo-pack/front.png')).toBe('product-images/demo-pack/front.png')
    expect(parseDestinationPath('product-images/library/1790000000000-a1b2c3d4-front-card.webp')).toBe('product-images/library/1790000000000-a1b2c3d4-front-card.webp')
    expect(parseDestinationPath('page-images/home/hero.jpg')).toBe('page-images/home/hero.jpg')
  })

  it('rejects traversal, foreign prefixes and junk', () => {
    expect(parseStagingPath('image-staging/admin-1/../../secret')).toBeNull()
    expect(parseStagingPath('product-images/admin-1/x.png')).toBeNull()
    expect(parseStagingPath('image-staging//x.png')).toBeNull()
    expect(parseDestinationPath('secrets/anything.png')).toBeNull()
    expect(parseDestinationPath('product-images/../other/x.png')).toBeNull()
    expect(parseDestinationPath('product-images/a/..%2Fx.png')).toBeNull()
    expect(parseDestinationPath(42)).toBeNull()
  })
})

describe('staged image validation', () => {
  it('accepts real signatures for the declared type', () => {
    expect(validateImageBytes(png, 'image/png')).toEqual({ ok: true, type: 'image/png' })
    expect(validateImageBytes(jpeg, 'image/jpeg')).toEqual({ ok: true, type: 'image/jpeg' })
    expect(validateImageBytes(webp, 'image/webp')).toEqual({ ok: true, type: 'image/webp' })
  })

  it('fails closed when the signature does not match the declared type', () => {
    expect(validateImageBytes(text, 'image/png')).toEqual({ ok: false, reason: 'signature-mismatch' })
    expect(validateImageBytes(png, 'image/jpeg')).toEqual({ ok: false, reason: 'signature-mismatch' })
    expect(validateImageBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46]), 'image/webp')).toEqual({ ok: false, reason: 'signature-mismatch' })
  })

  it('refuses unsupported, empty and oversized payloads', () => {
    expect(validateImageBytes(png, 'text/html')).toEqual({ ok: false, reason: 'unsupported-type' })
    expect(validateImageBytes(png, undefined)).toEqual({ ok: false, reason: 'unsupported-type' })
    expect(validateImageBytes(new Uint8Array(0), 'image/png')).toEqual({ ok: false, reason: 'empty' })
    expect(validateImageBytes(new Uint8Array(5 * 1024 * 1024 + 1), 'image/png')).toEqual({ ok: false, reason: 'too-large' })
  })
})

describe('published image metadata', () => {
  it('adds the Firebase download token required by getDownloadURL', () => {
    expect(publicImageMetadata('image/webp', 'fixed-download-token')).toEqual({
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: { firebaseStorageDownloadTokens: 'fixed-download-token' },
    })
  })

  it('repairs legacy library images once without replacing existing metadata', async () => {
    const setMetadata = vi.fn().mockResolvedValue(undefined)
    await expect(ensurePublicImageDownloadToken({ setMetadata }, {
      cacheControl: 'public,max-age=60',
      metadata: { owner: 'legacy-import' },
    }, 'backfilled-token')).resolves.toBe(true)
    expect(setMetadata).toHaveBeenCalledWith({
      cacheControl: 'public,max-age=60',
      metadata: { owner: 'legacy-import', firebaseStorageDownloadTokens: 'backfilled-token' },
    })

    setMetadata.mockClear()
    await expect(ensurePublicImageDownloadToken({ setMetadata }, {
      metadata: { firebaseStorageDownloadTokens: 'existing-token' },
    }, 'unused-token')).resolves.toBe(false)
    expect(setMetadata).not.toHaveBeenCalled()
  })
})
