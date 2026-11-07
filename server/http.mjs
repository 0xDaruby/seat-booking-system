import { createHash, randomBytes } from "node:crypto";

export const token = () => randomBytes(32).toString("hex");
export const digest = (value) => createHash("sha256").update(value).digest("hex");

export function readCookie(req, name) {
  return req.headers.get("cookie")?.match(new RegExp("(?:^|;\\s*)" + name + "=([a-f0-9]{64})(?:;|$)"))?.[1];
}

export function setCookie(headers, name, value, seconds, secure, sameSite = "Lax") {
  headers.append("Set-Cookie", `${name}=${value}; HttpOnly; SameSite=${sameSite}; Path=/api; Max-Age=${seconds}${secure ? "; Secure" : ""}`);
}

export function apiHeaders() {
  return new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
}

export function json(headers, status, data) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

export const deny = (headers, status, error) => json(headers, status, { error });
