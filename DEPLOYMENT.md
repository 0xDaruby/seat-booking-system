# Production deployments

Production runs at https://myhighsandi.me/ on the Cloudflare Worker `series-004`. Organizer sign-in is available at https://admin.myhighsandi.me/; the subdomain opens `/admin-login` and keeps organizer requests on that origin. The `www` hostname redirects to the main domain.

The original https://series-004.edaraiquaibom16.workers.dev/ address remains available for existing browser sessions, payment returns, and Paystack webhook delivery. New bookings made on the main domain return to that same domain after payment.

Cloudflare Workers Builds is connected to `0xDaruby/seat-booking-system`, with `main` as the production branch. A push to `main` automatically installs dependencies, runs the checks, builds the frontend, and deploys the Worker and assets. Local edits appear online after they are committed, pushed, and successfully deployed.

## Update production

Use Node.js 24.19.0 and install dependencies from the lockfile with `npm ci`. Before pushing, run:

```sh
node --test tests/*.test.mjs
npm run lint
npm run build
```

Commit the intended files and push to `main`. Check the build and deployment status in the Cloudflare dashboard under Workers & Pages > series-004 > Deployments. A failed check prevents the deploy command from running.

## Cloudflare build settings

| Setting | Value |
| --- | --- |
| Repository | `0xDaruby/seat-booking-system` |
| Production branch | `main` |
| Root directory | `/` |
| Node build variable | `NODE_VERSION=24.19.0` |
| Build command | `node --test tests/*.test.mjs && npm run lint && npm run build` |
| Deploy command | `npx wrangler deploy --env production` |
| Preview builds | Disabled |

The production environment in `wrangler.jsonc` selects the existing production D1 database, origin, rate limits, and scheduled reconciliation. The default environment is for local preview; always specify `--env production` for production deployment.

Runtime secrets remain in Cloudflare. Do not commit `.env`, `.dev.vars`, `.booking-data`, database files, access keys, or payment credentials. These local directories and secret files are excluded by `.gitignore`.

Deploying application code does not apply SQL migrations. If a future change needs a database migration, review its compatibility with existing bookings and apply it as a separate release step. Preserve booking records when rolling back application code.

The clean Series 004 application replaced the old files on `main` in commit `9059eec`. Earlier commits remain in Git history; use the current source for builds.

## Pay with OPay

The production checkout channel list includes `bank` alongside `card` and `bank_transfer`. Paystack provides OPay through its Bank channel; there is no separate `opay` channel value.

Enable **Bank** in the Paystack Dashboard under **Settings > Preferences** for the intended business. Customers then select **Bank > OPay Digital Services Limited (OPay)** in hosted checkout and authenticate through OPay. See [Paystack's OPay guide](https://paystack.com/blog/product-engineering/pay-with-opay).

The configuration change takes effect after deployment. Verify OPay is offered in a fresh checkout after enabling Bank in Paystack; existing checkout sessions may retain their previous channels.

## Custom domain

`myhighsandi.me` remains registered at Namecheap and uses Cloudflare nameservers `molly.ns.cloudflare.com` and `yichun.ns.cloudflare.com`. Cloudflare manages DNS and HTTPS for the root, `www`, and `admin` hostnames. The application source remains in `0xDaruby/seat-booking-system`; the separate `0xDaruby.github.io` repository created by the domain offer is not the booking application.

The production custom-domain routes and approved origins are versioned in `wrangler.jsonc`. The Worker handles hostname routing before static assets, rejects unapproved hosts, and keeps organizer cookies scoped to their host. Database bindings and runtime payment secrets are shared with the existing production deployment.
