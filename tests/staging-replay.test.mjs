import assert from "node:assert/strict";
import test from "node:test";
import { createStagingReplayWorker } from "../scripts/staging-replay-worker.mjs";

const origin = "https://series-004-replay-proof.edaraiquaibom16.workers.dev";
const env = { REPLAY_ENABLED: "1", BOOKING_ORIGIN: origin };
const accepted = () => new Response('{"received":true}', { status: 200 });

test("relay preserves raw bytes and signature headers in three sequential authenticated deliveries", async () => {
  const bytes = Uint8Array.from([123, 10, 32, 34, 120, 34, 58, 34, 195, 169, 34, 125, 10]);
  const calls = [];
  const logs = [];
  let active = 0;
  let consumed = 0;
  const worker = createStagingReplayWorker(async (url, options) => {
    assert.equal(active++, 0);
    assert.equal(url, "https://series-004-staging.edaraiquaibom16.workers.dev/api/paystack/webhook");
    calls.push({ bytes: Array.from(options.body), headers: [...options.headers] });
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    const response = accepted();
    const read = response.text.bind(response);
    response.text = async () => { const text = await read(); consumed++; active--; return text; };
    return response;
  }, (...args) => logs.push(args));
  const response = await worker.fetch(new Request(origin + "/webhook", { method: "POST", body: bytes,
    headers: { "Content-Type": "application/json", "x-paystack-signature": "fixture-legacy", "Paystack-Signature": "fixture-timestamped",
      Authorization: "must-not-forward", Cookie: "must-not-forward", "X-Attendee": "must-not-forward" } }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(calls.length, 3);
  assert.equal(consumed, 3);
  for (const call of calls) {
    assert.deepEqual(call.bytes, Array.from(bytes));
    assert.deepEqual(call.headers, [["content-type", "application/json"], ["paystack-signature", "fixture-timestamped"], ["x-paystack-signature", "fixture-legacy"]]);
  }
  assert.deepEqual(logs, [["STAGING_REPLAY_RESULT", 200, 200, 200]]);
});

test("rejected signatures, malformed acknowledgements and provider errors are never amplified", async () => {
  for (const first of [() => new Response("rejected", { status: 401 }), () => new Response('{"received":false}'),
    () => new Response("invalid JSON"), () => new Response("failed", { status: 503 }), () => { throw new Error("private error must stay unlogged"); }]) {
    let calls = 0;
    const logs = [];
    const worker = createStagingReplayWorker(() => { calls++; return first(); }, (...args) => logs.push(args));
    const response = await worker.fetch(new Request(origin + "/webhook", { method: "POST", body: "{}" }), env);
    assert.ok([401, 503].includes(response.status));
    assert.equal(calls, 1);
    assert.deepEqual(logs, []);
    assert.equal((await response.text()).includes("private"), false);
  }
  let calls = 0;
  const worker = createStagingReplayWorker(() => ++calls === 1 ? accepted() : new Response("rejected", { status: 401 }));
  assert.equal((await worker.fetch(new Request(origin + "/webhook", { method: "POST", body: "{}" }), env)).status, 503);
  assert.equal(calls, 2);
});

test("relay fails closed for incorrect host, route, enablement, size and exhausted rate limit", async () => {
  let calls = 0;
  const worker = createStagingReplayWorker(() => { calls++; return accepted(); });
  for (const [url, method, config] of [[origin + "/webhook", "GET", env], [origin + "/webhook/", "POST", env],
    [origin + "/webhook?x=1", "POST", env], ["https://wrong.example/webhook", "POST", env],
    [origin + "/webhook", "POST", { ...env, REPLAY_ENABLED: "0" }], [origin + "/webhook", "POST", { ...env, BOOKING_ORIGIN: "https://wrong.example" }]]) {
    assert.equal((await worker.fetch(new Request(url, { method }), config)).status, 404);
  }
  let canceled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(16_385)); }, cancel() { canceled = true; } });
  assert.equal((await worker.fetch(new Request(origin + "/webhook", { method: "POST", body, duplex: "half" }), env)).status, 413);
  assert.equal(canceled, true);
  assert.equal((await worker.fetch(new Request(origin + "/webhook", { method: "POST", body: "{}" }), {
    ...env, REPLAY_RATE: { limit: async () => ({ success: false }) },
  })).status, 429);
  assert.equal((await worker.fetch(new Request(origin + "/webhook", { method: "POST", body: "{}" }), {
    ...env, REPLAY_RATE: { limit: async () => { throw new Error("private binding error"); } },
  })).status, 503);
  assert.equal(calls, 0);
});
