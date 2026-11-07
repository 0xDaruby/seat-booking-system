const destination = "https://series-004-staging.edaraiquaibom16.workers.dev/api/paystack/webhook";
const relayOrigin = "https://series-004-replay-proof.edaraiquaibom16.workers.dev";
const maxBytes = 32_768;

function reply(status, received = false) {
  return new Response(JSON.stringify(received ? { received: true } : { error: "Webhook relay unavailable." }), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

async function readBytes(request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function createStagingReplayWorker(forward = fetch, log = console.log) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (env.REPLAY_ENABLED !== "1" || env.BOOKING_ORIGIN !== relayOrigin || url.origin !== relayOrigin
        || request.method !== "POST" || url.pathname !== "/webhook" || url.search !== "") return reply(404);
      if (env.REPLAY_RATE) {
        try {
          if (!(await env.REPLAY_RATE.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" })).success) return reply(429);
        } catch { return reply(503); }
      }
      let bytes;
      try { bytes = await readBytes(request); } catch { return reply(400); }
      if (bytes === null) return reply(413);
      const headers = new Headers();
      for (const name of ["content-type", "x-paystack-signature", "paystack-signature"]) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      const statuses = [];
      for (let delivery = 0; delivery < 3; delivery++) {
        let response;
        let received = false;
        try {
          response = await forward(destination, { method: "POST", headers: new Headers(headers), body: bytes,
            redirect: "error", signal: AbortSignal.timeout(10_000) });
          statuses.push(response.status);
          const body = await response.text();
          if (response.status === 200) {
            try { received = JSON.parse(body).received === true; } catch { /* Invalid acknowledgement cannot authorize replay. */ }
          }
        } catch {
          if (statuses.length <= delivery) statuses.push(503);
        }
        if (response?.status !== 200 || !received) {
          // A rejected/failed first delivery is never amplified. Later failures
          // return a retryable result; the destination owns idempotency.
          return reply(delivery === 0 && response?.status >= 400 && response.status <= 599 ? response.status : 503);
        }
      }
      log("STAGING_REPLAY_RESULT", ...statuses);
      return reply(200, true);
    },
  };
}

export default createStagingReplayWorker();
