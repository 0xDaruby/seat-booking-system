# My Highs & I · Series 004

Use this guide when designing the booking page, checkout, confirmation, ticket exports, and admin screens. The approved visual reference is the [Series 004 demo](https://my-highs-and-i-demo.vercel.app/). Its simulated payment and sample seat availability illustrate the interaction.

## Event identity

| Element | Copy |
| --- | --- |
| Event | My Highs & I |
| Edition | Series 004 |
| Format | Live conversation |
| Theme | The Life You Offer |
| Subtitle | Becoming too valuable for the world to ignore. |
| Byline | With Klinationt and Edwin Clinton |
| Date and time | 28 November 2026 · 10:00 AM WAT |
| Venue | FUTO Guest House, Owerri |
| Admission | ₦2,000 per seat |
| Tagline | A conversation for a higher you |
| Sign-off | Useful. Rare. Irreplaceable. |

Keep the edition, date, venue, and price consistent across the hero, checkout summary, confirmation, and exports. Use a shared event configuration in the production build. On narrow screens, the date can shorten to **28 Nov 2026**.

## Visual language

Use a warm paper surface for the hero, order summary, and ticket. Set the masthead and booking area in near-black. Let the flyer provide the portrait, texture, and event artwork. Keep the image at its original aspect ratio and place it in a charcoal frame with a subtle diagonal texture. Render the date, venue, price, and theme as page text as well.

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#141411` | Page background and text on light surfaces |
| Paper | `#EEECE2` | Hero, order summary, ticket, and text on dark surfaces |
| Panel | `#20211B` | Forms, seat map, and secondary dark surfaces |
| Divider | `#3D4036` | Rules and panel borders on dark surfaces |
| Muted text | `#BCBDB0` | Supporting text on dark surfaces |
| Lime | `#B4F150` | Primary actions, selected seats, and small accents on dark surfaces |
| Lime hover | `#CCFA8B` | Primary action hover |
| Deep green | `#344F19` | Small labels and rules on paper |
| Title green | `#3E601D` | Italic “Offer” in the hero |
| Focus | `#80B5FF` | Visible keyboard focus on dark surfaces |
| Error | `#FFB8A9` | Inline error text on dark surfaces |

Pair **Georgia** with **Bahnschrift**. Use Times New Roman as the serif fallback and Segoe UI, then a system sans-serif, for interface text.

| Element | Treatment |
| --- | --- |
| Hero title | Bold Georgia, two lines, roughly 58–112 px on desktop. Set “Offer” in italic deep green. |
| Subtitle | Italic Georgia, 19–29 px. |
| Section and panel headings | Bold Georgia. Section headings range from 34–59 px, and panel headings start at 24 px. |
| Body, labels, and controls | Sans-serif. Use 16 px for body text, 13–14 px for help and field labels, and 10–12 px for short uppercase labels with letter spacing. |

Use square edges, thin rules, and a dashed divider to suggest a printed ticket. The masthead uses an italic ampersand in a lime square beside the event wordmark. Primary actions use a solid lime fill with ink text. Secondary controls use an outline or an underlined text link.

## Page composition

- **Masthead.** Keep the wordmark at the left and a short booking link at the right when space allows.
- **Hero.** Put the edition, title, subtitle, byline, and **Reserve a seat** link on the paper side. Keep date, venue, and price close to the link. The link jumps to booking. Place the full framed flyer beside the copy on wide screens and beneath it on mobile.
- **Booking.** Lead with **Take your seat.** Place **01 Choose a seat** next to **02 Your details** on desktop, with more width for the map. Stack the map first on mobile. Put the order summary immediately above the payment button.
- **Programme.** Place it after booking with a numbered list separated by thin rules. Preserve the flyer’s order: The Problem That Built You, Value, Visibility & Leverage, The Hidden Rules of Opportunity, and Becoming Irreplaceable.
- **Ticket.** Use a paper card with a lime top rule and dashed dividers. Show event and edition, attendee name, seat, date, time, and venue. Apply the same hierarchy to PNG and PDF exports. Keep the ticket readable with long attendee names and allow the name to wrap.
- **Admin.** Use the same palette, typography, and focus styles. Give seat status, tables, and management actions priority in the layout.

The demo uses a 1,200 px maximum content width, with 40 px side gutters on wide screens, 18 px at 850 px and below, and 12 px at 365 px and below. Switch to one column around 680 px. Use these as starting points and adjust if text or controls run out of room.

## Booking and payment behavior

1. **Choose one seat.** Keep the stage marker, row labels, and seat positions stable. Use a named radio group so the customer can change their choice with a keyboard or tap. Available seats have a solid outline, the selected seat has a lime fill and checkmark, and unavailable seats show an × and a dashed outline. Announce the selected seat when the order summary updates.
2. **Enter full name and email.** Give each field a visible label and enable browser autofill. The demo proposes dropping the required photo before payment. Confirm any check-in photo requirement with the organizer before changing the production flow.
3. **Review the booking.** Show the attendee details, seat, event information, and the ₦2,000 total on the Series 004 payment page. Start the seat hold when the attendee selects **Pay ₦2,000 with Paystack**.
4. **Keep the booking recoverable.** Show validation beside the field or map and put focus where the customer can fix it. Keep the name, email, and seat selection on cancellation or decline while the seat remains available. If the seat is released or becomes unavailable, explain what happened and return focus to seat selection. Show when payment is opening and prevent repeated submissions while it is in progress.
5. **Show the ticket after payment is verified.** Focus the confirmation heading and make the seat and download actions easy to find. Use test credentials for production checkout verification. The demo’s sample inventory, simulated payment controls, and preview labels belong to the demo.

## Acceptance checks

- Check the hero, seat map, checkout, confirmation, and exports at desktop and mobile widths. Include 320 px and 390 px, verify there is no page overflow, and check seat targets remain readable and tappable.
- Complete the flow with keyboard controls. Verify seat selection, visible focus on both light and dark surfaces, validation, focus on return from checkout, and access to the ticket actions.
- Exercise cancellation, decline, retry, unavailable seat, and confirmed payment with approved test data. Check that the customer sees the correct amount and can recover without retyping their details.
- Inspect both PNG and PDF tickets. Check that event details, the seat, and long attendee names fit without clipping.
- Use the reviewed isolated preview described in [AGENTS.md](AGENTS.md) for local development and verification.
