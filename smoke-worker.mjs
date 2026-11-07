import { timingSafeEqual } from "node:crypto";
import bookingWorker from "./worker.mjs";
import { event } from "./server/event.mjs";
import { digest, readCookie } from "./server/http.mjs";

const hexKey = /^[a-f0-9]{64}$/;
const excludedDatabases = new Set([
  "10398fa5-b8f5-4e68-938d-51c87a046cb0",
  "84c43b82-77f9-44cb-8eb1-3054b66d193c",
]);

export function createSmokeWorker(delegate = bookingWorker, smokeEvent = event) {
  function configured(env) {
    return env.SMOKE_ENABLED === "1" && env.BOOKING_MODE === "live"
      && env.BOOKING_ENABLE_LIVE_MODE === "1" && hexKey.test(env.SMOKE_ACCESS_HASH ?? "")
      && smokeEvent.priceKobo === 10000 && smokeEvent.edition === "SMOKE TEST — NOT AN EVENT TICKET"
      && /^https:\/\/series-004-smoke\.[a-z0-9-]+\.workers\.dev$/.test(env.BOOKING_ORIGIN ?? "")
      && /^[a-f0-9-]{36}$/.test(env.SMOKE_DATABASE_ID ?? "")
      && !excludedDatabases.has(env.SMOKE_DATABASE_ID);
  }
  function matches(value, expected) {
    return hexKey.test(value ?? "") && timingSafeEqual(Buffer.from(digest(value), "hex"), Buffer.from(expected, "hex"));
  }
  function hidden() {
    return new Response("Not found", { status: 404, headers: {
      "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    } });
  }
  return {
    async fetch(request, env, context) {
      if (!configured(env)) return hidden();
      const url = new URL(request.url);
      if (url.origin !== env.BOOKING_ORIGIN) return hidden();
      const access = url.searchParams.get("access");
      if (access !== null) {
        if (request.method !== "GET" || !matches(access, env.SMOKE_ACCESS_HASH)) return hidden();
        url.searchParams.delete("access");
        return new Response(null, { status: 303, headers: {
          Location: url.pathname + url.search,
          "Set-Cookie": `s004_smoke=${access}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`,
          "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        } });
      }
      const webhook = request.method === "POST" && url.pathname === "/api/paystack/webhook";
      if (!webhook && !matches(readCookie(request, "s004_smoke"), env.SMOKE_ACCESS_HASH)) return hidden();
      const response = await delegate.fetch(request, env, context);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
    async scheduled(controller, env, context) {
      if (!configured(env)) return;
      return delegate.scheduled(controller, env, context);
    },
  };
}

export default createSmokeWorker();
