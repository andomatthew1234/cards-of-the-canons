/**
 * Public legal-policy publication gate.
 *
 * Legal wording is client-owned content. A policy is exposed to routes and
 * navigation only after its reviewed copy and approval metadata are recorded
 * together. This prevents a placeholder or an internal draft from being
 * mistaken for an operative policy.
 */

export const LEGAL_POLICY_SLUGS = [
  "privacy",
  "terms",
  "shipping",
  "returns",
] as const;

export type LegalPolicySlug = (typeof LEGAL_POLICY_SLUGS)[number];

export type LegalPolicySection = Readonly<{
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}>;

export type PendingLegalPolicy = Readonly<{
  slug: LegalPolicySlug;
  navigationLabel: string;
  status: "awaiting_approval";
}>;

export type ApprovedLegalPolicy = Readonly<{
  slug: LegalPolicySlug;
  navigationLabel: string;
  status: "approved";
  title: string;
  description: string;
  version: string;
  effectiveDate: string;
  approvedBy: string;
  approvedAt: string;
  sections: readonly LegalPolicySection[];
}>;

export type LegalPolicyRecord = PendingLegalPolicy | ApprovedLegalPolicy;

/**
 * Do not add legal prose here until the client or their legal adviser has
 * approved the exact wording. Approval metadata is deliberately required in
 * the same record as the content.
 */
export const LEGAL_POLICIES: Readonly<Record<LegalPolicySlug, LegalPolicyRecord>> =
  Object.freeze({
    privacy: Object.freeze({
      slug: "privacy",
      navigationLabel: "Privacy",
      status: "awaiting_approval",
    }),
    terms: Object.freeze({
      slug: "terms",
      navigationLabel: "Terms and Conditions",
      status: "awaiting_approval",
    }),
    shipping: Object.freeze({
      slug: "shipping",
      navigationLabel: "Shipping",
      status: "awaiting_approval",
    }),
    returns: Object.freeze({
      slug: "returns",
      navigationLabel: "Returns & refunds",
      status: "awaiting_approval",
    }),
  });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function hasVisibleText(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Runtime validation complements the discriminated union. It protects future
 * CMS or JSON-backed policy sources from publishing incomplete approval data.
 */
export function isPublishableLegalPolicy(
  policy: LegalPolicyRecord,
): policy is ApprovedLegalPolicy {
  if (policy.status !== "approved") return false;

  return (
    hasVisibleText(policy.title) &&
    hasVisibleText(policy.description) &&
    hasVisibleText(policy.version) &&
    hasVisibleText(policy.approvedBy) &&
    ISO_DATE.test(policy.effectiveDate) &&
    ISO_INSTANT.test(policy.approvedAt) &&
    policy.sections.length > 0 &&
    policy.sections.every(
      (section) =>
        hasVisibleText(section.heading) &&
        section.paragraphs.length > 0 &&
        section.paragraphs.every(hasVisibleText) &&
        (section.bullets === undefined || section.bullets.every(hasVisibleText)),
    )
  );
}

export function isLegalPolicySlug(value: string): value is LegalPolicySlug {
  return (LEGAL_POLICY_SLUGS as readonly string[]).includes(value);
}

export function getPublishedLegalPolicy(
  slug: LegalPolicySlug,
): ApprovedLegalPolicy | null {
  const policy = LEGAL_POLICIES[slug];
  return isPublishableLegalPolicy(policy) ? policy : null;
}

/** Only approved policies are eligible for public routes or footer links. */
export function getPublishedLegalPolicies(): readonly ApprovedLegalPolicy[] {
  return LEGAL_POLICY_SLUGS.map((slug) => LEGAL_POLICIES[slug]).filter(
    isPublishableLegalPolicy,
  );
}

export function legalPolicyPath(slug: LegalPolicySlug): string {
  return `/policies/${slug}`;
}
