import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { LegalPolicyPage } from "./LegalPolicy";

const { getPublishedTermsPolicy } = vi.hoisted(() => ({ getPublishedTermsPolicy: vi.fn() }));

vi.mock("../lib/data", () => ({ getPublishedTermsPolicy }));

vi.mock("../components/PageMeta", () => ({
  PageMeta: ({ noIndex }: { noIndex?: boolean }) => (
    <span data-testid="page-meta" data-no-index={String(noIndex === true)} />
  ),
}));

describe("LegalPolicyPage", () => {
  it("fails closed when client-approved wording is not recorded", () => {
    render(
      <MemoryRouter>
        <LegalPolicyPage slug="privacy" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "This policy is not published.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("page-meta")).toHaveAttribute(
      "data-no-index",
      "true",
    );
    expect(screen.getByRole("link", { name: "Contact Doxa" })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(screen.queryByText(/lorem ipsum/i)).not.toBeInTheDocument();
  });

  it("renders the administrator-published Terms and Conditions Markdown", async () => {
    getPublishedTermsPolicy.mockResolvedValue({
      slug: "terms",
      status: "published",
      revision: 3,
      title: "Terms and Conditions",
      description: "The approved terms for using Doxa.",
      version: "1.0",
      effectiveDate: "2026-10-27",
      bodyMarkdown: "## Orders\n\nOrders are subject to these **approved terms**.\n\n<script>alert('no')</script>",
    });

    render(<MemoryRouter><LegalPolicyPage slug="terms" /></MemoryRouter>);

    expect(await screen.findByRole("heading", { level: 1, name: "Terms and Conditions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Orders" })).toBeInTheDocument();
    expect(screen.getByText("approved terms").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByTestId("page-meta")).toHaveAttribute("data-no-index", "false");
  });

  it("uses the client-approved bundled Terms when no administrator version is published", async () => {
    getPublishedTermsPolicy.mockResolvedValue(null);
    render(<MemoryRouter><LegalPolicyPage slug="terms" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: "Website Terms and Conditions of Use" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "1. About the Website" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "18. Entire Agreement, Variation and Waiver" })).toBeInTheDocument();
    expect(screen.getByText(/ABN 57 919 748 380/)).toBeInTheDocument();
    expect(screen.getByTestId("page-meta")).toHaveAttribute("data-no-index", "false");
  });

  it("uses the approved Terms if the policy service is temporarily unavailable", async () => {
    getPublishedTermsPolicy.mockRejectedValue(new Error("offline"));
    render(<MemoryRouter><LegalPolicyPage slug="terms" /></MemoryRouter>);
    expect(await screen.findByRole("heading", { level: 1, name: "Website Terms and Conditions of Use" })).toBeInTheDocument();
    expect(screen.getByText("These Terms are effective as of 5 November 2026.")).toBeInTheDocument();
  });
});
