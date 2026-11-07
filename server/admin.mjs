import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { deny, digest, json, readCookie, setCookie, token } from "./http.mjs";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const usernamePattern = /^[a-z0-9._-]{2,40}$/;
const referencePattern = /^s004-[0-9a-f]{32}$/;
const activeHolds = new Set(["initializing", "pending"]);
const outcomes = new Set(["refund-confirmed", "no-charge-confirmed", "handled-externally"]);

export function hashAdminPassword(password) {
  if (typeof password !== "string" || password.length < 16 || password.length > 256) {
    throw new Error("Use an organizer password between 16 and 256 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 32, options).toString("hex");
}

export function loadAdminAccounts(raw, previewPassword, { accessKeys = false } = {}) {
  const data = raw ? JSON.parse(raw) : {};
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid organizer account configuration.");
  const accounts = new Map();
  const credentialPattern = accessKeys ? /^[a-f0-9]{64}$/ : /^[a-f0-9]{32}:[a-f0-9]{64}$/;
  for (const [username, encoded] of Object.entries(data)) {
    if (!usernamePattern.test(username) || typeof encoded !== "string" || !credentialPattern.test(encoded)) {
      throw new Error("Invalid organizer account configuration.");
    }
    accounts.set(username, encoded);
  }
  if (!accessKeys && !accounts.size && previewPassword) accounts.set("organizer", hashAdminPassword(previewPassword));
  return accounts;
}

function csvCell(value) {
  let cell = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}

export function organizerApi({ inventory, accounts, secure, mode, forcePause, verify, allowLogin, accessKeys }) {
  let failures = 0;
  let blockedUntil = 0;
  let checkingLogin = false;
  const fallback = "0".repeat(32) + ":" + "0".repeat(64);
  const sessionAge = 3600;

  async function login(req, res, data) {
    const now = Date.now();
    if (!accounts.size) return deny(res, 503, "Organizer sign-in is unavailable.");
    if (checkingLogin || blockedUntil > now) return deny(res, 429, "Too many sign-in attempts. Try again shortly.");
    if (typeof data.username !== "string" || typeof data.password !== "string" || data.password.length > 256) {
      return deny(res, 400, "Enter your username and password.");
    }
    const actor = data.username.trim().toLowerCase();
    const account = accounts.get(actor);
    let matched;
    if (accessKeys) {
      if (!await allowLogin(req, now)) return deny(res, 429, "Too many sign-in attempts. Try again shortly.");
      const validKey = /^[a-f0-9]{64}$/.test(data.password);
      const candidate = Buffer.from(digest(data.password), "hex");
      matched = timingSafeEqual(candidate, Buffer.from(account ?? "0".repeat(64), "hex")) && validKey && Boolean(account);
    } else {
      const [salt, hash] = (account ?? fallback).split(":");
      checkingLogin = true;
      try {
        const candidate = await derive(data.password, salt, 32, options);
        matched = timingSafeEqual(candidate, Buffer.from(hash, "hex")) && Boolean(account);
      } finally {
        checkingLogin = false;
      }
      if (matched) failures = 0;
      else if (++failures >= 5) {
        blockedUntil = Date.now() + 60_000;
        failures = 0;
      }
    }
    if (!matched) return deny(res, 401, "Incorrect username or password.");
    const previous = readCookie(req, "s004_admin");
    const id = token();
    await inventory.startAdminSession(digest(id), actor, digest(account), Date.now() + sessionAge * 1000, previous && digest(previous));
    setCookie(res, "s004_admin", id, sessionAge, secure, "Strict");
    return json(res, 200, { authenticated: true });
  }

  return async (req, res, route, post, data, query) => {
    if (route === "/api/admin/login" && post) return login(req, res, data);
    const tokenValue = readCookie(req, "s004_admin");
    const id = tokenValue && digest(tokenValue);
    const session = id && await inventory.findAdminSession(id);
    const account = session && accounts.get(session.actor);
    if (!account || digest(account) !== session.credential) return deny(res, 401, "Sign in to continue.");
    const { actor } = session;

    if (route === "/api/admin/logout" && post) {
      await inventory.endAdminSession(id);
      setCookie(res, "s004_admin", "", 0, secure, "Strict");
      return json(res, 200, { authenticated: false });
    }
    if (route === "/api/admin/records" && !post) {
      return json(res, 200, {
        records: await inventory.records(), actor, mode, checkoutPaused: forcePause || await inventory.isPaused(),
        forcePause, checkoutChange: await inventory.checkoutHistory(),
      });
    }
    if (route === "/api/admin/booking" && !post) {
      const ref = query.get("ref");
      const booking = referencePattern.test(ref ?? "") && await inventory.detail(ref);
      return booking ? json(res, 200, { booking }) : deny(res, 404, "Booking not found.");
    }
    if (route === "/api/admin/checkout" && post) {
      if (typeof data.paused !== "boolean") return deny(res, 400, "Choose a checkout state.");
      if (forcePause && !data.paused) return deny(res, 409, "Checkout is paused by the server configuration.");
      await inventory.setPaused(data.paused, actor);
      return json(res, 200, { checkoutPaused: forcePause || await inventory.isPaused() });
    }
    if (route === "/api/admin/release" && post) {
      if (typeof data.ref !== "string" || !referencePattern.test(data.ref)) return deny(res, 400, "Choose a booking.");
      const attempt = await inventory.get(data.ref);
      if (!attempt || !activeHolds.has(attempt.status)) return deny(res, 409, "Only an active hold can be released.");
      if (mode === "preview") {
        if (!await inventory.releasePreview(attempt.ref, actor)) return deny(res, 409, "This hold has already changed.");
        return json(res, 200, { released: true });
      }
      await inventory.auditAction("payment rechecked", actor, attempt.ref);
      const checked = await verify(attempt.ref);
      const released = ["failed", "canceled", "expired"].includes(checked.status);
      return json(res, 200, { released, status: checked.status });
    }
    if (route === "/api/admin/resolution" && post) {
      const note = typeof data.note === "string" ? data.note.trim() : "";
      if (typeof data.ref !== "string" || !referencePattern.test(data.ref) || !outcomes.has(data.outcome) ||
        !note || note.length > 300 || /[\x00-\x1f\x7f]/.test(note)) {
        return deny(res, 400, "Choose a resolution and enter a short note.");
      }
      if (!await inventory.recordResolution(data.ref, data.outcome, note, actor)) {
        return deny(res, 409, "This exception is unavailable or already resolved.");
      }
      return json(res, 200, { recorded: true });
    }
    if (route === "/api/admin/export" && !post) {
      const rows = (await inventory.exportRows()).map(({ seat, status, ref, updatedAt, ticketId, attendee, resolution }) =>
        [seat, status, ref, new Date(updatedAt).toISOString(), attendee, ticketId, resolution].map(csvCell).join(",")
      );
      await inventory.auditAction("records exported", actor);
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="series-004-bookings.csv"');
      return new Response(["seat,status,reference,updated_at,attendee,ticket_id,resolution", ...rows].join("\r\n"), { headers: res });
    }
    return deny(res, 404, "Route unavailable.");
  };
}
