# Octagon integration handoff

The standalone backend is being built separately. No HTTP endpoints are assumed. Types/tests here are a policy handoff, not production authentication, signature verification, database persistence or legal agreement acceptance.

The [separate local Stripe sandbox](STRIPE.md) now implements signed raw-body verification with the official SDK, a sequential hosted-purchase coordinator and durable SQLite test storage. Its `/api/sandbox/*` endpoints belong to this repository's local server; they are not claims about an existing external Octagon API. Production Octagon must replace the sandbox authentication/repository adapters and connect fulfillment/notification delivery. `integrationPorts.ts` remains the provider-neutral handoff; `apps/web/server/coordinator.ts` is the concrete sequential Stripe implementation rather than the older one-event/all-packages activation example.

## Operational records

| Record | Required data |
| --- | --- |
| Customer/address | Authenticated customer; exact address; geography decision, reviewer, timestamp, boundary version. ZIPs cannot grant eligibility. |
| Package | Customer/provider IDs; independently priced subscription, cadence, credits, service year, reset qualification, renewal state/date, payment state. Multiple subscriptions per customer. |
| Tote | Package/customer ownership, Large/XL, ID, contents/value acknowledgments, seals, conditions, private photos, empty custody, movement audit. |
| Bulky item | Package or standalone, item type/dimensions/value ≤$200, approved handling, price/quote, single annual Big bonus allocation, standalone collection/return. |
| Cycle/leg | Included, purchased $50 or cancellation cycle; entitlement provenance, return/dropoff and subsequent pickup IDs; requested/confirmed/completed status. |
| Agreement | Approved version, content reference/hash, explicit acceptance, timestamp, authenticated customer. Demo preview acceptance is not legal acceptance. |
| Appointment/handoff | Requested vs confirmed time; availability/blackouts; owner action; agreed unattended location, customer authorization, separate owner agreement; timestamp/photo/notification evidence where connected. |
| Cancellation | Requested, return scheduled, belongings returned, totes reconciled; renewal disabled; immediate free final return; fulfillment audit and any manual tote-return waiver. |
| Payment/order | Reviewed server-calculated order, retry key, provider IDs, event deduplication, invoice state. Never raw card numbers/security codes. |
| Communication | Separate service/marketing consent and opt-outs, timestamp/version, delivery IDs, outbox and retries. |
| Resolution | Nonpayment or potentially unclaimed goods separately from cancellation; operator review, approved notices/version, delivery evidence, legal deadlines and audited resolution. No automatic disposal/sale/transfer. |

Legacy `profile.planId`/`planCreditAllowance` remain for migration/aggregate display; `packages[]` governs each entitlement. Never import fictional profiles, consent, preview acceptance or payment state into real accounts.

## Server-side command requirements

Derive the actor from authentication, not browser customer IDs. Enforce ownership on every record read/write, private upload/download and hosted billing session. Only the owner approves geography/handling, confirms/completes visits, records seals/photos, waives tote returns, progresses fulfillment and issues notices. Demo owner-simulation controls cannot be exposed as customer production commands.

Recalculate prices, package-specific credits, annual bonus, service entitlements, notice/blackouts and agreement version on the server. Use transactions to prevent concurrent over-allocation or reusing visits. A partial return consumes a package’s whole return. Each extra $50 cycle holds both packed return and subsequent collection. Empty handling belongs to the included cycle.

Cancellation is idempotent: stop future provider renewals, create the free final-return entitlement and immediate coordination task, retain committed charges/history, then track fulfillment independently of paid-term end. Reconcile partial provider/Octagon failures with retries. A browser toggle does not stop provider billing. Existing appointment conflicts require owner coordination, never loss of the cancellation return.

Monthly invoices update payment state only. Do not reset visits on each payment or assume the enrollment anniversary. Keep reset qualification in review until the owner confirms the exact anchor and continuous-payment rule.

## Payments and communication ports

`HostedPaymentPort` / `PaymentBackendPort` define contracts. Stripe Checkout/Billing is proposed, not connected; there is no SDK or secret in the static bundle. Disabled adapters throw. Browser redirects never mark orders paid.

Implement raw-body signature verification on the backend, normalize verified events, then use `processPaymentWebhook` for reviewed-order/customer/currency/amount/subscription matching and replay-safe activation. Production must supply durable transactions, locking/isolation, unique provider-event/order/subscription constraints, atomic event insertion and entitlement creation, plus retries/reconciliation. Tests use an in-memory adapter and do not verify real Stripe signatures or DB races. Invoice/renewal events need separate provider mappings and must not reactivate enrollment or replenish visits. Support multiple subscriptions per customer. Use hosted billing management for card updates.

Implement `NotificationPort` with the existing servlet/Octagon email integration and a Twilio adapter. `maySendSms` distinguishes service/marketing consent and opt-outs. Persist consent and delivery audit; recheck consent at send time; process provider opt-outs. Use an outbox for enrollment, payment receipts/failures/reminders, appointment requests/confirmation/changes, handoff receipts, 30-day annual renewal reminders, cancellation and final-return coordination. Do not put gate codes, private facility addresses or unnecessary inventory details in notifications.

## Activation gates and remaining verification

Keep real payment/enrollment disabled until eligibility review, approved agreement acceptance, hosted checkout, authenticated durable persistence/backups and scheduling/notifications work centrally. Monthly also needs setup/refundability decisions. Standard bulky items need handling approval; nonstandard ones need a custom quote. Failed-visit fee, payment grace and legal notices/templates remain pending decisions/review.

Before activation test deployed customer/owner authorization, private upload access, real signed webhooks, concurrent retries, backup restoration, actual SMS/email delivery/opt-outs, renewal scheduling and end-to-end provider cancellation. Current unit tests cover policy and test-adapter behavior, not those production controls.
