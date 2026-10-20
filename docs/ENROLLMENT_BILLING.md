# Enrollment billing and acceptance

The real customer flow is the Django portal: sign up/sign in, complete Profile, then visit `/enroll/`. The public website inquiry form remains available without contract acceptance. The fictional web demo and optional Node Stripe sandbox are separate and do not open production enrollment.

## Approved new catalog

| Package | Storage credits | Monthly | One-time monthly setup | Annual |
| --- | ---: | ---: | ---: | ---: |
| Small | 2 | $14.95 | $25 | $125 |
| Medium | 4 | $29.95 | $50 | $225 |
| Large | 10 | $39.95 | $75 | $399 |

Setup appears only on the first monthly subscription invoice. Annual setup is waived. This uses a nonrecurring Stripe Price alongside the recurring Price in subscription Checkout, as supported by [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create). Amount, currency, active status and billing interval are validated server-side before checkout. No browser-supplied amount is trusted. Existing subscriptions, accepted commercial snapshots and old Stripe prices are not repriced.

The portal displays base first-payment, setup and renewal amounts before acceptance. Checkout discloses applicable taxes before payment; neither page claims the base amount is tax-inclusive. The order records a planned start date, with actual paid service start confirmed after verified payment. Failed/abandoned checkout does not activate storage. Existing duplicate-checkout prevention, signed-webhook verification, ownership checks and account locks remain in place.

## Acceptance records

Four separate required controls start unchecked: agreement and identified packing policy; liability; recurring charges; dispute terms. Server services require four explicit booleans, not just browser validation. Before payment the full agreement, packing policy, cancellation terms, liability and arbitration disclosures are available for printing. Accepted records retain actor, timestamp, policy versions and exact text, four acknowledgment texts, plan, price, setup, term, service address, planned start date and cancellation method. Updating an address requires reviewing the updated order before checkout.

Billing provides a private plain-text download of each retained agreement/order. Another customer's record returns 404. Acceptance queues a receipt; verified initial invoice payment queues a distinct written order confirmation. Existing accepted documents are not replaced retroactively. CI checks that public and retained agreement/packing text match. Privacy remains a separate draft and is not accepted as a storage contract.

## Prepare and open enrollment after deploying the code

1. In the correct Stripe sandbox/account, create six recurring USD prices matching the table, three nonrecurring setup prices, and one nonrecurring $50 round-trip price. Do not edit or delete prices used by existing customers. For live enrollment use the appropriate live account and webhook signing secret; sandbox keys remain for sandbox testing.
2. Copy `infrastructure/server/enrollment-catalog.example.json` to a reviewed local/server catalog file. Replace every placeholder with the actual Price ID; set each offering's enrollment capacity and explicitly reviewed `none` or `automatic` tax treatment. The example deliberately fails until reviewed. Automatic tax also requires the Stripe account's origin, registrations and price tax configuration to be correct. No tax classification is inferred by this migration.
3. From `apps/api`, validate without writes, then publish only after validation succeeds:

   ```sh
   python manage.py migrate --noinput
   python manage.py configure_storage_enrollment --catalog /path/to/reviewed-catalog.json
   python manage.py configure_storage_enrollment --catalog /path/to/reviewed-catalog.json --publish
   ```

   In Docker, copy the reviewed mapping into the app container or mount it read-only, then run the same commands with `docker compose exec -T app`. No secrets belong in the catalog. The command reads Stripe prices but never creates or modifies provider objects. Publishing is atomic: it publishes agreement/packing version 2026-10-19.3 and six new offerings, closes other offers to new enrollment and leaves existing contracts intact. Reruns preserve accepted terms and reject a conflicting document/price version.

4. Set `STORAGE_AGREEMENT_FINALIZED=true` in the server's shared environment and recreate app/worker containers to load it. This is the existing enrollment activation switch; it does not bypass ZIP, capacity, price validation, email verification or payment checks. Keep it false while configuring/testing. Confirm the supplied notice address and `blake@mytotekeeper.com` mailbox are usable, required business settings are configured, and eligible ZIPs plus future service windows are active.
5. Run `python manage.py check_launch`. Then verify sign-up/email, all four initially unchecked controls, correct initial/renewal totals, hosted payment, signed webhooks, durable receipt download and worker email delivery in the sandbox. Monitor the outbox for failures. These external checks were not performed during local implementation.

## Service-year and owner workflows

New agreements use separate packed-collection/packed-return ledger grants, once per continuous 12-month service year. Monthly invoices do not replenish them. Future years are not usable early; unused included visits do not carry over. An additional paid $50 return-and-recollection funds both directional legs at the approved address. A partial return consumes the return visit. Legacy contracts continue to use their original credit rules.

Empty-tote delivery, collection and redelivery are owner-coordinated through Help, not extra paid packed visits. Record completed handoffs with:

```sh
python manage.py record_package_handling --account ACCOUNT_ID --actor ADMIN_USERNAME --kind initial-empty-delivery --reason 'Handoff reference and tote/tag identifiers'
```

Other kinds are `empty-collection`, `empty-redelivery`, and `final-empty-collection`. The command requires an active administrator, audits the handoff and prevents repeating the initial delivery. It never charges a fee. Setup-fee refund eligibility depends on whether initial empty delivery actually occurred: review physical evidence if a handoff record is missing. Pre-delivery cancellation queues a support task to refund the paid setup fee and applicable tax using Stripe's operator tools; resolving a ticket is not itself a refund. No setup refund is claimed to be automatic.

Cancellation stops future renewal through Stripe and queues written request/confirmation notices. Customers may retain storage through the paid term or complete a free final return earlier, independently of their ordinary return allowance. The free final return includes all remaining stored belongings, can occur through 30 days after the last verified paid period, and ends active storage. It does not silently restart billing or permit new collections after the paid term. A final empty-tote collection is owner-coordinated and included.

If operator availability/delay prevents a timely requested final return, retain the customer's timely support request and record a no-charge extension:

```sh
python manage.py extend_final_return --account ACCOUNT_ID --actor ADMIN_USERNAME --request SUPPORT_REQUEST_ID --until '2026-12-01T19:00:00-06:00' --reason 'Operator delay and replacement appointment reference'
```

This extends only return scheduling, not the paid period or renewal. Verify customer-caused failed visits, the one courtesy revisit, approved extra bookings, business-termination daily prorated refunds and legal exceptions manually under the agreement; no blanket automated fee or disposal rule was added. Separately quoted bulky services and additional independent packages are not new self-service purchase flows in this change.

The existing worker queues annual renewal reminders 31 days before renewal and retries email through the existing outbox. Inspect unsent jobs well before the agreement's 30-day notice requirement; a queued job is not proof of delivery. New prices require a new offering version and the agreement's advance notice; no automatic repricing was added.

## Local verification

```sh
# From apps/api, with a disposable/test database and development settings
python manage.py test --noinput
python manage.py makemigrations --check --dry-run
# From repository root
python scripts/check_agreement_documents.py
# From apps/web
npm run build
npm run lint
npm test
npm run test:browser
```

Stripe calls in the automated billing tests are mocked. Local checks do not verify production deployment, external email, live billing, taxes, or real webhook delivery. PostgreSQL-specific concurrency coverage runs in CI; the local SQLite run skips that check.
