# Repository guidance

This repository contains the **My Highs & I** seat-booking frontend. Read [memory.md](memory.md) for the Series 004 brief, verified baseline, and pending event details.

## Safe development

- Treat the startup, build, and lint scripts in the affected checkout as unsafe. Running `npm run dev`, `npm run build`, or `npm run lint` from that checkout can load the affected files. Keep `api.js` and the affected ESLint config out of the isolated preview.
- Develop and verify in a reviewed checkout or the isolated preview described in [memory.md](memory.md). Use Vite directly from that copy for local serving and the TypeScript compiler directly for type checking. Bind the dev server to loopback.
- Use approved test credentials for checkout verification. Avoid exposing credentials, attendee details, or payment references in logs, screenshots, or documentation.
- Treat publishing, deployment, and infrastructure changes as separate work that requires explicit authorization.

## Where to make rebrand changes

| Surface | Entry point |
| --- | --- |
| Document title, metadata, and static assets | [index.html](index.html) and [public/](public/) |
| Global styles | [src/index.css](src/index.css) and [src/App.css](src/App.css) |
| Attendee details and seat map | [SeatBooking.tsx](src/pages/SeatBooking.tsx) |
| Checkout summary, timer, and Paystack handoff | [Payment.tsx](src/pages/Payment.tsx) |
| On-screen ticket and PNG/PDF exports | [Ticket.tsx](src/pages/Ticket.tsx) |
| Admin login and seat management | [AdminLogin.tsx](src/pages/AdminLogin.tsx) and [AdminDashboard.tsx](src/pages/AdminDashboard.tsx) |
| Routes and booking state | [App.tsx](src/App.tsx) and [useStore.ts](src/store/useStore.ts) |

## Series 004 working rules

- Use approved event details and assets. Keep the event name, date, venue, and price consistent wherever they appear, including ticket exports and checkout.
- Keep the existing booking behavior and admin tools working through the rebrand. Confirm any requested changes to seating, price, payment, or admin behavior as product decisions.
- Check the branded pages on mobile and desktop. Verify that the ticket artwork and text fit in both export formats.
