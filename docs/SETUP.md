# Doxa — local setup

## Safe demo (no cloud credentials)

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Demo mode is the default. The cart stores only product IDs and quantities in browser local storage. Enquiries, newsletter signups, accounts and checkout are deliberately not completed.

## Firebase emulator mode

No Firebase project or billing account is required for the local UI and rules tests. Java is required by the Firestore emulator.

1. Copy `.env.example` to `.env.local` and set `VITE_DATA_MODE=firebase`. Use a non-production Firebase web-app configuration. For an emulator-only project, placeholders can be replaced with consistent local values (the API key must not literally be `replace-me`).
2. In one terminal, install function dependencies and compile them:

   ```powershell
   npm --prefix functions install
   npm --prefix functions run build
   ```

3. Start the emulators with an explicit demo project ID:

   ```powershell
   npx firebase emulators:start --project demo-cards-of-the-canons
   ```

4. Start Vite in another terminal with `npm run dev`.

The Emulator UI is at `http://127.0.0.1:4000`. The app connects to Auth (9099), Firestore (8080), Functions (5001) and Storage (9199). Use an Auth emulator user with an `admin: true` custom claim to exercise protected administration. Never add an admin field to a user profile; only the trusted Admin SDK claim is recognised.

The account stack supports email/password, Google and Apple in the client. The emulator can exercise the local flows without real provider secrets. Customer tools include verification email, password reset/change, verified email change, private profile editing, provider-aware reauthentication and self-service account deletion. Administrators can list, enable, disable, promote, demote and delete accounts through callable Functions; they cannot disable, demote or delete themselves.

### Connected Firebase project

- Project: `cards-of-canons-au-260930` (legacy infrastructure identifier; public brand: `Doxa`).
- Web app: existing Firebase web app for Doxa.
- Cloud Firestore: Standard edition, `australia-southeast1` (Sydney), with the repository rules and indexes deployed.
- Email/password and Google Authentication are enabled. `localhost` and `127.0.0.1` are authorised for local OAuth testing.
- The ignored `.env.local` connects the local Vite preview to this project without using emulators. Public Hosting and the callable Functions are deployed to the connected project; reconcile the deployed function inventory with `functions/src/index.ts` during every release.
- Google sign-in uses Firebase's popup flow and requests account selection. No Google access token is stored by this application.
- Apple sign-in is currently disabled and visibly labelled as requiring setup. It is conditional on Apple Developer Program membership. Create a Services ID and Sign in with Apple private key, register `https://cards-of-canons-au-260930.firebaseapp.com/__/auth/handler`, then enter the Services ID, Team ID, Key ID and private key in Firebase Authentication's Apple provider settings and set `VITE_ENABLE_APPLE_AUTH=true`.
- If Firebase may send verification, recovery or email-change messages to Apple private-relay addresses, register the Firebase sender/custom email domain with Apple's private email relay service.
- Self-service account deletion reauthenticates the customer, deletes their private profile and removes their Firebase Authentication account. Apple deletion also revokes the fresh Apple access token where available.
- Review Firebase email templates and configure a production continue URL/custom email domain before launch.
- Firebase App Check is registered with the score-based reCAPTCHA Enterprise/Fraud Defense provider for the Firebase Hosting origins and `doxatreasury.com`. The client initializes App Check before other Firebase services and automatically refreshes tokens.
- The Node.js 22 second-generation Functions runtime service account has the least-privilege `roles/firebaseappcheck.tokenVerifier` role required to verify and consume App Check tokens. Do not replace it with a broader App Check administrator role.
- Local Vite development uses Firebase's App Check debug provider when connected to the live project. Register only the generated local debug token in Firebase Console; never add `localhost` to the production reCAPTCHA key or enable a hard-coded debug token in a production build.
- App Check enforcement is enabled for protected callable endpoints. Review valid-request and rejection metrics after every domain or client change.

## Verification

```powershell
npm run typecheck
npm test
npm run test:functions
npm run build
npm run rules:test
```

The rules test command starts local emulators and checks public/draft catalogue reads, ownership isolation, administrator claims, price tampering and schema pollution. It does not deploy.

## Production setup still required

- Keep `doxatreasury.com` in Firebase Authentication authorised domains and in the reCAPTCHA Enterprise key's allowed domains. `www` redirects to the apex address.
- Supply Apple Developer credentials if Apple sign-in is required.
- Reconcile and deploy the complete callable/scheduled Function inventory on every backend release; remove obsolete deployed functions deliberately.
- Review App Check metrics after each deploy and investigate unexpected rejection increases.
- Review and harden Firestore and Storage rules, then run the emulator tests again.
- Configure Cloud Storage CORS if the selected image workflow requires it.
- Add real content and image rights information.
- Stripe sandbox credentials are stored as Functions secrets. Live credentials must remain server-side and must not be enabled before the documented launch checks pass.
- Configure Analytics only after consent/privacy decisions. Current events are inert without a measurement ID and contain no PII.
- Build with `npm run build`; Firebase Hosting deploys the resulting `dist` output.

The production build prerenders the public storefront routes and generates a sitemap, robots policy and canonical URLs for `https://doxatreasury.com`. Product and category indexing stays disabled until the catalogue content, pricing and imagery are approved; enable it deliberately with `VITE_INDEX_PRODUCTS=true` only after that review.
