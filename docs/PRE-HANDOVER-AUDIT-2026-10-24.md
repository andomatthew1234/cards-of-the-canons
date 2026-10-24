# Doxa Treasury pre-handover audit

**Audit date:** 24 October 2026

**Audited target:** `https://doxatreasury.com` and the local source/deployment workspace

**Release verdict:** **Not ready for client handover yet**

The public site is online, the current production build succeeds, the deployed Hosting assets match the local build, and the expected Firebase Functions are deployed. However, the items in **P0** and **P1** below should be completed before the client is given operational ownership. P2 items are important polish and maintainability work that should either be completed or explicitly accepted and scheduled.

This audit deliberately excludes client-owned catalogue and creative work such as choosing product names, prices, stock, descriptions, photography, and replacement imagery. Where missing client content currently causes a broken or visibly unfinished experience, the development task is to hide or safely gate that surface until approved content exists.

## Priority guide

- **P0 — handover blocker:** security, data, payments, release integrity, or a public production defect that can cause material harm.
- **P1 — must fix before handover:** major correctness, operational, accessibility, or admin-workflow failure.
- **P2 — should fix before handover:** visible polish, performance, scaling, or maintenance weakness.
- **P3 — backlog:** worthwhile refinement that does not block a controlled handover.

## P0 — handover blockers

### 1. Establish an authoritative Git repository and release process

**Phase 1 update — resolved locally on 24 October 2026:** the workspace is now a Git repository on `main`, with documented Node 22/Java 21 requirements, exact lockfiles, a consolidated fail-closed `release:check`, and a least-privilege GitHub Actions validation workflow. Repository variables must be configured when the repository is connected to GitHub; deployment remains a separate protected operation.

**Confirmed:** this workspace has no `.git` directory, no commit history, no release tag, no root README, and no CI workflow.

**Risk:** there is no dependable change history, review trail, deployed-source provenance, automated release gate, or clean rollback point. Concurrent edits are especially unsafe without version control.

**Required work:**

- Import the authoritative source into a private Git repository.
- Review the ignore rules before the first commit; do not commit `.env.local`, logs, generated build output, local media dumps, or credentials.
- Create a clean, reviewed release commit and immutable handover tag.
- Add CI for type checking, bounded client tests, Functions tests, Firebase Rules emulator tests, production build, SEO checks, dependency audit, and artifact validation.
- Record the exact commit and deployment date in a release record.

**Done when:** a fresh clone can be configured from documented examples, passes every required check, and can be deployed and rolled back by an authorised maintainer.

### 2. Patch production dependency vulnerabilities

**Phase 1 update — resolved on 24 October 2026:** both direct Zod trees now resolve `4.6.7`; `fast-uri` resolves `3.1.9`; Functions `body-parser` resolves `2.4.0`; Firebase CLI's development-only body-parser branches resolve `1.20.9`/`2.4.0`. Both `npm audit --omit=dev` checks report zero vulnerabilities.

**Confirmed by `npm audit --omit=dev`:**

- Root: direct `zod@4.6.5` has a **high-severity memory-exhaustion** advisory; transitive `fast-uri` has moderate URL canonicalisation/scheme advisories.
- Functions: `zod@4.6.5` has the same high advisory and `body-parser@2.3.0` has a **high-severity compressed-request denial-of-service** advisory through `firebase-functions -> express`.

**Required work:** update Zod to at least the patched release, update the Functions dependency tree to resolve a patched `body-parser`, update `fast-uri`, inspect the lockfile changes, then rerun both audits and the complete test/build suite.

**Done when:** both production audits have no high or critical findings and any accepted lower-severity finding is documented with owner and review date.

### 3. Remove demo catalogue data from the Firebase production storefront

**Phase 1 update — resolved on 24 October 2026:** Home now renders only the authoritative catalogue supplied by `CatalogContext`, which already keeps demo data out of Firebase mode. The admin preview-catalogue seeder is available only in demo/emulator mode.

**Confirmed:** `src/pages/Home.tsx:297` builds the live Home carousel from `[...demoProducts, ...products]`. Missing Firestore slugs are therefore silently filled by `src/data/demo.ts`, even though the production catalogue context intentionally avoids demo fallback data.

**Risk:** concept products can appear publicly and demo entries with prices/unlimited stock can become purchasable when a matching live record is absent. This is an application defect, not a client catalogue-editing task.

**Required work:** permit demo fallback only in explicit demo/local mode. In Firebase mode, render only published Firestore products. Add a regression test proving that production mode cannot display or purchase demo-only products.

**Done when:** deleting or omitting a Firestore product cannot make its demo counterpart appear on the live storefront.

### 4. Complete and prove the payments launch state

**Phase 1 update — resolved to a safe handover state on 24 October 2026:** checkout is explicitly `disabled` in the current production build configuration and fails closed when its build value is absent or invalid. Test/live requests must match the server-derived Stripe environment. Every live session now rechecks the live key, protected activation switch, configured webhook secret, and current operator evidence bound to that signing secret. Live commerce remains intentionally locked until the separate operational transaction, refund, shipping and policy checklist is completed.

**Confirmed:** the inspected production build configuration does not explicitly set `VITE_CHECKOUT_ENABLED` or `VITE_CHECKOUT_MODE`; code defaults checkout to enabled and test mode (`src/config.ts:22-23`). The Cart currently labels the payment as a test. `docs/STRIPE-CHECKOUT.md` says the temporary sandbox expired on 9 October 2026 and states that shipping and launch policy decisions remain unresolved.

The server-side payment design is reassuringly fail-closed: it validates products/prices/stock, verifies signed webhooks, uses idempotency, separates sandbox inventory, and requires recorded live-webhook evidence before enabling real payments. The handover problem is incomplete operational activation and implicit build configuration.

**Required work:**

- Decide whether the handover is intentionally sandbox-only or includes live commerce.
- Make the client build environment explicit and validated in CI.
- If live: install least-privilege live credentials, configure and verify the live webhook, perform a small end-to-end live transaction/refund, record launch evidence, confirm shipping/tax/refund operations, and only then enable live payments in Admin Settings.
- If sandbox-only: disable or clearly gate customer checkout so a public visitor cannot mistake it for an operational store.
- Correct Settings so a failed commerce-status request is an error, not “Stripe sandbox active” (`src/pages/admin/SettingsPage.tsx:14,26`).

**Done when:** the UI, static build mode, server credentials, Admin status, Stripe mode, webhook evidence, and operations runbook all agree on one tested state.

### 5. Run and preserve Firebase Rules regression tests

**Phase 1 update — resolved on 24 October 2026:** Firestore and Storage Rules passed all 31 emulator tests. The suite is pinned to the emulator-only `demo-doxa-treasury` project and is part of `release:check` and CI.

**Confirmed:** the repository has a substantial default-deny Firestore/Storage rule set, but `npm run rules:test` cannot run on this machine because Java is unavailable.

**Required work:** install a supported JDK, run the Firestore/Auth/Storage emulator tests, resolve all failures, and move the same command into CI.

**Done when:** the exact release commit has a retained green Rules test result. A source review alone is not a substitute for emulator verification.

### 6. Create backup, restore, monitoring, and incident procedures

**Confirmed:** no repository-backed operational runbook was found for scheduled Firestore exports, Storage backup, restore drills, uptime checks, function/error alerts, email/checkout failure alerts, budget alerts, incident response, credential ownership, or deployment rollback. Cloud-side policies could not be independently verified from this workspace.

**Required work:**

- Configure scheduled Firestore exports and an appropriate Storage backup/retention policy.
- Perform and document a restore drill.
- Add uptime checks for the apex and critical public routes.
- Alert on Function errors, checkout/webhook failures, scheduled-job failures, email queue failures, App Check rejection spikes, and abnormal spend.
- Record credential/domain/Firebase/Stripe/Resend owners and recovery contacts.
- Document deploy, rollback, incident triage, and secret rotation.

**Done when:** a new maintainer can detect an outage, identify the affected service, restore data, and roll back without relying on the original developer.

### 7. Add public legal-policy routes before accepting real orders

**Confirmed:** there are no public Privacy, Terms, Shipping, or Returns/Refund routes. The private Account “Privacy & data” screen is not a public policy. This audit does not prescribe the client’s legal wording.

**Required development work:** provide stable, accessible, linkable public policy pages and footer/checkout links; add a version/effective-date mechanism; ensure acceptance records point to an immutable version where needed. The client or legal adviser supplies and approves the wording.

**Done when:** reviewed policies are publicly reachable before sign-up/checkout, and the exact accepted version can be identified later.

## P1 — must fix before handover

### 8. Prevent browser Back/Forward from discarding unsaved admin edits

`useUnsavedChanges` handles page unload and clicked anchors but not browser history/popstate navigation (`src/admin/utils.ts:61-83`). Journal, Email Campaigns, Website Editor, Product, Community, and other editors can therefore unmount a dirty form without confirmation.

Implement a React Router navigation blocker that covers links, Back/Forward, route changes, and unload; preserve focus and add regression tests.

### 9. Add a recoverable reauthentication flow to every protected email action

The seven-day backend recent-auth window is appropriate, but several UI paths only print the error after it expires:

- campaign test/send (`CampaignStudio.tsx:235-248`);
- campaign and queue retry (`EmailCampaignsPage.tsx:37-54`);
- Journal release-email retry (`JournalEditorPage.tsx:71`).

Initial Journal publishing has reauthentication, but the other paths do not. Route every recent-login error into the same reauthentication flow, then resume the exact pending action once. Do not require administrators to guess that signing out is the workaround.

### 10. Stop representing backend failures as valid empty/not-found states

Confirmed cases:

- Account Overview discards rejected profile, policy, and order reads (`AccountCentrePages.tsx:40-52`).
- Orders can show “No orders yet” after a failed request (`AccountCentrePages.tsx:120-132`).
- Personal Information substitutes editable fallback values after a failed profile read (`PersonalInfoPage.tsx:18-23`).
- Customer, Enquiry, and Order admin detail pages can show “not found” when their list request actually failed.

Add explicit loading, error, empty, and stale states with retry. Never allow fallback values to be saved over unknown server data.

### 11. Fix narrow-mobile clipping in the mission heading

The two-line title requirement is implemented with two forced `nowrap` spans (`Home.tsx:133-139,348`; `homepage.css:351-354`). At 320–375 px the second line cannot fit and the page shell clips overflow.

Keep two lines where space permits, but allow a smaller responsive type treatment or safe wrapping at the narrowest breakpoint. Verify at 320, 360, 375, and 390 px with 200% text zoom.

### 12. Remove or gate broken social links and unfinished public blocks

**Confirmed live CMS state:** footer Instagram, TikTok, YouTube, and Facebook labels all navigate to `/home`; `Instragram` is misspelled in stored CMS data. About displays “Links coming soon” and “Reviews coming soon”; Home displays a full disabled reviews control labelled “Reviews coming soon.”

The client may own the final links/review content, but the development handover must not expose fake destinations or visibly unfinished controls. Hide these items until valid data exists, validate external destinations, and avoid rendering empty sections.

### 13. Make Journal content a single reliable source of truth and support its full lifetime

Confirmed defects:

- Public Journal substitutes hard-coded starter articles both for an empty database and a failed request (`src/pages/Journal.tsx:31`), masking outages and diverging from managed/SEO content.
- Public retrieval and admin listing stop at 100 entries; older valid slugs/routes eventually become unreachable or uneditable.
- Published Journal deletion requires admin context but not recent authentication (`functions/src/journal.ts:133`) and immediately breaks indexed/emailed URLs.

Use an explicit unavailable state in Firebase mode, query articles directly by slug/ID, paginate archives and admin lists, require recent auth for destructive published changes, and prefer archive/unpublish plus redirect/tombstone history over hard deletion.

### 14. Make campaign audience selection complete and failure-aware

The Campaign Studio ignores customer/subscriber loading errors, and manual account discovery stops after five pages/500 accounts with no truncation indicator (`src/lib/accounts.ts:85-101`). A failed or large source silently omits eligible people.

Add pagination/server search, show source errors, disable sending while audience completeness is unknown, and display any cap explicitly. Continue rechecking consent/eligibility server-side at send time.

### 15. Make the client test suite deterministic and green in the release command

Observed results varied by run. An earlier bounded two-worker run passed all **41 files / 188 tests**, but the required final handover run with the same two-worker limit ended at **39 passed / 2 failed files and 184 passed / 4 failed tests**. The failures were the two Journal reauthentication/error-state cases in `tests/admin-routes.test.tsx:110-143` plus two timeout failures in `tests/security-centre.test.tsx` (Google-connected sign-in display and reauthentication before account deletion). Unconstrained parallel execution produced still more timeout failures and React `act(...)` warnings.

Pin a bounded worker count in the default script, fix the two Journal-path tests/implementation race, remove `act` warnings, and ensure the same command is used locally and in CI.

### 16. Enforce a practical full Content Security Policy

Live headers correctly enforce HSTS, `nosniff`, clickjacking protection, referrer policy, and restrictive permissions. However, the meaningful script/connect/image/frame policy remains `Content-Security-Policy-Report-Only`; the enforced CSP covers only frame ancestors, objects, base URI, and forms (`firebase.json:38-39`). No reporting endpoint/runbook was found.

Add CSP reporting, inventory violations, constrain arbitrary off-site media URLs to approved origins or a validated publishing pipeline, then enforce the complete policy without breaking Google sign-in, Stripe, Firebase, or Resend-adjacent flows.

### 17. Add route-change focus management and complete mobile drawer accessibility

SPA route changes scroll to the top but do not move focus or announce the new page. Keyboard/screen-reader users can remain focused on an element from the previous page. The public mobile menu and admin mobile drawer also lack a complete modal focus boundary; the admin drawer has no dialog semantics, Escape handling, focus trap/restoration, or inert background.

Move focus to the page heading/main region after navigation, add an announcement where appropriate, and implement/test accessible modal-drawer behaviour.

## P2 — important quality and maintenance work

### 18. Replace whole-grid carousel flashing with a continuous item transition

Product and information controls correctly advance one item and wrap, and reduced-motion is supported. However, each click remounts and animates the whole visible grid from low opacity/blur. Repeated cards flash together rather than moving as a continuous carousel.

Preserve stable items, animate outgoing and incoming positions in the selected direction, block double-trigger races, support keyboard controls, and consider touch swiping as optional P3 polish.

### 19. Reduce first-load and mobile payloads

The production build succeeds but warns about large chunks: main JS is about 615 KB minified, Firebase about 590 KB, Admin about 287 KB, and CSS about 341 KB. Home also preloads a roughly 3.4 MB desktop hero video or 1.7 MB mobile video, and an eagerly loaded card image is roughly 968 KB. The public shell is client-rendered, so these resources directly affect first useful render.

Route-split more public code, load Firebase features closer to use, remove unused CSS, serve responsive/modern media variants, avoid eager non-LCP imagery, verify the actual LCP resource, and set performance budgets in CI. Test on a throttled mid-range mobile device rather than desktop-only hardware.

### 20. Make payment, account, and admin status displays honest under partial failure

In addition to the P1 empty/not-found cases, add consistent stale-data banners and retry behaviour throughout list/detail screens. Preserve last known data only when clearly labelled stale. Operational dashboards must distinguish “provider accepted,” “delivered,” “failed,” and “status unknown.”

### 21. Refresh stale and contradictory documentation

Confirmed stale items include:

- `docs/ARCHITECTURE.md:19` says Stripe Checkout is intentionally not activated even though checkout code and Functions are deployed.
- `docs/STRIPE-CHECKOUT.md` references an already-expired temporary sandbox.
- `docs/CLIENT-DECISIONS.md` treats the implemented Journal as undecided.
- `docs/SETUP.md:67-73` still labels production steps as outstanding.
- `docs/SECURITY-REMEDIATION.md:36,62` describes work as local/not deployed even though current Functions are deployed.

Replace point-in-time notes with a concise README, current architecture, environment matrix, release checklist, operations runbook, and dated decision log. Do not leave future maintainers to infer which document is authoritative.

### 22. Add regression coverage for public Journal and long-lived data sets

Add tests for direct slug lookup, pagination past 100 records, empty versus unavailable states, metadata/SEO rendering, archive/delete redirects, and older admin entries. Add tests for customer/account fetch failures and campaign audience pagination.

### 23. Clean up handover artifacts and naming

The root contains large loose media files, JPEGs, emulator logs, TypeScript build-info files, and the legacy local-storage key `cards-of-the-canons:demo-cart`. Define what is source, what belongs in managed media storage, what is generated, and what should be ignored. Migrate the cart key deliberately with backward compatibility if the product name is standardised.

### 24. Remove the Functions test-runner configuration warning

Functions tests currently warn that `vitest.config.ts` uses ESM syntax while being loaded as CommonJS and that this will be unsupported when Vite's native config loader becomes the default. Make the Functions package/config module format explicit and preserve the green test run.

### 25. Decide whether email-code security is in scope and label it accurately

The Email Code setup currently stops and explains that secure delivery is unavailable. That is honest, but it must be listed as disabled/not supported in the handover feature matrix, hidden if it is not a client-facing option, or completed and security-reviewed before being promoted as operational.

## P3 — optional refinements

- Add swipe gestures and drag velocity to Home carousels while retaining buttons and keyboard operation.
- Add a final 320 px visual adjustment if the responsive mission-title fix still feels crowded.
- Record a browser/device support matrix and run the final acceptance pass on iOS Safari, Android Chrome, desktop Chrome/Edge/Firefox/Safari, keyboard-only navigation, 200% zoom, and reduced motion.

## Verified healthy controls and behaviours

These should be preserved while completing the work above:

- Live apex and the principal public, account, and admin routes responded over HTTPS.
- Current live Hosting asset hashes matched the local production build at audit time.
- Expected Firebase Functions were deployed in `australia-southeast1` on Node 22, including checkout, newsletter/campaign, Journal, website editor, Treasury, cleanup, and account functions.
- `npm run typecheck` passed.
- `npm run build` passed, including SEO generation and artifact checks.
- `npm run seo:check` passed across 19 generated documents.
- Functions tests passed: **21 files / 154 tests**.
- The final bounded client test run was **not green**: **39/41 files and 184/188 tests passed**. Earlier passes confirm nondeterminism rather than a consistently healthy release gate.
- Hosting artifact checks found no secrets, emulator endpoints, source maps, unsafe generated HTML, or unexpected output types.
- Live headers include HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict referrer policy, and restrictive camera/microphone/geolocation permissions.
- Firestore and Storage Rules are default-deny oriented; private mutations are server-owned; App Check is enforced on production callables; public write endpoints are rate-limited.
- Markdown is rendered through sanitisation rather than raw HTML.
- Checkout validates product identity, price and stock server-side; signed webhook processing is idempotent and live payment activation fails closed.
- Newsletter uses consent-aware flows; send eligibility is rechecked server-side.
- Home videos and known managed images returned successfully during direct production checks.
- Product and information carousels advance one item, wrap around, expose button labels, and honour reduced-motion preferences.
- The card flip interaction exposes an accessible state/label.
- Contact tabs use tab semantics and keyboard arrow handling.
- “Join the Council” is height-constrained on desktop and returns to natural height at smaller breakpoints.
- The sender defaults have been changed in source to `Doxa Cards <info@doxatreasury.com>` with reply-to `info@doxatreasury.com`.

## Final handover acceptance gate

Do not mark the project handed over until all of the following are true:

- [ ] Every P0 item is complete.
- [ ] Every P1 item is complete or has written, informed client acceptance with an owner and due date.
- [ ] Both production dependency audits have no high/critical findings.
- [ ] Typecheck, bounded client tests, Functions tests, Rules tests, build, SEO, and artifact checks all pass from a fresh clone in CI.
- [ ] The release is committed, tagged, deployed, smoke-tested, and rollback-tested.
- [ ] Payment mode and customer-facing checkout state are explicit and tested.
- [ ] A real admin completes: sign in, edit/save/publish site, upload media, publish/delete/archive Journal, create/test/send/schedule/retry an email campaign, inspect the queue, fulfil an order, and redeem/revoke a Treasury code.
- [ ] A real customer completes: create/verify account, sign in with enabled providers, recover/re-authenticate, update profile, join/leave mailing list, submit enquiry, add/redeem a Treasury code, add/remove cart items, and—if live—complete/cancel/refund an order.
- [ ] Mobile, keyboard, zoom, reduced-motion, and screen-reader acceptance passes are recorded.
- [ ] Backups, monitoring, alerts, ownership, incident response, and rollback documentation are transferred to the client.

## Audit limitations

- No destructive production actions, real payment, production email campaign, account deletion, or data mutation was performed.
- The formal Codex Security workbench failed to start before producing a scan ID; security findings in this document are therefore evidence-backed static/manual review and dependency/rules analysis, not a completed independent penetration test.
- Firebase Rules emulator tests passed with a portable Java 21 runtime; CI provisions Temurin 21 explicitly.
- Cloud-side backup schedules, alert policies, IAM membership, billing budgets, and secret-rotation state were not independently verifiable from this workspace and remain explicit handover checks.
- Final client-supplied catalogue, imagery, social destinations, review copy, and legal wording were intentionally excluded.
