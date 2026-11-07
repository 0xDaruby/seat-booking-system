import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker.mjs";

test("configuration diagnostics never log a misconfigured credential", async (t) => {
  const messages = [];
  t.mock.method(console, "error", (...args) => messages.push(args));
  const origin = "https://tickets.example.test";
  const secret = "sk_test_privatefixture";
  const response = await worker.fetch(new Request(origin + "/api/seats"), {
    BOOKING_MODE: "live", BOOKING_ORIGIN: origin, BOOKING_ENABLE_LIVE_MODE: "1",
    BOOKING_PAYSTACK_CHANNELS: "card", PAYSTACK_SECRET_KEY: secret,
  });
  assert.equal(response.status, 503);
  assert.deepEqual(messages, [["BOOKING_UNAVAILABLE", "paystack_key_mode"]]);
  assert.equal(JSON.stringify(messages).includes(secret), false);
});

test("public rate limits reject abuse before reaching D1 and use a separate checkout budget", async () => {
  const origin = "https://tickets.example.test";
  const limits = [];
  const limiter = (name) => ({
    async limit({ key }) {
      limits.push({ name, key });
      return { success: false };
    },
  });
  const env = {
    BOOKING_MODE: "test",
    BOOKING_ORIGIN: origin,
    API_RATE: limiter("public"),
    CHECKOUT_RATE: limiter("checkout"),
    get DB() { throw new Error("Blocked requests must not touch D1"); },
  };
  const headers = { "cf-connecting-ip": "192.0.2.42" };
  const seats = await worker.fetch(new Request(origin + "/api/seats", { headers }), env);
  const checkout = await worker.fetch(new Request(origin + "/api/checkout", { method: "POST", headers }), env);
  assert.equal(seats.status, 429);
  assert.equal(checkout.status, 429);
  assert.deepEqual(limits.map(({ name }) => name), ["public", "checkout"]);
  assert.match(limits[0].key, /^[a-f0-9]{64}$/);
  assert.equal(limits[0].key, limits[1].key);
});
