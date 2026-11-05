export type ProductStatus = 'draft' | 'published'
export type EnquiryKind = 'general' | 'quote'
export type OrderStatus = 'pending' | 'paid' | 'payment_failed' | 'payment_review' | 'checkout_failed' | 'cancelled' | 'fulfilled'

export interface Product {
  id: string
  slug: string
  name: string
  shortDescription: string
  description: string
  priceCents: number
  currency: 'AUD'
  imageUrl: string
  imageAlt: string
  category: string
  /** Lower values appear first in storefront product rails. */
  sortOrder?: number
  featured: boolean
  stock: number | null
  /** Physical Treasury cards included per purchased unit. Accessories use 0. */
  treasuryCardsPerUnit: number
  status: ProductStatus
}

export interface CartLine { productId: string; quantity: number }

export type SiteTypographyPreset = 'heritage' | 'classical' | 'editorial'
export type SiteLogoMode = 'monogram' | 'image' | 'text'

export interface SiteThemePalette {
  ink: string
  brown: string
  brownAccent: string
  gold: string
  goldLight: string
  paper: string
  cream: string
  line: string
  surface: string
  muted: string
  success: string
  danger: string
}

export interface SiteTheme {
  version: 1
  typography: SiteTypographyPreset
  palette: SiteThemePalette
  logo: {
    mode: SiteLogoMode
    monogram: string
    imageUrl: string
    imageAlt: string
  }
  header: {
    brandName: string
    navigation: {
      home: string
      shop: string
      about: string
      contact: string
    }
  }
  footer: {
    brandName: string
    description: string
    exploreHeading: string
    accountHeading: string
    copyrightText: string
    navigation: {
      shop: string
      about: string
      contact: string
      account: string
      orders: string
      security: string
      administrator: string
    }
  }
}

export interface SiteSettings {
  businessName: string
  announcement: string
  contactEmail: string
  currency: 'AUD'
  status?: ProductStatus
  /** Optional so settings saved before the visual editor remain valid. */
  theme?: SiteTheme
}

export interface HomePageSections {
  hero: {
    accent: string
    imageUrl: string
    imageAlt: string
    /** Optional so homepage content saved before the flip-card editor remains valid. */
    backImageUrl?: string
    backImageAlt?: string
    imageCredit: string
    primaryActionLabel: string
    secondaryActionLabel: string
  }
  values: {
    firstTitle: string
    firstBody: string
    secondTitle: string
    secondBody: string
    thirdTitle: string
    thirdBody: string
    marquee: string
  }
  featured: {
    eyebrow: string
    title: string
    body: string
  }
  story: {
    eyebrow: string
    title: string
    body: string
    imageUrl: string
    imageAlt: string
    imageCredit: string
    actionLabel: string
  }
}

export interface PageContent {
  page: 'home' | 'about'
  eyebrow: string
  title: string
  body: string
  imageUrl?: string
  imageAlt?: string
  contentVersion?: 2
  sections?: HomePageSections
  status?: ProductStatus
}

export interface Enquiry {
  id?: string
  kind: EnquiryKind
  name: string
  email: string
  organisation?: string
  message: string
  consent: boolean
  status: 'new' | 'in_progress' | 'resolved'
  createdAt?: unknown
}

export type NewsletterSource = 'home' | 'footer' | 'checkout' | 'contact' | 'account_registration' | 'account_settings'
export type NewsletterStatus = 'pending' | 'subscribed' | 'unsubscribed'

export interface AccountMailingListStatus {
  email: string
  emailVerified: boolean
  status: NewsletterStatus | 'not_joined'
}

export interface NewsletterSubscriber {
  id?: string
  email: string
  consent: true
  source: NewsletterSource | string
  /** 'pending' is retained only for legacy records created before immediate subscription. */
  status: NewsletterStatus
  createdAt?: unknown
  confirmedAt?: unknown
  unsubscribedAt?: unknown
}

export interface NewsletterSignupResult {
  demo: boolean
  /** Public callers receive no address state or delivery details. */
  accepted?: true
}

export type NewsletterCampaignStatus = 'draft' | 'preparing' | 'provider_draft' | 'queued' | 'sent'

export interface NewsletterCampaign {
  id: string
  subject: string
  previewText: string
  heading: string
  body: string
  buttonLabel: string
  buttonUrl: string
  status: NewsletterCampaignStatus
  source?: 'manual' | 'journal'
  audienceCount: number
  providerBroadcastId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  sentAt?: string | null
  lastError?: string | null
}

export interface NewsletterAdminOverview {
  configured: boolean
  counts: { subscribed: number; pending: number; unsubscribed: number }
  campaigns: NewsletterCampaign[]
}

export type NewsletterCampaignDraft = Pick<NewsletterCampaign, 'subject' | 'previewText' | 'heading' | 'body' | 'buttonLabel' | 'buttonUrl'> & { id?: string }

export type EmailCampaignBlockType = 'heading' | 'paragraph' | 'image' | 'button' | 'link' | 'divider' | 'spacer' | 'columns'
export type EmailCampaignPurpose = 'marketing' | 'service'
export type EmailCampaignAudience = 'mailing_list' | 'all_accounts' | 'individuals'
export type EmailCampaignStatus = 'draft' | 'scheduled' | 'preparing' | 'queued' | 'sent' | 'partially_sent' | 'failed' | 'cancelled'
export type EmailQueueStatus = EmailCampaignStatus | 'delivered'

export interface EmailCampaignBlock {
  id: string
  type: EmailCampaignBlockType
  text: string
  url: string
  alt: string
  caption: string
  align: 'left' | 'center' | 'right'
  size: 'small' | 'medium' | 'large'
  columns?: EmailCampaignBlock[][]
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  padding?: number
  fontFamily?: 'serif' | 'sans'
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  lineHeight?: number
  width?: number
}

export interface EmailCampaign {
  id: string
  revision: number
  name: string
  subject: string
  previewText: string
  blocks: EmailCampaignBlock[]
  purpose: EmailCampaignPurpose
  audience: EmailCampaignAudience
  recipientEmails: string[]
  status: EmailCampaignStatus
  recipientCount: number
  acceptedCount: number
  failedCount: number
  createdAt: string | null
  updatedAt: string | null
  scheduledAt: string | null
  sentAt: string | null
  lastError: string | null
}

export type EmailCampaignDraft = Pick<EmailCampaign, 'revision' | 'name' | 'subject' | 'previewText' | 'blocks' | 'purpose' | 'audience' | 'recipientEmails'> & { id?: string }

export interface EmailQueueItem {
  id: string
  kind: 'campaign' | 'journal' | 'newsletter' | 'test' | 'transactional'
  subject: string
  recipientLabel: string
  recipientCount: number
  acceptedCount: number
  deliveredCount: number
  failedCount: number
  status: EmailQueueStatus
  sourceId: string | null
  providerMessageId: string | null
  lastError: string | null
  createdAt: string | null
  updatedAt: string | null
  scheduledAt: string | null
  sentAt: string | null
}

export interface EmailCampaignWorkspace {
  configured: boolean
  audienceCounts: { mailingList: number; verifiedAccounts: number }
  audienceCandidates: Array<{ email: string; label: string; subscribed: boolean; verified: boolean }>
  audienceDirectoryComplete: boolean
  campaigns: EmailCampaign[]
  queue: EmailQueueItem[]
}

export interface EmailCampaignAudiencePage {
  candidates: EmailCampaignWorkspace['audienceCandidates']
  nextCursor: string | null
}

export interface OrderItemSnapshot {
  productId: string
  name: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
  inventoryTracked?: boolean
  treasuryCardsPerUnit?: number
  treasuryEligibleCodeCount?: number
}

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  currency: 'AUD'
  subtotalCents: number
  shippingCents: number
  totalCents: number
  items: OrderItemSnapshot[]
  treasuryEligibleCodeCount?: number
  treasuryAssignedCodeCount?: number
  treasuryRedeemedCodeCount?: number
  treasuryFailedAttempts?: number
  treasuryAttemptLimit?: number
  treasuryLocked?: boolean
  customerEmail?: string
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required'
  /** Normalised, monotonic payment state: unpaid | failed | paid | disputed | refunded. */
  paymentState?: 'unpaid' | 'failed' | 'paid' | 'disputed' | 'refunded'
  fulfilmentStatus?: 'unfulfilled' | 'fulfilled' | 'cancelled'
  refundStatus?: 'none' | 'partial' | 'full'
  paymentEnvironment?: 'test' | 'live'
  /** `sandbox` reservations never mutate operational product stock. */
  inventoryScope?: 'operational' | 'sandbox'
  inventoryState?: 'reserved' | 'committed' | 'released'
  stripeCheckoutStatus?: 'creating' | 'open' | 'complete' | 'expired' | 'failed'
  stripeCheckoutSessionId?: string
  stripePaymentIntentId?: string
  expiresAt?: unknown
  paidAt?: unknown
  updatedAt?: unknown
  createdAt: unknown
}

export interface Article {
  id: string
  revision: number
  slug: string
  title: string
  excerpt: string
  bodyMarkdown: string
  category: string
  coverImageUrl: string
  coverImageAlt: string
  authorName: string
  seoTitle: string
  seoDescription: string
  featured: boolean
  status: 'draft' | 'published' | 'archived'
  createdAt?: string | null
  updatedAt?: string | null
  publishedAt?: string | null
  notificationStatus?: 'not_requested' | 'preparing' | 'queued' | 'failed'
  notificationAudienceCount?: number
  notificationError?: string | null
}

export interface UserProfile {
  displayName: string
  email: string
  phone?: string
  onboarding?: {
    status: 'pending' | 'complete'
    version: 1
    termsVersion?: string
    startedAt?: unknown
    termsAcceptedAt?: unknown
    completedAt?: unknown
  }
  preferences?: {
    checkoutAndEnquiryAutofill: boolean
    mailingListRequested: boolean
    recoveryPhoneProvided: boolean
  }
  createdAt?: unknown
  updatedAt?: unknown
}

export type SecurityRequirement = 'signIn' | 'criticalActions' | 'paymentActions' | 'passwordlessSignIn'
export type SecurityMethodStatus = 'not_configured' | 'enabled'

export interface AccountSecurityPolicy {
  version: 1
  methods: {
    emailCode: { status: SecurityMethodStatus; verifiedAt: string | null }
    authenticator: { status: SecurityMethodStatus; verifiedAt: string | null }
    passkey: { status: SecurityMethodStatus; verifiedAt: string | null }
  }
  requirements: Record<SecurityRequirement, boolean>
}

export interface AccountSecurityCapabilities {
  emailCodeDelivery: boolean
  passwordlessEmailCode: boolean
  authenticator: boolean
  passkeys: boolean
  explanation: string
}

export interface ManagedAccount {
  uid: string
  email: string | null
  displayName: string | null
  disabled: boolean
  emailVerified: boolean
  providers: string[]
  createdAt: string
  lastSignInAt: string | null
  admin: boolean
  owner: boolean
}

export type AccountActivityType =
  | 'login'
  | 'order_purchased'
  | 'email_changed'
  | 'password_changed'
  | 'phone_changed'
  | 'profile_changed'
  | 'mfa_enrolled'
  | 'mfa_removed'

export interface AccountActivityLocation {
  city?: string
  region?: string
  country: string
  countryCode?: string
  latitude: number
  longitude: number
  accuracy: 'approximate'
}

export interface AccountActivityEvent {
  id: string
  type: AccountActivityType
  category: 'security' | 'profile' | 'purchase'
  title: string
  description: string
  createdAt: unknown
  // Server-evidence events are labelled 'server'; anything a client reported
  // (or any event written before provenance existed) stays unverified so the
  // interface never presents it as authoritative.
  verification?: 'server' | 'client_reported'
  metadata?: {
    provider?: string
    factorName?: string
    orderId?: string
    totalCents?: number
    currency?: string
    itemCount?: number
  }
  location?: AccountActivityLocation
}

export type AnalyticsEventName = 'page_view' | 'view_shop' | 'view_product' | 'add_to_cart' | 'begin_checkout' | 'generate_lead' | 'newsletter_signup' | 'sign_up'
export type AnalyticsDevice = 'desktop' | 'tablet' | 'mobile'

export interface AnalyticsEvent {
  id: string
  name: AnalyticsEventName
  path: string
  sessionId: string
  device: AnalyticsDevice
  createdAt: unknown
  itemId?: string
  quantity?: number
  valueCents?: number
  currency?: 'AUD'
  method?: 'password' | 'google' | 'apple'
  referrerHost?: string
  isLanding?: boolean
}

export type CommunitySurveyStatus = 'draft' | 'published' | 'closed'
export type CommunityQuestionType = 'single_choice' | 'multiple_choice' | 'short_text'

export interface CommunityQuestion {
  id: string
  prompt: string
  type: CommunityQuestionType
  required: boolean
  options: string[]
}

export interface CommunitySurvey {
  id: string
  title: string
  description: string
  status: CommunitySurveyStatus
  questions: CommunityQuestion[]
  responseCount: number
  createdAt?: unknown
  updatedAt?: unknown
  publishedAt?: unknown
  closedAt?: unknown
}

export interface CommunityAnswer {
  questionId: string
  value: string | string[]
}

export interface CommunityResponse {
  id: string
  surveyId: string
  userId: string
  respondentName: string
  respondentEmail: string
  answers: CommunityAnswer[]
  createdAt?: unknown
  updatedAt?: unknown
}

export type TreasuryPublishingStatus = 'draft' | 'published' | 'archived'

export interface TreasuryEdition {
  id: string
  title: string
  description: string
  coverImageUrl: string
  coverImageAlt: string
  status: TreasuryPublishingStatus
  sortOrder: number
  codePrefix?: string
}

export interface TreasuryOwnedCopy {
  id: string
  cardId: string
  editionId: string
  productionNumber: number | null
  acquiredAt: string | null
  source: 'physical_code' | 'legacy_migration' | 'admin'
  transferable: boolean
}

export interface TreasuryCard {
  id: string
  editionId: string
  number: string
  title: string
  teaser: string
  story: string
  imageUrl: string
  imageAlt: string
  status: TreasuryPublishingStatus
  sortOrder: number
  collected?: boolean
  quantity?: number
  firstCollectedAt?: string | null
  lastCollectedAt?: string | null
  copies?: TreasuryOwnedCopy[]
}

export interface TreasuryState {
  editions: TreasuryEdition[]
  cards: TreasuryCard[]
  uniqueCollected?: number
  totalAvailable?: number
  completionPercentage?: number
  treasuryBanned?: boolean
}

export interface TreasuryRedemptionSession {
  orderId: string
  eligibleCodeCount: number
  redeemedCodeCount: number
  remainingCodeCount: number
  failedAttempts: number
  attemptLimit: number
  attemptsRemaining: number
  locked: boolean
}

export interface TreasuryRedemptionResult extends TreasuryRedemptionSession {
  accepted: Array<{ index: number; cardId: string; title: string; instanceId: string }>
  rejected: Array<{ index: number; reason: string }>
}

export interface TreasuryTransaction {
  id: string
  type: 'code_assignment' | 'code_unassignment' | 'redemption' | 'failed_code' | 'transfer' | 'admin_add' | 'admin_remove' | 'attempt_grant' | 'allowance_change' | 'ban' | 'unban'
  accountId: string
  otherAccountId?: string
  orderId?: string
  cardId?: string
  instanceId?: string
  codeSuffix?: string
  detail?: string
  createdAt: string | null
  actorId?: string
}

export interface TreasuryAdminCustomerState extends TreasuryState {
  accountId: string
  banned: boolean
  orders: Array<TreasuryRedemptionSession & { status: OrderStatus }>
  transactions: TreasuryTransaction[]
}

export interface TreasuryCodeBatch {
  id: string
  label: string
  editionId: string
  cardId: string
  orderId: string
  quantity: number
  redeemedCount: number
  revokedCount: number
  status: 'active' | 'closed'
  createdAt: string | null
}

export interface TreasuryAdminState extends TreasuryState {
  batches: TreasuryCodeBatch[]
  transactions?: TreasuryTransaction[]
}

export interface TermsPolicyContent {
  title: string
  description: string
  bodyMarkdown: string
  version: string
  effectiveDate: string
}

export interface TermsPolicyDocument extends TermsPolicyContent {
  slug: 'terms'
  status: 'draft' | 'published'
  revision: number
  updatedAt?: unknown
  updatedBy?: string
  publishedAt?: unknown
  publishedBy?: string
}

export interface TermsPolicyEditorState {
  draft: TermsPolicyDocument
  published: TermsPolicyDocument | null
}

export type SocialMediaPlatform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'x'

export interface SocialMediaLink {
  id: SocialMediaPlatform
  label: string
  url: string
  visible: boolean
}

export interface SocialMediaLinksContent {
  heading: string
  links: SocialMediaLink[]
}

export interface SocialMediaLinksDocument extends SocialMediaLinksContent {
  status: 'draft' | 'published'
  revision: number
  updatedAt?: unknown
  updatedBy?: string
  publishedAt?: unknown
  publishedBy?: string
}

export interface SocialMediaLinksEditorState {
  draft: SocialMediaLinksDocument
  published: SocialMediaLinksDocument | null
}
