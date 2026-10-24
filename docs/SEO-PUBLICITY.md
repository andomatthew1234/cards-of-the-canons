# SEO, discoverability and publicity architecture

## What changed

The public storefront now has a deliberate search architecture instead of relying on a single generic SPA document:

- `PageMeta` owns titles, descriptions, canonical URLs, robots directives, Open Graph, Twitter cards and page JSON-LD. It removes stale structured data on navigation.
- `scripts/generate-seo.mjs` runs after every production build. It reads the published Firestore catalogue, writes route-specific static HTML, creates `sitemap.xml`, `robots.txt`, a branded `404.html`, and a separate private application shell.
- Firebase Hosting serves generated public files directly. Account, administrator, cart and checkout routes are rewritten to the no-index private shell and receive an `X-Robots-Tag` header.
- Product categories are crawlable links at stable `/shop/category/:slug` addresses. Product pages include semantic breadcrumbs and related-product links.
- Product and Offer structured data, product sitemap URLs and category sitemap URLs remain disabled while the catalogue is provisional.
- Public account/admin bundles are split from the initial storefront bundle. The main hero image was reduced from roughly 1 MB to roughly 280 KB without changing its dimensions.
- Anonymous acquisition analytics now distinguish shop/category views and the first landing page/referring host. Account and security page views are not recorded.

## Canonical-domain configuration

Set `VITE_PUBLIC_SITE_URL` to the approved public origin, without a trailing slash. It controls canonical tags, social URLs, sitemap entries and structured-data identifiers. The current canonical origin is:

`https://doxatreasury.com`

The Firebase hostnames may continue to serve the application, but search signals must point to the configured canonical origin. `www.doxatreasury.com` redirects to the canonical apex address.

## Indexing policy

| Route | Policy | Reason |
| --- | --- | --- |
| `/`, `/shop`, `/about`, `/contact` | Index/follow | Meaningful public landing pages |
| `/shop/category/:slug` | Noindex during preview | Categories contain provisional catalogue material |
| `/product/:slug` | Noindex during preview | Product names, artwork, prices and availability are not approved |
| `/account/**` | Noindex/nofollow/noarchive | Private customer application |
| `/admin/**` | Noindex/nofollow/noarchive | Restricted administration application |
| `/cart`, `/checkout/**` | Noindex/nofollow/noarchive | Utility and transaction states |
| Unknown routes / `404.html` | Noindex | Not a search landing page |

Set `VITE_INDEX_PRODUCTS=true` only after John approves the real product names, descriptions, imagery, identifiers, prices and publication status. That switch enables product/category sitemap URLs and truthful Product/Offer/Breadcrumb JSON-LD. Unknown stock is omitted rather than guessed. Ratings, reviews, social profiles, addresses and other unconfirmed facts are never generated.

## Static-generation behavior

The build reads only Firestore documents whose product status is `published`. Generated product/category pages make direct URLs crawlable and give social-preview crawlers route-specific metadata. A catalogue publication therefore needs a new Hosting build/deploy before its direct static URL and sitemap entry are available. This is intentional: it prevents a Firestore edit from accidentally advertising an unreviewed product before the public build is approved.

Run:

```text
npm run build
npm run seo:check
```

The check verifies canonical tags, descriptions, social metadata, private/404 noindex directives, sitemap exclusions and robots sitemap discovery.

## Structured data and social previews

- Home: truthful `Organization` and `WebSite`; no invented logo, address, contact point or social profiles.
- Product: `Product`, `Offer` and `BreadcrumbList` only when product indexing is explicitly enabled.
- Category: `BreadcrumbList` only when product indexing is enabled.
- Social preview image: the licensed Mount Athos photograph is the temporary site-wide image; products use their own published image. Supply a purpose-made 1200×630 branded image before launch for the strongest share previews.

## Content and future discovery

The existing information architecture can later support a small, editorially reviewed church-history hub using the existing `Article` type. Do not publish generated filler. Strong candidates are stories behind approved cards, profiles of represented figures, collection guides and primary-source reading guides. Each article should have a named editorial purpose, sources, a stable slug and contextual links to genuinely related products.

## Measurement and privacy

Recorded first-party events cover landing/page views, shop/category views, product views, add-to-cart, checkout start, enquiries and signups. Landing events may include only the referring hostname—not the full referring URL or query string. Account, administrator and security page views are excluded. Passwords, codes, emails, names and private settings must never be added to analytics parameters.

## Launch checklist

### Completed automatically

- [x] Route-specific titles, descriptions and canonical tags
- [x] Open Graph and Twitter card metadata
- [x] Static HTML for public pages and the published catalogue
- [x] Generated canonical sitemap and robots file
- [x] Private-route meta and HTTP noindex protection
- [x] Stable product/category URLs, breadcrumbs and crawlable internal links
- [x] Honest structured-data gating for provisional products
- [x] Branded real 404 response for unknown static URLs
- [x] Permanent redirects from legacy account settings URLs
- [x] Public-route code splitting, LCP image optimisation and image dimensions on product artwork
- [x] Automated production-output SEO checks

### Manual approval or account action required

- [ ] Confirm the final public/custom domain, add it to Firebase/Auth where required, then set `VITE_PUBLIC_SITE_URL`
- [ ] Replace provisional products, prices, stock and imagery with approved content
- [ ] Only then set `VITE_INDEX_PRODUCTS=true`, rebuild, inspect structured data and deploy
- [ ] Create and supply approved 1200×630 social-preview artwork and a final logo/favicon if desired
- [ ] Verify the final domain in Google Search Console and Bing Webmaster Tools
- [ ] Submit `/sitemap.xml` in both webmaster consoles after the canonical domain is final
- [ ] Use Google Rich Results Test and Schema Markup Validator on approved product URLs
- [ ] Decide whether Merchant Center is appropriate; create a feed only from approved real products with accurate availability, shipping and policy information
- [ ] Confirm public policies, shipping destinations/rates and contact details before live payments
- [ ] Create social profiles only if the business wants them; add `sameAs` structured data only for real maintained profiles
- [ ] Review Search Console coverage, Core Web Vitals and acquisition analytics after launch
