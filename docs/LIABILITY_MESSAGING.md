# Proposed tote liability messaging

The proposed contractual limit is actual compensable loss, up to $250 per physical
tote (Large or XL), subject to the storage agreement and applicable law. It is not
a maximum accepted contents value, insurance, comprehensive protection, or an automatic
$250 payment. Ordinary permitted belongings may exceed $250; value above the limit is
at the customer's risk. Prohibited, hazardous, unusually valuable and irreplaceable
items remain governed by the separate packing restrictions.

The homepage, FAQs, demo inventory forms/service validation, bulky quote validation,
demo fixtures and Django item pages no longer impose the former value ceiling.
Declared values must still be finite and nonnegative. No payment/valuation formula
is computed from them. Inquiry submission requires no liability acknowledgment or
agreement acceptance. The standalone review draft is now at
`/policies/storage-agreement`; marketing disclosures link to that visibly draft page.
It is not an approved operative agreement. Agreement-flow disclosures link to the
actual displayed agreement in those pages. See `POLICY_OWNER_REVIEW.md` for the
policy structure, conflicts and official research.

## Before opening enrollment

- Owner must finalize the actual agreement and publish a new active Policy version
  in Django. Existing draft demo policies remain inactive. Review any database-stored
  policies and externally supplied sandbox agreement document for the obsolete value
  ceiling before publication. Do not edit historical accepted snapshots or silently
  change existing customers' agreed terms.
- Keep `STORAGE_AGREEMENT_FINALIZED=false` (the default) until owner approval and
  publication. The Django enrollment page collects no acceptance while false, and
  server-side new enrollment and subscription checkout are blocked. Existing customer
  operations, inquiries and delivery billing are not gated by this flag.
- Once finalized, enable that flag in the API environment. A separate, required,
  initially unchecked liability acknowledgment appears before acceptance/payment.
  The submitted text is retained with the policy acceptance snapshot; stale pending
  enrollments require the new acknowledgment before subscription checkout. Existing
  accepted records are preserved; reacceptance creates a separate record when needed.
- The optional Stripe sandbox similarly requires a separate acknowledgment, stores
  it with the configured agreement acceptance, and blocks unacknowledged orders. Its
  existing explicit sandbox document approval remains required. No live integration
  or external agreement text was verified by this change.

## Owner decisions still unresolved

1. What business responsibility for loss or damage is required for reimbursement?
   Copy refers to responsibility/compensable loss and the agreement; it does not
   promise payment for every cause or invent exclusions.
2. How is actual contents value/compensable loss calculated and established?
   No replacement-cost, depreciation, deductible or evidence formula was introduced.
3. What liability limit applies to separately registered bulky items? No number has
   been finalized; the tote limit must not automatically be applied to those items.

No aggregate cap, claims deadline, unconditional waiver or insurance guarantee was
added. Customers are asked to consult their homeowners/renters insurer about storage
and transit coverage, without claiming that coverage exists.
