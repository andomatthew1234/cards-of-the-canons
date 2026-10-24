import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { LegalPolicyPage } from "./LegalPolicy";

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
});
