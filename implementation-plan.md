# Series 004 main build plan

The main app uses the approved Series 004 design. An attendee selects a seat, enters their name and email, and reviews the booking before selecting **Pay ₦2,000 with Paystack**. Paystack handles the payment, then the app verifies it and presents a downloadable ticket. Use [design.md](design.md) for visual rules, event copy, and responsive layouts.

The current React app has separate booking, payment, ticket, and admin routes. It stores seat availability in memory and trusts browser state for payment confirmation and admin access. The visual rebrand can be reviewed locally first. Taking live payments requires shared seat inventory, server-side payment verification, and authenticated admin actions.

## Delivery order

Each item below is sized for its own review. The frontend and inventory work can start in parallel once the reviewed baseline and API contract are in place. Ticket and admin integration can proceed independently after their server interfaces are available. Use a separate branch or reviewed copy for each work item. See [AGENTS.md](AGENTS.md) for safe local commands and release authorization.

| Work item | Depends on | Ready for review when | Rollback |
| --- | --- | --- | --- |
| A. Reviewed baseline and API contract | None | The safe checkout runs locally. The route inventory, seat states, booking session, payment statuses, and admin permissions are recorded. | Keep the prior baseline and discard the isolated copy. |
| B. Series 004 frontend preview | A | Booking, return states, ticket exports, and both admin pages can be reviewed with fixtures. | Revert the branded frontend changes. |
| C. Database, seat holds, and availability | A | Concurrent claims, expiry, and session ownership pass database integration checks. | Pause new holds and retain stored records. |
| D. Paystack initialization and finalization | C | Test-mode checkout finalizes one seat and ticket. Retries and interrupted callbacks or webhooks recover through persisted reconciliation. | Disable new checkout attempts and keep verification and reconciliation available for attempts already started. |
| E. Ticket access and exports | B, D | A verified booking can retrieve and export the same ticket. Other sessions are denied. | Restore the previous export implementation against verified booking data. |
| F. Admin authorization and operations | B, C | Authorized admins can inspect seats and export records. Ordinary releases cannot reopen a paid seat. D supplies payment exception records before launch. | Disable affected admin actions while preserving the records and audit history. |
| G. Launch rehearsal and approval | D, E, F | All acceptance gates pass and the organizer approves launch. | Pause checkout, preserve records, and use the rehearsed rollback. |

Agree on the API contract before the parallel work begins. Define the response and recovery behavior for a seat conflict, an expired hold, pending verification, and a verified booking. If the order or scope changes during implementation, update this table and the affected acceptance checks together.

## 1. Prepare a safe working baseline

- Start from a reviewed copy of the frontend. Follow the isolated preview workflow in [AGENTS.md](AGENTS.md) and [memory.md](memory.md). Exclude the affected `api.js` and ESLint config. Run Vite directly on loopback and use the TypeScript compiler directly from the reviewed copy.
- Before opening a production release, establish a clean source revision and review build inputs, dependencies, scripts, and deployment settings. Assess whether the affected code ran locally or in CI and resolve any credential exposure identified by that review.
- Record the existing routes, seat layout, admin actions, and export formats as regression checks. Confirm the venue’s sellable seat map and the organizer’s photo requirement. Use the existing 100-seat layout for local review while the final layout is confirmed.

## 2. Build the branded frontend

| Surface | Implementation |
| --- | --- |
| [Document shell](index.html) and [global styles](src/index.css) | Add Series 004 metadata, the approved flyer asset, and shared tokens for color, type, spacing, and focus. Put event copy, time, venue, and price in a shared configuration. |
| [Booking](src/pages/SeatBooking.tsx) | Recreate the approved hero and programme. Put the map, attendee fields, selected seat, and total in one form. Use a keyboard-operable seat group, inline validation, and one payment button. Stack the panels on mobile. |
| [Payment](src/pages/Payment.tsx) | Use this surface for the Paystack return and verification states. Give direct visits and expired sessions a route back to booking. Read the hold expiry from the server when available. |
| [Ticket](src/pages/Ticket.tsx) | Build the branded confirmation and reuse its ticket layout for PNG and PDF downloads. Show the attendee, seat, event details, and a ticket identifier. Check long names and narrow screens. |
| [Admin Login](src/pages/AdminLogin.tsx) and [Admin Dashboard](src/pages/AdminDashboard.tsx) | Apply the shared design and preview both screens. Keep the seat management and CSV export workflows available through authorized server actions in the production build. |
| [Routes](src/App.tsx) and [booking store](src/store/useStore.ts) | Use the store for form and selection state. Isolate the Series 004 draft from earlier editions. Load inventory, confirmed bookings, and admin permissions from the server. |

Review the booking, payment return, ticket exports, and both admin pages together in the isolated preview. Use simulated states for this review. The target checkout keeps the photo out of the payment path, subject to the organizer’s check-in requirement.

## 3. Implement seats and Paystack

1. **Create durable inventory.** Choose a transactional database and a small server API. Store the event seats, holds with server-defined expiries, booking records, and payment attempts. Enforce one active allocation per seat using database transactions and constraints. Return availability to the browser without exposing attendee data.
2. **Reserve and initialize on Pay.** Validate the attendee details and seat on the server, claim the seat atomically, and initialize Paystack with a unique reference and the configured price of **200,000 kobo (₦2,000 NGN)**. Use an idempotency key so repeated clicks or a network retry reuse the same attempt. A rejected seat claim returns the attendee to the map with their form details intact. [Paystack payment initialization](https://paystack.com/docs/payments/accept-payments/)
3. **Hand off directly to checkout.** Start with Paystack’s hosted checkout in the same tab to avoid an extra confirmation screen and popup handling. Use the return route to restore the booking session and show **Checking payment** until the server resolves it. Test the handoff and return on real mobile browsers before choosing the final integration. [Paystack hosted checkout and return flow](https://paystack.com/docs/payments/accept-payments/)
4. **Verify and issue once.** Treat the browser return as a prompt to verify. Match Paystack’s verified transaction status, reference, amount, currency, and test or live mode to the stored attempt. Validate signed webhooks using the configured Paystack signing scheme. Route callback, webhook, and retry processing through one idempotent finalization path. Commit the sold seat and ticket together. [Paystack verification](https://paystack.com/docs/payments/verify-payments/) · [Paystack webhook validation](https://paystack.com/docs/payments/webhooks/)
5. **Handle uncertainty and expiry.** Give attendees clear states for pending, failed, canceled, expired, and verified payment. Keep their details on a recoverable retry. Reconcile an attempt with Paystack before reopening the seat or inviting the attendee to pay again when the payment status is uncertain. Agree on a hold duration and a bounded policy for pending payments. Route late or duplicate successful payments that cannot be fulfilled to the organizer’s reconciliation process without issuing a second ticket or displacing another booking.

Store Paystack secrets on the server and separate test and live settings. Give attendees booking-scoped access to confirmation and downloads. Treat existing browser-stored payment references as unverified. If earlier records need to be carried forward, reconcile them against trusted organizer and payment records first.

Persist the attempt and its reference before calling Paystack. If initialization times out, recover the existing attempt before creating another. On return or refresh, recover the booking through its session and look up the stored attempt. Define the reconciliation workflow before exposing live payment channels that can settle after a hold expires.

Run a scheduled reconciliation job or durable worker for unresolved attempts. Persist when each attempt should be checked again so a restart can resume the work. Surface cases that require a decision in the admin dashboard, and give the organizer a way to record the resolution.

## 4. Connect tickets and admin to confirmed records

- Render and export tickets from verified booking data. Reloading the ticket should resolve the same issued ticket. Test that changing a reference or ticket identifier cannot expose someone else’s booking.
- Replace the browser admin flag with a server-backed session. Enforce authorization on inventory changes, booking lookups, and CSV downloads. Record who makes a change and when. Keep paid seats protected from an ordinary hold release.
- Give organizers a way to distinguish available seats, active holds, paid seats, and exceptions that need reconciliation. Confirm who owns guest support, seat overrides, and any refund decisions.

## 5. Verify and prepare for launch

| Gate | Evidence required |
| --- | --- |
| Design | Booking, payment return, ticket, and admin pages reviewed on desktop and mobile, including 320 px and 390 px. Keyboard focus, validation, and state changes work throughout. |
| Booking integrity | Two sessions competing for a seat yield one allocation. A database integration test covers the race between expiry, reassignment, and late payment success. The new holder keeps the seat and the original successful payment enters reconciliation without a ticket. Refresh and duplicate clicks preserve state. |
| Test payments | Approved Paystack test credentials cover success, decline, cancel, pending status, interrupted return, late success, amount mismatch, and repeated or invalid webhooks. A verified booking produces one ticket. |
| Ticket and admin | PNG and PDF exports fit and show the same verified details. Admin route and API authorization, seat operations, and CSV export pass review. |
| Release | The organizer approves the seat layout, photo rule, hold policy, and exception handling. A reviewed source revision, rollback procedure, and payment reconciliation owner are recorded. |

Prepare a reviewable build before requesting launch approval. Treat provisioning, publishing, production credentials, webhook changes, and deployment as separately authorized release steps. Use backward-compatible migrations for the launch and verify the rollback revision against the new schema. Rehearse pausing new checkout while pending payments can still finalize and existing tickets remain accessible.

From the reviewed frontend copy, run `node node_modules/typescript/bin/tsc -b` to check TypeScript and `node node_modules/vite/bin/vite.js --host 127.0.0.1` to serve the browser review. Record the database and API verification commands once the stack is chosen. Save the results with each work item before starting dependent work.

## Local review of A–D

The reviewed copy is `dist/series-004-review`. It excludes the affected startup file and uses the ESLint configuration from the earlier reviewed revision. The working source also removes the startup file and the commands that loaded it. This source cleanup is separate from the historical credential and deployment review.

From the reviewed copy, use Node 24, set `BOOKING_MODE=preview` in the API terminal, and run `node server/index.mjs`. In a second terminal, run `node node_modules/vite/bin/vite.js --host 127.0.0.1` and open `http://127.0.0.1:5184/`. The API binds to loopback on port 4319, and Vite proxies requests on the same browser origin. Run `node --test tests/booking.test.mjs` for the database and Paystack adapter tests. Preview mode uses a separate SQLite file and exposes simulated payment outcomes through the development frontend.

For a Paystack test run, supply `BOOKING_MODE=test` and the approved `PAYSTACK_SECRET_KEY` through the server environment. The API requires a test key and uses a separate database for test attempts. Configure a Paystack-reachable webhook target only as part of a separately approved environment. The local visual review uses the existing 100 seats and a typographic panel while the approved flyer is unavailable.

| Endpoint | Contract |
| --- | --- |
| `GET /api/seats` | Returns held and sold seats without attendee details. Starts an opaque browser session and reports whether that session has a booking to recover. |
| `POST /api/checkout` | Validates the seat, name, email, and request ID. Atomically claims the seat and stores the server price and payment reference. Retries reuse the stored attempt. A conflicting seat returns 409 so the form can refresh the map. |
| `POST /api/verify` | Finds the current session’s stored attempt and reports pending, paid, failed, canceled, expired, exception, or resolved. The browser return only requests verification. |
| `POST /api/paystack/webhook` | Validates the raw-body HMAC and verifies the stored reference through Paystack. The callback, worker, and webhook use the same finalization function. |
| `GET /api/ticket` | Returns one issued ticket to the browser session that owns the verified booking. |
| `/api/admin/*` | Uses a named organizer account and an expiring server-side session. The booking lookup, roster CSV, hold checks, exception resolutions, and checkout controls require organizer authorization. |

The review uses a five-minute checkout window and allows up to 15 additional minutes for a known pending status in Paystack test mode. Provider errors keep the seat allocated until the API can confirm a status. The worker rechecks released attempts for 24 hours, and a signed success webhook can still surface a later exception. If the seat was released, a late successful charge enters organizer review while any new seat allocation stays in place. The organizer still needs to approve the hold duration, reconciliation policy, check-in photo rule, and final seat map.

The reviewed copy passed TypeScript, ESLint, the Vite build, and four database and adapter tests. Edge checks at 1440, 390, and 320 pixels exercised keyboard selection, inventory retry, competing claims, simulated payment recovery, booking ownership, ticket exports, and admin sign-in and CSV. The long-name PNG and rasterized PDF were visually checked. Real Paystack test-mode transactions and public webhook delivery require an approved test secret and a reachable test environment.

## Launch rehearsal for E–G

Use Node 24 from the reviewed launch copy in `dist/series-004-launch`. From that directory, run the API and Vite commands above. To run alongside the earlier review, set `BOOKING_API_PORT=4321` in both terminals, set `BOOKING_ORIGIN=http://127.0.0.1:5186` in the API terminal, and add `--port 5186` to the Vite command. The default preview database stays under `.booking-data`.

For a local organizer rehearsal, set `BOOKING_ADMIN_PASSWORD` in the API environment to a private password of at least 16 characters and sign in as `organizer`. For an approved HTTPS test environment, set `BOOKING_ADMIN_ACCOUNTS` to a JSON object mapping each organizer username to a separate scrypt credential. Usernames contain 2–40 lowercase letters, digits, dots, underscores, or hyphens. Generate each credential locally with `hashAdminPassword` from `server/admin.mjs`. Supply passwords through the terminal or a secret manager and keep credentials outside the repository. Removing or changing an account invalidates its sessions.

The dashboard records the signed-in organizer and time when checkout is paused or reopened, a simulated hold is released, a Paystack-backed hold is rechecked, an exception is resolved, or CSV is exported. A Paystack-backed release action checks the provider and uses the shared payment finalization rules. The release action keeps an uncertain hold protected and preserves a confirmed seat. Organizers can record an outcome after resolving a payment with the provider. The record remains linked to the exception and the attendee receives a generic status update. Attendees can reopen their ticket in the booking browser during its 30-day session window.

### Verify the candidate

1. In a clean reviewed copy, install the locked dependencies with `npm ci --ignore-scripts`. Run `node node_modules/typescript/bin/tsc -b --force`, `node node_modules/eslint/bin/eslint.js src vite.config.ts`, `node node_modules/vite/bin/vite.js build`, and `node --test tests/booking.test.mjs tests/launch-rehearsal.test.mjs`. The rehearsal tests bind to loopback and use disposable databases and a simulated Paystack transport.
2. Review the attendee, payment, ticket, and organizer screens at 320 px, 390 px, and desktop. With a pending attempt, pause new checkout from the organizer dashboard. In a fresh booking session, confirm new reservations are paused. Complete the original attempt, reopen its ticket, then reopen checkout. Check a simulated hold release and a recorded exception resolution.
3. For the provider gate, run the hosted Paystack checkout with the organizer’s approved test secret and a reachable HTTPS origin. Cover success, decline, cancel, pending, lost return, late success, amount mismatch, and repeated and invalid webhooks. Confirm the same ticket opens on refresh. Use the test account’s dashboard to reconcile the test records.

### Test environment and rollback

- Serve the reviewed frontend build and the Node API behind the same HTTPS origin. Route `/api/*` to the loopback listener and serve the SPA entry for client-side routes. Configure the approved Paystack test webhook to reach `/api/paystack/webhook`. Keep the SQLite file on durable storage with restricted permissions and use a separate file for each mode.
- After explicit launch approval, live startup requires `BOOKING_MODE=live`, `BOOKING_ENABLE_LIVE_MODE=1`, an HTTPS origin, the live Paystack secret, named organizer accounts, and a comma-separated `BOOKING_PAYSTACK_CHANNELS` list approved for the event. A new live database starts with checkout paused. The organizer opens checkout after checking the deployment, webhook delivery, inventory, and support handoff. [Paystack transaction initialization](https://paystack.com/docs/api/transaction/#initialize)
- Before an upgrade, record the reviewed revision and take a consistent SQLite backup with the service stopped or with a SQLite-aware backup tool. The organizer tables are additive and leave the existing attempts schema intact.
- If a release needs to be paused, pause new reservations in the dashboard or set `BOOKING_CHECKOUT_PAUSED=1` in the API environment and restart. Continue verification, webhook processing, and access to issued tickets. For the first live release, the recovery target is this live-capable API with checkout paused. For a later rollback to a reviewed live-capable revision, block new checkout at the ingress before switching. Keep the current database and verified payment paths available. Confirm a pending attempt can settle and a previously issued ticket still opens before removing the block.
- Before launch, obtain the approved flyer, confirmed seat map and photo rule, the agreed hold and late-payment policy, a named reconciliation owner, and organizer sign-off. Review the earlier affected deployment’s build logs and any credential exposure, then approve the reviewed revision and hosting settings. The previous deployment audit remains open because the connected Vercel account could not access its records.

### Rehearsal results

| Gate | Observed result |
| --- | --- |
| Candidate build | TypeScript, ESLint, the Vite build, and 10 automated tests passed. The runtime and full npm audits reported zero vulnerabilities after updating the lockfile and applying a scoped lint-tool dependency override. |
| Organizer and ticket | Edge review at 320, 390, and 1440 px covered named sign-in, pause and reopen, a paid booking during a pause, audited hold release and exception resolution, CSV export, and sign-out. The PNG and rasterized PDF both fit the same long fixture name and seat details. |
| Rollback data | The earlier reviewed inventory code read an issued ticket and finalized a pending booking against a migrated rehearsal database. The candidate reopened that database with the original ticket, the newly issued ticket, and the pause intact. |
| Provider and release | The local tests used a simulated Paystack transport. The approved provider test account, reachable HTTPS environment, real device handoff, historical build-log review, and organizer sign-off are pending. |
