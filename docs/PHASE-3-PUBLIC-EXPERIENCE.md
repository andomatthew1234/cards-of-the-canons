# Phase 3 — Public experience

Completed on 24 October 2026.

## Delivered

- Mobile headings now wrap safely at narrow widths, including the two-line home mission heading.
- Unconfirmed social destinations, empty footer groups, and public "coming soon" feature panels are hidden instead of exposing dead controls.
- Public Privacy, Terms, Shipping, and Returns routes use one versioned publication model. A policy is exposed in navigation only when reviewed wording and complete approval metadata are present.
- Route changes move focus to the new page heading and announce the destination. The mobile navigation traps focus, closes with Escape, restores focus to its trigger, prevents background interaction, and preserves the page scroll position.
- Product and information carousels move one item at a time, wrap in both directions, support arrow keys, announce position changes, and respect reduced-motion preferences.
- Public pages below the home route are code-split. Hero media is bounded by a release-time performance budget and below-the-fold imagery is lazy-loaded.

## Legal-content approval boundary

The repository does not contain client- or adviser-approved legal wording. It would be unsafe to invent operative policies.

Until exact wording is supplied, all four policy records remain `awaiting_approval`, footer links stay hidden, and direct policy URLs return a clearly labelled, `noindex` unavailable state. To publish a policy, record all of the following together in `src/legal/policies.ts`:

1. approved title, description, and section text;
2. immutable version identifier;
3. effective date;
4. approver identity; and
5. approval timestamp.

The runtime gate rejects incomplete approval records, and tests cover both pending and fully approved states.

## Release gates

- TypeScript type checking
- storefront and Cloud Functions tests
- Firebase Rules emulator tests
- production dependency audits
- production build and SEO validation
- initial JavaScript/CSS and hero-media performance budgets
