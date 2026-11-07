import { randomUUID, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { openInventory, holdMs, graceMs } from "../server/inventory.mjs";
import { paystack, settleVerified, settleVerifiedAsync } from "../server/paystack.mjs";

const claim = (inventory, session, seat = "A1", requestId = randomUUID(), now = 1_000) =>
  inventory.claim({ session, seat, requestId, name: "Fixture Guest", email: "guest@example.test", mode: "test" }, now);

const success = (attempt, changes = {}) => ({
  status: "success", reference: attempt.ref, amount: attempt.amount, currency: "NGN", domain: "test", ...changes,
});

test("a single durable allocation wins, and one attempt yields one ticket", () => {
  const dir = mkdtempSync(join(tmpdir(), "series-004-test-"));
  const path = join(dir, "booking.sqlite");
  try {
    let first = openInventory(path);
    const second = openInventory(path);
    const request = randomUUID();
    const { created } = claim(first, "first", "A1", request);
    assert.deepEqual(claim(second, "second"), {});
    assert.equal(claim(second, "first", "A1", request).existing.ref, created.ref);
    first.close();
    first = openInventory(path);
    assert.equal(first.latest("first").ref, created.ref);
    assert.deepEqual(second.availability(), { A1: "held" });
    const confirmed = settleVerified(first, created.ref, success(created));
    assert.equal(confirmed.status, "paid");
    assert.ok(confirmed.ticketId);
    assert.equal(settleVerified(second, created.ref, success(created)).ticketId, confirmed.ticketId);
    assert.deepEqual(second.availability(), { A1: "sold" });
    first.close();
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("expiry permits reassignment and late success goes to review", () => {
  const inventory = openInventory(":memory:");
  try {
    const request = randomUUID();
    const { created } = claim(inventory, "first", "A1", request);
    const later = 1_000 + holdMs + graceMs;
    const expired = settleVerified(inventory, created.ref, success(created, { status: "ongoing" }), later);
    assert.equal(expired.status, "expired");
    assert.equal(claim(inventory, "first", "A1", request, later).existing.ref, created.ref);
    const reassigned = claim(inventory, "second", "A1", randomUUID(), later).created;
    assert.equal(settleVerified(inventory, created.ref, success(created), later).status, "exception");
    assert.equal(inventory.get(created.ref).ticketId, null);
    assert.equal(inventory.get(reassigned.ref).status, "initializing");
    assert.equal(settleVerified(inventory, reassigned.ref, success(reassigned), later).status, "paid");
  } finally {
    inventory.close();
  }
});

test("wrong amount, currency, reference or domain cannot issue a ticket", () => {
  const inventory = openInventory(":memory:");
  try {
    for (const [index, fields] of [{ amount: 1 }, { currency: "USD" }, { domain: "live" }, { reference: "other" }].entries()) {
      const { created } = claim(inventory, String(index));
      const result = settleVerified(inventory, created.ref, success(created, fields));
      assert.equal(result.status, "exception");
      assert.equal(result.ticketId, null);
    }
  } finally {
    inventory.close();
  }
});

test("Paystack request uses server amount and rejects invalid webhook signatures", async () => {
  const secret = "sk_test_fixture";
  const origin = "http://127.0.0.1:5184";
  const inventory = openInventory(":memory:");
  const { created: attempt } = claim(inventory, "paystack");
  inventory.close();
  const adapter = paystack(secret, origin, async (url, request) => {
    assert.equal(url, "https://api.paystack.co/transaction/initialize");
    assert.deepEqual(JSON.parse(request.body), {
      email: attempt.email, amount: "200000", currency: "NGN", reference: attempt.ref,
      callback_url: origin + "/payment?return=1", metadata: JSON.stringify({ cancel_action: origin + "/payment" }),
    });
    return Response.json({ status: true, data: {
      reference: attempt.ref, authorization_url: "https://checkout.paystack.com/example",
    } });
  });
  assert.equal(await adapter.initialize(attempt), "https://checkout.paystack.com/example");
  const raw = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac("sha512", secret).update(raw).digest("hex");
  assert.equal(adapter.authentic(raw, signature), true);
  assert.equal(adapter.authentic(Buffer.from("different payload"), signature), false);
  assert.equal(adapter.authentic(raw, "invalid"), false);
});

test("timestamped Paystack webhook verification rejects tampering, stale timestamps, and legacy downgrade", () => {
  const apiKey = "sk_test_fixture";
  const signingSecret = "whsec_fixture";
  const adapter = paystack(apiKey, "https://example.test", undefined, { webhookSecret: signingSecret });
  const raw = Buffer.from('{ "event": "charge.success" }');
  const timestamp = 1_800_000_000;
  const sign = (key, body) => createHmac("sha512", key).update(body);
  const signature = sign(signingSecret, timestamp + ".").update(raw).digest("hex");
  const legacy = sign(apiKey, raw).digest("hex");
  const header = `t=${timestamp},v1=whk_previous:${"0".repeat(128)},v1=whk_current:${signature}`;
  assert.equal(adapter.authentic(raw, legacy, header, timestamp * 1000), true);
  assert.equal(adapter.authentic(raw, legacy, header, (timestamp + 301) * 1000), false);
  assert.equal(adapter.authentic(Buffer.from("{}"), legacy, header, timestamp * 1000), false);
  assert.equal(adapter.authentic(raw, legacy, undefined, timestamp * 1000), false);
  assert.equal(adapter.authentic(raw, legacy, header + `,t=${timestamp}`, timestamp * 1000), false);
});

test("a verified success racing an initializing-to-pending transition still issues a ticket", async () => {
  const inventory = openInventory(":memory:");
  try {
    inventory.bindMode("test");
    const { created } = inventory.claim({
      session: "session", seat: "A1", name: "Test attendee", email: "attendee@example.test",
      mode: "test", requestId: randomUUID(),
    });
    const concurrent = {
      get: async (ref) => inventory.get(ref),
      settle: async (attempt, status, now) => {
        if (attempt.status === "initializing") inventory.initialized(attempt.ref, "https://checkout.paystack.com/test");
        return inventory.settle(attempt, status, now);
      },
    };
    const confirmed = await settleVerifiedAsync(concurrent, created.ref, success(created));
    assert.equal(confirmed.status, "paid");
    assert.ok(confirmed.ticketId);
  } finally {
    inventory.close();
  }
});
