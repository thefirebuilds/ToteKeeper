# Owner-supplied storage agreement 2026-10-19.3

The supplied original is retained verbatim in `agreements/storage-agreement-2026-10-19.3.txt`. The website renders the full agreement at `/policies/storage-agreement`, including the supplied effective date, operator/notice details, package table and all 16 sections. No legal enforceability or attorney approval is asserted.

One owner-authorized amendment replaces section 2 exact-address approval with whole-ZIP geographic eligibility. Capacity, safe access and handling requirements remain. The original attachment is retained unchanged for comparison.

The agreement now expressly selects a $250 separate bulky-item liability limit, reasonable repair cost or pre-loss fair market value as appropriate, and reasonable-care responsibility with stated exceptions. Older review notes describing these as undecided are superseded by this document.

## Billing and acceptance implementation

New portal offerings use the approved recurring prices (Small/Medium/Large $14.95/$29.95/$39.95 monthly or $125/$225/$399 annually), with one-time monthly setup of $25/$50/$75. Annual setup is waived. Existing contracts and old Stripe Price IDs are retained. The internal web identifier `big` remains stable; its current displayed plan name is Large.

The portal requires four separate unchecked acknowledgments. It retains the authenticated actor, timestamp, exact agreement and packing versions/text, acknowledgment text, order prices, setup fee, service address, planned start date and cancellation method. The signed-in customer can download those records from Billing; other customers cannot access them. A receipt is queued on acceptance and an order confirmation only after verified initial invoice payment. Provider redirects do not activate service.

New contracts receive separate collection/return allowances per continuous 12-month service year, rather than each monthly invoice. Partial returns consume the visit. A paid $50 extra return funds both return and recollection at the same approved address. A free final return is available after cancellation through 30 days after the last paid storage period, independent of ordinary allowance. No subscription is silently restarted after that grace period. Annual reminders are queued 31 days before renewal through the existing outbox; monitor delivery failures.

Empty-tote handling is coordinated by the owner through Help and recorded using `record_package_handling`. It never creates an extra paid visit. The initial handoff timestamp supports setup-fee refund review. Pre-delivery cancellation creates a support task to review/refund paid setup and applicable tax in Stripe; refunds are not falsely marked complete or silently automated. Voluntary cancellation issues no automatic subscription refund. Business-termination prorated refunds, exceptions, disputed/failed visits and operator-caused return extensions require owner handling under the agreement.

See [enrollment rollout](ENROLLMENT_BILLING.md) for validated catalog publication, activation and operational procedures. STORAGE_AGREEMENT_FINALIZED is still false by default; the website update alone does not open enrollment. No production configuration, payment or customer acceptance was changed locally.
