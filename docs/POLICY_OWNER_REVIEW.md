> Update October 19, 2026: the owner supplied agreement 2026-10-19.3, now rendered on the site. See [agreement implementation status](AGREEMENT_2026-10-19.3.md). Earlier unresolved-decision notes below are historical where superseded by that agreement; operational mismatches still require implementation before enrollment.

# Internal: policy owner and Texas attorney review

Status: **DRAFT / NOT APPROVED / DO NOT DEPLOY OR ENABLE ACCEPTANCE**.
Prepared October 18, 2026. This is an issue list, not a legal opinion or assurance
that any proposed term is enforceable. No outside counsel approval is recorded.

## Sources of the customer documents

The maintainable public text is in
[documents.ts](../apps/web/src/features/policies/documents.ts), version
`draft-2026-10-19-v3`, rendered at:

- `/policies/storage-agreement`
- `/policies/packing`
- `/policies/privacy`

Prices and package quantities are drawn from `src/config/commercial.ts`, rather
than copied to a separate legal price schedule. Footer links and an inquiry privacy
link are informational; they do not collect acceptance. These pages do not populate
or activate a Django Policy, modify prior acceptance snapshots, or approve the
optional sandbox agreement. `STORAGE_AGREEMENT_FINALIZED` remains false by default.

## P0: decisions that block an operative agreement

- [ ] **Contracting identity:** owner confirms My Tote Keeper is a sole-proprietor,
  owner-operated business run by Blake Thompson. Verify the exact contracting name,
  trade-name registration where needed and notices/mailing address. Do not invent
  an LLC, registered address or change the published business identity.
- [ ] **Responsibility and valuation:** choose whether compensation requires legal
  responsibility or extends more broadly to accidental loss in custody. Define
  actual compensable loss and a supportable evidence/valuation method. Do not infer
  replacement cost, depreciation, deductible or a payment for every cause.
- [ ] **Liability:** have counsel review the proposed actual-loss limit up to $250
  per physical tote, required exceptions, conspicuous disclosure, separate
  acknowledgment, and a recorded request process for increased liability where
  required. Decide whether an increased-liability arrangement can actually be
  offered, documented, priced and supported. No aggregate cap is approved.
- [ ] **Bulky items:** approve a separate liability limit, numerical weight/handling
  rules and paid add-on coupling. The tote number is not a substitute. Until then,
  do not accept binding bulky storage orders based on a standard tote agreement.
- [ ] **Visit entitlement model:** choose published package cycles or the current
  Django per-visit credit model; implement the chosen model consistently before
  selling it. Preserve accepted contracts rather than repricing them silently.
- [ ] **Cancellation vs nonrenewal:** decide whether customers can stop renewal and
  keep storage through the paid term, or request earlier termination and immediate
  final-return coordination. Define which action triggers one free final return,
  delivery scheduling and empty-tote return. Resolve the mismatch below.
- [ ] **Custody:** define exactly when possession/risk changes at attended pickup,
  transit, storage and return, including authorized recipients and failed handoffs.
  No unattended handoff is authorized by these drafts. Approve a documented process
  before enabling unattended collection/delivery; request submission is not consent.
- [ ] **Operator absence/closure:** identify authorized backup/custodian, facility
  access permissions, customer communications, return process and financial treatment
  for illness, disruption or closure. Trusted individuals and family can provide
  authorized backup when needed; specific permissions, access and communication
  procedures still need documentation. If the business closes, belongings are
  returned. No new return deadline, legal recovery right or guarantee is approved.

## P1: operational and publication decisions

### Planned absence, authorized backup and closure procedures

Owner-confirmed facts: this is a sole-proprietor business; requested pickup/delivery
needs at least 72 hours' notice and confirmation. Evening/weekend availability is
subject to scheduling. Planned absences are communicated to affected customers.
Trusted individuals and family can provide authorized backup when needed. If the
business closes, customer belongings are returned. These facts do not establish
round-the-clock staffing, a fixed return deadline or a legal recovery guarantee.

1. Before an absence, review confirmed deliveries and affected customers. Use the
   existing ServiceWindow `blackout` control in administration for unavailable
   windows, and do not offer new windows during the absence. Blackout blocks new
   requests/reschedules; it does not cancel existing appointments or send messages.
2. Blake contacts affected customers using the existing business email/phone
   channels, agrees revised arrangements and records the communication. A revised
   requested time still needs confirmation. No absence-triggered notifications or
   response-time promise were added.
3. The existing NotificationJob outbox and `send_notifications` worker can deliver
   queued account messages. Recipient selection and queuing are not automatic;
   NotificationJob administration is read-only. Any technical queuing must be an
   authorized, reviewed operation. Check delivery outcomes and follow up directly.
4. Document the specific backup people, agreed tasks, facility/key access and
   customer communication. Keep private access details out of public documents.
   Use individual existing staff roles, assignments, verified email, MFA and audit
   controls for account access. Never share the owner login or grant automatic
   permissions based on a family relationship. This update changes no roles.
5. Brief authorized help on attended outdoor handoffs, customer privacy and custody
   records. Record who performed service and the applicable inventory/condition
   information through the existing workflow.
6. For closure, inventory belongings, contact affected customers, coordinate returns
   and reconcile company totes. Assign access/communication responsibilities, and
   resolve financial treatment and required notices with counsel. No new lien,
   disposal right, deadline, staffing commitment or recovery protection is invented.

### Remaining operational and publication decisions

- [ ] Verify a single packed-tote weight rule, practical measurement and repacking
  procedure. Do not conflate approximate capacity with an approved handling limit.
- [ ] Verify storage permissions, environmental target, pest-control arrangements,
  operator access and transport procedures. No temperature/security/pest guarantee.
- [ ] Adopt a practical claims workflow: intake/contact, identifiers, customer
  evidence, investigation owner, responses and escalation. Counsel must approve any
  time limits; none has been introduced in these drafts.
- [ ] Resolve tax treatment, exact payable totals, hosted price IDs, renewal prices,
  annual reminder execution and understandable consent/cancellation controls.
- [ ] Keep monthly billing unavailable until setup amount/refundability, entitlement
  reset and qualification rules are resolved. No invented deposit or fee.
- [ ] Decide appointment cutoff rules, waiting, rescheduling and failed visits.
  Publish a specific approved amount before any new charge; vague fee language is
  not approval. The courtesy-reschedule promise needs an operational process.
- [ ] Establish retention and deletion rules for inquiries, mailbox copies, account
  records, photos, accepted contracts, security/audit records and backups. Verify
  data-request identity checks, responses, appeals if applicable and incident plan.
- [ ] Confirm live hosting/email/payment providers and processing locations,
  operator mailbox access and provider agreements. Confirm analytics/marketing/SMS
  status. Google Fonts currently creates third-party network requests.
- [ ] Confirm notices, electronic delivery, version-change process, dispute handling
  and any governing-law/forum language through counsel; none is selected by draft.

## Implementation conflicts and evidence

| Topic | Published/configured intent | Actual implementation / action needed |
| --- | --- | --- |
| Annual packages | Small $125/2 credits; Medium $225/4; Big $399/10; Large 1, XL 2 | `commercial.ts` is marketing authority. Django Offering and Stripe catalog/snapshots are separately configured. Check provider totals and preserve existing accepted terms. |
| Included visits | One package cycle: initial empty delivery, packed collection and return, empty collection/redelivery | `domain/operations.ts` models package legs. `portal/operations.py` reserves offering-defined credits per visit; Django forms say delivery credits. Reconcile units and service-year reset semantics. |
| Extras | $50 for a packed return-and-recollection round trip, both legs | Frontend/sandbox supports extra cycles. Django has configurable `extra_delivery_cents` and provider extra-visit prices. Do not quietly reinterpret $50 as per-leg pricing. |
| Cancellation | Marketing/demo starts free final-return coordination immediately; no committed-term refund | `portal/billing.py:cancel_subscription` sets provider cancellation at period end; Django billing page directs separate return arrangements. The immediate free-return path is not equivalent. |
| Refunds | Published committed term remains paid | Review statutory remedies and inability to provide service; no blanket waiver of required refunds. Distinguish cancellation, nonrenewal and payment reversal. |
| Weight | Homepage publishes 50 lb/tote from `maxPackedToteWeightPounds` | `OPERATIONAL_PRACTICES.toteHandlingAndWeightLimits` is planned; bulky weight values are null. Backend inventory does not enforce a weight field. Owner must approve the authoritative rule. |
| Unattended | Marketing requires agreed location and authorization | Generic request/address instructions do not establish a full approved unattended custody policy. No new authorization is conferred by these documents. |
| Renewal | Annual reminder 30 days ahead; automatic renewal | Demo/sandbox and Django jobs differ. Verify production scheduling, channel, retry and customer evidence; draft cannot certify delivery. |
| Account photos | Octagon validates/re-encodes private images, strips metadata, supports image-content deletion | Frontend fictional demo upload is only planned. Do not describe all accounts as having a live upload feature or total erasure capability. |
| Privacy/data | Inquiry receipts persist and mail to operator; account and audit data persist | No approved retention schedule or full account/inquiry erasure service. Source has Google Fonts, no found analytics pixel; verify deployment before an effective notice. |

Source review included `portal/forms.py`, `portal/models.py`, `portal/operations.py`,
`portal/billing.py`, `portal/photos.py`, `portal/audit.py`, `portal/inquiries.py`,
`config/settings.py`, `config/gmail.py`, frontend demo/sandbox services, CSS font
imports and server hosting configuration. No real environment values were copied.
This review did not verify live data processing, delivery of messages, facility
conditions, corporate identity or external integrations.

## Texas legal-review questions and official research

Sources consulted October 18, 2026. These are issue-spotting inferences, not a
determination of legal classification or a complete survey. Public drafts contain
no legal research citations; citations and analysis are kept here.

### Storage classification, care and liability

[Texas Business & Commerce Code Chapter 7, §§7.102, 7.202, 7.204 and 7.403](https://tcss.legis.texas.gov/resources/BC/htm/BC.7.htm)
addresses storing goods for hire, receipts, care and delivery. If applicable,
§7.204 ties the default care standard to reasonable care; a contractual amount
limitation does not protect conversion to the warehouse's own use. It also addresses
recorded requests to increase liability and reasonable claims provisions. Counsel
must assess applicability, required exceptions, increased-liability implementation,
conspicuous disclosure and whether the proposed per-tote amount can be used during
both storage and transit. Review receipt content, including location disclosure,
against the business's desire to keep the facility private. Do not simply import
warehouse lien or disposal powers into this agreement.

[Texas Property Code Chapter 59, §59.001](https://tcss.legis.texas.gov/resources/PR/htm/PR.59.htm)
defines self-service storage around tenant-controlled storage space. The operator
custody/valet model may differ; that is a classification question for counsel, not
permission to use self-storage forms, liens or abandoned-goods procedures.

### Pickup, delivery and transportation

[TxDMV intrastate operating-authority guidance](https://www.txdmv.gov/motor-carriers/how-to-be-a-motor-carrier)
and [household-goods consumer guidance](https://www.txdmv.gov/motorists/consumer-protection/dont-make-a-move)
describe mover authority, insurance and customer documentation requirements. Ask
whether paid pickup/delivery of household belongings, including bundled storage,
triggers household-goods carrier registration, vehicle/insurance rules, tariffs,
transport documents or distinct valuation/claims protections. No home entry and a
local service boundary do not, by themselves, answer that question. Confirm the
actual vehicle, routes and business model with counsel/TxDMV before adoption.

### Renewal, cancellation and electronic assent

[15 USC §8403 (ROSCA)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section8403&num=0&edition=prelim)
addresses material-term disclosure, express informed consent and stopping recurring
charges in internet negative-option transactions. Counsel should assess coverage
and review the actual enrollment and nonrenewal controls, not just draft prose.
The proposed 30-day annual reminder is a business policy here, not a claimed
universal statutory safe harbor. Research did not establish a complete current Texas
renewal/cancellation rule set; counsel must check enacted current law and applicable
consumer-protection rules. Search results containing introduced Texas renewal bills
were not treated as enacted law. No reliance on a blanket federal click-to-cancel
rule is made here.

[Texas Business & Commerce Code Chapter 322, §§322.005, 322.007, 322.008 and 322.012](https://tcss.legis.texas.gov/resources/BC/htm/BC.322.htm)
addresses agreement to transact electronically, electronic records/signatures,
retainable presentation and record retention. Review assent, attribution, accessible
print/save copies, exact-text snapshots and notice delivery; electronic format alone
does not establish that an unfinished or substantively defective agreement is valid.
Ask counsel whether federal consumer electronic-disclosure requirements also apply.

### Privacy and incident response

[Texas Business & Commerce Code Chapter 541, including §§541.002, 541.051–.055 and 541.102](https://tcss.legis.texas.gov/resources/BC/htm/BC.541.htm)
provides applicability, consumer-rights and notice provisions. Counsel should assess
scope/exemptions and the needed request, appeal, processor and consent mechanisms.
[Texas Attorney General guidance](https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act)
describes the general small-business exemption and sensitive-data sale restriction;
do not infer exemption solely from being an MVP. No sale or ad-targeting mechanism
was found in the reviewed source, but the actual operations/providers require review.

[Texas Business & Commerce Code Chapter 521](https://tcss.legis.texas.gov/resources/BC/htm/BC.521.htm)
and [Attorney General incident guidance](https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/identity-theft-enforcement-and-protection-act)
raise separate protection and breach-notice questions. Have counsel determine the
applicable incident process and notices; a Chapter 541 exemption is not assumed to
eliminate other obligations. Do not publish invented retention or deletion promises.

## Release gates before operative terms

1. Complete P0/P1 decisions, verify legal identity and live processing, and obtain
   documented owner and Texas attorney review of final text and customer screens.
2. Reconcile the chosen pricing, visit, cancellation, weight and bulky rules with
   Django, provider configuration and all marketing copy. Implement missing workflows
   and test them without importing fictional fixtures as real entitlements.
3. Preserve this draft in version history; issue a separately versioned final
   agreement and effective date. Keep exact text of every accepted older version.
   The current review draft derives offer values from configuration; freeze an
   immutable text snapshot for each operative version rather than rendering changing
   configuration into an already approved agreement under the same version number.
   Update public status, publish the matching backend Policy, and verify no unresolved
   placeholders remain. Do not activate a draft by flipping a flag alone.
4. Keep inquiry independent of agreement acceptance. Before actual payment, show all
   material costs/restrictions, the approved agreement and a separate unchecked
   liability acknowledgment. Verify authenticated server-side version, exact text and
   timestamp evidence and a retainable customer copy. Existing backend acceptance
   snapshots are not a license to change accepted contracts retroactively.
5. Only after those gates, explicitly approve enabling enrollment/payment configuration
   in a separate release. This task does not deploy, enable payments, publish an active
   database policy, add a final effective date, or bind any customer.

## Local verification

Owner-operated workflow update (October 18, 2026): build/typecheck, lint, 57 web
unit tests and all 20 desktop/mobile browser cases passed. Django ran 84 tests with
one PostgreSQL-only concurrency test skipped on SQLite; migration drift check
passed. Active scheduling/handling copy was searched for contradictions, and the
mobile homepage visual was inspected. Inquiry confirmation is shown only after a
successful validated backend receipt; it states that appointments need confirmation
and that submission creates no payment, subscription or appointment.

Migration `0006_minimum_72_hour_booking_notice` changes the default for new windows
only. Runtime booking/rescheduling and window selection enforce the greater of
72 hours and the configured lead time, including older shorter windows. Legacy
date-only requests use a conservative local-midnight cutoff; exact appointment
slots use their timestamp. Existing confirmed appointments and historical window/
acceptance records are not rewritten. Tests cover shorter historical lead values,
the exact 72-hour boundary, blackout/reschedule refusal and legacy request notice.
No deployment, live notification or production migration was performed.

- Web production build/typecheck and lint passed; 54 web/sandbox unit tests passed.
- All 14 desktop/mobile browser cases passed across the full run and focused rerun.
  Two initial failures were an incorrect test substring for cancellation wording;
  the corrected assertions passed on both viewports. Browser checks cover footer
  navigation, all three pages, draft status, section anchors, heading focus, mobile
  overflow, current prices/service disclosures, and no policy acceptance controls.
- Mobile policy rendering was visually inspected. The document retains readable
  typography, conspicuous draft notice and existing cream/blue design.
- Three existing Django regression tests passed: separate unchecked acknowledgment,
  draft agreement enrollment/checkout blocking, and preservation of legacy accepted
  text when pending customers acknowledge new disclosures.
- Searched liability/value, renewal/cancellation, visits and weight wording; material
  conflicts are listed above rather than silently resolved. `git diff --check` passed.
- No deployment, live email, payment, account modification, or external integration
  test was performed. Existing unrelated working changes were preserved.

## Geography decision resolved October 19, 2026

The owner approved entire ZIPs with any overlap with Hays north of the Blanco or
Travis south of the Colorado. Geographic eligibility no longer requires manual
exact-address approval. See SERVICE_AREA_ZIPS.md for the 46-code initial dataset,
small-overlap caveats, admin controls and source research. Existing contradictory
manual geography statements in earlier review notes are superseded by this decision.
Capacity, scheduling, draft agreement, visit-model and cancellation decisions remain
separate; no payment or binding acceptance was enabled.
