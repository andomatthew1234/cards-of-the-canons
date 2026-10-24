# Account security centre implementation

## Implemented

- Provider-aware presentation for password, Google and future linked providers.
- Password and Google/Apple reauthentication through Firebase before sensitive flows.
- A guided email-change flow using `verifyBeforeUpdateEmail`; the current address remains active until the new address is verified through Firebase's signed action link.
- A guided deletion flow. The client reauthenticates first and the callable checks `auth_time` again before deleting the Firebase user and private profile/security documents.
- An extensible, server-owned account-security policy shape with independent methods and requirements for sign-in, critical actions, payment actions and passwordless sign-in.
- Direct client access to account security policy and challenge documents is denied by Firestore Rules. The authenticated callable returns only a bounded, sanitised view.
- Honest groundwork for authenticator apps and passkeys without presenting either as active.

## Email-code limitation

The project does not currently have a trusted transactional email provider or Firebase Trigger Email extension. Firebase Authentication's built-in passwordless email mechanism sends signed links, not custom six-digit codes. Firebase's native second factors are SMS and TOTP, not email.

For that reason, email-code setup stops before code delivery. No code is generated, stored or compared in the browser, and the UI does not claim that protection has been enabled.

To activate six-digit email challenges later, add a trusted delivery provider and server-only Functions that enforce all of the following:

- cryptographically secure code generation;
- keyed hashing with a secret held outside source control;
- short expiry and single use;
- strict per-challenge attempt limits;
- per-account and per-network resend/rate limits;
- atomic challenge consumption;
- no plaintext codes or secrets in Firestore, client responses or logs;
- recent Firebase authentication before policy changes; and
- generic responses for passwordless initiation to limit account enumeration.

TOTP through Firebase Authentication with Identity Platform is the preferred native MFA extension when the business is ready to configure and test it.
