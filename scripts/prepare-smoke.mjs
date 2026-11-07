import { cp, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const excludedDatabases = new Set(["10398fa5-b8f5-4e68-938d-51c87a046cb0", "84c43b82-77f9-44cb-8eb1-3054b66d193c"]);
const smokeEdition = "SMOKE TEST — NOT AN EVENT TICKET";

export async function prepareSmoke({ source, destination, privateDirectory, databaseId, origin }) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(databaseId ?? "") || excludedDatabases.has(databaseId)) {
    throw new Error("A separate smoke D1 database is required.");
  }
  if (!/^https:\/\/series-004-smoke\.[a-z0-9-]+\.workers\.dev$/.test(origin ?? "")) throw new Error("Use the isolated smoke hostname.");
  source = await realpath(source);
  destination = resolve(destination);
  if (source === destination || source.startsWith(destination + "/") || source.startsWith(destination + "\\")) {
    throw new Error("Smoke destination must be separate from the reviewed source.");
  }
  // Copy an explicit allowlist: no API startup file, local variables, secrets,
  // deployment caches, dependency tree, or unrelated build artifacts.
  const entries = ["src", "public", "server", "migrations", "index.html", "package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts", "worker.mjs"];
  for (const entry of entries) await readFile(join(source, entry === "src" ? "src/event.json" : entry === "server" ? "server/event.mjs" : entry === "migrations" ? "migrations/0001_inventory.sql" : entry === "public" ? "public/series-004.svg" : entry));
  await mkdir(destination, { recursive: true });
  for (const entry of entries) await cp(join(source, entry), join(destination, entry), { recursive: true });
  await cp(join(root, "smoke-worker.mjs"), join(destination, "smoke-worker.mjs"));
  const original = JSON.parse(await readFile(join(source, "src/event.json"), "utf8"));
  if (original.priceKobo !== 200000) throw new Error("Reviewed public price must remain 200000 kobo.");
  await writeFile(join(destination, "src/event.json"), JSON.stringify({ ...original, priceKobo: 10000,
    edition: smokeEdition, theme: "Private payment verification", subtitle: "A real ₦100 charge. This is not admission to Series 004.",
    date: "Private payment check", time: "", venue: "Isolated verification inventory",
  }, null, 2) + "\n");
  await mkdir(privateDirectory, { recursive: true });
  const accessFile = join(privateDirectory, "smoke-access.txt");
  let access;
  try {
    access = new URL((await readFile(accessFile, "utf8")).trim()).searchParams.get("access");
    if (!/^[a-f0-9]{64}$/.test(access ?? "")) throw new Error("Existing private smoke access file is invalid.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    access = randomBytes(32).toString("hex");
    await writeFile(accessFile, `${origin}/?access=${access}\n`, { flag: "wx", mode: 0o600 });
  }
  const config = {
    name: "series-004-smoke", account_id: "6beb17d940b589d4fcba7fc5fcf0005e", main: "smoke-worker.mjs",
    compatibility_date: "2026-01-15", compatibility_flags: ["nodejs_compat"], workers_dev: true, preview_urls: false,
    assets: { directory: "./dist/worker-assets", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: true },
    vars: { BOOKING_MODE: "live", BOOKING_ORIGIN: origin, BOOKING_ENABLE_LIVE_MODE: "1", BOOKING_CHECKOUT_PAUSED: "0",
      BOOKING_PAYSTACK_CHANNELS: "card,bank_transfer", SMOKE_ENABLED: "1", SMOKE_DATABASE_ID: databaseId,
      SMOKE_ACCESS_HASH: createHash("sha256").update(access).digest("hex") },
    d1_databases: [{ binding: "DB", database_name: "series-004-smoke", database_id: databaseId }],
    ratelimits: [{ name: "API_RATE", namespace_id: "504005", simple: { limit: 180, period: 60 } },
      { name: "CHECKOUT_RATE", namespace_id: "504006", simple: { limit: 15, period: 60 } }],
    triggers: { crons: ["* * * * *"] },
  };
  await writeFile(join(destination, "wrangler.jsonc"), JSON.stringify(config, null, 2) + "\n");
  const dependencyDirectory = await realpath(join(source, "node_modules"));
  try { await symlink(dependencyDirectory, join(destination, "node_modules"), "junction"); }
  catch (error) {
    if (error.code !== "EEXIST" || await realpath(join(destination, "node_modules")) !== dependencyDirectory) throw error;
  }
  return { destination, accessFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const databaseId = process.argv[2];
  const origin = process.argv[3];
  await prepareSmoke({ source: join(root, "dist/series-004-cloudflare"), destination: join(root, "dist/series-004-smoke"),
    privateDirectory: join(root, ".booking-data"), databaseId, origin });
  console.log("Isolated smoke source prepared. Private access link saved in .booking-data/smoke-access.txt. No secrets printed.");
}
