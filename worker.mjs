import { loadAdminAccounts } from "./server/admin.mjs";
import { createBookingApi } from "./server/booking-api.mjs";
import { openD1Inventory } from "./server/d1-inventory.mjs";
import { apiHeaders, deny, digest } from "./server/http.mjs";
import { paystack } from "./server/paystack.mjs";

const configurationErrors = new Map([
  ["The Paystack secret must match the configured payment mode.", "paystack_key_mode"],
  ["Configure approved Paystack payment channels for this mode.", "paystack_channels"],
  ["Configure a valid Paystack webhook signing secret.", "webhook_signing_secret"],
  ["Invalid organizer account configuration.", "organizer_accounts"],
  ["Live mode requires explicit activation", "live_activation"],
  ["Live mode requires HTTPS and named organizer accounts.", "live_requirements"],
  ["The booking database belongs to another mode.", "database_mode"],
  ["Invalid booking origin", "booking_origin"],
]);

function bookingOrigin(env) {
  const { BOOKING_MODE: mode, BOOKING_ORIGIN: configured } = env;
  const { origin, protocol, hostname } = new URL(configured);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const validOrigin = mode === "preview" ? protocol === "http:" && loopback : protocol === "https:" && !loopback;
  if (configured !== origin || !validOrigin) {
    throw new Error("Invalid booking origin");
  }
  return origin;
}

async function bookingApi(env, origin, timeoutMs) {
  const mode = env.BOOKING_MODE;
  if (mode === "live" && env.BOOKING_ENABLE_LIVE_MODE !== "1") throw new Error("Live mode requires explicit activation");
  const channels = (env.BOOKING_PAYSTACK_CHANNELS ?? "").split(",").map((channel) => channel.trim()).filter(Boolean);
  const gateway = mode === "preview" ? null : paystack((env.PAYSTACK_SECRET_KEY ?? "").trim(), origin, fetch, {
    mode, channels, webhookSecret: env.PAYSTACK_WEBHOOK_SECRET, timeoutMs,
  });
  const accounts = loadAdminAccounts(env.BOOKING_ADMIN_ACCOUNTS, undefined, { accessKeys: true });
  const inventory = openD1Inventory(env.DB);
  const api = createBookingApi({
    origin, mode, gateway, inventory, accounts,
    forcePause: env.BOOKING_CHECKOUT_PAUSED === "1",
    accessKeys: true, rateLimit: inventory.takeRateLimit,
  });
  await inventory.bindMode(mode);
  return api;
}

export default {
  async fetch(request, env) {
    try {
      const origin = bookingOrigin(env);
      const url = new URL(request.url);
      if (url.origin !== origin) return deny(apiHeaders(), 421, "Booking is unavailable on this address.");
      if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      if (url.pathname !== "/api/paystack/webhook" && env.API_RATE && env.CHECKOUT_RATE) {
        const client = digest(request.headers.get("cf-connecting-ip") ?? "unknown");
        const limiter = url.pathname === "/api/checkout" ? env.CHECKOUT_RATE : env.API_RATE;
        if (!(await limiter.limit({ key: client })).success) {
          return deny(apiHeaders(), 429, "Too many requests. Please try again shortly.");
        }
      }
      const api = await bookingApi(env, origin);
      return await api.fetch(request);
    } catch (error) {
      // Only fixed diagnostic codes enter logs. Secret values, request bodies,
      // payment references, and exception text stay out of the log stream.
      console.error("BOOKING_UNAVAILABLE", configurationErrors.get(error?.message) ?? "request_failure");
      return deny(apiHeaders(), 503, "The booking service is temporarily unavailable. Please try again.");
    }
  },

  async scheduled(_controller, env) {
    const api = await bookingApi(env, bookingOrigin(env), 5000);
    await api.reconcile(6);
  },
};
