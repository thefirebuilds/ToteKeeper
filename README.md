# My Tote Keeper

Marketing website and fictional customer-portal frontend for a local storage service. Built with React, TypeScript, Vite, and React Router.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 8 requirement)
- npm

## Setup and local development

```sh
npm install
npm run dev
```

Vite prints the local development URL when ready.

## Checks and production preview

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The production output is written to `dist/`. For a cloud-droplet deployment, serve that directory over HTTPS and configure the web server to fall back to `index.html` for application routes such as `/portal/totes/MTK-1042`. No infrastructure is provisioned by this repository.

### Deploy to IONOS with GitHub Actions

The workflow at `.github/workflows/deploy-ionos.yml` builds the site and uploads only `dist/` to the configured IONOS website document root. It runs on pushes to `main` or manually through GitHub Actions. Add these repository Actions secrets before enabling it:

- `SFTP_HOST`: IONOS SFTP host.
- `SFTP_USERNAME`: IONOS SFTP username.
- `SFTP_PASSWORD`: IONOS SFTP password.
- `SFTP_REMOTE_DIR`: optional path relative to the SFTP login directory. It defaults to `.`, because the new IONOS login opens directly inside the `totekeeper` website directory. Set this secret only if the deploy files should go into a subdirectory of that login's starting directory.

The deployment mirrors the generated site with `--delete` into the SFTP login's starting directory. This is safe only because that login is restricted to the dedicated `totekeeper` website folder; do not reuse the login for unrelated site files. `public/.htaccess` is included in the build to route React Router paths back to `index.html` on IONOS Apache hosting. The workflow does not deploy the repository, source files, or secrets. When you connect a domain later, point its document root to this `totekeeper` folder or update `SFTP_REMOTE_DIR` if IONOS requires a different target path.

## What is implemented

- Responsive public marketing site with process, draft configurable plans, pilot-area messaging, FAQ, and a validated interest-form preview. The form explicitly does not transmit or store submissions.
- A fictional customer portal at `/portal`, with tote records, editing, movement history, request review, request cancellation, plan/profile views, and reset-demo.
- Demo tote/request state may be persisted in browser `localStorage` under `my-tote-keeper-demo-v1`. It contains fictional data only. Do not put real personal data, passwords, or tokens there.
- There is no authentication, backend, billing, email, or live appointment scheduling. Portal route visibility is not authorization. Every future API request and record must be authorized by the backend.

## Source layout

- `src/app/`: application routes and root composition.
- `src/features/marketing/`: public landing page and its sections.
- `src/features/portal/`: customer demo portal and interactions.
- `src/components/`: shared presentation components such as the brand mark.
- `src/assets/images/`: imported, app-owned image assets. Vite fingerprints and copies these into the production build.
- `public/`: files served at stable root URLs, currently the favicon.
- `src/config/`, `src/services/`, and `src/styles/`: business configuration, typed data services, and global/marketing styles.

## Demo mode

`DEMO_PORTAL_ENABLED` in `src/config/business.ts` controls whether the portal route and public portal links are shown. Set it to `false` to disable the demo portal for a production build. Before a real service launch, replace the demo route with a backend-authenticated application, remove mock customer data and mock persistence, and review the public copy, pricing, accepted-items rules, and service-area availability.

## Business settings

Annual plan prices, month-to-month tote rental rates, monthly tote deposit, annual-prepay tote terms, service-area names, included annual visits, and oversized-item quote examples are centralized in `src/config/business.ts`. Month-to-month rental is billed at the displayed monthly rate and requires a deposit per tote. Annual prepayment uses the discounted annual rate and waives the tote deposit. The savings display compares 12 monthly payments against the annual price. Totes remain My Tote Keeper property and are returned when storage ends. Deposit return conditions need to be confirmed before signup. Oversized items require quotes, not fixed-price booking.

The public service-area wording lists Buda, Kyle, San Marcos, Austin, and surrounding areas, but address availability depends on scheduling and must be confirmed. Appointment requests ask for 48 hours' notice and are not confirmed until staff confirmation. Evening and weekend preferences are shown in the demo.

The proposed pilot liability wording is subject to finalized storage-agreement terms: eligible loss or damage for which the service is responsible would be reimbursed based on actual covered loss, up to $200 per tote. This is a contractual liability limit, not insurance. Every tote also has a maximum combined contents value of $200; this is not a per-item allowance and does not make prohibited belongings acceptable. Separately quoted oversized items need their own agreed value and terms. The storage agreement and valuation method require final business and legal review. Cancellation transport and prepaid-fee policies remain unresolved; any additional visit charge must be agreed before scheduling.

The customer demo requires a separate, unchecked per-tote acknowledgment of combined value and packing rules before collection requests can be submitted. These fictional local-demo acknowledgments do not create a storage agreement. Full prohibited-item rules are published in the expandable packing guidelines on the marketing page.

Trust-process card labels and owner/contact placeholders are in `src/config/business.ts`. Update these values when operating practices, owner introduction, and direct contact channel have been verified. Do not remove the planned/unconfirmed labels until the practices are actually in place.

## Trust-practice launch decisions

Public trust copy identifies operational practices as planned or unconfirmed rather than active guarantees. Before launch, confirm authorized handlers and facility access, actual security arrangements, packed-weight limits, the off-floor storage method, inspection frequency and pest-control arrangements, the tote/seal/condition-record procedure, and the real contact channel for concern reports. The concern form and receipt/photo areas in the portal are demo-only; they do not transmit or save reports or images.

The portal shows a planned photo-inventory feature but has no upload control or image storage. Numbered tamper-evident tie identifiers are fictional demo data. Ties can show visible signs if broken or missing, but are not a security guarantee. A production inventory needs an authenticated upload API, storage/retention rules, access control, and privacy policy before collecting customer photos.

## Service boundary and backend integration

`src/services/demoService.ts` defines the typed `ToteKeeperService` contract for retrieving demo data, editing tote details, creating and cancelling requests, and resetting the demo. UI components call this interface rather than accessing storage directly. Replace `createMockToteKeeperService()` with an implementation that uses your chosen HTTP client and authenticated API; retain the interface or version it alongside the API contract. The mock implementation enforces the same basic eligibility and active-request conflict rules in the browser for the demo only. The backend must repeat all validation and authorization, allocate durable identifiers, enforce concurrency-safe conflicts, and return confirmed appointment times separately from customer-preferred dates.

All appointment display formatting uses the `America/Chicago` time zone. The demo does not confirm appointments or promise dates.

## Tests

Focused Vitest coverage checks tote eligibility, conflicting active requests, and request creation. Tests use fictional in-memory browser storage.
## Selected Farmplast totes: implementation notes

Shared specifications and authoritative blue product images are in `src/config/business.ts`. Existing `large_tote.jpeg` and `XL_tote.jpeg` are the supplied Large and XL product photos (supplier filenames: `Heavy-Duty-Attached-Lid-Pastic-Tote-Blue-3-1200x1200.jpeg` and `Heavy-Duty-XL-Attached-Lid-Tote-Blue-5-1200x1200.jpeg`). Dimensions are approximate; the provided gallon and cubic-foot figures are manufacturer-listed values, not a guarantee of usable capacity.

Unresolved before launch: verify manufacturer load and stacking ratings, which conflict in the supplied text (500 lb and 100 lb claims). Confirm the service packed-weight limit for each size independently. Do not derive safe stacks or customer weight limits from these claims. Cross-size stacking or interlocking has not been verified. These are internal implementation decisions, not customer packing limits.

Saved v1/v2 demo records using `oversized` migrate to `xl`, preserving IDs, contents descriptions, seals, and movement history. The v2 storage key remains in use; reset clears both versions. Bulky items remain separately quoted outside tote credits.
