import {
  LEGAL_POLICIES,
  LEGAL_POLICY_SLUGS,
  getPublishedLegalPolicies,
  getPublishedLegalPolicy,
  isLegalPolicySlug,
  isPublishableLegalPolicy,
  legalPolicyPath,
  type ApprovedLegalPolicy,
} from "./policies";

describe("legal policy publication gate", () => {
  it("knows every required public policy destination", () => {
    expect(LEGAL_POLICY_SLUGS).toEqual([
      "privacy",
      "terms",
      "shipping",
      "returns",
    ]);
    expect(isLegalPolicySlug("privacy")).toBe(true);
    expect(isLegalPolicySlug("refunds-and-returns")).toBe(false);
    expect(legalPolicyPath("returns")).toBe("/policies/returns");
  });

  it("does not expose client-unapproved policy placeholders", () => {
    expect(
      Object.values(LEGAL_POLICIES).every(
        (policy) => policy.status === "awaiting_approval",
      ),
    ).toBe(true);
    expect(getPublishedLegalPolicies()).toEqual([]);
    expect(getPublishedLegalPolicy("terms")).toBeNull();
  });

  it("accepts a complete approved policy record", () => {
    const approved: ApprovedLegalPolicy = {
      slug: "privacy",
      navigationLabel: "Privacy",
      status: "approved",
      title: "Approved title",
      description: "Approved description.",
      version: "privacy-2026-10-24",
      effectiveDate: "2026-10-24",
      approvedBy: "Authorised approver",
      approvedAt: "2026-10-24T02:00:00Z",
      sections: [
        {
          heading: "Approved section",
          paragraphs: ["Approved paragraph."],
        },
      ],
    };

    expect(isPublishableLegalPolicy(approved)).toBe(true);
  });

  it("rejects approved records with missing content or invalid approval metadata", () => {
    const incomplete = {
      slug: "privacy",
      navigationLabel: "Privacy",
      status: "approved",
      title: "",
      description: "Description",
      version: "privacy-v1",
      effectiveDate: "24 October 2026",
      approvedBy: "",
      approvedAt: "yesterday",
      sections: [],
    } as const;

    expect(isPublishableLegalPolicy(incomplete)).toBe(false);
  });
});
