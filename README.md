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
- `SFTP_REMOTE_DIR`: optional absolute SFTP path to this site's deploy directory. It defaults to `/totekeeper`, the directory created in the SFTP account root. Since no domain is connected yet, browse the site at the host's corresponding `/totekeeper/` path if that host serves the account root. Set this secret only if IONOS reports a different absolute path for the directory.

The deployment mirrors the generated site with `--delete`, so `/totekeeper` must be dedicated to this website. The workflow refuses the account root and path-traversing targets. `public/.htaccess` is included in the build to route React Router paths back to `index.html` on IONOS Apache hosting. The workflow does not deploy the repository, source files, or secrets. When you connect a domain later, point its document root to this folder or update `SFTP_REMOTE_DIR` if IONOS requires a different target path.

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

Annual plan prices, month-to-month tote deposit, annual-prepay tote terms, service-area wording, included annual visits, and illustrative oversized-item estimates are centralized in `src/config/business.ts`. Annual-prepay totals equal the annual plan prices because standardized totes are provided for use at no added charge. Totes remain My Tote Keeper property and are returned when storage ends. Deposit return conditions need to be confirmed before signup. The current oversized-item examples are estimates, not fixed-price bookable products. No monthly service prices, proration, or upgrade rules are configured.

The portal shows a planned photo-inventory feature but has no upload control or image storage. Numbered tamper-evident tie identifiers are fictional demo data. Ties can show visible signs if broken or missing, but are not a security guarantee. A production inventory needs an authenticated upload API, storage/retention rules, access control, and privacy policy before collecting customer photos.

## Service boundary and backend integration

`src/services/demoService.ts` defines the typed `ToteKeeperService` contract for retrieving demo data, editing tote details, creating and cancelling requests, and resetting the demo. UI components call this interface rather than accessing storage directly. Replace `createMockToteKeeperService()` with an implementation that uses your chosen HTTP client and authenticated API; retain the interface or version it alongside the API contract. The mock implementation enforces the same basic eligibility and active-request conflict rules in the browser for the demo only. The backend must repeat all validation and authorization, allocate durable identifiers, enforce concurrency-safe conflicts, and return confirmed appointment times separately from customer-preferred dates.

All appointment display formatting uses the `America/Chicago` time zone. The demo does not confirm appointments or promise dates.

## Tests

Focused Vitest coverage checks tote eligibility, conflicting active requests, and request creation. Tests use fictional in-memory browser storage.