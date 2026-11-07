import event from "../src/event.json" with { type: "json" };

export { event };
export const seats = new Set([...event.rows].flatMap((row) =>
  Array.from({ length: event.seatsPerRow }, (_, i) => row + (i + 1))
));
export const holdMs = 5 * 60_000;
export const graceMs = 15 * 60_000;
export const latePaymentReviewMs = 24 * 60 * 60_000;
