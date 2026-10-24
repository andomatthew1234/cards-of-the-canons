import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'

// Never point rules tests at the production project alias. Firebase reserves
// demo-* project IDs for emulator-only use and refuses accidental live access.
const projectId = 'demo-doxa-treasury'
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    storage: { rules: readFileSync('storage.rules', 'utf8') },
    // Storage rules read the server-owned account control record through the
    // Firestore API, so the Firestore emulator must be wired up too.
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => env?.cleanup())
beforeEach(async () => { await env.clearStorage(); await env.clearFirestore() })

describe('Cloud Storage access boundaries', () => {
  it('accepts administrator uploads only into the private staging area', async () => {
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const adminStorage = env.authenticatedContext('admin', { admin: true }).storage()
    const customerStorage = env.authenticatedContext('customer').storage()

    await assertSucceeds(uploadBytes(ref(adminStorage, 'image-staging/admin/1712-front.png'), image, { contentType: 'image/png' }))
    // Customers never reach the staging area.
    await assertFails(uploadBytes(ref(customerStorage, 'image-staging/customer/1712-front.png'), image, { contentType: 'image/png' }))
    // A wrong content type is refused at the boundary as well.
    await assertFails(uploadBytes(ref(adminStorage, 'image-staging/admin/notes.txt'), image, { contentType: 'text/plain' }))
    // Public prefixes are server-publications only: nobody writes them directly.
    await assertFails(uploadBytes(ref(adminStorage, 'product-images/product-a/front.png'), image, { contentType: 'image/png' }))
    await assertFails(uploadBytes(ref(customerStorage, 'product-images/product-a/front.png'), image, { contentType: 'image/png' }))
  })

  it('keeps the staging area private while published images stay publicly readable', async () => {
    const image = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0])
    const adminStorage = env.authenticatedContext('admin', { admin: true }).storage()
    await uploadBytes(ref(adminStorage, 'image-staging/admin/1712-hero.jpg'), image, { contentType: 'image/jpeg' })

    // Staging is invisible to everybody but its administrator.
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'image-staging/admin/1712-hero.jpg')))
    await assertFails(getBytes(ref(env.authenticatedContext('other-admin', { admin: true }).storage(), 'image-staging/admin/1712-hero.jpg')))
    await assertSucceeds(getBytes(ref(adminStorage, 'image-staging/admin/1712-hero.jpg')))

    // Publication (the server function's copy) lands in a readable prefix.
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), 'page-images/home/hero.jpg'), image, { contentType: 'image/jpeg' })
    })
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), 'page-images/home/hero.jpg')))
    await assertFails(deleteObject(ref(env.unauthenticatedContext().storage(), 'page-images/home/hero.jpg')))
    await assertFails(deleteObject(ref(adminStorage, 'page-images/home/hero.jpg')))
  })

  it('rejects files over the five-megabyte limit and paths outside approved folders', async () => {
    const adminStorage = env.authenticatedContext('admin', { admin: true }).storage()
    const tooLarge = new Uint8Array(5 * 1024 * 1024)
    await assertFails(uploadBytes(ref(adminStorage, 'image-staging/admin/large.webp'), tooLarge, { contentType: 'image/webp' }))
    await assertFails(uploadBytes(ref(adminStorage, 'private/unexpected.png'), new Uint8Array([1]), { contentType: 'image/png' }))
    await assertFails(uploadBytes(ref(adminStorage, 'image-staging/admin/sub/dir.png'), new Uint8Array([1]), { contentType: 'image/png' }))
  })

  it('stops a blocked administrator from staging images, even with a valid claim', async () => {
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountControls/admin'), { disabled: true, updatedAt: Timestamp.now() })
    })
    const blockedStorage = env.authenticatedContext('admin', { admin: true }).storage()
    await assertFails(uploadBytes(ref(blockedStorage, 'image-staging/admin/blocked.png'), image, { contentType: 'image/png' }))
    await assertFails(deleteObject(ref(blockedStorage, 'image-staging/admin/blocked.png')))
    // A mailbox-verified session without the claim never had access either.
    const mailboxStorage = env.authenticatedContext('mailbox-owner', { email: 'mumanderson10@gmail.com', email_verified: true }).storage()
    await assertFails(uploadBytes(ref(mailboxStorage, 'image-staging/mailbox-owner/mailbox.png'), image, { contentType: 'image/png' }))
  })

  it('does not let an administrator stage into another account’s folder', async () => {
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const adminStorage = env.authenticatedContext('admin', { admin: true }).storage()
    await assertFails(uploadBytes(ref(adminStorage, 'image-staging/other-admin/injected.png'), image, { contentType: 'image/png' }))
  })
})
