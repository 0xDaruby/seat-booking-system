import event from "./event.json";

export { event };
export const price = new Intl.NumberFormat("en-NG", {
  style: "currency", currency: event.currency, maximumFractionDigits: 0,
}).format(event.priceKobo / 100);

export type Inventory = Record<string, "held" | "sold">;
export type Booking = {
  status: "pending" | "paid" | "expired" | "failed" | "canceled" | "exception" | "resolved";
  expiresAt: number;
  checkoutUrl?: string;
  ticket?: { id: string; name: string; seat: string };
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/" + path, {
    cache: "no-store",
    signal,
    ...(data && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result === null) {
    throw new ApiError(result?.error ?? "The booking service is unavailable. Please try again.", response.status);
  }
  return result as T;
}

export function isLoopback() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function openCheckout(url: string) {
  const target = new URL(url, window.location.origin);
  if (
    (isLoopback() && target.origin === window.location.origin && target.pathname === "/preview-checkout") ||
    (target.protocol === "https:" && target.origin === "https://checkout.paystack.com")
  ) {
    window.location.assign(target.href);
    return;
  }
  throw new Error("Checkout could not be opened.");
}
