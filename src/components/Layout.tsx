import { ArrowRight, Menu, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSiteContent } from "../context/SiteContentContext";
import { useSiteTheme } from "../context/SiteThemeContext";
import { getPublishedLegalPolicies, legalPolicyPath } from "../legal/policies";
import { siteThemeCssVariables } from "../lib/siteTheme";
import type { SiteTheme } from "../types";
import { PageTransition } from "./PageTransition";

function isExternalDestination(destination: string) {
  return destination.startsWith("https://");
}

const SOCIAL_LINK_NAME = /^(?:instagram|instragram|tiktok|you\s*tube|facebook|x|twitter)$/i;
const PLACEHOLDER_SOCIAL_PATH = /(?:coming[-_ ]?soon|placeholder|replace[-_ ]?me|todo)/i;

export function shouldRenderFooterLink(item: {
  id: string;
  label: string;
  path: string;
  visible: boolean;
}) {
  if (!item.visible) return false;
  const name = `${item.id} ${item.label}`.trim();
  if (!SOCIAL_LINK_NAME.test(item.id.trim()) && !SOCIAL_LINK_NAME.test(item.label.trim()) && !SOCIAL_LINK_NAME.test(name)) {
    return true;
  }

  const destination = item.path.trim();
  if (!destination.startsWith("https://") || PLACEHOLDER_SOCIAL_PATH.test(destination)) return false;
  try {
    const url = new URL(destination);
    return Boolean(url.hostname && url.pathname !== "/" && !/(?:^|\.)example\.(?:com|org|net)$/i.test(url.hostname));
  } catch {
    return false;
  }
}

export function getVisibleFooterGroups<
  T extends {
    links: readonly { id: string; label: string; path: string; visible: boolean }[];
  },
>(groups: readonly T[], isAdmin: boolean) {
  return groups
    .map((group) => ({
      ...group,
      links: group.links.filter(
        (item) => shouldRenderFooterLink(item) && (item.id !== "administrator" || isAdmin),
      ),
    }))
    .filter((group) => group.links.length > 0);
}

function DestinationLink({
  destination,
  children,
  className,
  onClick,
  navigation = false,
}: {
  destination: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  navigation?: boolean;
}) {
  if (isExternalDestination(destination)) {
    return <a className={className} href={destination} target="_blank" rel="noopener noreferrer" onClick={onClick}>{children}</a>;
  }
  if (navigation) return <NavLink className={className} to={destination} onClick={onClick}>{children}</NavLink>;
  return <Link className={className} to={destination} onClick={onClick}>{children}</Link>;
}

export function SiteBrand({
  theme,
  placement,
}: {
  theme: SiteTheme;
  placement: "header" | "footer";
}) {
  const name =
    placement === "header" ? theme.header.brandName : theme.footer.brandName;
  if (theme.logo.mode === "image")
    return (
      <img
        className="site-logo-image"
        src={theme.logo.imageUrl}
        alt={theme.logo.imageAlt}
      />
    );
  if (theme.logo.mode === "text")
    return <span className="site-brand-name">{name}</span>;
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        {theme.logo.monogram}
      </span>
      <span className="site-brand-name">{name}</span>
    </>
  );
}

export function Layout({
  children,
  previewPath,
  previewMode = false,
}: {
  children: ReactNode;
  previewPath?: string;
  previewMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const { count } = useCart();
  const { isAdmin } = useAuth();
  const { website: managedWebsite, ready: contentReady } = useSiteContent();
  const theme = useSiteTheme();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const navigation = navigationRef.current;
    const main = mainRef.current;
    const footer = footerRef.current;
    const bodyOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    const brand = brandRef.current;
    const headerActions = headerActionsRef.current;
    const menuLinks = Array.from(
      navigation?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [],
    );
    const focusable = menuButton ? [menuButton, ...menuLinks] : menuLinks;

    brand?.setAttribute("inert", "");
    headerActions?.setAttribute("inert", "");
    if (!previewMode) {
      main?.setAttribute("inert", "");
      footer?.setAttribute("inert", "");
      document.body.style.overflow = "hidden";
    }
    menuLinks[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        menuButton?.focus();
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      brand?.removeAttribute("inert");
      headerActions?.removeAttribute("inert");
      if (!previewMode) {
        main?.removeAttribute("inert");
        footer?.removeAttribute("inert");
        document.body.style.overflow = bodyOverflow;
      }
    };
  }, [open, previewMode]);
  useEffect(() => {
    if (previewMode) return;
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (meta) meta.content = theme.palette.ink;
  }, [previewMode, theme.palette.ink]);
  useEffect(() => {
    if (previewMode) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 36));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, [previewMode]);

  const displayedPath = previewPath ?? pathname;
  const isHome = displayedPath === "/";
  const headerState = isHome && !scrolled ? "is-overlay" : "is-surface";

  const footer = theme.footer;
  const publishedLegalPolicies = getPublishedLegalPolicies();
  const website = managedWebsite as typeof managedWebsite | undefined;
  const configuredPrimaryNavigation = (
    website?.navigation.primary ?? [
      {
        id: "home",
        label: theme.header.navigation.home,
        path: "/",
        visible: true,
      },
      {
        id: "shop",
        label: theme.header.navigation.shop,
        path: "/shop",
        visible: true,
      },
      {
        id: "about",
        label: theme.header.navigation.about,
        path: "/about",
        visible: true,
      },
      {
        id: "contact",
        label: theme.header.navigation.contact,
        path: "/contact",
        visible: true,
      },
    ]
  ).filter((item) => item.visible);
  const primaryNavigation = configuredPrimaryNavigation.some((item) => item.id === "journal")
    ? configuredPrimaryNavigation.map((item) => item.id === "journal" ? { ...item, path: "/journal" } : item)
    : [
        ...configuredPrimaryNavigation.slice(0, Math.min(3, configuredPrimaryNavigation.length)),
        { id: "journal", label: "Journal", path: "/journal", visible: true },
        ...configuredPrimaryNavigation.slice(Math.min(3, configuredPrimaryNavigation.length)),
      ];
  const footerGroups = website?.footer.groups ?? [
    {
      id: "explore",
      heading: footer.exploreHeading,
      links: [
        {
          id: "shop",
          label: footer.navigation.shop,
          path: "/shop",
          visible: true,
        },
        {
          id: "about",
          label: footer.navigation.about,
          path: "/about",
          visible: true,
        },
        {
          id: "contact",
          label: footer.navigation.contact,
          path: "/contact",
          visible: true,
        },
      ],
    },
    {
      id: "account",
      heading: footer.accountHeading,
      links: [
        {
          id: "account",
          label: footer.navigation.account,
          path: "/account",
          visible: true,
        },
        {
          id: "orders",
          label: footer.navigation.orders,
          path: "/account/orders",
          visible: true,
        },
        {
          id: "security",
          label: footer.navigation.security,
          path: "/account/security",
          visible: true,
        },
        {
          id: "administrator",
          label: footer.navigation.administrator,
          path: "/admin",
          visible: true,
        },
      ],
    },
  ];
  const visibleFooterGroups = getVisibleFooterGroups(footerGroups, isAdmin);
  if (contentReady === false && !previewMode) {
    return (
      <div className="site-shell public-site-loading" data-theme-typography={theme.typography} style={siteThemeCssVariables(theme)} aria-busy="true">
        <main className="public-site-loader-minimal" role="status" aria-label="Loading Doxa Treasury" />
      </div>
    );
  }
  return (
    <div
      className={`site-shell ${isHome ? "home-shell" : "interior-shell"}`}
      data-theme-typography={theme.typography}
      style={siteThemeCssVariables(theme)}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {website?.header.announcementEnabled &&
        website.header.announcementText && (
          <div className="site-announcement">
            <span>{website.header.announcementText}</span>
            {website.header.announcementLinkLabel && (
              <DestinationLink destination={website.header.announcementLinkPath}>
                {website.header.announcementLinkLabel}
              </DestinationLink>
            )}
          </div>
        )}
      <header
        className={`header public-header ${isHome ? "home-header" : ""} ${headerState} ${scrolled ? "is-scrolled" : ""}`}
        data-editor-target={previewMode ? "header" : undefined}
      >
        <Link
          ref={brandRef}
          className={`brand brand-${theme.logo.mode}`}
          to="/"
          aria-label={`${theme.header.brandName} home`}
          data-editor-target={previewMode ? "header-logo" : undefined}
        >
          <SiteBrand theme={theme} placement="header" />
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className="menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav
          ref={navigationRef}
          id="main-nav"
          className={open ? "nav open" : "nav"}
          role={open ? "dialog" : undefined}
          aria-modal={open ? "true" : undefined}
          aria-label={open ? "Site navigation menu" : "Main navigation"}
        >
          {primaryNavigation.map((item) => (
            <DestinationLink
              key={item.id}
              destination={item.path}
              navigation
              onClick={() => setOpen(false)}
            >
              {item.label}
            </DestinationLink>
          ))}
        </nav>
        <div ref={headerActionsRef} className="header-actions">
          <Link
            className="icon-link"
            to="/account"
            aria-label={website?.copy.accountLabel ?? "Account"}
          >
            <UserRound />
          </Link>
          <Link
            className="icon-link cart-link"
            to="/cart"
            aria-label={`${website?.copy.cartLabel ?? "Cart"} with ${count} items`}
          >
            <ShoppingBag />
            <span>{count}</span>
          </Link>
        </div>
      </header>
      <main id="main" ref={mainRef}>
        <PageTransition>{children}</PageTransition>
      </main>
      <footer ref={footerRef} className="footer editorial-footer" data-editor-target={previewMode ? "footer" : undefined}>
        <div className="footer-introduction">
          <div className={`brand footer-brand brand-${theme.logo.mode}`}>
            <SiteBrand theme={theme} placement="footer" />
          </div>
          <p>{(website?.footer.description || footer.description).replace(/\bchurch\b/g, "Church")}</p>
          <Link className="footer-newsletter-link" to="/account/mailing-list">Join the newsletter <span aria-hidden="true">→</span></Link>
        </div>
        <div className="footer-navigation">
        {visibleFooterGroups.map((group) => (
          <div className="footer-link-group" key={group.id}>
            <h2>{group.heading}</h2>
            {group.links.map((item) => (
                <DestinationLink key={item.id} destination={item.id === "journal" ? "/journal" : item.path}>
                  {item.label.replace(/^Instragram$/i, "Instagram")}
                </DestinationLink>
              ))}
          </div>
        ))}
        {publishedLegalPolicies.length > 0 && (
          <div className="footer-link-group">
            <h2>Legal</h2>
            {publishedLegalPolicies.map((policy) => (
              <Link key={policy.slug} to={legalPolicyPath(policy.slug)}>
                {policy.navigationLabel}
              </Link>
            ))}
          </div>
        )}
        </div>
        <div className="footer-contact">
          <h2>Contact</h2>
          <p>Open to private or business enquiries</p>
          <Link className="footer-contact-button" to="/contact">Contact us <ArrowRight aria-hidden="true" /></Link>
          <a className="footer-contact-email" href={`mailto:${website?.branding.publicContactEmail ?? "info@doxatreasury.com"}`}>{website?.branding.publicContactEmail ?? "info@doxatreasury.com"}</a>
        </div>
        <p className="footer-note">
          © {new Date().getFullYear()} {footer.brandName}.{" "}
          {footer.copyrightText}
        </p>
      </footer>
    </div>
  );
}
