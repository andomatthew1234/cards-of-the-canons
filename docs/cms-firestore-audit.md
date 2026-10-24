# Website editor Firestore audit

This working audit records the access patterns considered while extending the website editor. It is an implementation aid, not a production-data migration record.

## Existing public content

- `products`: the storefront queries published products by `status`, ordered by `name`; administrators query up to 100 ordered by `name` and manage complete product records.
- `pageContent/{home|about}`: the public app reads a single document by ID. Existing administrators can edit these structured page records. They remain the compatibility fallback while the versioned website document is introduced.
- `siteSettings/main`: the public app reads one published settings document. Existing business name, contact address and theme values remain the compatibility fallback.

## Existing private/admin data

- `orders`: customers query their own orders by `userId` and `createdAt`; administrators list recent orders. Trusted functions own payment and fulfilment transitions.
- `enquiries`, `newsletterSubscribers`, `newsletterCampaigns`, `communitySurveys`, `communityResponses`, `analyticsEvents`, account/profile/security collections: retain their existing ownership, administrator and trusted-function boundaries. The website editor must not widen them.

## Versioned website editor model

- One bounded public document contains the last atomically published, presentation-only website snapshot. It contains no credentials or PII.
- Draft state and version history are server-owned and administrator-readable only through authenticated, App Check-protected callables.
- Saving a draft uses an expected revision to detect concurrent administrator edits.
- Publishing validates and normalises the whole snapshot before one transaction updates the public document, records an immutable version and advances the revision.
- Versions are bounded and old history is pruned server-side to avoid unbounded cost.
- Public code always falls back to compiled defaults and the existing `pageContent` / `siteSettings` documents if the new published snapshot is missing or invalid.

## Media

- Browser uploads continue through private `image-staging/{uid}` objects.
- A trusted callable validates administrator claims, declared type, magic bytes, size and destination before copying an image into a public website-media path.
- Metadata contains bounded filename, MIME type, dimensions where available, created timestamp and usage references. It never grants write authority.
- Deletion must fail while a published or draft snapshot references the asset.

## Threat checks

- Public reads cannot enumerate drafts, versions, media-management metadata or administrator identity.
- Public/client writes to the new editor collections are denied; trusted functions use the Admin SDK and repeat role checks.
- A non-admin cannot save, publish, restore, upload or delete editor content.
- Draft/publish payloads reject extra fields, unsafe URLs, scripts/HTML, oversized strings, excessive lists/maps and invalid design tokens.
- Optimistic revision checks prevent silent overwrite of another administrator's draft.
- Publishing is atomic, so a visitor cannot observe a partially updated theme/content snapshot.
- Restores create a new version; they do not rewrite history in place.
- Existing product, checkout, account, enquiry and newsletter rules remain unchanged except for explicitly documented editor paths.

## Required verification

- Type-check the frontend and Functions packages.
- Run frontend and Functions tests, including validation/concurrency/publishing cases.
- Compile rules with the Firebase CLI and run emulator rule tests when Java is available.
- Re-audit the final rules for default-deny coverage and verify that no private collection gained public access.
