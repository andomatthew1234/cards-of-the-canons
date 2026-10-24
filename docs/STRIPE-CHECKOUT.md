# Stripe Checkout

## Current state

The public storefront is connected to an isolated Stripe sandbox. Sandbox
payments cannot move real money. The current temporary sandbox expires on
9 October 2026 unless it is claimed with:

```powershell
stripe sandbox claim
```

The Stripe restricted key and webhook signing secret are stored in Google
Secret Manager as `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. They must
never be added to source control, Vite variables, browser code or logs.

## Customer test

1. Sign in with a verified customer account.
2. Add one or more published products to the cart.
3. Select **Continue to test checkout**.
4. On Stripe's hosted sandbox page, use card `4242 4242 4242 4242`, any future
   expiry date, any three-digit CVC and a valid test postcode.
5. Complete Checkout and wait for the site's confirmation page to receive the
   verified webhook result.

The success page never marks an order paid by itself. It reads the order that
the signed Stripe webhook updated. Cancellation and expiry release reserved
stock. Duplicate webhook events are recorded idempotently and cannot decrement
inventory twice.

Shipping is intentionally zero and no shipping promise is displayed during
this checkout test. Destinations, rates and fulfilment must be agreed before
launch.

## Server components

- `createCheckoutSession`: validates Firebase Auth, App Check, product IDs,
  quantities, published status, prices and stock before reserving inventory.
- `cancelCheckoutSession`: expires an open Stripe Session before releasing its
  reservation.
- `stripeWebhook`: verifies Stripe signatures and processes completed,
  asynchronous success/failure and expired Session events.
- `releaseExpiredCheckoutReservations`: safety cleanup for abandoned open
  Sessions.
- `getCommerceStatus` and `setLivePaymentsEnabled`: administrator-only launch
  controls.

## Production activation

Live activation is deliberately two-part so a leaked key or browser action
cannot accidentally take money:

1. Install a least-privilege live restricted key and the signing secret for a
   separate live webhook endpoint in Google Secret Manager, then redeploy the
   payment Functions.
2. After the launch checklist passes, open **Admin → Settings → Payments** and
   select **Enable live payments**.

The second step is the final launch switch. The server refuses it unless both
live credentials are installed. Until then, the button remains locked and the
store can only use Stripe's sandbox.

Before activation, confirm products, prices, stock, currency, shipping,
tax/GST treatment, refund terms, privacy terms and fulfilment responsibilities.

## Recording launch prerequisites

Live activation is refused until an administrator records structured evidence
that a real signed webhook was received from the live endpoint. A `whsec_`
prefix is configuration, not validation, and never unlocks the switch.

1. Configure the live webhook endpoint for the checkout lifecycle events
   (`checkout.session.completed`, `checkout.session.expired`, async payment
   success/failure, `charge.refunded`, `charge.dispute.created`,
   `charge.dispute.closed`) and install the live signing secret.
2. Place a small live-mode test order end to end and capture the Stripe
   delivery id, the event type, the received timestamp and the order reference
   from the Functions logs (`stripeWebhook`).
3. Call the `recordLaunchPrerequisites` function as a server administrator with
   recent MFA, passing that evidence plus the confirmation phrase
   `RECORD LAUNCH PREREQUISITES`.
4. Re-open **Admin › Settings › Payments**; only then does **Enable live
   payments** become available.

Until step 3 succeeds, `getCommerceStatus.readyForLiveActivation` stays `false`
and enabling live payments fails closed.

## Test-checkout gating

Test checkout only works for tester UIDs listed in the Functions environment
variable `TEST_CHECKOUT_TESTER_UIDS` (comma separated). With it unset or empty,
test checkout is denied. Test checkout reservations are scoped
`inventoryScope: sandbox` and never mutate operational product stock; quotas are
independent of live stock and default to 3 active reservations per tester and 25
overall (`TEST_CHECKOUT_PER_USER_QUOTA`, `TEST_CHECKOUT_GLOBAL_QUOTA`).
