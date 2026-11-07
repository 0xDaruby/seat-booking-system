import { createHmac, timingSafeEqual } from "node:crypto";
import { graceMs } from "./event.mjs";

const supportedChannels = new Set(["card", "bank", "apple_pay", "ussd", "qr", "mobile_money", "bank_transfer", "eft", "capitec_pay", "payattitude"]);

function timestampedSignature(raw, header, secret, now) {
  if (typeof header !== "string" || header.length > 4096) return false;
  let timestamp;
  const signatures = [];
  for (const field of header.split(",")) {
    const value = field.trim();
    if (value.startsWith("t=")) {
      if (timestamp !== undefined || !/^t=\d{1,12}$/.test(value)) return false;
      timestamp = value.slice(2);
    } else {
      const match = /^v1=whk_[a-zA-Z0-9_-]+:([a-f0-9]{128})$/.exec(value);
      if (match) signatures.push(match[1]);
    }
  }
  if (timestamp === undefined || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha512", secret).update(timestamp + ".").update(raw).digest();
  return signatures.some((signature) => timingSafeEqual(expected, Buffer.from(signature, "hex")));
}

export function paystack(secret, origin, fetcher = fetch, { mode = "test", channels = [], webhookSecret, timeoutMs = 10_000 } = {}) {
  if (!["test", "live"].includes(mode) || !new RegExp(`^sk_${mode}_[a-zA-Z0-9]+$`).test(secret)) {
    throw new Error("The Paystack secret must match the configured payment mode.");
  }
  if ((mode === "live" && channels.length === 0) || channels.some((channel) => !supportedChannels.has(channel))) {
    throw new Error("Configure approved Paystack payment channels for this mode.");
  }
  if (webhookSecret !== undefined && (typeof webhookSecret !== "string" || !/^whsec_\S+$/.test(webhookSecret))) {
    throw new Error("Configure a valid Paystack webhook signing secret.");
  }
  async function request(path, data) {
    const response = await fetcher("https://api.paystack.co/transaction/" + path, {
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      ...(data && { method: "POST", body: JSON.stringify(data) }),
    });
    const body = await response.json();
    if (response.status === 404 && /^transaction reference not found\.?$/i.test(body.message ?? "")) return null;
    if (!response.ok || body.status !== true || !body.data) throw new Error("Paystack request failed");
    return body.data;
  }
  return {
    async initialize(attempt) {
      const data = await request("initialize", {
        email: attempt.email, reference: attempt.ref, amount: String(attempt.amount), currency: attempt.currency,
        callback_url: origin + "/payment?return=1", metadata: JSON.stringify({ cancel_action: origin + "/payment" }),
        ...(channels.length > 0 && { channels }),
      });
      const checkout = new URL(data.authorization_url);
      if (checkout.protocol !== "https:" || checkout.origin !== "https://checkout.paystack.com" || data.reference !== attempt.ref) {
        throw new Error("Invalid Paystack initialization response");
      }
      return checkout.href;
    },
    verify: (reference) => request("verify/" + encodeURIComponent(reference)),
    authentic(raw, signature, signedHeader, now = Date.now()) {
      if (webhookSecret) return timestampedSignature(raw, signedHeader, webhookSecret, now);
      if (typeof signature !== "string" || !/^[a-f0-9]{128}$/i.test(signature)) return false;
      const expected = createHmac("sha512", secret).update(raw).digest();
      return timingSafeEqual(expected, Buffer.from(signature, "hex"));
    },
  };
}

function verifiedTransition(attempt, transaction, now) {
  const matches = transaction?.reference === attempt.ref && transaction.amount === attempt.amount &&
    transaction.currency === attempt.currency && transaction.domain === attempt.mode;
  const stillAllocated = ["initializing", "pending"].includes(attempt.status);
  if (transaction?.status === "success") {
    return matches && stillAllocated ? "paid" : "exception";
  }

  if (stillAllocated) {
    if (matches && transaction.status === "failed") return "failed";
    if (matches && transaction.status === "abandoned" && now >= attempt.expiresAt) {
      return "canceled";
    }
    const knownUnpaid = transaction === null ||
      (matches && ["ongoing", "pending", "processing", "queued", "reversed"].includes(transaction.status));
    if (knownUnpaid && now >= attempt.expiresAt + graceMs) return "expired";
  }
  return null;
}

export function settleVerified(inventory, ref, transaction, now = Date.now()) {
  const attempt = inventory.get(ref);
  if (!attempt || ["paid", "exception"].includes(attempt.status)) return attempt;
  const next = verifiedTransition(attempt, transaction, now);
  if (next) return inventory.settle(attempt, next, now);
  inventory.defer(ref, now);
  return attempt;
}

export async function settleVerifiedAsync(inventory, ref, transaction, now = Date.now()) {
  let attempt = await inventory.get(ref);
  // A concurrent initialization, expiry, or settlement can change the source
  // state. Re-evaluate against the winning row rather than applying a stale transition.
  for (let tries = 0; tries < 4; tries += 1) {
    if (!attempt || ["paid", "exception"].includes(attempt.status)) return attempt;
    const next = verifiedTransition(attempt, transaction, now);
    if (!next) {
      await inventory.defer(ref, now);
      return attempt;
    }
    attempt = await inventory.settle(attempt, next, now);
    if (attempt?.status === next) return attempt;
  }
  throw new Error("Booking changed during payment verification");
}
