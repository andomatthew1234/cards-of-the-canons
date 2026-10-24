# Release controls

## Before every release

1. Use Node 22 and Java 21.
2. Install exact lockfiles with `npm ci` and `npm --prefix functions ci`.
3. Configure the public Firebase web values and `VITE_PUBLIC_SITE_URL` in the release environment.
4. Set `VITE_CHECKOUT_STATE` explicitly to `disabled`, `test` or `live`. It defaults to disabled when absent or invalid.
5. Run `npm run release:check`. Do not deploy if any step fails.
6. Review the Git diff and deploy from a clean, reviewed commit on `main`.

The GitHub workflow uses repository variables for public Firebase web configuration and `VITE_CHECKOUT_STATE`. These values are not secrets, but keeping them as variables prevents a test project, placeholder, or checkout mode that differs from the intended release from being shipped accidentally. The validator also requires the Firebase auth domain and Storage bucket to match the production project.

## Stripe modes

- `disabled`: storefront checkout is unavailable. This is the safe default.
- `test`: the client requests test checkout; the server still restricts access to configured tester UIDs and quotas.
- `live`: the client requests live checkout. The server independently requires a live Stripe key, an installed webhook secret, current operator-recorded webhook evidence bound to that secret, and the protected live-payments switch.

The client-requested environment must equal the server-derived environment before any inventory reservation or Stripe session is created. Rotating the webhook signing secret invalidates the recorded launch evidence and locks live checkout until the new secret has been tested and approved.

Stripe keys and webhook secrets belong only in Firebase Secret Manager. Never add them to `.env` files, GitHub variables, source code or logs.

## Rollback

1. Set the protected live-payments switch off in Admin Settings if payments are implicated.
2. Set `VITE_CHECKOUT_STATE=disabled`, rebuild and redeploy Hosting.
3. Revert to the last reviewed Git commit and rerun `npm run release:check` before redeploying.
