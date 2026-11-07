import codes from "./referral-codes.json" with { type: "json" };

const approved = new Set(codes);
export const referralError = "This referral code is invalid. Correct it or leave it blank to continue.";

export function normalizeReferralCode(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 32) throw new RangeError(referralError);
  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (!approved.has(code)) throw new RangeError(referralError);
  return code;
}
