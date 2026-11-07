import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { event, holdMs } from "./event.mjs";

export { seats, holdMs, graceMs } from "./event.mjs";
const active = "('initializing','pending','paid')";

export function openInventory(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS attempts (
      ref TEXT PRIMARY KEY, session TEXT NOT NULL, seat TEXT NOT NULL,
      name TEXT NOT NULL, email TEXT NOT NULL, amount INTEGER NOT NULL,
      currency TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
      checkoutUrl TEXT, ticketId TEXT UNIQUE, expiresAt INTEGER NOT NULL,
      nextCheck INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
      CHECK (status IN ('initializing','pending','paid','failed','canceled','expired','exception'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS seat_allocation ON attempts(seat) WHERE status IN ${active};
    CREATE UNIQUE INDEX IF NOT EXISTS session_allocation ON attempts(session) WHERE status IN ${active};
    CREATE TABLE IF NOT EXISTS booking_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS organizer_sessions (
      id TEXT PRIMARY KEY, actor TEXT NOT NULL, credential TEXT NOT NULL, expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organizer_audit (
      id INTEGER PRIMARY KEY, action TEXT NOT NULL, actor TEXT NOT NULL, ref TEXT REFERENCES attempts(ref), at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS organizer_audit_by_ref ON organizer_audit(ref, id DESC);
    CREATE TABLE IF NOT EXISTS payment_resolutions (
      ref TEXT PRIMARY KEY REFERENCES attempts(ref), outcome TEXT NOT NULL,
      note TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS attempts_by_session ON attempts(session, updatedAt DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS attempts_by_check ON attempts(nextCheck)");

  const latest = db.prepare(`
    SELECT a.*, r.ref IS NOT NULL AS resolved
    FROM attempts a LEFT JOIN payment_resolutions r ON r.ref=a.ref WHERE a.session=?
    ORDER BY CASE WHEN a.status IN ${active} THEN 0 WHEN a.status='exception' THEN 1 ELSE 2 END, a.rowid DESC LIMIT 1
  `);
  const get = db.prepare("SELECT * FROM attempts WHERE ref = ?");
  const insert = db.prepare(`
    INSERT INTO attempts(ref,session,seat,name,email,amount,currency,mode,status,expiresAt,nextCheck,updatedAt)
    VALUES(?,?,?,?,?,?,?,?,'initializing',?,?,?)
    ON CONFLICT DO NOTHING
  `);
  const change = db.prepare(`
    UPDATE attempts SET status=?, ticketId=?, updatedAt=?, nextCheck=?
    WHERE ref=? AND status=?
  `);
  const readSetting = db.prepare("SELECT value FROM booking_settings WHERE key=?");
  const writeSetting = db.prepare("INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const isPaused = () => readSetting.get("checkout_paused")?.value === "1";
  const audit = db.prepare("INSERT INTO organizer_audit(action,actor,ref,at) VALUES(?,?,?,?)");
  const addResolution = db.prepare(`
    INSERT INTO payment_resolutions(ref,outcome,note,actor,at)
    SELECT ref,?,?,?,? FROM attempts WHERE ref=? AND status='exception'
    ON CONFLICT(ref) DO NOTHING
  `);

  function transaction(run) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    close: () => db.close(),
    bindMode(mode) {
      transaction(() => {
        const stored = readSetting.get("mode");
        const foreign = db.prepare("SELECT 1 FROM attempts WHERE mode<>? LIMIT 1").get(mode);
        if ((stored && stored.value !== mode) || foreign) throw new Error("The booking database belongs to another mode.");
        if (!stored) {
          writeSetting.run("mode", mode);
          if (mode === "live" && !readSetting.get("checkout_paused")) writeSetting.run("checkout_paused", "1");
        }
      });
    },
    latest: (session) => latest.get(session),
    get: (ref) => get.get(ref),
    claim({ session, seat, name, email, mode, requestId, forcePause = false }, now = Date.now()) {
      const ref = "s004-" + createHash("sha256").update(session + ":" + requestId).digest("hex").slice(0, 32);
      return transaction(() => {
        const existing = latest.get(session);
        if (existing && ["initializing", "pending", "paid", "exception"].includes(existing.status)) {
          return { existing };
        }
        const replay = get.get(ref);
        if (replay) return { existing: replay };
        if (forcePause || isPaused()) return { paused: true };
        const { changes } = insert.run(ref, session, seat, name, email, event.priceKobo, event.currency, mode, now + holdMs, now + 30_000, now);
        return changes ? { created: get.get(ref) } : {};
      });
    },
    initialized(ref, checkoutUrl, now = Date.now()) {
      db.prepare("UPDATE attempts SET status='pending', checkoutUrl=?, updatedAt=? WHERE ref=? AND status='initializing'").run(checkoutUrl, now, ref);
      return get.get(ref);
    },
    settle(attempt, status, now = Date.now()) {
      if (["paid", "exception"].includes(attempt.status)) return get.get(attempt.ref);
      const ticketId = status === "paid" ? "S004-" + randomUUID().toUpperCase() : null;
      change.run(status, ticketId, now, now + 300_000, attempt.ref, attempt.status);
      return get.get(attempt.ref);
    },
    defer(ref, now = Date.now()) {
      db.prepare(`UPDATE attempts SET nextCheck=? + CASE WHEN status IN ${active} THEN 60000 ELSE 900000 END WHERE ref=?`).run(now, ref);
    },
    due(now = Date.now()) {
      return db.prepare(`
        SELECT * FROM attempts WHERE status IN ('initializing','pending','expired','failed','canceled')
        AND (status IN ${active} OR updatedAt >= ?)
        AND nextCheck <= ? ORDER BY nextCheck LIMIT 20
      `).all(now - 24 * 60 * 60_000, now);
    },
    availability() {
      const allocated = db.prepare(`SELECT seat, status FROM attempts WHERE status IN ${active}`).all();
      return Object.fromEntries(allocated.map(({ seat, status }) => [seat, status === "paid" ? "sold" : "held"]));
    },
    records() {
      return db.prepare(`
        SELECT a.ref, a.seat, a.status, a.updatedAt, r.outcome AS resolution
        FROM attempts a LEFT JOIN payment_resolutions r ON r.ref=a.ref ORDER BY a.rowid DESC
      `).all();
    },
    detail(ref) {
      const booking = db.prepare("SELECT ref,seat,status,name,email,ticketId,expiresAt,updatedAt FROM attempts WHERE ref=?").get(ref);
      if (!booking) return null;
      const resolution = db.prepare("SELECT outcome,note,actor,at FROM payment_resolutions WHERE ref=?").get(ref) ?? null;
      const auditTrail = db.prepare("SELECT action,actor,at FROM organizer_audit WHERE ref=? ORDER BY id DESC LIMIT 15").all(ref);
      return { ...booking, resolution, auditTrail };
    },
    exportRows() {
      return db.prepare(`
        SELECT a.ref, a.seat, a.status, a.updatedAt, a.ticketId,
        CASE WHEN a.status='paid' THEN a.name END AS attendee, r.outcome AS resolution
        FROM attempts a LEFT JOIN payment_resolutions r ON r.ref=a.ref ORDER BY a.rowid DESC
      `).all();
    },
    isPaused,
    setPaused(paused, actor, now = Date.now()) {
      return transaction(() => {
        if (isPaused() === paused) return;
        writeSetting.run("checkout_paused", paused ? "1" : "0");
        audit.run(paused ? "checkout paused" : "checkout opened", actor, null, now);
      });
    },
    releasePreview(ref, actor, now = Date.now()) {
      return transaction(() => {
        const { changes } = db.prepare(`
          UPDATE attempts SET status='expired', updatedAt=?, nextCheck=?
          WHERE ref=? AND mode='preview' AND status IN ('initializing','pending')
        `).run(now, now, ref);
        if (changes) audit.run("hold released", actor, ref, now);
        return Boolean(changes);
      });
    },
    recordResolution(ref, outcome, note, actor, now = Date.now()) {
      return transaction(() => {
        const { changes } = addResolution.run(outcome, note, actor, now, ref);
        if (changes) audit.run("exception resolved", actor, ref, now);
        return Boolean(changes);
      });
    },
    auditAction(action, actor, ref = null, now = Date.now()) {
      audit.run(action, actor, ref, now);
    },
    checkoutHistory() {
      return db.prepare("SELECT action,actor,at FROM organizer_audit WHERE ref IS NULL AND action LIKE 'checkout %' ORDER BY id DESC LIMIT 1").get() ?? null;
    },
    startAdminSession(id, actor, credential, expiresAt, previous, now = Date.now()) {
      transaction(() => {
        db.prepare("DELETE FROM organizer_sessions WHERE expiresAt<=? OR id=?").run(now, previous ?? null);
        db.prepare("INSERT INTO organizer_sessions(id,actor,credential,expiresAt) VALUES(?,?,?,?)").run(id, actor, credential, expiresAt);
      });
    },
    findAdminSession(id, now = Date.now()) {
      return db.prepare("SELECT actor,credential FROM organizer_sessions WHERE id=? AND expiresAt>?").get(id, now);
    },
    endAdminSession(id) {
      db.prepare("DELETE FROM organizer_sessions WHERE id=?").run(id);
    },
  };
}
