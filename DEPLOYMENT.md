# Production deployments

Production runs at https://series-004.edaraiquaibom16.workers.dev/ on the Cloudflare Worker `series-004`.

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
