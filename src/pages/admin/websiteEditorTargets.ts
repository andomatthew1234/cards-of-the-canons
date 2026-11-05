import type { WebsitePageId } from "../../cms/websiteContent";

export type WebsiteEditorTarget = {
  id: string;
  label: string;
  breadcrumb: string;
  section: WebsitePageId | "header" | "footer" | "branding";
  page: WebsitePageId;
  controlId: string;
  fieldId?: string;
};

const targets: WebsiteEditorTarget[] = [
  { id: "header", label: "Edit header", breadcrumb: "Site → Header & navigation", section: "header", page: "home", controlId: "header-settings" },
  { id: "header-logo", label: "Edit logo", breadcrumb: "Site → Branding → Logo", section: "branding", page: "home", controlId: "branding-logo" },
  { id: "home-hero", label: "Edit hero section", breadcrumb: "Home → Hero", section: "home", page: "home", controlId: "hero" },
  { id: "home-hero-image", label: "Edit hero image", breadcrumb: "Home → Hero → Image", section: "home", page: "home", controlId: "hero", fieldId: "hero-image" },
  { id: "home-hero-heading", label: "Edit heading", breadcrumb: "Home → Hero → Heading", section: "home", page: "home", controlId: "page-introduction", fieldId: "page-title" },
  { id: "home-hero-description", label: "Edit description", breadcrumb: "Home → Hero → Description", section: "home", page: "home", controlId: "page-introduction" },
  { id: "home-hero-primary", label: "Edit primary button", breadcrumb: "Home → Hero → Primary button", section: "home", page: "home", controlId: "hero", fieldId: "hero-primary" },
  { id: "home-hero-secondary", label: "Edit secondary button", breadcrumb: "Home → Hero → Secondary button", section: "home", page: "home", controlId: "hero", fieldId: "hero-secondary" },
  { id: "home-values", label: "Edit moving values", breadcrumb: "Home → Moving values", section: "home", page: "home", controlId: "moving-values" },
  { id: "home-council", label: "Edit Join the Council", breadcrumb: "Home → Smaller info boxes → Join the Council", section: "home", page: "home", controlId: "editorial-panels" },
  { id: "home-genesis", label: "Edit How It Began", breadcrumb: "Home → Smaller info boxes → How It Began", section: "home", page: "home", controlId: "editorial-panels" },
  { id: "home-from-scriptorium", label: "Edit From the Scriptorium", breadcrumb: "Home → Smaller info boxes → From the Scriptorium", section: "home", page: "home", controlId: "editorial-panels" },
  { id: "home-featured", label: "Edit featured collection", breadcrumb: "Home → Featured collection", section: "home", page: "home", controlId: "featured" },
  { id: "home-story", label: "Edit story section", breadcrumb: "Home → Editorial story", section: "home", page: "home", controlId: "story" },
  { id: "home-story-image", label: "Edit story image", breadcrumb: "Home → Editorial story → Image", section: "home", page: "home", controlId: "story", fieldId: "story-image" },
  { id: "newsletter", label: "Edit newsletter section", breadcrumb: "Home → Newsletter", section: "home", page: "home", controlId: "homepage-controls" },
  { id: "about-introduction", label: "Edit page introduction", breadcrumb: "About → Introduction", section: "about", page: "about", controlId: "page-introduction" },
  { id: "about-image", label: "Edit page image", breadcrumb: "About → Introduction → Image", section: "about", page: "about", controlId: "about-image" },
  { id: "about-heading", label: "Edit heading", breadcrumb: "About → Introduction → Heading", section: "about", page: "about", controlId: "page-introduction", fieldId: "page-title" },
  { id: "about-content", label: "Edit story content", breadcrumb: "About → Editorial story", section: "about", page: "about", controlId: "about-story" },
  { id: "shop-introduction", label: "Edit page introduction", breadcrumb: "Shop → Introduction", section: "shop", page: "shop", controlId: "page-introduction" },
  { id: "shop-heading", label: "Edit heading", breadcrumb: "Shop → Introduction → Heading", section: "shop", page: "shop", controlId: "page-introduction", fieldId: "page-title" },
  { id: "shop-products", label: "Edit category copy", breadcrumb: "Shop → Collection area", section: "shop", page: "shop", controlId: "shop-categories" },
  { id: "contact-introduction", label: "Edit page introduction", breadcrumb: "Contact → Introduction", section: "contact", page: "contact", controlId: "page-introduction" },
  { id: "contact-heading", label: "Edit heading", breadcrumb: "Contact → Introduction → Heading", section: "contact", page: "contact", controlId: "page-introduction", fieldId: "page-title" },
  { id: "contact-form", label: "Edit enquiry guidance", breadcrumb: "Contact → Enquiry guidance", section: "contact", page: "contact", controlId: "contact-enquiry" },
  { id: "contact-direct", label: "Edit direct contact", breadcrumb: "Contact → Direct contact", section: "contact", page: "contact", controlId: "contact-direct" },
  { id: "footer", label: "Edit footer", breadcrumb: "Site → Footer", section: "footer", page: "home", controlId: "footer-settings" },
];

export const websiteEditorTargets = Object.fromEntries(
  targets.map((target) => [target.id, target]),
) as Record<string, WebsiteEditorTarget>;

export const websiteEditorTargetLabels = Object.fromEntries(
  targets.map((target) => [target.id, target.label]),
) as Record<string, string>;

export function targetsForPage(page: WebsitePageId) {
  const pageTargets = targets.filter((target) => target.page === page && target.section !== "header" && target.section !== "footer" && target.section !== "branding");
  return [websiteEditorTargets.header, ...pageTargets, websiteEditorTargets.footer];
}
