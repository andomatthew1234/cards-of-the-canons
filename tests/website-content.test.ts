import { describe, expect, it } from "vitest";
import {
  cloneWebsiteContent,
  defaultWebsiteContent,
  parseWebsiteContent,
  websiteContentSchema,
} from "../src/cms/websiteContent";

describe("website content schema", () => {
  it("accepts the complete default website contract", () => {
    expect(websiteContentSchema.safeParse(defaultWebsiteContent).success).toBe(
      true,
    );
    expect(parseWebsiteContent(defaultWebsiteContent)).toEqual(
      defaultWebsiteContent,
    );
  });

  it("rejects unsafe URLs, arbitrary colours and unknown fields", () => {
    const content = cloneWebsiteContent(
      defaultWebsiteContent,
    ) as typeof defaultWebsiteContent & { injected?: string };
    content.pages.home.sections.hero.imageUrl = "javascript:alert(1)";
    content.theme.palette.gold = "gold; background:url(https://evil.test)";
    content.injected = "not allowed";
    expect(parseWebsiteContent(content)).toBeNull();
  });

  it("requires an uploaded logo when image branding is selected", () => {
    const content = cloneWebsiteContent(defaultWebsiteContent);
    content.theme.logo.mode = "image";
    content.theme.logo.imageUrl = "";
    expect(websiteContentSchema.safeParse(content).success).toBe(false);
  });

  it("requires unique navigation IDs and each home section exactly once", () => {
    const content = cloneWebsiteContent(defaultWebsiteContent);
    content.navigation.primary[1].id = content.navigation.primary[0].id;
    content.pages.home.layout.order = [
      "hero",
      "hero",
      "featured",
      "story",
      "newsletter",
    ];
    const result = websiteContentSchema.safeParse(content);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Navigation IDs must be unique.",
          "Each home section must appear exactly once.",
        ]),
      );
    }
  });

  it("accepts secure off-site links and rejects unsafe destinations", () => {
    const content = cloneWebsiteContent(defaultWebsiteContent);
    content.footer.groups[1].links[4] = {
      ...content.footer.groups[1].links[4],
      path: "https://x.com/doxatreasury",
      visible: true,
    };
    expect(websiteContentSchema.safeParse(content).success).toBe(true);

    for (const path of ["http://example.com", "//example.com", "javascript:alert(1)", "https://user:pass@example.com"]) {
      const unsafe = cloneWebsiteContent(content);
      unsafe.footer.groups[1].links[4].path = path;
      expect(websiteContentSchema.safeParse(unsafe).success).toBe(false);
    }
  });

  it("upgrades older footer content to six editable slots per column", () => {
    const legacy = cloneWebsiteContent(defaultWebsiteContent);
    legacy.footer.groups[0].heading = "Explore";
    legacy.footer.groups[0].links = legacy.footer.groups[0].links.slice(0, 3);
    legacy.footer.groups[1].heading = "Account";
    legacy.footer.groups[1].links = legacy.footer.groups[1].links.slice(0, 4);
    const parsed = parseWebsiteContent(legacy);
    expect(parsed?.footer.groups[0].heading).toBe("Links");
    expect(parsed?.footer.groups[1].heading).toBe("More");
    expect(parsed?.footer.groups.map((group) => group.links)).toEqual([
      expect.arrayContaining([expect.objectContaining({ id: "journal", path: "/journal" })]),
      expect.arrayContaining([expect.objectContaining({ id: "x", visible: false })]),
    ]);
    expect(parsed?.footer.groups.map((group) => group.links.length)).toEqual([6, 6]);
  });
});
