# Plans & details

The homepage keeps annual prices, physical tote options, included packed visits,
associated empty-tote handling, extra-cycle pricing, renewal and cancellation
disclosures. Extended explanations are at `/plans`, with direct plan links
`/plans#small`, `/plans#medium` and `/plans#big`.

## Content and conversion

- Page: `apps/web/src/features/plans/PlansPage.tsx`.
- Pricing/capacity/policy source: `apps/web/src/config/commercial.ts`, unchanged by
  this task. Annual prices remain $125 / $225 / $399 for 2 / 4 / 10 space credits;
  Large uses one and XL uses two. Cards lead with physical tote quantities.
- `planContent.ts` derives full-capacity tote mixes and inquiry links for Help me decide and bulky-item questions. Primary plan CTAs use `customerPortal.ts` to open the real portal with only a recognized annual-plan hint; no personal data is included. Inquiries remain separate from agreement acceptance and payment.
- Anchor navigation focuses the matching heading and reserves space beneath the
  sticky header. Home hash navigation also works when returning from `/plans`.

## Image manifest and replacement

`apps/web/src/features/plans/imageManifest.ts` defines nine stable asset keys,
suggested filenames, aspect ratios, image briefs, visible captions and suggested
finished-image alt text. No new image was generated, downloaded or claimed as real.
The homepage uses the matched space-reclaimed visual in its existing hero slot.
The detail page uses eight supporting placeholders, including matched crowded/
reclaimed garage corners and a safe attic-storage view. The attic caption explicitly
says packed belongings are collected outside; it does not imply indoor retrieval.

`PlanVisual.tsx` renders a semantic figure, visible placeholder description and
caption, without an img element or fake alt text for missing imagery. Its frame
reserves the manifest aspect ratio at every viewport. Installed image failures fall
back to the same placeholder frame. No essential pricing/policy text is in an image.

To replace one placeholder:

1. Produce and review the image against the brief and current configured quantities,
   product dimensions, prohibited contents and service rules. Suggested filenames
   are guidance, not automatically requested URLs.
2. Add the asset under `apps/web/src/assets/images/` and import it in the manifest,
   then set that entry's `src` to the import. Alternatively use a controlled public
   asset URL. Keep the stable key and aspect ratio; the layout needs no rewrite.
3. Replace the *Planned image* caption with an accurate finished-image caption and
   review `alt`. Set `imageDisclosure` to `AI-generated illustration.` or the
   appropriate visible illustrative disclosure when applicable. Retain qualifications
   about fit and handling. Do not present synthetic imagery as an actual customer,
   actual facility, measured packing test or capacity guarantee.
4. Keep verified listed dimensions as the fit reference, and keep pricing/policy
   content in HTML. Rerun build, lint, unit and browser checks after replacement.

## Unresolved owner decisions — no new rules chosen

See `POLICY_OWNER_REVIEW.md` for the full conflicts and legal-review checklist.

- **Visits and service years:** marketing/frontend describe one packed collection
  and return plus associated empty handling; Django offers independently configured
  per-visit credits and extra-visit pricing. The page explains the published offer,
  not a claim that these systems have been reconciled. It does not promise another
  free packed collection after repacking, rollover or simultaneous exchanges.
- **Partial returns:** a partial return consumes the plan's included return. A later
  extra packed return-and-recollection cycle remains $50 covering both legs. Confirm
  the tote/appointment allocation before booking; no new per-tote or per-leg fee.
- **Cancellation:** published immediate free final-return coordination differs from
  Django period-end provider cancellation and separate return arrangements. The
  page retains the published summary and says return timing/final terms need
  confirmation, rather than choosing paid-term retention or a new termination rule.
- **Weight:** the current storefront publishes 50 lb/tote, while operational
  weight/handling approval is unfinished elsewhere. Confirm the authoritative rule;
  no bulky numerical weight was invented.
- **Bulky liability and other terms:** separate bulky liability, claims/value basis,
  missed-visit amount and actual monthly setup/refund rules remain unfinalized. The
  page links the explicitly draft agreement and packing policy; no operative terms
  or payment are enabled by this page.

The seasonal example is illustrative, uses only the already described appointments,
and stops short of inventing an extra packed collection after the included cycle.
The partial-return example does not multiply free returns by physical tote count.

Scheduling now uses at least 72 hours' advance notice for pickup/delivery, with
confirmation required. Minimum notice does not guarantee an appointment or delivery
deadline. Homepage, detail page, inquiry, FAQs and current policy drafts use that
rule. See the owner operating procedures in `POLICY_OWNER_REVIEW.md` for manual
absence communication, authorized backup and return of belongings upon closure.

## Verification

- Production build/typecheck, lint and 57 unit tests passed.
- The full browser run passed the 14 existing cases and the two direct-anchor/
  placeholder cases, and identified a genuine smooth-scroll issue in the new
  homepage-to-plan journey. Anchor navigation now uses immediate positioning.
- All four plan-specific desktop/mobile cases then passed on rerun. Checks cover
  all three Learn more links, safe plan preselection, browser Back, direct anchor
  reloads, visible headings beneath the header, physical-capacity/price consistency,
  Help me decide, captions, reserved placeholder height, no missing-image elements,
  keyboard focus and mobile overflow. An overly strict fixed-pixel test threshold
  was adjusted to check heading visibility within the viewport instead.
- The desktop tote-comparison layout was visually inspected. Missing image assets
  are represented by designed placeholders, not broken image URLs.
- No backend rules, database records, secrets, provider configuration or deployed
  application were changed in this task. Existing unrelated working edits remain.

Geography update, October 19, 2026: whole-ZIP eligibility now replaces manual exact-
address review. See SERVICE_AREA_ZIPS.md; plan capacity and confirmed appointments
remain separate. Primary signup now opens the real customer portal; inquiries remain for questions. Agreement and sandbox activation are documented in ENROLLMENT_BILLING.md and STRIPE_SANDBOX_CATALOG.md.
