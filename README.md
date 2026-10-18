# My Tote Keeper

React/TypeScript/Vite storefront and **fictional** Octagon customer-experience preview. Octagon is a standalone backend under development. This repository has no production authentication, database, uploads, payment processing, messaging delivery, or appointment confirmation endpoint. It is not ready to accept real online enrollments.

A separate, opt-in **local Stripe sandbox integration** now preserves the existing enrollment/cart and uses hosted Checkout, recurring Billing, a restricted customer portal, signed webhooks and durable SQLite test records. It rejects live keys and does not deploy with the static storefront. Setup, object mapping, tests and production blockers: [Stripe sandbox guide](docs/STRIPE.md).

## Development

Use Node.js 20.19+ or 22.12+ and npm. Run `npm install`, then `npm run dev`. Checks: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`. Production preview: `npm run preview`. Build output: `dist/`.

The optional sandbox server requires **Node 22.13+ or Node 24** for built-in SQLite. `npm run sandbox:server` starts it on loopback; `npm run stripe:catalog` explicitly syncs versioned test Prices, and `npm run stripe:portal` configures restricted hosted billing. All require local environment setup; none runs automatically during build/deploy.

## Implemented

- Existing blue Large/XL images, responsive illustration layouts, blue branding and warm backgrounds are preserved.
- Owner Blake Thompson: `blake@totekeeper.com`, `262-880-4570`. Only Blake handles/accesses belongings. No owner photo or facility address is published.
- Buda, Kyle, South Austin; exact-address review before payment. No fabricated ZIP approvals. Storage target 55–80°F, dry shelves, facility-provided pest control, existing packing restrictions.
- Annual Small $125/2 credits, Medium $299/4, Big $599/10. Actual monthly rates $15/$50/$100 are distinguished from annual monthly equivalents. Monthly enrollment remains disabled pending the setup charge/refundability decision.
- `/enroll`: independent packages and tote mixes; standard bulky items at $75/year with tote appointments or $125/year standalone; single annual Big bonus; custom items unpriced and in review. Recurring-price summary, separate fictional SMS consents, versioned policy preview and idempotent demo enrollment. No real checkout or approved legal agreement acceptance.
- `/portal`: fictional inventory, IDs/seals/history, packing acknowledgments, package-scoped requests, empty handling, two-leg $50 extra cycles, concern previews, persistence/reset.
- `/portal/plan`: independent package allowances/service years, renewal state, bonus and bulky records, cancellation stages, free final return and fictional audit. Operator completion/progression controls are labeled simulations. Current committed charges are retained; no cancellation penalty or lost-tote fee is invented.
- Monthly invoices never replenish visits; reset anchor/continuous-payment qualification remain unset. The March enrollment/April return/following-April earliest allowance example remains in policy copy.
- Tests cover mixed allocation, independent entitlements, partial returns, monthly invariants, extra-cycle legs, bonus limits, cancellation, ownership guards, payment orchestration with test adapters, migration/persistence/reset, scheduling and consent.

## Architecture and data

`src/config/business.ts`: products, prices, contact, confirmed policies, unresolved settings, windows/blackouts, disconnected integration flags. `src/config/policyCopy.ts`: FAQs/order policy copy. `src/domain/operations.ts`: operational rules. `src/services/integrationPorts.ts`: backend contracts, not invented Octagon endpoints. See [Octagon integration handoff](docs/OCTAGON.md).

`src/services/demoService.ts` stores **fictional data only** in `my-tote-keeper-demo-v2` browser storage. v1/v2 data migrate without losing tote IDs/descriptions/seals/history. Legacy assignments attach to their existing package; excess capacity is flagged rather than silently pooled. Reset clears both storage versions. Never enter real customer information, passwords, tokens, card details or access codes. Browser storage is not an Octagon backend.

`DEMO_PORTAL_ENABLED` controls portal visibility and fictional enrollment saving. Checkout/payment-method management always stay unavailable until connected. Requests do not confirm real appointments; cancellation does not modify real provider subscriptions. Contact Blake directly for real concerns; concern previews send/save nothing.

## Unresolved business decisions

- Monthly setup amount/refundability and monthly allowance reset anchor/continuous-payment qualification. Do not invent an enrollment-anniversary reset.
- Customer handling/weight limits and conflicting manufacturer stack/load verification (500 lb vs 100 lb). Neither supplier claim is a packing limit. The former 50 lb bulky limit also needs owner confirmation; no active numerical limit is published. Cross-size stacking is unverified.
- Further failed-visit charge (disclose before booking), failed-payment grace, final agreement/valuation/unattended-handoff theft-risk terms.
- Texas notice/warehouse/lien/disposition procedures, legal deadlines and notice templates require legal review. Cancellation, nonpayment and unclaimed goods remain distinct. No automatic disposal, sale or transfer is implemented.

## Production blockers

Connect standalone Octagon authentication/authorization, transactional central persistence/backups, ownership-protected private uploads, owner scheduling/fulfillment, geographic and handling reviews. Connect hosted recurring payments and signed/idempotent webhooks, billing management, consent-aware Twilio and servlet/email delivery. Finalize/version the real agreement and outstanding policies. Add reliable notification and renewal jobs. Unit tests do not establish production readiness.

## IONOS deployment

`.github/workflows/deploy-ionos.yml` builds on pushes to `main` or manual dispatch and uploads only `dist/` via SFTP. Configure Actions secrets `SFTP_HOST`, `SFTP_USERNAME`, `SFTP_PASSWORD`, optionally `SFTP_REMOTE_DIR` (default `.`). This dedicated login opens in the website directory. The mirror uses `--delete`; never share that login with unrelated files. `public/.htaccess` provides SPA route fallback. Deployment neither deploys Octagon nor activates integrations.
