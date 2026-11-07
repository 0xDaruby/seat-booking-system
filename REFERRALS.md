# Ambassador referrals

The fixed roster is [referral-codes.csv](referral-codes.csv): **MHI04 001** through **MHI04 055**, numbered for assignment outside the app. There are no ambassador accounts or names in the application.

## Booking and reporting

- The booking form accepts an optional code. Leaving it blank does not prevent checkout.
- The server checks the code before checkout and before reserving a seat. Approved codes are case-insensitive and trimmed; random codes are rejected. The database also enforces the approved-code relationship.
- Attribution is saved when the payment attempt is created. Retrying an existing attempt does not change its code.
- **Confirmed bookings** is the default admin section. It includes only paid bookings with an issued ticket, whether or not they used a code.
- **Referrals** lists every generated code, including zero-count codes. Counts include only paid bookings with issued tickets. No commission rate or payout is calculated by the app.
- **Payment Attempts** contains pending, failed, canceled, expired, and payment-review records. These records never increase confirmed-attendee or referral counts.
- Each section has a corresponding authenticated CSV export. Existing paid bookings without referral attribution remain confirmed and are reported as having no code.

Keep the roster stable after distribution. The server allowlist is `server/referral-codes.json`. Migration `0003_referral_code_format.sql` replaces the earlier random codes with MHI04 001 through MHI04 055 and preserves existing attribution by roster number. The old codes are removed from the active database allowlist and are rejected by the server. Do not regenerate or replace the new codes after ambassadors start using them.

## Release order

Apply `0002_referrals.sql` and then `0003_referral_code_format.sql` to each intended D1 environment before deploying this application revision. The first adds the allowlist table, a nullable referral column, and an index; the second replaces the old roster. Both preserve existing bookings, tickets, and organizer records. Keep the original migration as history rather than editing a migration that has already run.

Production migration and deployment require separate release authorization under `AGENTS.md`. A GitHub push to `main` triggers production deployment, so do not push this revision before the production migration has been applied and checked.

The local Node API upgrades an older local SQLite database on startup. D1 uses explicit migrations; the Worker does not migrate its production database during requests.

## Verification

`node --test tests/*.test.mjs` checks optional and invalid codes, stable retry attribution, paid-only counts and exports, all 55 summary rows, authorization, duplicate settlement, and preservation of pre-referral bookings. The D1 adapter tests execute the migration SQL and adapter queries through a transactional SQLite binding.
