import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { latePaymentReviewMs } from "../server/event.mjs";
import { digest, token } from "../server/http.mjs";
import worker from "../worker.mjs";
import { localBinding } from "./d1-binding.mjs";

const origin = "http://127.0.0.1:8791";

test("custom domains keep booking and organizer requests on their own approved origins", async (t) => {
  const { env, key } = runtime(t);
  const main = "https://myhighsandi.me";
  const admin = "https://admin.myhighsandi.me";
  const legacy = "https://series-004.edaraiquaibom16.workers.dev";
  Object.assign(env, {
    BOOKING_MODE: "test", PAYSTACK_SECRET_KEY: "sk_test_fixture",
    BOOKING_ORIGIN: main, BOOKING_ADMIN_ORIGIN: admin,
    BOOKING_LEGACY_ORIGIN: legacy, BOOKING_WWW_ORIGIN: "https://www.myhighsandi.me",
  });
  const request = (base, path, data, caller = base, cookie) => worker.fetch(new Request(base + path, {
    ...(data && { method: "POST", body: JSON.stringify(data),
      headers: { "content-type": "application/json", origin: caller, ...(cookie && { cookie }) } }),
  }), env);
  for (const base of [main, legacy]) {
    assert.equal((await request(base, "/api/seats")).status, 200);
    assert.equal(await (await request(base, "/payment?reference=fixture")).text(), "/payment");
  }
  const landing = await request(admin, "/");
  assert.equal(landing.status, 302);
  assert.equal(landing.headers.get("location"), admin + "/admin-login");
  assert.equal(await (await request(admin, "/admin-login")).text(), "/admin-login");
  assert.equal(await (await request(admin, "/assets/app.js")).text(), "/assets/app.js");
  assert.equal((await request(admin, "/api/seats")).status, 404);
  assert.equal((await request(admin, "/api/checkout", {})).status, 404);
  assert.equal((await request(admin, "/api/admin/records")).status, 401);
  const login = await request(admin, "/api/admin/login", { username: "rehearsal", password: key });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Path=\/api; Max-Age=3600; Secure/);
  assert.doesNotMatch(login.headers.get("set-cookie"), /Domain=/i);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await request(admin, "/api/admin/checkout", { paused: true }, main, cookie)).status, 403);
  assert.equal((await request("https://myhighsandi.me.evil.example", "/api/seats")).status, 421);
  const www = await request("https://www.myhighsandi.me", "//evil.example/payment?return=1");
  assert.equal(www.status, 308);
  assert.equal(www.headers.get("location"), main + "//evil.example/payment?return=1");
  assert.equal((await request("https://www.myhighsandi.me", "/api/admin/login", {})).status, 421);
  assert.equal((await request(legacy, "/api/paystack/webhook", {})).status, 401);
});

function runtime(t) {
  const { db, sqlite } = localBinding(t);
  const key = token();
  const env = {
    DB: db,
    ASSETS: { fetch: (request) => new Response(new URL(request.url).pathname) },
    BOOKING_MODE: "preview",
    BOOKING_ORIGIN: origin,
    BOOKING_ADMIN_ACCOUNTS: JSON.stringify({ rehearsal: digest(key) }),
  };
  const req = (path, { cookie, data, caller = origin } = {}) => worker.fetch(new Request(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(cookie && { cookie }),
      ...(data !== undefined && { "content-type": "application/json", origin: caller }),
    },
    ...(data !== undefined && { body: JSON.stringify(data) }),
  }), env);
  return { req, env, sqlite, key };
}

test("Worker shares same-origin booking routes and forwards SPA paths to assets", async (t) => {
  const { req, env } = runtime(t);
  assert.equal(await (await req("/payment?reference=fixture")).text(), "/payment");
  assert.equal((await worker.fetch(new Request("https://wrong.example/api/seats"), env)).status, 421);
  assert.equal((await req("/api/missing")).status, 404);
  assert.equal((await req("/api/checkout", { data: {}, caller: "https://other.example" })).status, 403);

  const [first, second] = await Promise.all([req("/api/seats"), req("/api/seats")]);
  assert.match(first.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const buyerCookies = [first, second].map((response) => response.headers.get("set-cookie").split(";")[0]);
  const reservations = await Promise.all(buyerCookies.map((cookie) => req("/api/checkout", {
    cookie, data: { requestId: randomUUID(), seat: "A1", name: "Preview Buyer", email: "buyer@example.test" },
  })));
  assert.deepEqual(reservations.map((response) => response.status).sort(), [201, 409]);
  const winner = reservations.findIndex((response) => response.status === 201);
  assert.equal((await req("/api/simulate", { cookie: buyerCookies[winner], data: { outcome: "paid" } })).status, 200);
  assert.equal((await req("/api/ticket", { cookie: buyerCookies[1 - winner] })).status, 404);
  const { ticket } = await (await req("/api/ticket", { cookie: buyerCookies[winner] })).json();
  assert.equal(ticket.seat, "A1");
});

test("Worker uses persistent organizer access keys, rate limits and scheduled hold expiry", async (t) => {
  const { req, env, sqlite, key } = runtime(t);
  const credentials = (password) => ({ data: { username: "rehearsal", password } });
  for (let i = 0; i < 4; i++) {
    assert.equal((await req("/api/admin/login", credentials(token()))).status, 401);
  }
  const login = await req("/api/admin/login", credentials(key));
  assert.equal(login.status, 200);
  assert.equal((await req("/api/admin/login", credentials(key))).status, 429);
  const organizerCookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await req("/api/admin/records", { cookie: organizerCookie })).status, 200);
  env.BOOKING_ADMIN_ACCOUNTS = JSON.stringify({ rehearsal: digest(token()) });
  assert.equal((await req("/api/admin/records", { cookie: organizerCookie })).status, 401);

  const seats = await req("/api/seats");
  const cookie = seats.headers.get("set-cookie").split(";")[0];
  assert.equal((await req("/api/checkout", {
    cookie, data: { requestId: randomUUID(), seat: "A2", name: "Preview Buyer", email: "buyer@example.test" },
  })).status, 201);
  sqlite.prepare("UPDATE attempts SET nextCheck = 1, expiresAt = 1 WHERE seat = 'A2'").run();
  await worker.scheduled({ scheduledTime: Date.now() }, env);
  const { booking } = await (await req("/api/verify", { cookie, data: {} })).json();
  assert.equal(booking.status, "expired");
});

test("a payment return can resolve an older attempt only within its booking session", async (t) => {
  const { req, sqlite } = runtime(t);
  const newCookie = async () => (await req("/api/seats")).headers.get("set-cookie").split(";")[0];
  const owner = await newCookie();
  const other = await newCookie();
  const claim = (seat) => req("/api/checkout", {
    cookie: owner,
    data: { requestId: randomUUID(), seat, name: "Fixture Buyer", email: "buyer@example.test" },
  });
  assert.equal((await claim("A1")).status, 201);
  const { ref } = sqlite.prepare("SELECT ref FROM attempts WHERE seat='A1'").get();
  assert.equal((await req("/api/simulate", { cookie: owner, data: { outcome: "failed" } })).status, 200);
  assert.equal((await claim("A2")).status, 201);
  const verify = async (cookie, data) => (await req("/api/verify", { cookie, data })).json();
  assert.equal((await verify(owner, {})).booking.status, "pending");
  assert.equal((await verify(owner, { reference: ref })).booking.status, "failed");
  assert.equal((await verify(other, { reference: ref })).booking, null);
});

test("Worker retries unverified signed webhooks and issues only one ticket", async (t) => {
  const { env, sqlite } = runtime(t);
  env.BOOKING_MODE = "test";
  env.BOOKING_ORIGIN = "https://staging.example.test";
  env.PAYSTACK_SECRET_KEY = " \nsk_test_fixture\n ";
  env.PAYSTACK_WEBHOOK_SECRET = "whsec_fixture";
  let reference;
  let status = "missing";
  let verifyCount = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer sk_test_fixture");
    if (url.endsWith("/initialize")) {
      ({ reference } = JSON.parse(options.body));
      return Response.json({ status: true, data: { reference, authorization_url: "https://checkout.paystack.com/fixture" } });
    }
    assert.ok(url.endsWith("/verify/" + reference));
    verifyCount++;
    if (status === "missing") return Response.json({ status: false, message: "Transaction reference not found" }, { status: 404 });
    return Response.json({ status: true, data: { reference, amount: 200_000, currency: "NGN", domain: "test", status } });
  });

  const request = (path, init) => worker.fetch(new Request(env.BOOKING_ORIGIN + path, init), env);
  const post = (path, cookie, data) => request(path, {
    method: "POST", headers: { cookie, origin: env.BOOKING_ORIGIN, "content-type": "application/json" }, body: JSON.stringify(data),
  });
  const checkout = async (seat) => {
    const response = await request("/api/seats");
    assert.match(response.headers.get("set-cookie"), /; Secure$/);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal((await post("/api/checkout", cookie, { requestId: randomUUID(), seat, name: "Test Buyer", email: "buyer@example.test" })).status, 201);
    return cookie;
  };
  const cookie = await checkout("B1");
  assert.equal((await request("/api/ticket", { headers: { cookie } })).status, 404);

  const webhook = (legacy = false) => {
    const body = `{ "event": "charge.success", "data": { "reference": "${reference}" } }`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha512", env.PAYSTACK_WEBHOOK_SECRET).update(timestamp + "." + body).digest("hex");
    const headers = legacy
      ? { "x-paystack-signature": createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(body).digest("hex") }
      : { "paystack-signature": `t=${timestamp},v1=whk_fixture:${signature}` };
    return request("/api/paystack/webhook", { method: "POST", headers, body });
  };
  assert.equal((await webhook(true)).status, 401);
  assert.equal(verifyCount, 0);
  assert.equal((await webhook()).status, 503);
  status = "pending";
  assert.equal((await webhook()).status, 503);
  assert.equal((await request("/api/ticket", { headers: { cookie } })).status, 404);
  status = "success";
  assert.equal((await webhook()).status, 200);
  assert.equal((await webhook()).status, 200);
  assert.equal(verifyCount, 3);
  const { ticket } = await (await request("/api/ticket", { headers: { cookie } })).json();
  assert.equal(ticket.seat, "B1");

  const oldBuyer = await checkout("B2");
  sqlite.prepare("UPDATE attempts SET status='expired', updatedAt=? WHERE ref=?").run(Date.now() - latePaymentReviewMs - 1000, reference);
  const { booking: old } = await (await post("/api/verify", oldBuyer, {})).json();
  assert.equal(old.status, "expired");
  assert.equal(verifyCount, 3);
  assert.equal((await webhook()).status, 200);
  const { booking: reviewed } = await (await post("/api/verify", oldBuyer, {})).json();
  assert.equal(reviewed.status, "exception");
  assert.equal(verifyCount, 4);
});
