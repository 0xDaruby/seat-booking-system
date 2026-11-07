CREATE TABLE attempts (
  ref TEXT NOT NULL PRIMARY KEY,
  session TEXT NOT NULL,
  seat TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preview','test','live')),
  status TEXT NOT NULL CHECK (status IN ('initializing','pending','paid','failed','canceled','expired','exception')),
  checkoutUrl TEXT,
  ticketId TEXT UNIQUE,
  expiresAt INTEGER NOT NULL,
  nextCheck INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  CHECK ((status = 'paid') = (ticketId IS NOT NULL))
);

CREATE UNIQUE INDEX seat_allocation ON attempts(seat) WHERE status IN ('initializing','pending','paid');
CREATE UNIQUE INDEX session_allocation ON attempts(session) WHERE status IN ('initializing','pending','paid');
CREATE INDEX attempts_by_session ON attempts(session, updatedAt DESC);
CREATE INDEX attempts_by_check ON attempts(nextCheck);
CREATE INDEX attempts_by_mode ON attempts(mode);

CREATE TABLE seat_snapshot (id INTEGER PRIMARY KEY CHECK (id=1), seats TEXT NOT NULL CHECK (json_valid(seats)));
INSERT INTO seat_snapshot(id,seats) VALUES(1,'{}');

CREATE TRIGGER seat_snapshot_on_insert AFTER INSERT ON attempts
WHEN NEW.status IN ('initializing','pending','paid') BEGIN
  UPDATE seat_snapshot SET seats=json_set(seats,'$.' || NEW.seat, CASE NEW.status WHEN 'paid' THEN 'sold' ELSE 'held' END)
  WHERE id=1;
END;

CREATE TRIGGER seat_snapshot_on_update AFTER UPDATE OF status ON attempts
WHEN NEW.status <> OLD.status AND (NEW.status IN ('initializing','pending','paid') OR OLD.status IN ('initializing','pending','paid')) BEGIN
  UPDATE seat_snapshot SET seats=CASE
    WHEN NEW.status IN ('initializing','pending','paid')
      THEN json_set(seats,'$.' || NEW.seat, CASE NEW.status WHEN 'paid' THEN 'sold' ELSE 'held' END)
    ELSE json_remove(seats,'$.' || OLD.seat)
  END WHERE id=1;
END;

CREATE TRIGGER seat_snapshot_on_delete AFTER DELETE ON attempts
WHEN OLD.status IN ('initializing','pending','paid') BEGIN
  UPDATE seat_snapshot SET seats=json_remove(seats,'$.' || OLD.seat) WHERE id=1;
END;

CREATE TABLE booking_settings (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE organizer_sessions (
  id TEXT NOT NULL PRIMARY KEY,
  actor TEXT NOT NULL,
  credential TEXT NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX organizer_sessions_by_expiry ON organizer_sessions(expiresAt);

CREATE TABLE organizer_audit (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  ref TEXT REFERENCES attempts(ref),
  at INTEGER NOT NULL
);
CREATE INDEX organizer_audit_by_ref ON organizer_audit(ref, id DESC);

CREATE TABLE payment_resolutions (
  ref TEXT NOT NULL PRIMARY KEY REFERENCES attempts(ref),
  outcome TEXT NOT NULL CHECK (outcome IN ('refund-confirmed','no-charge-confirmed','handled-externally')),
  note TEXT NOT NULL,
  actor TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE booking_rate_limits (
  key TEXT NOT NULL PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  expiresAt INTEGER NOT NULL
);
CREATE INDEX booking_rate_limits_by_expiry ON booking_rate_limits(expiresAt);

CREATE TABLE booking_rate_limit_capacity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used INTEGER NOT NULL CHECK (used BETWEEN 0 AND 4096)
);
INSERT INTO booking_rate_limit_capacity(id, used) VALUES(1, 0);

CREATE TRIGGER booking_rate_limits_inserted AFTER INSERT ON booking_rate_limits BEGIN
  UPDATE booking_rate_limit_capacity SET used = used + 1 WHERE id = 1;
END;

CREATE TRIGGER booking_rate_limits_deleted AFTER DELETE ON booking_rate_limits BEGIN
  UPDATE booking_rate_limit_capacity SET used = used - 1 WHERE id = 1;
END;
