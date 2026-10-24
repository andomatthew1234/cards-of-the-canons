# Staged architecture

## Stage 1 — complete local prototype

React, TypeScript and Vite provide the responsive storefront. `CartContext` persists only `{ productId, quantity }` in local storage. Sample catalogue data is isolated in `src/data/demo.ts`, while business-wide display values are centralised in `src/config.ts`.

## Stage 2 — Firebase-connected foundation

- The local site is connected to the dedicated Firebase project. Email/password and Google sign-in are enabled; Apple support is implemented but intentionally disabled until Apple Developer credentials are supplied. Verification, reset, email-change and password-change flows, provider-aware reauthentication, profile management, self-service deletion and token-based administrator detection are present.
- Admin SDK callable Functions list and manage accounts without exposing password hashes or allowing customers to alter roles. Administrators cannot remove their own access. These functions remain local until billing/deployment is separately authorised.
- Firestore adapters cover published products, customer orders, administrator product/order/enquiry lists and product updates.
- Callable Functions validate and rate-limit public enquiry and newsletter writes. Direct browser writes to those PII collections are denied. Enquiry submission is deployed with App Check enforcement and replay protection; newsletter ingestion remains inactive.
- Firestore rules use default deny, strict field lists, bounds, ownership and trusted `admin` custom claims.
- Storage rules limit administrator uploads to JPEG, PNG or WebP under 5 MiB and confined catalogue/page paths.
- Editable models exist for products, settings, selected pages, enquiries, newsletter subscribers, orders and optional articles.

The administrator interface is deliberately a focused workflow, not a drag-and-drop builder. Demo mode is read-only; Firebase mode requires an administrator claim for protected data.

## Stage 3 — intentionally not activated

Stripe Checkout is not installed or callable yet. The authorised implementation should accept only product IDs and quantities, validate current published products/prices/stock in a transaction, create the Checkout Session on the server, reserve inventory with an expiry, and finalise immutable order snapshots only from idempotently processed, signature-verified webhooks. Shipping must remain configurable until John supplies destinations and rates. Browser success pages must never mark an order paid.
