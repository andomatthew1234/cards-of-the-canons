# Doxa Treasury

The Doxa Treasury storefront, customer account area and Firebase-backed administration system.

## Supported runtime

- Node.js 22 (see `.nvmrc`)
- npm
- Java 21 for Firebase Rules emulator tests

## Local checks

Install both dependency trees, configure `.env.local` from `.env.example`, then run:

```sh
npm ci
npm --prefix functions ci
npm run release:check
```

`release:check` fails closed when production Firebase configuration or the explicit checkout state is missing. It audits production dependencies, typechecks and tests both applications, runs Firestore and Storage Rules tests against the emulator-only `demo-doxa-treasury` project, then verifies the production build and SEO artifacts.

See [docs/RELEASE.md](docs/RELEASE.md) for release and Stripe activation controls.
