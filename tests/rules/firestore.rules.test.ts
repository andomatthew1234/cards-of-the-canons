import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'

const projectId = 'demo-doxa-treasury'
let env: RulesTestEnvironment
beforeAll(async () => { env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } }) })
afterAll(async () => env?.cleanup())
beforeEach(async () => env.clearFirestore())

const product = { slug:'sample',name:'Sample',shortDescription:'Sample description',description:'Longer sample description',priceCents:1200,currency:'AUD',imageUrl:'/images/sample.svg',imageAlt:'Sample artwork',category:'Packs',featured:true,stock:null,status:'published' }

describe('Firestore access boundaries', () => {
  it('allows public published reads but hides drafts', async () => {
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'products/live'), product); await setDoc(doc(context.firestore(), 'products/draft'), { ...product, status:'draft' }) })
    const publicDb = env.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(publicDb, 'products/live')))
    await assertFails(getDoc(doc(publicDb, 'products/draft')))
  })
  it('prevents customers changing prices or creating enquiries directly', async () => {
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'products/live'), product) })
    const customerDb = env.authenticatedContext('customer-a').firestore()
    await assertFails(updateDoc(doc(customerDb, 'products/live'), { priceCents: 1 }))
    await assertFails(setDoc(doc(customerDb, 'enquiries/bypass'), { kind:'general',name:'Name',email:'n@example.com',message:'A sufficient message',consent:true,status:'new',createdAt:Timestamp.now() }))
  })
  it('lets a customer read only their own order', async () => {
    const order = { userId:'customer-a',status:'paid',currency:'AUD',subtotalCents:1200,shippingCents:0,totalCents:1200,items:[{productId:'live',name:'Sample',unitPriceCents:1200,quantity:1,lineTotalCents:1200}],createdAt:Timestamp.now() }
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'orders/order-a'), order) })
    await assertSucceeds(getDoc(doc(env.authenticatedContext('customer-a').firestore(), 'orders/order-a')))
    await assertFails(getDoc(doc(env.authenticatedContext('customer-b').firestore(), 'orders/order-a')))
  })
  it('allows only a custom-claim administrator to write valid products', async () => {
    await assertSucceeds(setDoc(doc(env.authenticatedContext('admin', { admin:true }).firestore(), 'products/new'), product))
    await assertFails(setDoc(doc(env.authenticatedContext('customer').firestore(), 'products/new'), product))
    await assertFails(setDoc(doc(env.authenticatedContext('admin', { admin:true }).firestore(), 'products/bad'), { ...product, extraData:'pollution' }))
  })
  it('keeps Journal drafts private and every article mutation server-owned', async () => {
    const article = { slug:'a-published-story',title:'A published story',excerpt:'A considered introduction to this Journal story.',bodyMarkdown:'## A heading\n\nA complete story for readers.',category:'Progress update',coverImageUrl:'',coverImageAlt:'',authorName:'Doxa Treasury',seoTitle:'',seoDescription:'',featured:false,status:'published',revision:1,publishedAt:Timestamp.now(),createdAt:Timestamp.now(),updatedAt:Timestamp.now() }
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'articles/live'), article); await setDoc(doc(context.firestore(), 'articles/draft'), { ...article, status:'draft' }) })
    const publicDb = env.unauthenticatedContext().firestore()
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertSucceeds(getDoc(doc(publicDb, 'articles/live')))
    await assertFails(getDoc(doc(publicDb, 'articles/draft')))
    await assertSucceeds(getDoc(doc(adminDb, 'articles/draft')))
    await assertFails(setDoc(doc(adminDb, 'articles/forged'), article))
    await assertFails(updateDoc(doc(adminDb, 'articles/live'), { status:'draft' }))
    await assertFails(deleteDoc(doc(adminDb, 'articles/live')))
  })
  it('keeps legacy page projections server-owned', async () => {
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    const page = {
      page:'home', eyebrow:'History worth holding', title:'Stories worth collecting', body:'A considered introduction to the collection.', contentVersion:2, status:'published',
      sections:{
        hero:{ accent:'worth collecting',imageUrl:'/images/history/hero.jpg',imageAlt:'A historic monastery',imageCredit:'Public domain',primaryActionLabel:'Explore the collection',secondaryActionLabel:'Discover our purpose' },
        values:{ firstTitle:'Rich context',firstBody:'Designed to encourage learning',secondTitle:'Collectible format',secondBody:'Created for thoughtful discovery',thirdTitle:'Considered detail',thirdBody:'Made to revisit',marquee:'Collectible storytelling · Church history' },
        featured:{ eyebrow:'Featured collection',title:'Explore the collection',body:'Discover the current collection.' },
        story:{ eyebrow:'A living inheritance',title:'The cards begin in real places.',body:'A story grounded in real places and history.',imageUrl:'/images/history/story.jpg',imageAlt:'A historic church interior',imageCredit:'Licensed image',actionLabel:'Discover our purpose' },
      },
    }
    await assertFails(setDoc(doc(adminDb, 'pageContent/home'), page))
    await assertFails(setDoc(doc(adminDb, 'siteSettings/main'), { businessName:'Doxa',announcement:'',contactEmail:'info@doxatreasury.com',currency:'AUD',status:'published' }))
    await assertFails(setDoc(doc(adminDb, 'pageContent/unsafe'), { ...page, sections:{ ...page.sections, hero:{ ...page.sections.hero, imageUrl:'javascript:alert(1)' } } }))
    await assertFails(setDoc(doc(adminDb, 'pageContent/polluted'), { ...page, sections:{ ...page.sections, trackingScript:'evil' } }))
  })
  it('exposes only the atomic published website document', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'websiteContent/published'), { revision:1,content:{ safe:true },publishedAt:Timestamp.now() })
      await setDoc(doc(context.firestore(), 'websiteContent/preview'), { revision:2,content:{ private:true } })
      await setDoc(doc(context.firestore(), 'websiteContentDrafts/current'), { revision:3,content:{ private:true } })
      await setDoc(doc(context.firestore(), 'websiteContentVersions/v0000000001'), { revision:1,content:{ private:true } })
    })
    const publicDb = env.unauthenticatedContext().firestore()
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertSucceeds(getDoc(doc(publicDb, 'websiteContent/published')))
    await assertFails(getDoc(doc(publicDb, 'websiteContent/preview')))
    await assertFails(getDocs(collection(publicDb, 'websiteContent')))
    await assertFails(getDoc(doc(adminDb, 'websiteContentDrafts/current')))
    await assertFails(getDoc(doc(adminDb, 'websiteContentVersions/v0000000001')))
    await assertFails(setDoc(doc(adminDb, 'websiteContent/published'), { revision:4 }))
  })
  it('prevents products from referencing the page-image library', async () => {
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    const pageImage = 'https://firebasestorage.googleapis.com/v0/b/demo-doxa-treasury.appspot.com/o/page-images%2Flibrary%2Fhero.jpg?alt=media&token=abc'
    const productImage = 'https://firebasestorage.googleapis.com/v0/b/demo-doxa-treasury.appspot.com/o/product-images%2Fsample%2Ffront.jpg?alt=media&token=abc'
    await assertFails(setDoc(doc(adminDb, 'products/page-image'), { ...product, imageUrl:pageImage }))
    await assertSucceeds(setDoc(doc(adminDb, 'products/product-image'), { ...product, imageUrl:productImage }))
  })
  it('grants nothing for a verified mailbox and everything for a server-issued claim', async () => {
    // No mailbox address — verified or not — is a credential any more.
    await assertFails(setDoc(doc(env.authenticatedContext('founder', { email:'mumanderson10@gmail.com', email_verified:true }).firestore(), 'products/founder'), product))
    await assertFails(setDoc(doc(env.authenticatedContext('matthew', { email:'matthew@andomail.com', email_verified:true }).firestore(), 'products/matthew'), product))
    await assertFails(setDoc(doc(env.authenticatedContext('attacker', { email:'attacker@example.com', email_verified:true }).firestore(), 'products/attacker'), product))
    await assertSucceeds(setDoc(doc(env.authenticatedContext('claimed', { email:'nobody-in-particular@example.com', email_verified:false, admin:true }).firestore(), 'products/claimed'), product))
  })
  it('denies a blocked administrator immediately, including their control record', async () => {
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'accountControls/admin'), { disabled:true, updatedAt:Timestamp.now() }) })
    const blockedAdmin = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertFails(setDoc(doc(blockedAdmin, 'products/blocked'), product))
    await assertFails(getDoc(doc(blockedAdmin, 'analyticsEvents/any')))
    // A blocked session cannot clear its own block.
    await assertFails(setDoc(doc(blockedAdmin, 'accountControls/admin'), { disabled:false, updatedAt:Timestamp.now() }))
  })
  it('allows administrators to disable private access without allowing self-service controls', async () => {
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertSucceeds(setDoc(doc(adminDb, 'accountControls/customer-a'), { disabled:true, updatedAt:Timestamp.now() }))
    await assertFails(setDoc(doc(env.authenticatedContext('customer-a').firestore(), 'accountControls/customer-a'), { disabled:false, updatedAt:Timestamp.now() }))
  })
  it('keeps deletion tombstones server-owned, unmodifiable and non-recreatable', async () => {
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'usersPrivate/customer-delete'), { displayName:'Delete me',email:'delete@example.com',createdAt:Timestamp.now() }) })
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    // Profile documents are server-owned: no client, not even an
    // administrator, may delete them as part of a deletion.
    const batch = writeBatch(adminDb)
    batch.set(doc(adminDb, 'accountControls/customer-delete'), { disabled:true,deleted:true,updatedAt:Timestamp.now() })
    batch.delete(doc(adminDb, 'usersPrivate/customer-delete'))
    await assertFails(batch.commit())

    await assertSucceeds(setDoc(doc(adminDb, 'accountControls/customer-delete'), { disabled:true,deleted:true,updatedAt:Timestamp.now() }))
    const deletedDb = env.authenticatedContext('customer-delete', { email:'delete@example.com' }).firestore()
    await assertFails(getDoc(doc(deletedDb, 'usersPrivate/customer-delete')))
    await assertFails(setDoc(doc(deletedDb, 'usersPrivate/customer-delete'), { displayName:'Return',email:'delete@example.com',createdAt:Timestamp.now() }))
    // The tombstone itself can neither be cleared nor deleted by a client.
    await assertFails(setDoc(doc(adminDb, 'accountControls/customer-delete'), { disabled:false,updatedAt:Timestamp.now() }))
    await assertFails(deleteDoc(doc(adminDb, 'accountControls/customer-delete')))
  })
  it('protects owner accounts and role records from client tampering', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountRoles/founder'), { role:'owner', updatedAt:Timestamp.now() })
      await setDoc(doc(context.firestore(), 'accountRoles/owner-1'), { role:'owner', updatedAt:Timestamp.now() })
      await setDoc(doc(context.firestore(), 'accountRoles/admin-1'), { role:'admin', updatedAt:Timestamp.now() })
    })
    const adminDb = env.authenticatedContext('admin-1', { admin:true }).firestore()
    const ownerDb = env.authenticatedContext('owner-1', { admin:true }).firestore()
    // An administrator cannot disable, delete or demote an owner…
    await assertFails(setDoc(doc(adminDb, 'accountControls/founder'), { disabled:true,deleted:true,updatedAt:Timestamp.now() }))
    // …but an owner can change another administrator.
    await assertSucceeds(setDoc(doc(ownerDb, 'accountControls/admin-1'), { disabled:true,updatedAt:Timestamp.now() }))
    // Role records are server-owned: never writable or deletable from a client.
    await assertFails(setDoc(doc(adminDb, 'accountRoles/admin-1'), { role:'owner', updatedAt:Timestamp.now() }))
    await assertFails(deleteDoc(doc(adminDb, 'accountRoles/founder')))
    // And nobody edits their own control record.
    await assertFails(setDoc(doc(ownerDb, 'accountControls/owner-1'), { disabled:false,updatedAt:Timestamp.now() }))
    await assertFails(setDoc(doc(adminDb, 'accountControls/admin-1'), { disabled:false,updatedAt:Timestamp.now() }))
  })
  it('requires trusted server code for fulfilment, payment and total edits', async () => {
    const order = { userId:'customer-a',status:'paid',currency:'AUD',subtotalCents:1200,shippingCents:0,totalCents:1200,items:[{productId:'live',name:'Sample',unitPriceCents:1200,quantity:1,lineTotalCents:1200}],createdAt:Timestamp.now() }
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'orders/order-transition'), order) })
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertFails(updateDoc(doc(adminDb, 'orders/order-transition'), { status:'fulfilled', updatedAt:Timestamp.now() }))
    await assertFails(updateDoc(doc(adminDb, 'orders/order-transition'), { totalCents:1, updatedAt:Timestamp.now() }))
  })
  it('denies every client write to the private profile, including the owner’s own', async () => {
    const customerDb = env.authenticatedContext('customer-a', { email: 'owner@example.com' }).firestore()
    const validProfile = { displayName: 'Owner', email: 'owner@example.com', createdAt: Timestamp.now() }
    // Profile mutation happens only through the rate-limited server callable:
    // there is no client-writable path left, for anyone.
    await assertFails(setDoc(doc(customerDb, 'usersPrivate/customer-a'), validProfile))
    await assertFails(setDoc(doc(customerDb, 'usersPrivate/customer-b'), validProfile))
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'usersPrivate/customer-a'), validProfile) })
    await assertSucceeds(getDoc(doc(customerDb, 'usersPrivate/customer-a')))
    await assertFails(updateDoc(doc(customerDb, 'usersPrivate/customer-a'), { email: 'other@example.com' }))
    await assertFails(updateDoc(doc(customerDb, 'usersPrivate/customer-a'), { displayName: 'Renamed' }))
    await assertFails(deleteDoc(doc(customerDb, 'usersPrivate/customer-a')))
    await assertFails(deleteDoc(doc(env.authenticatedContext('admin', { admin:true }).firestore(), 'usersPrivate/customer-a')))
  })
  it('keeps analytics events private and requires the trusted Function to create them', async () => {
    const publicDb = env.unauthenticatedContext().firestore()
    const event = { name:'page_view',path:'/shop',sessionId:'0123456789abcdef0123456789abcdef',device:'mobile',createdAt:serverTimestamp() }
    await assertFails(setDoc(doc(publicDb, 'analyticsEvents/valid'), event))
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'analyticsEvents/valid'), { ...event, createdAt: Timestamp.now() }) })
    await assertFails(getDoc(doc(publicDb, 'analyticsEvents/valid')))
    await assertSucceeds(getDoc(doc(env.authenticatedContext('admin', { admin:true }).firestore(), 'analyticsEvents/valid')))
  })
  it('keeps security policies and challenge records server-only', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountSecurity/customer-a'), { version:1,methods:{},requirements:{} })
      await setDoc(doc(context.firestore(), '_securityChallenges/challenge-a'), { codeHash:'not-a-real-code',attempts:0 })
    })
    const ownerDb = env.authenticatedContext('customer-a').firestore()
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertFails(getDoc(doc(ownerDb, 'accountSecurity/customer-a')))
    await assertFails(setDoc(doc(ownerDb, 'accountSecurity/customer-a'), { methods:{ emailCode:{ enabled:true } } }))
    await assertFails(getDoc(doc(adminDb, 'accountSecurity/customer-a')))
    await assertFails(getDoc(doc(ownerDb, '_securityChallenges/challenge-a')))
  })
  it('lets only an enabled owner read server-written account activity', async () => {
    const event = { type:'login',category:'security',title:'New sign-in',description:'Signed in with Google.',createdAt:Timestamp.now(),recordedAt:Timestamp.now(),expiresAt:Timestamp.fromMillis(Date.now() + 86_400_000) }
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountActivity/customer-a/activityEvents/login-a'), event)
      await setDoc(doc(context.firestore(), 'accountActivity/customer-disabled/activityEvents/login-b'), event)
      await setDoc(doc(context.firestore(), 'accountControls/customer-disabled'), { disabled:true,updatedAt:Timestamp.now() })
    })
    const ownerDb = env.authenticatedContext('customer-a').firestore()
    const ownerQuery = query(collection(ownerDb, 'accountActivity/customer-a/activityEvents'), orderBy('createdAt', 'desc'), limit(50))
    await assertSucceeds(getDoc(doc(ownerDb, 'accountActivity/customer-a/activityEvents/login-a')))
    await assertSucceeds(getDocs(ownerQuery))
    await assertFails(getDoc(doc(env.authenticatedContext('customer-b').firestore(), 'accountActivity/customer-a/activityEvents/login-a')))
    await assertFails(getDoc(doc(env.authenticatedContext('admin', { admin:true }).firestore(), 'accountActivity/customer-a/activityEvents/login-a')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'accountActivity/customer-a/activityEvents/login-a')))
    await assertFails(getDoc(doc(env.authenticatedContext('customer-disabled').firestore(), 'accountActivity/customer-disabled/activityEvents/login-b')))
  })
  it('denies every client write to account activity', async () => {
    const ownerDb = env.authenticatedContext('customer-a').firestore()
    const ref = doc(ownerDb, 'accountActivity/customer-a/activityEvents/forged')
    const event = { type:'order_purchased',category:'purchase',title:'Forged',description:'Forged event',createdAt:serverTimestamp(),recordedAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now() + 86_400_000) }
    await assertFails(setDoc(ref, event))
    await env.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'accountActivity/customer-a/activityEvents/existing'), { ...event, createdAt:Timestamp.now(),recordedAt:Timestamp.now() }))
    await assertFails(updateDoc(doc(ownerDb, 'accountActivity/customer-a/activityEvents/existing'), { title:'Changed' }))
    await assertFails(deleteDoc(doc(ownerDb, 'accountActivity/customer-a/activityEvents/existing')))
  })
  it('rejects analytics schema pollution, PII and invalid commerce events', async () => {
    const publicDb = env.unauthenticatedContext().firestore()
    const base = { name:'page_view',path:'/shop',sessionId:'0123456789abcdef0123456789abcdef',device:'desktop',createdAt:serverTimestamp() }
    await assertFails(setDoc(doc(publicDb, 'analyticsEvents/pii'), { ...base, email:'visitor@example.com' }))
    await assertFails(setDoc(doc(publicDb, 'analyticsEvents/bad-session'), { ...base, sessionId:'visitor@example.com' }))
    await assertFails(setDoc(doc(publicDb, 'analyticsEvents/bad-cart'), { ...base, name:'add_to_cart' }))
    await assertFails(updateDoc(doc(publicDb, 'analyticsEvents/missing'), { path:'/tampered' }))
  })
  it('keeps community drafts private and responses owner-or-admin readable', async () => {
    const survey = { title:'Choose a theme',description:'Help shape a collection.',status:'published',questions:[{ id:'q_one',prompt:'Which theme?',type:'single_choice',required:true,options:['Councils','Fathers'] }],responseCount:1,createdAt:Timestamp.now(),updatedAt:Timestamp.now() }
    const response = { surveyId:'open',userId:'customer-a',respondentName:'Customer A',respondentEmail:'a@example.com',answers:[{ questionId:'q_one',value:'Councils' }],createdAt:Timestamp.now(),updatedAt:Timestamp.now() }
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'communitySurveys/open'), survey)
      await setDoc(doc(context.firestore(), 'communitySurveys/draft'), { ...survey, status:'draft' })
      await setDoc(doc(context.firestore(), 'communitySurveys/open/responses/customer-a'), response)
    })
    const ownerDb = env.authenticatedContext('customer-a').firestore()
    const strangerDb = env.authenticatedContext('customer-b').firestore()
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertSucceeds(getDoc(doc(ownerDb, 'communitySurveys/open')))
    await assertFails(getDoc(doc(ownerDb, 'communitySurveys/draft')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'communitySurveys/open')))
    await assertSucceeds(getDoc(doc(ownerDb, 'communitySurveys/open/responses/customer-a')))
    await assertFails(getDoc(doc(strangerDb, 'communitySurveys/open/responses/customer-a')))
    await assertSucceeds(getDoc(doc(adminDb, 'communitySurveys/open/responses/customer-a')))
    await assertSucceeds(getDoc(doc(adminDb, 'communitySurveys/draft')))
  })
  it('requires trusted Functions for every community write', async () => {
    const survey = { title:'Forged',description:'',status:'published',questions:[],responseCount:0,createdAt:Timestamp.now(),updatedAt:Timestamp.now() }
    for (const db of [env.unauthenticatedContext().firestore(), env.authenticatedContext('customer-a').firestore(), env.authenticatedContext('admin', { admin:true }).firestore()]) {
      await assertFails(setDoc(doc(db, 'communitySurveys/forged'), survey))
      await assertFails(setDoc(doc(db, 'communitySurveys/open/responses/customer-a'), { surveyId:'open',userId:'customer-a',answers:[] }))
    }
  })
  it('keeps Treasury definitions and codes server-only while isolating customer holdings', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'treasuryEditions/edition-1'), { title:'First Edition',status:'published' })
      await setDoc(doc(context.firestore(), 'treasuryCards/card-1'), { editionId:'edition-1',title:'Card 01',story:'Private reveal' })
      await setDoc(doc(context.firestore(), '_treasuryCodes/' + 'a'.repeat(64)), { status:'active',cardId:'card-1' })
      await setDoc(doc(context.firestore(), '_treasuryCodeBatches/batch-1'), { quantity:1 })
      await setDoc(doc(context.firestore(), '_treasuryRedemptions/' + 'a'.repeat(64)), { cardId:'card-1' })
      await setDoc(doc(context.firestore(), 'userTreasuries/customer-a/cards/card-1'), { cardId:'card-1',editionId:'edition-1',quantity:1 })
    })
    const ownerDb = env.authenticatedContext('customer-a').firestore()
    const strangerDb = env.authenticatedContext('customer-b').firestore()
    const adminDb = env.authenticatedContext('admin', { admin:true }).firestore()
    await assertSucceeds(getDoc(doc(ownerDb, 'userTreasuries/customer-a/cards/card-1')))
    await assertFails(getDoc(doc(strangerDb, 'userTreasuries/customer-a/cards/card-1')))
    await assertFails(setDoc(doc(ownerDb, 'userTreasuries/customer-a/cards/card-2'), { cardId:'card-2',quantity:99 }))
    for (const privatePath of ['treasuryEditions/edition-1','treasuryCards/card-1','_treasuryCodes/' + 'a'.repeat(64),'_treasuryCodeBatches/batch-1','_treasuryRedemptions/' + 'a'.repeat(64)]) {
      await assertFails(getDoc(doc(ownerDb, privatePath)))
      await assertFails(getDoc(doc(adminDb, privatePath)))
      await assertFails(setDoc(doc(adminDb, privatePath), { forged:true }))
    }
  })
})

describe('newsletter consent boundaries', () => {
  const subscriber = {
    email:'jane@example.com',
    emailHash:'a'.repeat(64),
    consent:true,
    source:'home',
    status:'pending',
    createdAt:Timestamp.now(),
    requestedAt:Timestamp.now(),
    confirmTokenHash:'b'.repeat(64),
    updatedAt:Timestamp.now(),
  }
  const adminDb = () => env.authenticatedContext('admin', { admin:true }).firestore()
  const seed = (overrides: Record<string, unknown> = {}) => env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'newsletterSubscribers/sub-1'), { ...subscriber, ...overrides })
    await setDoc(doc(context.firestore(), '_newsletterTokens/' + 'c'.repeat(64)), { action:'confirm', subscriberId:'a'.repeat(64), issuedAt:Timestamp.now(), expiresAt:Timestamp.fromMillis(Date.now() + 604_800_000), usedAt:null })
    await setDoc(doc(context.firestore(), 'newsletterConsentEvents/e-1'), { subscriberId:'a'.repeat(64), action:'requested', source:'home', recordedAt:Timestamp.now(), expiresAt:Timestamp.fromMillis(Date.now() + 63_072_000_000), writtenBy:'server' })
  })

  it('lets no client create or read subscriber records', async () => {
    await seed()
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'newsletterSubscribers/forge'), subscriber))
    await assertFails(setDoc(doc(env.authenticatedContext('customer').firestore(), 'newsletterSubscribers/forge'), subscriber))
    await assertFails(getDoc(doc(env.authenticatedContext('customer').firestore(), 'newsletterSubscribers/sub-1')))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'newsletterSubscribers/sub-1')))
    await assertSucceeds(getDoc(doc(adminDb(), 'newsletterSubscribers/sub-1')))
    await assertFails(deleteDoc(doc(env.authenticatedContext('customer').firestore(), 'newsletterSubscribers/sub-1')))
  })

  it('constrains administrator updates to status, statuses and the source enum', async () => {
    await seed()
    await assertSucceeds(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'unsubscribed', updatedAt:Timestamp.now() }))
    await assertFails(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'confirmed-by-hand', updatedAt:Timestamp.now() }))
    await assertFails(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'subscribed', source:'campaign-x', updatedAt:Timestamp.now() }))
    await assertFails(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'subscribed', email:'attacker@example.com', updatedAt:Timestamp.now() }))
    await seed({ source:'account_registration' })
    await assertSucceeds(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'unsubscribed', updatedAt:Timestamp.now() }))
    await seed({ source:'account_settings' })
    await assertSucceeds(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'unsubscribed', updatedAt:Timestamp.now() }))
    // A stored record that predates the enum cannot be silently re-subscribed.
    await seed({ source:'legacy-value' })
    await assertFails(updateDoc(doc(adminDb(), 'newsletterSubscribers/sub-1'), { status:'subscribed', updatedAt:Timestamp.now() }))
  })

  it('keeps consent tokens and evidence out of every client’s reach', async () => {
    await seed()
    const tokenRef = '_newsletterTokens/' + 'c'.repeat(64)
    for (const db of [env.unauthenticatedContext().firestore(), env.authenticatedContext('customer').firestore(), adminDb()]) {
      await assertFails(getDoc(doc(db, tokenRef)))
      await assertFails(setDoc(doc(db, tokenRef), { action:'confirm', subscriberId:'a'.repeat(64) }))
      await assertFails(deleteDoc(doc(db, tokenRef)))
      await assertFails(setDoc(doc(db, 'newsletterConsentEvents/forged'), { subscriberId:'a'.repeat(64), action:'confirmed', recordedAt:Timestamp.now(), expiresAt:Timestamp.fromMillis(Date.now() + 604_800_000), writtenBy:'server' }))
      await assertFails(deleteDoc(doc(db, 'newsletterConsentEvents/e-1')))
    }
    // Consent evidence is administrator-readable for audits, never writable.
    await assertSucceeds(getDoc(doc(adminDb(), 'newsletterConsentEvents/e-1')))
  })
})
