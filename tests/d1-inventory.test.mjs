import assert from "node:assert/strict";
import test from "node:test";
import { openD1Inventory } from "../server/d1-inventory.mjs";
import { holdMs } from "../server/event.mjs";
import { localBinding } from "./d1-binding.mjs";

const start = 1_000_000_000;
const claim = (inventory, session, seat, requestId = "one", mode = "preview") => inventory.claim({
  session, seat, requestId, mode, name: "Example Guest", email: "test@example.test",
}, start);

test("mode binds once, refuses foreign attempts and starts fresh live checkout paused", async (t) => {
  const { sqlite, inventory } = localBinding(t);
  await inventory.bindMode("preview");
  await claim(inventory, "session", "A1");
  sqlite.exec("DELETE FROM booking_settings WHERE key='mode'");
  await assert.rejects(inventory.bindMode("test"), /belongs to another mode/);
  assert.equal(sqlite.prepare("SELECT count(*) AS total FROM booking_settings").get().total, 0);
  await inventory.bindMode("preview");
  await assert.rejects(inventory.bindMode("live"), /belongs to another mode/);

  const { inventory: live } = localBinding(t);
  await live.bindMode("live");
  assert.equal(await live.isPaused(), true);
  assert.deepEqual(await claim(live, "session", "A1", "one", "live"), { paused: true });
  await live.setPaused(false, "organizer", start);
  await live.bindMode("live");
  assert.equal(await live.isPaused(), false);
  assert.equal((await live.checkoutHistory()).action, "checkout opened");
  assert.equal((await claim(live, "session", "A1", "one", "live")).created.seat, "A1");
});

test("same-seat claims, same-session attempts and checkout pause are atomic", async (t) => {
  const { db, inventory } = localBinding(t);
  const otherWorker = openD1Inventory(db);
  await inventory.bindMode("preview");
  const outcomes = await Promise.all(Array.from({ length: 25 }, (_, i) => claim(
    i % 2 ? inventory : otherWorker, "session-" + i, "A1",
  )));
  const [{ created: winner }] = outcomes.filter((outcome) => outcome.created);
  assert.equal(outcomes.filter((outcome) => outcome.created).length, 1);
  assert.equal((await claim(otherWorker, winner.session, "B1", "two")).existing.ref, winner.ref);
  await inventory.setPaused(true, "organizer", start);
  assert.deepEqual(await claim(otherWorker, "new", "B1"), { paused: true });
  assert.equal((await claim(otherWorker, winner.session, "A1")).existing.ref, winner.ref);
  assert.deepEqual(await inventory.availability(), { A1: "held" });
});

test("CAS settlement preserves one ticket and a released seat can only produce an exception", async (t) => {
  const { inventory } = localBinding(t);
  await inventory.bindMode("preview");
  const { created: first } = await claim(inventory, "first", "A1");
  const pending = await inventory.initialized(first.ref, "/preview-checkout", start);
  assert.equal((await inventory.settle(first, "paid", start)).status, "pending");
  const outcomes = await Promise.all([inventory.settle(pending, "paid", start), inventory.settle(pending, "paid", start)]);
  assert.equal(outcomes[0].status, "paid");
  assert.equal(outcomes[1].ticketId, outcomes[0].ticketId);
  assert.deepEqual(await inventory.availability(), { A1: "sold" });

  const { created: second } = await claim(inventory, "second", "A2");
  assert.equal(await inventory.releasePreview(second.ref, "organizer", start), true);
  assert.equal((await claim(inventory, "second", "A2")).existing.status, "expired");
  const { created: replacement } = await claim(inventory, "replacement", "A2");
  assert.equal(replacement.seat, "A2");
  const stale = await inventory.settle(second, "paid", start);
  assert.equal(stale.status, "expired");
  assert.equal((await inventory.settle(stale, "paid", start)).status, "expired");
  assert.equal((await inventory.settle(stale, "exception", start)).ticketId, null);
  assert.equal((await inventory.detail(second.ref)).auditTrail[0].action, "hold released");
  assert.equal((await inventory.exportRows()).find((row) => row.ref === first.ref).attendee, "Example Guest");
});

test("exception resolution and organizer sessions preserve atomicity and expiry", async (t) => {
  const { inventory } = localBinding(t);
  await inventory.bindMode("preview");
  const { created } = await claim(inventory, "first", "A1");
  await inventory.settle(created, "exception", start);
  await assert.rejects(inventory.recordResolution(created.ref, "invalid", "note", "organizer", start));
  assert.deepEqual((await inventory.detail(created.ref)).auditTrail, []);
  const outcomes = await Promise.all([1, 2].map(() => inventory.recordResolution(
    created.ref, "refund-confirmed", "note", "organizer", start,
  )));
  assert.deepEqual(outcomes.sort(), [false, true]);
  const detail = await inventory.detail(created.ref);
  assert.equal(detail.resolution.outcome, "refund-confirmed");
  assert.equal(detail.auditTrail.length, 1);
  assert.equal((await inventory.latest(created.session)).resolved, 1);
  await inventory.startAdminSession("original", "organizer", "secret-hash", start + 10, null, start);
  await inventory.startAdminSession("replacement", "organizer", "secret-hash", start + 10, "original", start);
  assert.equal(await inventory.findAdminSession("original", start), null);
  assert.equal((await inventory.findAdminSession("replacement", start)).actor, "organizer");
  assert.equal(await inventory.findAdminSession("replacement", start + 10), null);
  await inventory.endAdminSession("replacement");
  assert.equal(await inventory.findAdminSession("replacement", start), null);
});

test("due checks prefer active holds and honor the requested batch size", async (t) => {
  const { inventory } = localBinding(t);
  await inventory.bindMode("preview");
  const { created: first } = await claim(inventory, "first", "A1");
  const { created: second } = await claim(inventory, "second", "A2");
  await inventory.releasePreview(first.ref, "organizer", start);
  assert.deepEqual(await inventory.due(start + holdMs, -1), []);
  assert.equal((await inventory.due(start + holdMs, 1))[0].ref, second.ref);
  assert.deepEqual((await inventory.due(start + holdMs, 2)).map(({ ref }) => ref), [second.ref, first.ref]);
});

test("due checks reserve two slots for closed attempts and fill any unused slots", async (t) => {
  const { inventory } = localBinding(t);
  await inventory.bindMode("preview");
  const active = [];
  const closed = [];
  for (let i = 1; i <= 7; i++) {
    const { created } = await claim(inventory, "active-" + i, "A" + i);
    active.push(created);
  }
  for (let i = 1; i <= 5; i++) {
    const { created } = await claim(inventory, "closed-" + i, "B" + i);
    closed.push(await inventory.settle(created, "expired", start + i));
  }
  const due = () => inventory.due(start + holdMs + 10, 6);
  assert.deepEqual((await due()).map(({ status }) => status), ["initializing", "initializing", "initializing", "initializing", "expired", "expired"]);

  for (const attempt of active.slice(1)) await inventory.settle(attempt, "paid", start);
  assert.deepEqual((await due()).map(({ ref }) => ref), [active[0].ref, ...closed.map(({ ref }) => ref)]);

  for (const attempt of closed.slice(1)) await inventory.settle(attempt, "exception", start);
  for (let i = 1; i <= 6; i++) await claim(inventory, "new-" + i, "C" + i);
  assert.deepEqual((await due()).map(({ status }) => status), ["initializing", "initializing", "initializing", "initializing", "initializing", "expired"]);
});

test("shared rate-limit increments are atomic, key capacity is bounded and expired keys are pruned", async (t) => {
  const { db, sqlite, inventory } = localBinding(t);
  const otherWorker = openD1Inventory(db);
  const outcomes = await Promise.all([inventory, otherWorker, inventory].map((worker) => worker.takeRateLimit("login:client", start, 2, 60_000)));
  assert.equal(outcomes.filter(Boolean).length, 2);
  assert.equal(await inventory.takeRateLimit("login:client", start + 60_000, 2, 60_000), true);

  const insert = sqlite.prepare("INSERT INTO booking_rate_limits(key,count,expiresAt) VALUES(?,1,?)");
  sqlite.exec("BEGIN IMMEDIATE");
  for (let index = 0; index < 4095; index++) insert.run("key-" + index, start + 120_000);
  sqlite.exec("COMMIT");
  assert.equal(await inventory.takeRateLimit("login:new-client", start + 60_000, 2, 60_000), false);
  assert.equal(await inventory.takeRateLimit("login:client", start + 60_000, 2, 60_000), true);
  assert.equal(await inventory.takeRateLimit("login:new-client", start + 120_000, 2, 60_000), true);
  assert.equal(sqlite.prepare("SELECT used FROM booking_rate_limit_capacity WHERE id=1").get().used, 4081);
});
