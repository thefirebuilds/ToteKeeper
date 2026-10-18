# Stripe sandbox integration

This extends the existing storefront, multi-package enrollment and Octagon policy scaffold. It does not replace the app, deploy a backend, activate real customers, or connect Stripe Connect. The merchant is ToteKeeper alone. Subscription invoices come from Billing; no standalone Invoicing creation flow was added.

## Modes and actual verification

| Mode | Storage/auth | Payment behavior |
| --- | --- | --- |
| Existing fictional demo | Existing localStorage records; no real authentication | No Stripe calls, charges or provider cancellation. |
| Opt-in local sandbox | Separate SQLite server records; local token login and HttpOnly sessions | Official Stripe SDK with test keys only. Reviewed orders and configured test agreement/tax policy required. |
| Production Octagon | Not connected | Disabled. No live key accepted; the sandbox server refuses production mode and binds loopback only. |

The implemented automated suite uses controlled Stripe API fixtures, the official SDK's real webhook signature verification, a loopback HTTP handler, and SQLite persistence. Browser checks use deliberately nonfunctional API-key fixtures and never contact Stripe. Actual account catalog sync, hosted test-card payments, Stripe Tax calculation, CLI event forwarding and test-clock renewal require your sandbox key/configuration and have **not** been run against your account. OAuth access to MCP does not supply the server's API key.

## SDK and agent tools

Pinned dependency: `stripe@23.0.0`; API version `2026-09-30.endive`. Server requests pin this version. Configure your test webhook destination with the same version. Reconciliation reads fresh provider objects using the pinned API instead of trusting webhook ordering or obsolete embedded invoice fields.

Official Codex setup: `codex plugin add stripe@openai-curated`. Remote fallback: `codex mcp add stripe --url https://mcp.stripe.com`, then complete OAuth for the sandbox. If installed tools do not appear in an existing VS Code session, run **Developer: Reload Window**, reopen Codex, and start a new chat so it loads Stripe MCP. Use the implementation planner when it becomes available. This task installed the official plugin and verified the remote MCP registration with OAuth; its planner was not exposed to the running chat.

## Local setup

1. Use Node 22.13+ or Node 24, then `npm install`.
2. Copy `.env.example` to an untracked `.env`. Set a sandbox-only `STRIPE_SECRET_KEY` locally. Never use `VITE_*` for server credentials. The server rejects live keys and live provider objects. Do not paste secrets in chat.
3. Generate separate random values of at least 24 characters for `SANDBOX_CUSTOMER_TOKEN` and `SANDBOX_OWNER_TOKEN`. These are local test-account logins, not Stripe keys or production Octagon authentication. Login issues expiring HttpOnly/SameSite cookies; logout revokes the server session. Do not deploy this development login.
4. Set `VITE_STRIPE_SANDBOX_ENABLED=true`. The extra controls appear only in the Vite development build. Keep `SANDBOX_APP_ORIGIN=http://127.0.0.1:5173`, or set it to your exact loopback Vite origin. Restart Vite after changing frontend env values. The proxy targets `127.0.0.1:4242`; update the proxy if you change the API port.
5. Provide a local **reviewed test document** using `SANDBOX_AGREEMENT_FILE`, its immutable `SANDBOX_AGREEMENT_VERSION`, and `SANDBOX_AGREEMENT_APPROVED=true` only after explicitly approving it for sandbox exercises. No approved legal agreement is invented or shipped. The customer sees that document and explicitly accepts that version; order acceptance time comes from the server. Demo preview acceptance never satisfies this requirement.
6. Explicitly choose the sandbox tax policy. `unconfigured` blocks Checkout. `disabled` requires `SANDBOX_TAX_POLICY_APPROVED=true` and does not silently add tax. `automatic` additionally requires approved inclusive/exclusive behavior, product classifications, origin and registrations; the coordinator also checks active Stripe Tax settings/test registrations. No registrations or tax settings are written automatically.
7. Keep monthly checkout blocked: no approved setup amount/refundability exists. Paid bulky add-ons additionally require `SANDBOX_BULKY_ADDON_COUPLING_APPROVED=true` only after approving the test coupling described below. The annual Big bonus does not require paid add-on coupling approval.
8. Explicitly run `npm run stripe:catalog`. Then run `npm run stripe:portal` and save the printed **configuration ID** (not a credential) to `STRIPE_PORTAL_CONFIGURATION_ID`. Restart the sandbox server after env changes.
9. Run `npm run sandbox:server` and `npm run dev` in separate terminals. Visit `/billing/return` to sign in as the local customer, then use the existing `/enroll` cart to **Save cart for sandbox review**. This persists before Checkout. Sign in as local owner to review the exact address and item dimensions/value. No ZIP automatically approves an address. Re-enter the customer account, accept the configured test agreement, and continue the next hosted test Checkout.

Defaults leave agreement, tax, paid add-on coupling and monthly checkout unapproved. These gates are deliberate and must not be bypassed with fictional demo data.

## Object model and sequential purchases

Standard subscription-mode Checkout creates a subscription for that Checkout purchase, not independent subscriptions for each line item. Therefore one order persists multiple **purchase units**, and the coordinator opens one hosted Checkout Session per package, in sequence. The UI shows paid/remaining steps and preserves the cart after abandonment or partial completion. A standalone bulky item gets its own annual unit/subscription. Mixed monthly/annual carts remain nonpayable while monthly setup terms are unresolved; no mixed-interval shortcut is assumed.

| Octagon/sandbox record | Stripe mapping |
| --- | --- |
| Authenticated customer | One durable Stripe Customer mapping, reused across packages and future orders. Never inferred by email alone. |
| Order | Stable server ID, client retry-key deduplication, immutable fingerprint, exact address review and versioned acceptance. |
| Package purchase unit | Stable package ID, own Checkout attempt/session and own Subscription. Checkout metadata carries opaque IDs only. |
| Order line / bulky item | Stable line and operational-item IDs; versioned lookup key → Price ID → Checkout line and Subscription Item IDs where applicable. Identical add-on Prices can share a quantity-based Stripe item while retaining separate item records. |
| Subscription invoice / payment | Invoice IDs and associated PaymentIntent IDs on each paid package. Hosted billing exposes invoice/payment history. No standalone invoices are created. |
| Extra cycle | Separate authorized `mode=payment` Checkout; one paid operational cycle with return/dropoff and subsequent pickup legs. Not a subscription. |

The order is stored before the Stripe Customer/session is created. Each attempt has a persisted server-derived Stripe idempotency key. Repeated clicks or a lost create response reuse the same attempt. Open sessions resume; pending asynchronous outcomes do not create new purchases. Only expired sessions or authoritatively terminal failures rotate attempts. Retired-session events do not reactivate a unit; an unexpected old payment creates owner review. Attempts/customer creations with uncertain results older than 23 hours require operator reconciliation instead of blindly reusing expired provider idempotency retention.

A success/cancel redirect contains the owned order ID, not payment authority. The page requests server reconciliation; payment remains processing until current Stripe state verifies paid Checkout and an active, paid initial subscription invoice. Opening Checkout allocates no physical tote IDs or appointments. A validated paid unit creates one package/cycle only, even if both Checkout and invoice events arrive.

Annual prices remain $125/$299/$599; monthly catalog prices are $15/$50/$100 but monthly checkout is blocked. Tote mix changes credits, not Price. The free annual Big item has an operational record/zero billable line and no extra visit. Approved $75 annual add-ons become recurring items on their **parent annual package** subscription; they renew/cancel with that package and have no independent plan-change flow. This coupling is gated on explicit sandbox policy approval because independent add-on removal/refund/renewal policy is unresolved. Standalone standard bulky storage is $125/year with its own collection/return. Custom/unapproved items never reach instant Checkout.

## Catalog and tax

`server/catalog.ts` derives authoritative USD amounts from shared asset-free `src/config/commercial.ts`. The storefront's `business.ts` decorates those shared products with existing images. No arbitrary client amounts or Price IDs enter Checkout. Stable lookup keys such as `totekeeper_small_annual_usd_v1` identify immutable Prices. Catalog setup is explicit/idempotent, not a startup side effect. Existing inactive/mismatched Prices fail closed; change amounts/behavior through an explicit versioned migration rather than overwriting a Price.

Catalog classifications distinguish storage (packages/bulky) from transportation/service (the extra round trip). Setup-fee classification has a reserved env field but no product/charge exists until its policy is resolved. Approve whether bundled storage/transportation needs different classifications before live billing. Automatic tax validates configured product tax codes, Price behavior, active Tax settings and test registrations. Changing an existing catalog's tax treatment requires explicit owner-reviewed product/Price migration. There is no guessed Texas taxability or automatic jurisdiction registration. The UI labels pre-tax amounts and never claims an uncalculated amount is tax-inclusive.

## Webhooks and reconciliation

Install/login to the official Stripe CLI for the **same sandbox**, then forward:

```sh
stripe listen --forward-to http://127.0.0.1:4242/api/sandbox/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,invoice.paid,invoice.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,charge.refunded,charge.dispute.created,charge.dispute.closed,refund.created,refund.updated,refund.failed
```

Save the listener's signing secret directly in local `STRIPE_WEBHOOK_SECRET`; never commit or paste it in chat. Restart the sandbox server. Signature verification uses the **raw request body** before JSON parsing. Test actual Checkout with Stripe-provided test payment details only. Generic CLI-triggered objects without the persisted order/customer/line mapping do not grant entitlements. For schema-sensitive integration tests use a test webhook destination pinned to the documented API version; reconciliation itself retrieves fresh pinned-version objects.

SQLite commits event IDs/status/attempt counts, purchase state, mapping and fulfillment changes durably. Duplicate and out-of-order events retrieve current Stripe state and cannot double-grant. Processing failures retain a retryable event record and return HTTP 500. The owner reconciliation control recovers persisted sessions/subscriptions and retries failed provider cancellation synchronization. Risk events create owner financial-review tasks, never automatic inventory forfeiture. Older unknown objects without a persisted session/customer mapping require manual reconciliation; no metadata-only payment shortcut is accepted.

Annual paid renewal appends an invoice-keyed service-year cycle without deleting previous cycles, inventory selections, pending visits or cancellation. Enrollment's initial-empty delivery is not duplicated every renewal. Monthly invoices never reset allowances; the reset anchor/continuous-payment qualification remain unresolved. `past_due` flags operator review, not abandonment or disposal.

## Billing portal and cancellation

The setup script creates/reuses a dedicated portal configuration: payment-method updates and invoice history enabled; subscription updates, prorations/plan changes and portal cancellation disabled. The server rechecks those restrictions before issuing a customer-owned session. Customers may own multiple subscriptions; ensure Dashboard's one-subscription-only Checkout restriction/login redirect is disabled for this catalog.

Cancellation is initiated through the owned package API. It immediately records stopped operational renewal, a free final-return entitlement and coordination task; then sets Stripe `cancel_at_period_end=true`. This retains the paid month/year with no automatic refund or proration while preventing renewal. The customer can request the free final return immediately, even with ordinary visits exhausted or a temporary Stripe update failure. Billing's end date is separate from belongings-return/tote-reconciliation closure. A failed provider update is visibly pending and retryable, never falsely reported synchronized. Dashboard/provider-initiated cancellation is reconciled by subscription webhooks into the same free-return workflow.

Inventory here is the persisted selected tote mix and operational package/cycle record; actual physical tote inventory/private photos and real appointment confirmation still belong to the external Octagon integration. The final-return sandbox form saves a preferred date/window and reserves its free leg, not a confirmed appointment.

## Notifications and production handoff

Octagon's existing email/planned Twilio adapters own enrollment, receipts, payment failures, 30-day annual reminders, appointment and cancellation coordination. The sandbox writes deduplicated outbox tasks only; no SMS/email sender or scheduler is claimed connected. Configure Stripe receipt/upcoming-renewal emails consistently when connecting Octagon to avoid duplicate customer messages. Preserve separate service/marketing consent and opt-outs from the existing notification contracts. Outbox records contain opaque IDs, not gate codes or contents/facility details.

`PaymentRepository` and `SessionAuthenticator` are typed local adapter boundaries, not invented external Octagon APIs. SQLite is durable test storage with transactional locking, not the production Octagon database/backups. Replace local-token auth, attach real authorization/customer identity, normalize/secure operational persistence, connect private uploads, availability/confirmation, final returns and outbox workers. Run concurrency, backup/restore and security integration tests in the standalone backend. Do not expose the loopback sandbox or deploy its login.

Pending decisions: monthly setup amount/refundability; monthly service-year reset qualification; bulky handling/weight limits; paid add-on cancellation coupling; missed-visit fee; payment grace/service-pause policy; approved legal agreement and notice/disposition process; tax classifications, treatment, origin and registrations. No live-readiness flag is enabled by this implementation.

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. The suite covers all annual plans, partial sequential purchase/resume, independent cancellation, Big bonus and repeated paid add-ons, standalone bulky storage, $50 one-time entitlement deduplication, monthly/eligibility/agreement/tax gates, duplicate/out-of-order/failed/pending events, renewal preservation, cross-customer denial, portal restrictions, cancellation synchronization retry, free return after exhausted visits, SQLite reopening, and raw-body signature tampering.

After credentials and policy approvals are configured, run actual sandbox Checkout/decline/asynchronous scenarios and forward their events. Use [Stripe test clocks](https://docs.stripe.com/billing/testing/test-clocks) for a mapped test customer's subscription renewals/cancellation and replay/reorder event delivery. Test-clock fixtures must preserve the same metadata and server-owned mappings; do not enable live charges or modify live tax settings. Real sandbox test-clock/Tax/hosted-payment tests remain pending; fixtures are not represented as account-level verification.

Official references: [Checkout sessions](https://docs.stripe.com/api/checkout/sessions/create), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [cancellation](https://docs.stripe.com/billing/subscriptions/cancel), [billing portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create), [tax readiness](https://docs.stripe.com/tax/checkout), [API versioning](https://docs.stripe.com/api/versioning), [MCP](https://docs.stripe.com/mcp), [agent plugins](https://docs.stripe.com/agents/plugin).
