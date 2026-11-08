import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createBookingApi } from "../server/booking-api.mjs";
import { openInventory } from "../server/inventory.mjs";
import { localBinding } from "./d1-binding.mjs";
import { digest } from "../server/http.mjs";

const origin = "http://127.0.0.1:5194";
for (const adapter of ["SQLite", "D1"]) {
  test(`${adapter}: repeat payments preserve tickets, ownership and one unfinished checkout`, async (t) => {
    const inventory = adapter === "D1" ? localBinding(t).inventory : openInventory(":memory:");
    if (adapter === "SQLite") t.after(() => inventory.close());
    await inventory.bindMode("preview");
    const api = createBookingApi({ origin, mode: "preview", inventory });
    const req = (route, cookie, data) => api.fetch(new Request(origin + "/api/" + route, {
      headers: { ...(cookie && { cookie }), ...(data && { origin, "content-type": "application/json" }) },
      ...(data && { method: "POST", body: JSON.stringify(data) }),
    }));
    const owner = (await req("seats")).headers.get("set-cookie").split(";")[0];
    const other = (await req("seats")).headers.get("set-cookie").split(";")[0];
    const draft = (seat, afterTicket, requestId = randomUUID()) => ({
      seat, afterTicket, requestId, name: "Repeat Buyer", email: "repeat@example.test",
    });
    const firstDraft = draft("A1");
    assert.equal((await req("checkout", owner, firstDraft)).status, 201);
    await req("simulate", owner, { outcome: "paid" });
    const first = (await (await req("ticket", owner)).json()).ticket;
    // Ordinary reload/replay must not begin another charge.
    assert.equal((await (await req("checkout", owner, draft("A2"))).json()).status, "paid");
    assert.equal((await (await req("checkout", owner, firstDraft)).json()).ticket.id, first.id);
    assert.equal((await (await req("seats", owner)).json()).canBookAnother, true);
    assert.equal((await req("ticket?id=" + first.id, other)).status, 404);
    assert.deepEqual((await (await req("tickets", other)).json()).tickets, []);

    const secondDraft = draft("A2", first.id);
    const attempts = await Promise.all([
      req("checkout", owner, secondDraft), req("checkout", owner, draft("A3", first.id)),
    ]);
    assert.equal(attempts.filter(response => response.status === 201).length, 1);
    assert.equal((await (await req("seats", owner)).json()).canBookAnother, false);
    assert.equal((await (await req("verify", owner, {})).json()).booking.status, "pending");
    assert.equal((await (await req("ticket?id=" + first.id, owner)).json()).ticket.id, first.id);
    await req("simulate", owner, { outcome: "paid" });
    const second = (await (await req("ticket", owner)).json()).ticket;
    assert.notEqual(second.id, first.id);
    assert.deepEqual((await (await req("tickets", owner)).json()).tickets.map(ticket => ticket.id), [second.id, first.id]);
    assert.equal((await (await req("checkout", owner, secondDraft)).json()).ticket.id, second.id);
    assert.deepEqual((await (await req("seats", owner)).json()).seats, { A1: "sold", A2: "sold" });
    // A foreign ticket ID cannot authorize an additional purchase.
    await req("checkout", other, draft("B1"));
    await req("simulate", other, { outcome: "paid" });
    const foreign = (await (await req("ticket", other)).json()).ticket;
    assert.equal((await (await req("checkout", owner, draft("A4", foreign.id))).json()).status, "paid");
    assert.equal((await (await req("tickets", owner)).json()).tickets.length, 2);
    // A failed third payment leaves both previous tickets usable and can be retried.
    assert.equal((await req("checkout", owner, draft("A4", second.id))).status, 201);
    await req("simulate", owner, { outcome: "failed" });
    assert.equal((await (await req("verify", owner, {})).json()).booking.status, "failed");
    assert.equal((await (await req("ticket?id=" + first.id, owner)).json()).ticket.id, first.id);
    assert.equal((await req("checkout", owner, draft("A5", second.id))).status, 201);
    const active = await inventory.latest(digest(owner.slice(owner.indexOf("=") + 1)));
    await inventory.settle(active, "exception");
    assert.equal((await (await req("checkout", owner, draft("A6", second.id))).json()).status, "exception");
    assert.equal((await (await req("tickets", owner)).json()).tickets.length, 2);
  });
}

test("legacy session-index upgrade preserves paid records and survives reopen with multiple tickets", () => {
  const folder = mkdtempSync(join(tmpdir(), "series004-repeat-upgrade-"));
  const path = join(folder, "booking.sqlite");
  let inventory;
  try {
    inventory = openInventory(path);
    inventory.bindMode("preview");
    const draft = { session: "legacy", seat: "A1", requestId: randomUUID(), mode: "preview", name: "Legacy Buyer", email: "legacy@example.test" };
    const { created } = inventory.claim(draft);
    const first = inventory.settle(created, "paid");
    inventory.close();
    inventory = undefined;
    const legacy = new DatabaseSync(path);
    legacy.exec("DROP INDEX session_allocation; CREATE UNIQUE INDEX session_allocation ON attempts(session) WHERE status IN ('initializing','pending','paid')");
    const before = legacy.prepare("SELECT * FROM attempts").all();
    legacy.close();
    inventory = openInventory(path);
    assert.equal(inventory.tickets("legacy")[0].id, first.ticketId);
    const { created: second } = inventory.claim({ ...draft, seat: "A2", requestId: randomUUID(), afterTicket: first.ticketId });
    assert.ok(second);
    inventory.settle(second, "paid");
    inventory.close();
    inventory = openInventory(path);
    assert.equal(inventory.tickets("legacy").length, 2);
    assert.deepEqual(inventory.get(first.ref), before[0]);
    assert.deepEqual(inventory.availability(), { A1: "sold", A2: "sold" });
  } finally {
    inventory?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("D1 migration changes only session uniqueness and preserves existing paid data", async (t) => {
  const { sqlite, inventory } = localBinding(t);
  await inventory.bindMode("preview");
  sqlite.exec("DROP INDEX session_allocation; CREATE UNIQUE INDEX session_allocation ON attempts(session) WHERE status IN ('initializing','pending','paid')");
  const draft = { session: "legacy", seat: "A1", requestId: randomUUID(), mode: "preview", name: "Legacy Buyer", email: "legacy@example.test" };
  const { created } = await inventory.claim(draft);
  const first = await inventory.settle(created, "paid");
  const before = sqlite.prepare("SELECT * FROM attempts").all();
  sqlite.exec(readFileSync(new URL("../migrations/0004_repeat_bookings.sql", import.meta.url), "utf8"));
  assert.deepEqual(sqlite.prepare("SELECT * FROM attempts").all(), before);
  const { created: second } = await inventory.claim({ ...draft, seat: "A2", requestId: randomUUID(), afterTicket: first.ticketId });
  assert.ok(second);
  assert.equal((await inventory.settle(second, "paid")).status, "paid");
  assert.equal((await inventory.tickets("legacy")).length, 2);
});
