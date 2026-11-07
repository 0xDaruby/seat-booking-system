import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { hashAdminPassword, loadAdminAccounts } from "../server/admin.mjs";
import { digest } from "../server/http.mjs";
import { createBookingServer } from "../server/index.mjs";
import { graceMs, holdMs, openInventory } from "../server/inventory.mjs";
import { paystack } from "../server/paystack.mjs";

const password = randomUUID();
const accounts = loadAdminAccounts(JSON.stringify({ rehearsal: hashAdminPassword(password) }));
const origin = "http://127.0.0.1:5184";
const testSecret = "sk_test_rehearsal";
const attendee = { name: "Fixture Guest", email: "guest@example.test" };

function provider(origin) {
  const transactions = new Map();
  let unavailable = false;
  const gateway = paystack(testSecret, origin, async (url, request) => {
    if (unavailable) throw new Error("Simulated network interruption");
    if (url.endsWith("/initialize")) {
      const { reference, amount, currency } = JSON.parse(request.body);
      transactions.set(reference, { reference, amount: Number(amount), currency, domain: "test", status: "pending" });
      return Response.json({ status: true, data: { reference, authorization_url: "https://checkout.paystack.com/rehearsal" } });
    }
    const transaction = transactions.get(url.split("/").at(-1));
    return transaction ? Response.json({ status: true, data: transaction }) :
      Response.json({ status: false, message: "Transaction reference not found" }, { status: 404 });
  });
  return {
    gateway, transactions,
    setUnavailable(value) { unavailable = value; },
  };
}

async function runtime(t, { mode = "preview", gateway, forcePause = false, publicOrigin = origin, inventory = openInventory(":memory:") } = {}) {
  const server = createBookingServer({ origin: publicOrigin, mode, gateway, inventory, accounts, forcePause });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    inventory.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const req = (route, { cookie, data, headers, raw } = {}) => fetch(base + "/api/" + route, {
    headers: { ...(cookie && { Cookie: cookie }), ...((data || raw) && { Origin: publicOrigin, "Content-Type": "application/json" }), ...headers },
    ...((data || raw) && { method: "POST", body: raw ?? JSON.stringify(data) }),
  });
  const getCookie = (response) => response.headers.get("set-cookie").split(";")[0];
  async function login() {
    const response = await req("admin/login", { data: { username: "rehearsal", password } });
    assert.equal(response.status, 200);
    return getCookie(response);
  }
  const guest = async () => getCookie(await req("seats"));
  const checkout = (cookie, seat, fields = {}) => req("checkout", { cookie, data: {
    seat, requestId: randomUUID(), ...attendee, ...fields,
  } });
  return { req, login, guest, checkout, inventory };
}

const signed = (reference, valid = true) => {
  const raw = JSON.stringify({ event: "charge.success", data: { reference } });
  const signature = valid ? createHmac("sha512", testSecret).update(raw).digest("hex") : "f".repeat(128);
  return { raw, headers: { "x-paystack-signature": signature, Origin: "https://webhook.example.test" } };
};

test("organizer permissions, audited simulated release, booking ownership and spreadsheet-safe CSV", async (t) => {
  const { req, login, guest, checkout } = await runtime(t);
  const guests = [await guest(), await guest()];
  const results = await Promise.all(guests.map((cookie) => checkout(cookie, "A1", { name: '=SUM(1,2) "Guest"' })));
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
  const winner = results.findIndex((response) => response.status === 201);
  const purchaser = guests[winner];
  const second = guests[1 - winner];
  assert.equal((await req("simulate", { cookie: purchaser, data: { outcome: "paid" } })).status, 200);
  const { ticket } = await (await req("ticket", { cookie: purchaser })).json();
  assert.equal(ticket.seat, "A1");
  assert.equal((await req("ticket?id=" + ticket.id, { cookie: second })).status, 404);
  assert.equal((await req("ticket?id=altered", { cookie: purchaser })).status, 404);
  assert.deepEqual((await (await req("ticket", { cookie: purchaser })).json()).ticket, ticket);
  assert.equal((await req("admin/records", { cookie: purchaser })).status, 401);
  assert.equal((await req("admin/booking?ref=any", { cookie: purchaser })).status, 401);
  assert.equal((await req("admin/export", { cookie: purchaser })).status, 401);
  assert.equal((await req("admin/release", { cookie: purchaser, data: { ref: "any" } })).status, 401);

  const admin = await login();
  assert.equal((await checkout(second, "B1")).status, 201);
  const { records } = await (await req("admin/records", { cookie: admin })).json();
  const sold = records.find((row) => row.seat === "A1");
  assert.ok(records.every(row => row.status === "paid"));
  const { records: paymentAttempts } = await (await req("admin/records?view=attempts", { cookie: admin })).json();
  const held = paymentAttempts.find((row) => row.seat === "B1");
  assert.equal((await req("admin/release", { cookie: admin, data: { ref: sold.ref } })).status, 409);
  assert.equal((await req("admin/release", { cookie: admin, data: { ref: held.ref }, headers: { Origin: "https://wrong.example.test" } })).status, 403);
  assert.equal((await req("admin/release", { cookie: admin, data: { ref: held.ref } })).status, 200);
  assert.equal((await req("admin/release", { cookie: admin, data: { ref: held.ref } })).status, 409);
  const { booking } = await (await req("admin/booking?ref=" + held.ref, { cookie: admin })).json();
  assert.equal(booking.status, "expired");
  assert.equal(booking.auditTrail.length, 1);
  assert.equal(booking.auditTrail[0].actor, "rehearsal");
  assert.equal(booking.auditTrail[0].action, "hold released");
  assert.equal((await checkout(second, "B1")).status, 201);
  const csv = await (await req("admin/export", { cookie: admin })).text();
  assert.ok(csv.includes(ticket.id));
  assert.ok(csv.includes(`"'=SUM(1,2) ""Guest"""`));
  assert.equal((await req("admin/logout", { cookie: admin, data: {} })).status, 200);
  assert.equal((await req("admin/export", { cookie: admin })).status, 401);
});

test("pausing new checkout leaves hosted attempts and issued tickets available", async (t) => {
  const fixture = provider(origin);
  const { req, login, guest, checkout } = await runtime(t, { mode: "test", gateway: fixture.gateway });
  const buyer = await guest();
  const shopper = await guest();
  const admin = await login();
  assert.equal((await checkout(buyer, "C1")).status, 201);
  const [reference] = fixture.transactions.keys();
  await req("admin/checkout", { cookie: admin, data: { paused: true } });
  assert.equal((await checkout(shopper, "C2")).status, 423);
  assert.equal((await (await req("seats", { cookie: shopper })).json()).checkoutPaused, true);
  const pending = await (await req("verify", { cookie: buyer, data: {} })).json();
  assert.equal(pending.booking.status, "pending");

  assert.equal((await req("paystack/webhook", signed(reference, false))).status, 401);
  fixture.transactions.get(reference).status = "success";
  const responses = await Promise.all([
    req("paystack/webhook", signed(reference)),
    req("verify", { cookie: buyer, data: {} }),
    req("paystack/webhook", signed(reference)),
  ]);
  assert.ok(responses.every((response) => response.ok));
  const original = await (await req("ticket", { cookie: buyer })).json();
  fixture.setUnavailable(true);
  assert.equal((await req("paystack/webhook", signed(reference))).status, 200);
  assert.deepEqual(await (await req("ticket", { cookie: buyer })).json(), original);
  assert.equal((await checkout(shopper, "C2")).status, 423);
  fixture.setUnavailable(false);
  await req("admin/checkout", { cookie: admin, data: { paused: false } });
  assert.equal((await checkout(shopper, "C2")).status, 201);
  const dashboard = await (await req("admin/records", { cookie: admin })).json();
  assert.equal(dashboard.checkoutChange.action, "checkout opened");
  assert.equal(dashboard.checkoutChange.actor, "rehearsal");
});

test("provider failure keeps a hold, verified late success becomes an auditable exception", async (t) => {
  const fixture = provider(origin);
  const { req, login, guest, checkout, inventory } = await runtime(t, { mode: "test", gateway: fixture.gateway });
  const previous = await guest();
  const replacement = await guest();
  const admin = await login();
  const session = digest(previous.split("=")[1]);
  const claim = inventory.claim({ session, seat: "D1", ...attendee, mode: "test", requestId: randomUUID() },
    Date.now() - holdMs - graceMs - 100);
  const { ref, amount, currency } = claim.created;
  const record = { reference: ref, amount, currency, domain: "test", status: "ongoing" };
  fixture.transactions.set(ref, record);

  fixture.setUnavailable(true);
  assert.equal((await req("admin/release", { cookie: admin, data: { ref } })).status, 503);
  assert.equal((await checkout(replacement, "D1")).status, 409);
  fixture.setUnavailable(false);
  fixture.transactions.set(ref, { ...record, amount: 1 });
  assert.equal((await (await req("admin/release", { cookie: admin, data: { ref } })).json()).released, false);
  fixture.transactions.set(ref, record);
  assert.equal((await (await req("admin/release", { cookie: admin, data: { ref } })).json()).released, true);
  assert.equal((await checkout(replacement, "D1")).status, 201);

  record.status = "success";
  assert.equal((await req("paystack/webhook", signed(ref))).status, 200);
  const exception = await (await req("verify", { cookie: previous, data: {} })).json();
  assert.equal(exception.booking.status, "exception");
  assert.equal((await req("ticket", { cookie: previous })).status, 404);
  assert.equal(inventory.availability().D1, "held");
  const resolution = { ref, outcome: "refund-confirmed", note: "Simulated refund confirmed in provider records." };
  assert.equal((await req("admin/resolution", { cookie: replacement, data: resolution })).status, 401);
  assert.equal((await req("admin/resolution", { cookie: admin, data: resolution })).status, 200);
  assert.equal((await req("admin/resolution", { cookie: admin, data: resolution })).status, 409);
  const { booking } = await (await req("admin/booking?ref=" + ref, { cookie: admin })).json();
  assert.equal(booking.status, "exception");
  assert.equal(booking.ticketId, null);
  assert.equal(booking.resolution.actor, "rehearsal");
  assert.equal(booking.auditTrail.filter((row) => row.action === "exception resolved").length, 1);
  const resolved = await (await req("verify", { cookie: previous, data: {} })).json();
  assert.equal(resolved.booking.status, "resolved");
  assert.equal(JSON.stringify(resolved).includes(resolution.note), false);
});

test("additive SQLite schema preserves issued tickets and organizer state across reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "series004-migration-"));
  const path = join(dir, "bookings.sqlite");
  try {
    let store = openInventory(path);
    const { created } = store.claim({ ...attendee, seat: "J10", session: "guest", mode: "preview", requestId: randomUUID() });
    const ticket = store.settle(created, "paid").ticketId;
    store.close();
    const originalShape = new DatabaseSync(path);
    originalShape.exec("DROP TABLE organizer_audit; DROP TABLE organizer_sessions; DROP TABLE payment_resolutions; DROP TABLE booking_settings");
    originalShape.close();

    store = openInventory(path);
    store.bindMode("preview");
    store.setPaused(true, "rehearsal");
    store.startAdminSession("fixture-session", "rehearsal", "fixture-credential", Date.now() + 60_000);
    store.close();
    store = openInventory(path);
    assert.equal(store.latest("guest").ticketId, ticket);
    assert.equal(store.checkoutHistory().action, "checkout paused");
    assert.equal(store.findAdminSession("fixture-session").actor, "rehearsal");
    assert.equal(store.isPaused(), true);
    assert.throws(() => store.bindMode("test"), /belongs to another mode/);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTPS test cookies are secure and the server pause override cannot be reopened by an organizer", async (t) => {
  const publicOrigin = "https://rehearsal.example.test";
  const { req, login, guest, checkout } = await runtime(t, {
    mode: "test", gateway: provider(publicOrigin).gateway, forcePause: true, publicOrigin,
  });
  assert.match((await req("seats")).headers.get("set-cookie"), /HttpOnly; SameSite=Lax.*; Secure/);
  const loginResponse = await req("admin/login", { data: { username: "rehearsal", password } });
  assert.match(loginResponse.headers.get("set-cookie"), /HttpOnly; SameSite=Strict.*; Secure/);
  const admin = await login();
  assert.equal((await req("admin/checkout", { cookie: admin, data: { paused: false } })).status, 409);
  assert.equal((await checkout(await guest(), "E1")).status, 423);
});

test("live configuration requires matching credentials and channels, and a fresh database opens paused", async (t) => {
  const publicOrigin = "https://release.example.test";
  assert.throws(() => paystack(testSecret, publicOrigin, fetch, { mode: "live", channels: ["card"] }), /match/);
  assert.throws(() => paystack("sk_live_fixture", publicOrigin, fetch, { mode: "live" }), /channels/);
  let transaction;
  const gateway = paystack("sk_live_fixture", publicOrigin, async (url, request) => {
    if (transaction && url.endsWith("/verify/" + transaction.reference)) {
      return Response.json({ status: true, data: transaction });
    }
    assert.ok(url.endsWith("/initialize"));
    const { reference, amount, currency, callback_url, channels } = JSON.parse(request.body);
    assert.equal(amount, "200000");
    assert.equal(currency, "NGN");
    assert.equal(callback_url, publicOrigin + "/payment?return=1");
    assert.deepEqual(channels, ["bank_transfer"]);
    transaction = { reference, amount: Number(amount), currency, domain: "live", status: "success" };
    return Response.json({ status: true, data: { reference, authorization_url: "https://checkout.paystack.com/rehearsal" } });
  }, { mode: "live", channels: ["bank_transfer"] });
  const { req, login, guest, checkout } = await runtime(t, { mode: "live", gateway, publicOrigin });
  const buyer = await guest();
  assert.equal((await checkout(buyer, "E2")).status, 423);
  assert.equal(transaction, undefined);
  const organizer = await login();
  assert.equal((await req("admin/checkout", { cookie: organizer, data: { paused: false } })).status, 200);
  const response = await checkout(buyer, "E2");
  assert.equal(response.status, 201);
  assert.equal((await response.json()).checkoutUrl, "https://checkout.paystack.com/rehearsal");
  assert.equal((await req("simulate", { cookie: buyer, data: { outcome: "paid" } })).status, 404);
  assert.equal((await req("ticket", { cookie: buyer })).status, 404);
  const verified = await req("verify", { cookie: buyer, data: {} });
  assert.equal(verified.status, 200);
  const { booking } = await verified.json();
  assert.equal(booking.status, "paid");
  assert.equal(booking.ticket.seat, "E2");
  const ticket = await req("ticket", { cookie: buyer });
  assert.equal(ticket.status, 200);
  assert.deepEqual((await ticket.json()).ticket, booking.ticket);
});
