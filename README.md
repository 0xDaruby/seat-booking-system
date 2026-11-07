# My Highs & I · Series 004

Seat booking, Paystack checkout, and downloadable tickets for **My Highs & I — The Life You Offer**.

[Live website](https://series-004.edaraiquaibom16.workers.dev/) · [Deployment guide](DEPLOYMENT.md)

## Event

| Detail | Current configuration |
| --- | --- |
| Date | 28 November 2026 |
| Time | 10:00 AM WAT |
| Venue | FUTO Guest House, Owerri |
| Admission | ₦2,000 per seat |
| Seating | 100 seats, rows A–J |

Event details and pricing are shared by the frontend and server through [src/event.json](src/event.json).

## Features

- Interactive seat map with shared availability and temporary seat holds.
- Paystack hosted checkout with server-side payment verification and signed webhook validation.
- Persistent booking records in Cloudflare D1, with scheduled payment reconciliation.
- Booking recovery after a refresh or interrupted payment return.
- Tickets issued from verified bookings, with PNG and PDF downloads.
- Authenticated organizer dashboard for inventory, checkout controls, payment exceptions, and CSV exports.
- Separate local preview, staging, and production environments.

## Stack

- **Frontend:** React 19, TypeScript, Vite, React Router, Zustand, and custom CSS.
- **Production API:** Cloudflare Workers with D1 storage and scheduled triggers.
- **Local API:** Node.js with SQLite.
- **Payments:** Paystack.
- **Ticket exports:** html2canvas and jsPDF.
- **Deployment:** Cloudflare Workers Builds connected to GitHub.

## Local development

Use **Node.js 24.19.0**, as specified in [.node-version](.node-version).

```sh
git clone https://github.com/0xDaruby/seat-booking-system.git
cd seat-booking-system
npm ci
```

Start the local preview API in a PowerShell terminal:

```powershell
$env:BOOKING_MODE = 'preview'
node server/index.mjs
```

In a second terminal, start the frontend:

```sh
npm run dev
```

Open [http://127.0.0.1:5184](http://127.0.0.1:5184). Vite proxies `/api` to the local API on port 4319. Preview mode simulates payment outcomes without charging a card and stores its SQLite database in the ignored `.booking-data/` directory.

Organizer sign-in is unavailable locally until accounts are configured. For preview only, set `BOOKING_ADMIN_PASSWORD` to a private password of 16–256 characters before starting the API, then sign in as `organizer`. Production uses separately configured organizer access keys.

## Checks and builds

```sh
node --test tests/*.test.mjs
npm run lint
npm run build
```

The tests cover seat allocation, payment verification, webhook handling, booking ownership, organizer operations, reconciliation, and Worker behavior. The build checks TypeScript and writes the frontend to `dist/worker-assets/`.

## Production deployments

**Edit locally → commit → push to `main` → Cloudflare checks, builds, and deploys.**

Cloudflare runs the tests, lint, and production build before deploying the existing `series-004` Worker. Failed checks stop deployment. A local edit appears online only after it has been pushed and the deployment succeeds.

Production uses the `production` environment in [wrangler.jsonc](wrangler.jsonc), including the existing D1 database, rate limits, and reconciliation schedule. Preview branch builds are disabled. See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact build settings and release notes.

Runtime payment secrets and organizer credentials are configured in Cloudflare. Keep them out of source control. Database migrations are separate from application deployments; preserve existing booking records when changing the schema or rolling back code.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/pages/` | Booking, payment return, tickets, and organizer screens |
| `src/components/` | Shared event presentation |
| `src/event.json` | Shared event details, price, and seat layout |
| `src/booking.ts` | Frontend API helpers |
| `src/store/` | Frontend form and selection state |
| `public/` | Flyer and static artwork |
| `worker.mjs` | Production HTTP and scheduled handlers |
| `server/` | Booking, inventory, payment, and organizer logic |
| `migrations/` | D1 database schema |
| `tests/` | Automated booking and Worker checks |
| `wrangler.jsonc` | Local, staging, and production Cloudflare configuration |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Event information and seat booking |
| `/payment` | Payment return and verification |
| `/ticket` | Verified ticket and downloads |
| `/admin-login` | Organizer sign-in |
| `/admin-dashboard` | Organizer tools |
| `/preview-checkout` | Loopback-only simulated checkout |
