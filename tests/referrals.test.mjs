import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import codes from "../server/referral-codes.json" with { type: "json" };
import { normalizeReferralCode } from "../server/referrals.mjs";
import { createBookingApi } from "../server/booking-api.mjs";
import { digest, token } from "../server/http.mjs";
import { openInventory } from "../server/inventory.mjs";
import { localBinding } from "./d1-binding.mjs";

test("the referral allowlist has exactly 55 unique codes and normalizes only approved values", () => {
  assert.equal(codes.length, 55);
  assert.equal(new Set(codes).size, 55);
  const roster = readFileSync(new URL("../referral-codes.csv", import.meta.url), "utf8").trim().split(/\r?\n/).slice(1)
    .map(row => row.split(",")[1]);
  assert.deepEqual(roster, codes);
  assert.deepEqual(codes, Array.from({ length: 55 }, (_, index) => 'MHI04 ' + String(index + 1).padStart(3, '0')));
  assert.equal(normalizeReferralCode("  " + codes[0].toLowerCase() + "  "), codes[0]);
  for (const value of [undefined, null, "", "   "]) assert.equal(normalizeReferralCode(value), null);
  for (const value of ["RANDOM", "MHI04 000", "MHI04 056", "MHI04001", "S004-3MZ42P", [], {}, 12, true, "x".repeat(10000)]) {
    assert.throws(() => normalizeReferralCode(value), /referral code/i);
  }
});

test("the additive referral migration preserves old paid bookings and enforces the database allowlist", () => {
  const folder = mkdtempSync(join(tmpdir(), "series004-referrals-"));
  const path = join(folder, "bookings.sqlite");
  try {
    const old = new DatabaseSync(path);
    old.exec(readFileSync(new URL("../migrations/0001_inventory.sql", import.meta.url), "utf8"));
    old.exec(readFileSync(new URL("../migrations/0002_referrals.sql", import.meta.url), "utf8"));
    old.prepare(`INSERT INTO attempts(ref,session,seat,name,email,amount,currency,mode,status,ticketId,expiresAt,nextCheck,updatedAt)
      VALUES('legacy','legacy-session','J10','Earlier Guest','old@example.test',200000,'NGN','preview','paid','OLD-TICKET',1,1,1)`).run();
    old.prepare(`INSERT INTO attempts(ref,session,seat,name,email,amount,currency,mode,status,ticketId,expiresAt,nextCheck,updatedAt,referralCode)
      VALUES('referred-legacy','referred-session','J9','Earlier Referred Guest','referred@example.test',200000,'NGN','preview','paid','REFERRED-TICKET',1,1,1,'S004-3MZ42P')`).run();
    old.close();
    const inventory = openInventory(path);
    assert.equal(inventory.get("legacy").ticketId, "OLD-TICKET");
    assert.equal(inventory.get("legacy").referralCode, null);
    assert.equal(inventory.get("referred-legacy").referralCode, "MHI04 001");
    assert.equal(inventory.get("referred-legacy").ticketId, "REFERRED-TICKET");
    assert.deepEqual({ ...inventory.paidTotals() }, { confirmed: 2, referred: 1, withoutReferral: 1 });
    inventory.close();
    const migrated = new DatabaseSync(path);
    migrated.exec("PRAGMA foreign_keys=ON");
    assert.deepEqual(migrated.prepare("SELECT code FROM referral_codes ORDER BY code").all().map(row => row.code), codes);
    assert.throws(() => migrated.prepare("UPDATE attempts SET referralCode='FAKE' WHERE ref='legacy'").run(), /FOREIGN KEY/);
    migrated.close();
    const reopened = openInventory(path);
    assert.equal(reopened.get("legacy").ticketId, "OLD-TICKET");
    reopened.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

for (const storage of ["SQLite", "D1"]) {
  test(`${storage}: invalid codes cannot reserve seats; paid reports exclude every unsuccessful state`, async (t) => {
    const inventory = storage === "D1" ? localBinding(t).inventory : openInventory(":memory:");
    if (storage === "SQLite") t.after(() => inventory.close());
    await inventory.bindMode("preview");
    const origin = "http://127.0.0.1:5184";
    const key = token();
    const api = createBookingApi({ inventory, origin, mode: "preview", gateway: null,
      accounts: new Map([["organizer", digest(key)]]), accessKeys: true, rateLimit: async () => true });
    const req = (path, cookie, data) => api.fetch(new Request(origin + "/api/" + path, {
      headers: { ...(cookie && { cookie }), ...(data !== undefined && { origin, "content-type": "application/json" }) },
      ...(data !== undefined && { method: "POST", body: JSON.stringify(data) }),
    }));
    const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
    const guest = async () => cookieOf(await req("seats"));
    const fields = (seat, referralCode) => ({ seat, name: "Fixture Guest", email: "guest@example.test", requestId: randomUUID(), referralCode });
    const invalidGuest = await guest();
    assert.equal((await req("referral/validate", undefined, { referralCode: "FAKE" })).status, 400);
    assert.equal((await req("checkout", invalidGuest, fields("A1", "FAKE"))).status, 400);
    assert.deepEqual(await inventory.availability(), {});
    assert.equal((await req("referral/validate", undefined, { referralCode: codes[0].toLowerCase() })).status, 200);
    const login = await req("admin/login", undefined, { username: "organizer", password: key });
    assert.equal(login.status, 200);
    const organizer = cookieOf(login);
    for (const view of ["confirmed", "attempts", "referrals"]) {
      assert.equal((await req("admin/records?view=" + view)).status, 401);
      assert.equal((await req("admin/export?view=" + view)).status, 401);
    }
    assert.equal((await req("admin/records?view=anything", organizer)).status, 400);
    const fixtures = [["paid", codes[0]], ["paid", undefined], ["pending", codes[0]],
      ["failed", codes[0]], ["canceled", codes[0]], ["expired", codes[0]], ["exception", codes[0]]];
    const refs = [];
    for (const [index, [status, code]] of fixtures.entries()) {
      const cookie = await guest();
      const data = fields("B" + (index + 1), code);
      const response = await req("checkout", cookie, data);
      assert.equal(response.status, 201);
      const attempt = await inventory.latest(digest(cookie.split("=")[1]));
      refs.push(attempt.ref);
      if (status !== "pending") await inventory.settle(attempt, status);
      const replay = await req("checkout", cookie, { ...data, referralCode: codes[1] });
      assert.equal(replay.status, 200);
      assert.equal((await inventory.get(attempt.ref)).referralCode, code ?? null);
      if (status === "paid") await inventory.settle(await inventory.get(attempt.ref), "paid");
    }
    const dashboard = await (await req("admin/records", organizer)).json();
    assert.equal(dashboard.view, "confirmed");
    assert.equal(dashboard.records.length, 2);
    assert.ok(dashboard.records.every(row => row.status === "paid" && row.ticketId));
    assert.deepEqual(dashboard.paidTotals, { confirmed: 2, referred: 1, withoutReferral: 1 });
    const attempts = await (await req("admin/records?view=attempts", organizer)).json();
    assert.equal(attempts.records.length, 5);
    assert.ok(attempts.records.every(row => row.status !== "paid"));
    const summary = await (await req("admin/records?view=referrals", organizer)).json();
    assert.equal(summary.referrals.length, 55);
    assert.equal(summary.referrals.find(row => row.code === codes[0]).paidBookings, 1);
    assert.equal(summary.referrals.reduce((total, row) => total + row.paidBookings, 0), 1);
    assert.equal(summary.referrals.filter(row => row.paidBookings === 0).length, 54);
    const csv = await (await req("admin/export", organizer)).text();
    assert.ok(csv.includes(codes[0]));
    assert.ok(csv.includes(refs[0]) && csv.includes(refs[1]));
    for (const ref of refs.slice(2)) assert.ok(!csv.includes(ref));
    const attemptCsv = await (await req("admin/export?view=attempts", organizer)).text();
    assert.ok(attemptCsv.includes(refs[2]) && !attemptCsv.includes(refs[0]));
    const referralCsv = await (await req("admin/export?view=referrals", organizer)).text();
    assert.equal(referralCsv.split("\r\n").length, 56);
    assert.ok(referralCsv.includes(`"${codes[0]}","1"`));
    const { booking } = await (await req("admin/booking?ref=" + refs[0], organizer)).json();
    assert.equal(booking.referralCode, codes[0]);
    await assert.rejects(async () => inventory.claim({ session: "invalid", seat: "J1", name: "Fixture", email: "x@example.test",
      mode: "preview", requestId: randomUUID(), referralCode: "FAKE" }), /referral code/i);
  });
}
