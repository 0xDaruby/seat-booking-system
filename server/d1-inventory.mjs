import { event, holdMs, latePaymentReviewMs } from "./event.mjs";
import { normalizeReferralCode } from "./referrals.mjs";

const active = "('initializing','pending','paid')";
const holds = "('initializing','pending')";
const closed = "('expired','failed','canceled')";
const recoverable = "('initializing','pending','paid','exception')";
const modes = ["preview", "test", "live"];
const firstRow = (result) => result.results[0];
const changed = (result) => result.meta.changes > 0;

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function openD1Inventory(db) {
  const query = (sql, ...params) => {
    const statement = db.prepare(sql);
    return params.length ? statement.bind(...params) : statement;
  };
  const byRef = (ref) => query("SELECT * FROM attempts WHERE ref=?", ref);
  const get = (ref) => byRef(ref).first();
  const bySession = (session) => query(`
    SELECT a.*, r.ref IS NOT NULL AS resolved
    FROM attempts a LEFT JOIN payment_resolutions r ON r.ref=a.ref WHERE a.session=?
    ORDER BY CASE WHEN a.status IN ${active} THEN 0 WHEN a.status='exception' THEN 1 ELSE 2 END,
      a.rowid DESC LIMIT 1
  `, session);
  const setting = (key) => query("SELECT value FROM booking_settings WHERE key=?", key);
  const pauseValue = () => setting("checkout_paused");
  const pauseCheck = "COALESCE((SELECT value FROM booking_settings WHERE key='checkout_paused'), '0')";
  const releaseCondition = `ref=? AND mode='preview' AND status IN ${holds}`;
  const resolutionCondition = `ref=? AND status='exception'
    AND NOT EXISTS (SELECT 1 FROM payment_resolutions WHERE payment_resolutions.ref=attempts.ref)`;

  return {
    async bindMode(mode) {
      if (!modes.includes(mode)) throw new Error("Invalid booking mode.");
      const otherModes = modes.filter((candidate) => candidate !== mode);
      const checkMode = () => query(`
        SELECT value, EXISTS (SELECT 1 FROM attempts WHERE mode IN (?,?)) AS foreignData
        FROM booking_settings WHERE key='mode'
      `, ...otherModes);
      let stored = await checkMode().first();
      if (!stored) {
        const results = await db.batch([
          query(`INSERT INTO booking_settings(key,value) SELECT 'mode',?
            WHERE NOT EXISTS (SELECT 1 FROM attempts WHERE mode IN (?,?))
            ON CONFLICT(key) DO NOTHING`, mode, ...otherModes),
          query(`INSERT INTO booking_settings(key,value) SELECT 'checkout_paused','1'
            WHERE ?='live' AND (SELECT value FROM booking_settings WHERE key='mode')='live'
            ON CONFLICT(key) DO NOTHING`, mode),
          checkMode(),
        ]);
        stored = firstRow(results[2]);
      }
      if (!stored || stored.value !== mode || stored.foreignData) {
        throw new Error("The booking database belongs to another mode.");
      }
    },
    latest: (session) => bySession(session).first(),
    get,
    async claim({ session, seat, name, email, mode, requestId, forcePause = false, referralCode }, now = Date.now()) {
      referralCode = normalizeReferralCode(referralCode);
      const ref = "s004-" + (await hash(session + ":" + requestId)).slice(0, 32);
      const [inserted, latest, replay, pause] = await db.batch([
        query(`INSERT INTO attempts(ref,session,seat,name,email,amount,currency,mode,status,expiresAt,nextCheck,updatedAt,referralCode)
          SELECT ?,?,?,?,?,?,?,?,'initializing',?,?,?,?
          WHERE ?=0 AND ${pauseCheck}='0'
          AND EXISTS (SELECT 1 FROM booking_settings WHERE key='mode' AND value=?)
          AND NOT EXISTS (SELECT 1 FROM attempts WHERE session=? AND status IN ${recoverable})
          ON CONFLICT DO NOTHING`,
        ref, session, seat, name, email, event.priceKobo, event.currency, mode,
        now + holdMs, now + 30_000, now, referralCode, Number(forcePause), mode, session),
        bySession(session),
        byRef(ref),
        pauseValue(),
      ]);
      const existing = firstRow(latest);
      const replayed = firstRow(replay);
      if (changed(inserted)) return { created: replayed };
      if (existing && ["initializing", "pending", "paid", "exception"].includes(existing.status)) return { existing };
      if (replayed) return { existing: replayed };
      return forcePause || firstRow(pause)?.value === "1" ? { paused: true } : {};
    },
    async initialized(ref, checkoutUrl, now = Date.now()) {
      const [, result] = await db.batch([
        query("UPDATE attempts SET status='pending', checkoutUrl=?, updatedAt=? WHERE ref=? AND status='initializing'", checkoutUrl, now, ref),
        byRef(ref),
      ]);
      return firstRow(result);
    },
    async settle(attempt, status, now = Date.now()) {
      if (["paid", "exception"].includes(attempt.status)) return get(attempt.ref);
      const ticketId = status === "paid" ? "S004-" + crypto.randomUUID().toUpperCase() : null;
      const [, result] = await db.batch([
        query(`UPDATE attempts SET status=?, ticketId=?, updatedAt=?, nextCheck=?
          WHERE ref=? AND status=? AND (?<>'paid' OR status IN ${holds})`,
        status, ticketId, now, now + 300_000, attempt.ref, attempt.status, status),
        byRef(attempt.ref),
      ]);
      return firstRow(result);
    },
    async defer(ref, now = Date.now()) {
      await query(`UPDATE attempts SET nextCheck=? + CASE WHEN status IN ${holds} THEN 60000 ELSE 900000 END
        WHERE ref=? AND status IN ('initializing','pending','expired','failed','canceled')`, now, ref).run();
    },
    async due(now = Date.now(), limit = 20) {
      const batchSize = Number.isInteger(limit) ? Math.max(0, Math.min(limit, 20)) : 20;
      if (!batchSize) return [];
      const [activeDue, closedDue] = await db.batch([
        query(`SELECT * FROM attempts WHERE nextCheck<=? AND status IN ${holds}
          ORDER BY nextCheck LIMIT ?`, now, batchSize),
        query(`SELECT * FROM attempts WHERE nextCheck<=? AND status IN ${closed} AND updatedAt>=?
          ORDER BY nextCheck LIMIT ?`, now, now - latePaymentReviewMs, batchSize),
      ]);
      const reservedForClosed = Math.min(closedDue.results.length, 2, Math.floor(batchSize / 3));
      const activeBatch = activeDue.results.slice(0, batchSize - reservedForClosed);
      return [...activeBatch, ...closedDue.results.slice(0, batchSize - activeBatch.length)];
    },
    async availability() {
      const row = await query("SELECT seats FROM seat_snapshot WHERE id=1").first();
      if (!row) throw new Error("Seat availability snapshot is missing.");
      return JSON.parse(row.seats);
    },
    async records(view = "confirmed") {
      const { results } = await query(`
        SELECT a.ref, a.seat, a.status, a.updatedAt, a.name, a.email, a.ticketId, a.referralCode, r.outcome AS resolution
        FROM attempts a LEFT JOIN payment_resolutions r ON r.ref=a.ref
        WHERE ${view === "attempts" ? "NOT (a.status='paid' AND a.ticketId IS NOT NULL)" : "a.status='paid' AND a.ticketId IS NOT NULL"}
        ORDER BY a.rowid DESC
      `).all();
      return results;
    },
    async detail(ref) {
      const [booking, resolution, auditTrail] = await db.batch([
        query("SELECT ref,seat,status,name,email,ticketId,expiresAt,updatedAt,referralCode FROM attempts WHERE ref=?", ref),
        query("SELECT outcome,note,actor,at FROM payment_resolutions WHERE ref=?", ref),
        query("SELECT action,actor,at FROM organizer_audit WHERE ref=? ORDER BY id DESC LIMIT 15", ref),
      ]);
      if (!firstRow(booking)) return null;
      return { ...firstRow(booking), resolution: firstRow(resolution) ?? null, auditTrail: auditTrail.results };
    },
    async exportRows(view = "confirmed") {
      const { results } = await query(`
        SELECT a.ref, a.seat, a.status, a.updatedAt, a.ticketId, a.referralCode,
        CASE WHEN a.status='paid' THEN a.name END AS attendee, r.outcome AS resolution
        FROM attempts a LEFT JOIN payment_resolutions r ON r.ref=a.ref
        WHERE ${view === "attempts" ? "NOT (a.status='paid' AND a.ticketId IS NOT NULL)" : "a.status='paid' AND a.ticketId IS NOT NULL"}
        ORDER BY a.rowid DESC
      `).all();
      return results;
    },
    async paidTotals() {
      return query(`SELECT COUNT(*) AS confirmed, COUNT(referralCode) AS referred,
        COUNT(*) - COUNT(referralCode) AS withoutReferral FROM attempts WHERE status='paid' AND ticketId IS NOT NULL`).first();
    },
    async referrals() {
      const { results } = await query(`SELECT c.code, COUNT(a.ref) AS paidBookings FROM referral_codes c
        LEFT JOIN attempts a ON a.referralCode=c.code AND a.status='paid' AND a.ticketId IS NOT NULL
        GROUP BY c.code ORDER BY c.code`).all();
      return results;
    },
    async isPaused() {
      return (await pauseValue().first())?.value === "1";
    },
    async setPaused(paused, actor, now = Date.now()) {
      const value = paused ? "1" : "0";
      await db.batch([
        query(`INSERT INTO organizer_audit(action,actor,ref,at) SELECT ?,?,NULL,? WHERE ${pauseCheck}<>?`,
          paused ? "checkout paused" : "checkout opened", actor, now, value),
        query(`INSERT INTO booking_settings(key,value) SELECT 'checkout_paused',? WHERE ${pauseCheck}<>?
          ON CONFLICT(key) DO UPDATE SET value=excluded.value`, value, value),
      ]);
    },
    async releasePreview(ref, actor, now = Date.now()) {
      const [, result] = await db.batch([
        query(`INSERT INTO organizer_audit(action,actor,ref,at)
          SELECT 'hold released',?,ref,? FROM attempts WHERE ${releaseCondition}`, actor, now, ref),
        query(`UPDATE attempts SET status='expired', updatedAt=?, nextCheck=? WHERE ${releaseCondition}`, now, now, ref),
      ]);
      return changed(result);
    },
    async recordResolution(ref, outcome, note, actor, now = Date.now()) {
      const [, result] = await db.batch([
        query(`INSERT INTO organizer_audit(action,actor,ref,at)
          SELECT 'exception resolved',?,ref,? FROM attempts WHERE ${resolutionCondition}`, actor, now, ref),
        query(`INSERT INTO payment_resolutions(ref,outcome,note,actor,at)
          SELECT ref,?,?,?,? FROM attempts WHERE ${resolutionCondition}`, outcome, note, actor, now, ref),
      ]);
      return changed(result);
    },
    async auditAction(action, actor, ref = null, now = Date.now()) {
      await query("INSERT INTO organizer_audit(action,actor,ref,at) VALUES(?,?,?,?)", action, actor, ref, now).run();
    },
    checkoutHistory: () => query(`
      SELECT action,actor,at FROM organizer_audit WHERE ref IS NULL AND action LIKE 'checkout %' ORDER BY id DESC LIMIT 1
    `).first(),
    async startAdminSession(id, actor, credential, expiresAt, previous, now = Date.now()) {
      await db.batch([
        query("DELETE FROM organizer_sessions WHERE expiresAt<=? OR id=?", now, previous ?? null),
        query("INSERT INTO organizer_sessions(id,actor,credential,expiresAt) VALUES(?,?,?,?)", id, actor, credential, expiresAt),
      ]);
    },
    findAdminSession: (id, now = Date.now()) => query(
      "SELECT actor,credential FROM organizer_sessions WHERE id=? AND expiresAt>?", id, now,
    ).first(),
    async endAdminSession(id) {
      await query("DELETE FROM organizer_sessions WHERE id=?", id).run();
    },
    async takeRateLimit(key, now, limit, windowMs) {
      const id = await hash(key);
      const [, result] = await db.batch([
        query(`DELETE FROM booking_rate_limits WHERE key IN (
          SELECT key FROM booking_rate_limits WHERE expiresAt<=? ORDER BY expiresAt LIMIT 16
        )`, now),
        query(`INSERT INTO booking_rate_limits(key,count,expiresAt) SELECT ?,1,?
          WHERE (SELECT used FROM booking_rate_limit_capacity WHERE id=1)<4096
          OR EXISTS (SELECT 1 FROM booking_rate_limits WHERE key=?)
          ON CONFLICT(key) DO UPDATE SET
            count=CASE WHEN expiresAt<=? THEN 1 ELSE count+1 END,
            expiresAt=CASE WHEN expiresAt<=? THEN excluded.expiresAt ELSE expiresAt END
          WHERE expiresAt<=? OR count<?`, id, now + windowMs, id, now, now, now, limit),
      ]);
      return changed(result);
    },
  };
}
