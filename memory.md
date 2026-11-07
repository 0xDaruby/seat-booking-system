# Series 004 project memory

## Direction

Rebrand the existing **My Highs & I** seat-booking site for **Series 004**. The first task is to establish the project context and contributor instructions. The rebrand itself is pending.

Series 004 is the confirmed edition label. The final event name and wording, date and time, venue, ticket price, seat layout, artwork, and visual direction are pending. Use the organizer's approved details when they arrive. Treat the current site's copy and artwork as references for the previous edition.

## Verified baseline

- The [public site](https://nyhighsandi.vercel.app/) served a JavaScript bundle that matched a frontend build from `34ee1a8` byte for byte when checked on 6 November 2026. The [local preview](http://127.0.0.1:5173/) was updated to the same frontend source. Its isolated directory is `dist/local-preview-3658a81`, named after the earlier revision used to create it.
- The app uses React, TypeScript, Vite, Tailwind CSS, React Router, and Zustand. The attendee flow is seat selection, Paystack checkout, then a downloadable PNG or PDF ticket. The current seat map has 100 seats and checkout shows a five-minute countdown.
- Seat availability lives in memory. The store persists attendee details, the selected seat, the payment reference, and the admin flag in browser storage. The checkout trusts the client-side Paystack callback. Admin access and seat management also run in the browser.
- TypeScript passed on the updated preview, and the dev server served the updated checkout. No payment was submitted during verification. The preview uses a live Paystack public key.

## Repository safety

Local `main` was synced to `4eed552`. It includes `34ee1a8`, which introduced obfuscated code in `api.js` and `eslint.config.js` capable of fetching and executing remote JavaScript. The local preview uses a separate setup assembled from the earlier revision and the verified frontend changes. See [AGENTS.md](AGENTS.md) for the rules for working on it.

## Hosting discussion (7 November 2026)

- David wants to host Series 004 under his own account from `0xDaruby/seat-booking-system` so he can deploy fixes independently of Daniel's Vercel project. He asked for a free alternative to paid Render hosting. The hosting platform is still undecided.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/) with [D1](https://developers.cloudflare.com/d1/platform/limits/) is a candidate within free plan limits. The React frontend can be retained. The current Node API and local SQLite access would need to be adapted to Workers and D1, and periodic payment reconciliation would need a [scheduled trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- [Render's free web service](https://render.com/docs/free) loses its local SQLite data when it sleeps, restarts, or redeploys. Render with a paid persistent disk can preserve the current database setup.
- Before accepting live payments on a new host, verify Paystack test checkout and webhooks, concurrent seat reservations, and ticket delivery in the hosted environment. No hosting platform was selected or deployment made in this discussion.
