import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSmokeWorker } from "../smoke-worker.mjs";
import { prepareSmoke } from "../scripts/prepare-smoke.mjs";

const access = "1".repeat(64);
const origin = "https://series-004-smoke.example.workers.dev";
const env = { SMOKE_ENABLED: "1", BOOKING_MODE: "live", BOOKING_ENABLE_LIVE_MODE: "1", BOOKING_ORIGIN: origin,
  SMOKE_DATABASE_ID: "637ba20d-fa1d-43bc-a7fe-e3a88f7beb85", SMOKE_ACCESS_HASH: createHash("sha256").update(access).digest("hex") };
const smokeEvent = { priceKobo: 10000, edition: "SMOKE TEST — NOT AN EVENT TICKET" };

test("private smoke gate guards HTML and API, strips access links and permits only the signed-webhook route", async () => {
  let calls = 0;
  const worker = createSmokeWorker({ fetch() { calls++; return new Response("delegate", { status: 401 }); } }, smokeEvent);
  const request = (path, options, config = env) => worker.fetch(new Request(origin + path, options), config);
  for (const path of ["/", "/api/seats", "/assets/app.js", "/api/paystack/webhook"]) {
    const response = await request(path);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 0);
  assert.equal((await request("/?access=" + "2".repeat(64))).status, 404);
  const opened = await request("/payment?access=" + access + "&return=1");
  assert.equal(opened.status, 303);
  assert.equal(opened.headers.get("location"), "/payment?return=1");
  assert.match(opened.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=3600/);
  assert.equal(await opened.text(), "");
  const cookie = opened.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/seats", { headers: { Cookie: cookie } })).status, 401);
  assert.equal((await request("/api/paystack/webhook", { method: "POST", body: "{}" })).status, 401);
  assert.equal(calls, 2);
  assert.equal((await request("/api/paystack/webhook/", { method: "POST" })).status, 404);
  assert.equal((await request("/?access=" + access, { method: "POST" })).status, 404);
});

test("smoke fetch and cron fail closed for public pricing, reused databases, wrong mode or hostname", async () => {
  let calls = 0;
  const delegate = { fetch() { calls++; return new Response("ok"); }, scheduled() { calls++; } };
  const request = new Request(origin + "/", { headers: { Cookie: `s004_smoke=${access}` } });
  const candidates = [
    [{ ...env, SMOKE_ENABLED: "0" }, smokeEvent],
    [{ ...env, BOOKING_MODE: "test" }, smokeEvent],
    [{ ...env, SMOKE_ACCESS_HASH: "bad" }, smokeEvent],
    [{ ...env, BOOKING_ORIGIN: "https://series-004.example.workers.dev" }, smokeEvent],
    [{ ...env, SMOKE_DATABASE_ID: "84c43b82-77f9-44cb-8eb1-3054b66d193c" }, smokeEvent],
    [{ ...env, SMOKE_DATABASE_ID: "10398fa5-b8f5-4e68-938d-51c87a046cb0" }, smokeEvent],
    [env, { ...smokeEvent, priceKobo: 200000 }],
    [env, { ...smokeEvent, edition: "Series 004" }],
  ];
  for (const [config, event] of candidates) {
    const worker = createSmokeWorker(delegate, event);
    assert.equal((await worker.fetch(request, config)).status, 404);
    await worker.scheduled({}, config);
  }
  assert.equal(calls, 0);
  await createSmokeWorker(delegate, smokeEvent).scheduled({}, env);
  assert.equal(calls, 1);
});

test("smoke preparation isolates amount, binding, assets and private access without changing source", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "series004-smoke-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "reviewed");
  const destination = join(directory, "smoke");
  for (const folder of ["src", "public", "server", "migrations", "node_modules", ".booking-data"]) await mkdir(join(source, folder), { recursive: true });
  const original = JSON.stringify({ priceKobo: 200000, edition: "Series 004" });
  await writeFile(join(source, "src/event.json"), original);
  for (const file of ["public/series-004.svg", "server/event.mjs", "migrations/0001_inventory.sql", "index.html", "package.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts", "worker.mjs"]) await writeFile(join(source, file), "{}");
  await writeFile(join(source, ".dev.vars"), "must-not-copy");
  await writeFile(join(source, ".booking-data/private.txt"), "must-not-copy");
  const options = { source, destination, privateDirectory: join(directory, "private"), databaseId: env.SMOKE_DATABASE_ID, origin };
  for (const databaseId of ["84c43b82-77f9-44cb-8eb1-3054b66d193c", "10398fa5-b8f5-4e68-938d-51c87a046cb0", "invalid"]) {
    await assert.rejects(prepareSmoke({ ...options, databaseId }), /separate smoke D1/);
  }
  await prepareSmoke(options);
  const prepared = JSON.parse(await readFile(join(destination, "src/event.json"), "utf8"));
  assert.equal(prepared.priceKobo, 10000);
  assert.equal(prepared.edition, smokeEvent.edition);
  assert.equal(await readFile(join(source, "src/event.json"), "utf8"), original);
  const config = JSON.parse(await readFile(join(destination, "wrangler.jsonc"), "utf8"));
  assert.equal(config.d1_databases[0].database_id, options.databaseId);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.vars.BOOKING_CHECKOUT_PAUSED, "0");
  assert.equal(config.env, undefined);
  for (const file of [".dev.vars", ".booking-data/private.txt"]) await assert.rejects(readFile(join(destination, file)), { code: "ENOENT" });
  const privateLink = await readFile(join(directory, "private/smoke-access.txt"), "utf8");
  assert.match(new URL(privateLink.trim()).searchParams.get("access"), /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(config).includes(new URL(privateLink.trim()).searchParams.get("access")), false);
  await prepareSmoke(options);
  assert.equal(await readFile(join(directory, "private/smoke-access.txt"), "utf8"), privateLink);
});
