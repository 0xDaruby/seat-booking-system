import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { openInventory } from "./inventory.mjs";
import { paystack } from "./paystack.mjs";
import { loadAdminAccounts } from "./admin.mjs";
import { createBookingApi, maxBodyBytes } from "./booking-api.mjs";
import { apiHeaders, deny } from "./http.mjs";

async function body({ incoming }) {
  let length = 0;
  const chunks = [];
  for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > maxBodyBytes) throw new RangeError("Request is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

export function createBookingServer({ inventory, ...options }) {
  const api = createBookingApi({ ...options, inventory, readBody: body });
  inventory.bindMode(options.mode);
  const server = createServer(async (req, res) => {
    let response;
    try {
      response = await api.fetch({
        incoming: req,
        method: req.method,
        url: req.url,
        headers: new Headers(req.headers),
      });
    } catch {
      response = deny(apiHeaders(), 503, "The booking service is temporarily unavailable. Please try again.");
    }
    const headers = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers["set-cookie"] = cookies;
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  const interval = setInterval(() => {
    void api.reconcile().catch(() => console.error("Booking reconciliation failed."));
  }, 10_000).unref();
  server.once("close", () => clearInterval(interval));
  return server;
}
if (import.meta.main) {
  const origin = new URL(process.env.BOOKING_ORIGIN ?? "http://127.0.0.1:5184").origin;
  const mode = process.env.BOOKING_MODE;
  if (!["preview", "test", "live"].includes(mode)) throw new Error("Set BOOKING_MODE to preview, test, or live.");
  if (mode === "live" && process.env.BOOKING_ENABLE_LIVE_MODE !== "1") throw new Error("Live mode requires explicit activation.");
  const loopback = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
  if (!((mode !== "live" && loopback) || (mode !== "preview" && origin.startsWith("https://")))) {
    throw new Error("Use a loopback review origin or an approved HTTPS payment origin.");
  }
  const channels = (process.env.BOOKING_PAYSTACK_CHANNELS ?? "").split(",").map((channel) => channel.trim()).filter(Boolean);
  const gateway = mode === "preview" ? null : paystack(process.env.PAYSTACK_SECRET_KEY ?? "", origin, fetch, { mode, channels });
  const accounts = loadAdminAccounts(process.env.BOOKING_ADMIN_ACCOUNTS, mode === "preview" ? process.env.BOOKING_ADMIN_PASSWORD : undefined);
  const path = resolve(process.env.BOOKING_DB ?? `.booking-data/series-004-${mode}.sqlite`);
  mkdirSync(dirname(path), { recursive: true });
  const inventory = openInventory(path);
  const server = createBookingServer({
    origin, mode, gateway, inventory, accounts, forcePause: process.env.BOOKING_CHECKOUT_PAUSED === "1",
  });
  const port = Number(process.env.BOOKING_API_PORT ?? 4319);
  server.listen(port, "127.0.0.1", () => console.log("Series 004 booking API running in " + mode + " mode."));
}

