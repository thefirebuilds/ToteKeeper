# ToteKeeper sandbox catalog

Created and read back through the Stripe API on October 20, 2026 in **ToteKeeper sandbox**, account `acct_1URv4FRZzc1Yv7ae`. All ten prices are active USD test-mode prices. No customer, charge, invoice, payment link or subscription was created.

The six recurring prices, three one-time setup prices and one $50 round-trip price are mapped in `infrastructure/server/enrollment-catalog.sandbox.json`. The prices use tax-exclusive amounts, matching the agreement's disclosure that applicable taxes are additional. No tax category, registration or exemption was inferred.

The sandbox mapping uses `tax_mode: none` solely to test without calculating tax; this is not a live tax-exemption decision. The existing backend requires a numeric total-enrollment limit, so the sandbox uses its maximum supported integer, 2147483647, to avoid imposing a practical signup limit. This field is unrelated to tote size or the Small/Medium/Large 2/4/10 storage-credit allowances. Price IDs are configuration identifiers, not API credentials. Use only with this sandbox's API key; live mode or another sandbox needs its own IDs.

Sandbox activation is performed on the dedicated server using this mapping. The sandbox-only billing portal configuration is `bpc_1USj1PRZzc1Yv7aeIUPn4DjB`; invoices and payment-method updates are enabled, while subscription cancellation stays in the application’s existing cancellation flow. Follow `docs/ENROLLMENT_BILLING.md` to validate/publish reviewed mappings and enable the existing server setting when ready. Existing prices and subscriptions were not changed.

Activated on the dedicated server on October 20, 2026 using deployed release `959c4d6`. Six offers and agreement/packing version 2026-10-19.3 are active; enrollment is enabled with the existing sandbox credentials. Startup configuration checks, public HTTPS signup/health, a rollback-only enrollment form probe and actual unpaid Stripe Checkout creation/expiration passed. No payment was completed. For Small monthly, the verified initial amount was $39.95 ($14.95 subscription plus $25 setup); tax simulation is disabled.
