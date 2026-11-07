import { latePaymentReviewMs, seats } from "./event.mjs";
import { settleVerifiedAsync } from "./paystack.mjs";
import { organizerApi } from "./admin.mjs";
import { normalizeReferralCode, referralError } from "./referrals.mjs";
import { apiHeaders, deny, digest, json, readCookie, setCookie, token } from "./http.mjs";

const cookieMaxAge = 30 * 24 * 3600;
export const maxBodyBytes = 32_768;
const referencePattern = /^s004-[0-9a-f]{32}$/;
const payable = ["initializing", "pending"];
const terminal = ["paid", "exception"];

async function body(req) {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, length);
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new RangeError("Request is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function publicBooking(attempt) {
  if (!attempt) return null;
  const status = attempt.resolved ? "resolved" : attempt.status === "initializing" ? "pending" : attempt.status;
  return {
    status, expiresAt: attempt.expiresAt, referralCode: attempt.referralCode ?? null,
    ...(status === "pending" && Date.now() < attempt.expiresAt && attempt.checkoutUrl && { checkoutUrl: attempt.checkoutUrl }),
    ...(status === "paid" && { ticket: { id: attempt.ticketId, name: attempt.name, seat: attempt.seat } }),
  };
}

export function createBookingApi({ origin, mode, gateway, inventory, accounts = new Map(), forcePause = false,
  accessKeys = false, rateLimit, readBody = body }) {
  if (!["preview", "test", "live"].includes(mode) || Boolean(gateway) !== (mode !== "preview")) {
    throw new Error("Preview, test, and live modes require separate gateway settings.");
  }
  const secure = origin.startsWith("https://");
  if (mode === "live" && (!secure || !accounts.size)) throw new Error("Live mode requires HTTPS and named organizer accounts.");
  const checks = new Map();

  async function verify(ref, requireSuccess = false) {
    const attempt = await inventory.get(ref);
    if (!attempt || terminal.includes(attempt.status)) return attempt;
    const checkKey = requireSuccess ? "webhook:" + ref : ref;
    const existing = checks.get(checkKey);
    if (existing) return existing;
    const operation = (async () => {
      try {
        const result = await gateway.verify(ref);
        if (requireSuccess && result?.status !== "success") {
          throw new Error("Payment success has not propagated");
        }
        return await settleVerifiedAsync(inventory, ref, result);
      } catch {
        await inventory.defer(ref);
        throw new Error("Verification temporarily unavailable");
      } finally {
        checks.delete(checkKey);
      }
    })();
    checks.set(checkKey, operation);
    return operation;
  }

  let reconciling = false;
  async function reconcile(limit = 20) {
    if (reconciling) return;
    reconciling = true;
    try {
      for (const attempt of await inventory.due(Date.now(), limit)) {
        if (attempt.mode !== mode) continue;
        if (gateway) await verify(attempt.ref).catch(() => {});
        else if (payable.includes(attempt.status) && attempt.expiresAt <= Date.now()) {
          await inventory.settle(attempt, "expired");
        } else await inventory.defer(attempt.ref);
      }
    } finally {
      reconciling = false;
    }
  }

  let checkoutWindow = 0;
  let checkoutCount = 0;
  function allowCheckout(now) {
    if (rateLimit) return rateLimit("checkout", now, 100, 60_000);
    if (now >= checkoutWindow) {
      checkoutWindow = now + 60_000;
      checkoutCount = 0;
    }
    return ++checkoutCount <= 100;
  }

  const allowLogin = (req, now) => rateLimit("admin:" + digest(req.headers.get("cf-connecting-ip") ?? "unknown"), now, 5, 60_000);
  const admin = organizerApi({ inventory, accounts, mode, secure, forcePause, verify, allowLogin, accessKeys });

  async function fetchBooking(req) {
    const headers = apiHeaders();
    const post = req.method === "POST";
    try {
      const { pathname: route, searchParams } = new URL(req.url, origin);
      if (route === "/api/paystack/webhook" && post && gateway) {
        const raw = await readBody(req);
        if (!await gateway.authentic(raw, req.headers.get("x-paystack-signature"), req.headers.get("paystack-signature"))) {
          return deny(headers, 401, "Invalid signature.");
        }
        const event = JSON.parse(raw.toString());
        const ref = event?.data?.reference;
        if (event?.event === "charge.success" && typeof ref === "string" && referencePattern.test(ref)) {
          const attempt = await inventory.get(ref);
          if (attempt?.mode === mode) {
            const verified = await verify(attempt.ref, true);
            if (!terminal.includes(verified?.status)) return deny(headers, 503, "Payment verification is pending.");
          }
        }
        return json(headers, 200, { received: true });
      }
      if (post && (req.headers.get("origin") !== origin || !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") ?? ""))) {
        return deny(headers, 403, "Request origin or content type is invalid.");
      }
      if (!post && req.method !== "GET") return deny(headers, 405, "Method is unavailable.");

      const sessionToken = readCookie(req, "s004_booking");
      const session = sessionToken && digest(sessionToken);
      const latest = () => session && inventory.latest(session);
      const data = post ? JSON.parse((await readBody(req)).toString()) : null;
      if (post && (!data || typeof data !== "object" || Array.isArray(data))) return deny(headers, 400, "Invalid request.");

      if (route === "/api/seats" && !post) {
        if (!session) setCookie(headers, "s004_booking", token(), cookieMaxAge, secure);
        const attempt = await latest();
        return json(headers, 200, {
          seats: await inventory.availability(), preview: mode === "preview",
          checkoutPaused: forcePause || await inventory.isPaused(),
          recovery: Boolean(attempt && (payable.includes(attempt.status) || terminal.includes(attempt.status))),
        });
      }
      if (route === "/api/referral/validate" && post) {
        try { return json(headers, 200, { referralCode: normalizeReferralCode(data.referralCode) }); }
        catch { return deny(headers, 400, referralError); }
      }
      if (route === "/api/checkout" && post) {
        if (!session) return deny(headers, 409, "Reload seat availability and try again.");
        const { seat, requestId } = data;
        const name = typeof data.name === "string" ? data.name.trim() : "";
        const email = typeof data.email === "string" ? data.email.trim() : "";
        let referralCode;
        try { referralCode = normalizeReferralCode(data.referralCode); }
        catch { return deny(headers, 400, referralError); }
        if (!seats.has(seat) || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId) ||
          !name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name) ||
          email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return deny(headers, 400, "Enter a valid name and email address and choose a seat.");
        }
        if (!await allowCheckout(Date.now())) return deny(headers, 429, "Too many attempts. Please try again shortly.");
        const { created, existing, paused } = await inventory.claim({ session, seat, name, email, mode, requestId, forcePause, referralCode });
        if (paused) return deny(headers, 423, "New reservations are paused. Please check back later.");
        if (existing) {
          const result = publicBooking(existing);
          if (existing.seat !== seat || existing.name !== name || existing.email !== email || (existing.referralCode ?? null) !== referralCode) delete result.checkoutUrl;
          return json(headers, 200, result);
        }
        if (!created) return deny(headers, 409, "Someone else reserved that seat. Please choose another.");
        try {
          const checkoutUrl = gateway ? await gateway.initialize(created) : "/preview-checkout";
          return json(headers, 201, publicBooking(await inventory.initialized(created.ref, checkoutUrl)));
        } catch {
          return json(headers, 202, publicBooking(await inventory.get(created.ref)));
        }
      }
      if (route === "/api/verify" && post) {
        let attempt = await latest();
        if (data.reference !== undefined) {
          if (typeof data.reference !== "string" || !referencePattern.test(data.reference)) {
            return deny(headers, 400, "Invalid booking reference.");
          }
          if (attempt?.ref !== data.reference) {
            const referenced = session && await inventory.get(data.reference);
            if (!referenced || referenced.session !== session || referenced.mode !== mode) {
              return json(headers, 200, { booking: null });
            }
            attempt = referenced.status === "exception"
              ? { ...referenced, resolved: Boolean((await inventory.detail(referenced.ref))?.resolution) }
              : referenced;
          }
        }
        const now = Date.now();
        const eligibleForVerify = attempt && !terminal.includes(attempt.status) &&
          (payable.includes(attempt.status) || attempt.updatedAt >= now - latePaymentReviewMs);
        if (gateway && eligibleForVerify) {
          if (rateLimit && !await rateLimit("verify:" + session, now, 12, 60_000)) {
            return deny(headers, 429, "Too many payment checks. Please try again shortly.");
          }
          attempt = await verify(attempt.ref);
        }
        return json(headers, 200, { booking: publicBooking(attempt) });
      }
      if (route === "/api/ticket" && !post) {
        const attempt = await latest();
        const requestedId = searchParams.get("id");
        if (attempt?.status !== "paid" || (requestedId !== null && requestedId !== attempt.ticketId)) {
          return deny(headers, 404, "No confirmed ticket for this session.");
        }
        return json(headers, 200, { ticket: publicBooking(attempt).ticket });
      }
      if (route === "/api/simulate" && post && !gateway) {
        const attempt = await latest();
        if (attempt?.status !== "pending" || attempt.expiresAt <= Date.now()) return deny(headers, 409, "This preview hold has ended.");
        if (!["paid", "failed", "canceled"].includes(data.outcome)) return deny(headers, 400, "Invalid outcome.");
        await inventory.settle(attempt, data.outcome);
        return json(headers, 200, { simulated: true });
      }
      if (route.startsWith("/api/admin/")) return await admin(req, headers, route, post, data, searchParams);
      return deny(headers, 404, "Route unavailable.");
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof RangeError) return deny(headers, 400, "Invalid request body.");
      return deny(headers, 503, "The booking service is temporarily unavailable. Please try again.");
    }
  }
  return { fetch: fetchBooking, reconcile };
}
