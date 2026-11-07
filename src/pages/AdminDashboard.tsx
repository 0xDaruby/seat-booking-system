import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import EventShell from "../components/EventShell";
import { api, ApiError, event } from "../booking";

type Status = "initializing" | "pending" | "paid" | "failed" | "canceled" | "expired" | "exception";
type Resolution = "refund-confirmed" | "no-charge-confirmed" | "handled-externally";
type Attempt = { seat: string; status: Status; updatedAt: number; ref: string; resolution: Resolution | null };
type Audit = { action: string; actor: string; at: number };
type Snapshot = {
  records: Attempt[]; actor: string; mode: "preview" | "test" | "live";
  checkoutPaused: boolean; forcePause: boolean; checkoutChange: Audit | null;
};
type Detail = Omit<Attempt, "resolution"> & {
  name: string; email: string; ticketId: string | null; expiresAt: number;
  resolution: { outcome: Resolution; note: string; actor: string; at: number } | null;
  auditTrail: Audit[];
};

const states: Record<Status, string> = {
  initializing: "Held", pending: "Held", paid: "Sold", failed: "Declined",
  canceled: "Canceled", expired: "Released", exception: "Needs review",
};
const outcomes: Record<Resolution, string> = {
  "refund-confirmed": "Refund confirmed",
  "no-charge-confirmed": "No charge confirmed",
  "handled-externally": "Handled externally",
};
const held = (status: Status) => status === "initializing" || status === "pending";
const localTime = (ms: number) => new Date(ms).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });

export default function AdminDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [detail, setDetail] = useState<Detail>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const returnFocus = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  const reportError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      navigate("/admin-login", { replace: true });
      return;
    }
    setError(err instanceof Error ? err.message : "Organizer records could not be loaded.");
  }, [navigate]);

  useEffect(() => {
    let active = true;
    api<Snapshot>("admin/records").then((data) => {
      if (active) setSnapshot(data);
    }).catch((err: unknown) => {
      if (active) reportError(err);
    });
    return () => { active = false; };
  }, [reportError]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch (err) { reportError(err); }
    finally { setBusy(false); }
  }

  async function loadDetail(ref: string) {
    const result = await api<{ booking: Detail }>("admin/booking?ref=" + encodeURIComponent(ref));
    setDetail(result.booking);
  }

  async function refresh(ref?: string) {
    const records = api<Snapshot>("admin/records").then(setSnapshot);
    await Promise.all([records, ref && loadDetail(ref)]);
  }

  const counts = { held: 0, sold: 0, exceptions: 0 };
  for (const row of snapshot?.records ?? []) {
    if (held(row.status)) counts.held += 1;
    if (row.status === "paid") counts.sold += 1;
    if (row.status === "exception" && !row.resolution) counts.exceptions += 1;
  }
  const shown = snapshot?.records.filter((row) => {
    const term = query.trim().toLowerCase();
    if (term && !row.seat.toLowerCase().includes(term) && !row.ref.includes(term)) return false;
    if (filter === "held") return held(row.status);
    if (filter === "review") return row.status === "exception" && !row.resolution;
    if (filter === "resolved") return Boolean(row.resolution);
    return filter === "all" || row.status === filter;
  });

  return <EventShell><section className="wrap booking admin">
    <p className="eyebrow">Series 004 / Organizer</p>
    <h1>Seat management.</h1>
    <p className="muted">Review allocations, confirmed tickets, and payment exceptions.</p>
    {error && <div role="alert" className="admin-message error">{error} <button className="text-button" disabled={busy} onClick={() => run(() => refresh(detail?.ref))}>Refresh records</button></div>}
    {notice && <p className="admin-message" role="status">{notice}</p>}
    {!snapshot && !error && <p role="status">Loading records…</p>}
    {snapshot && <>
      <dl className="metrics">
        <div><dt>Available</dt><dd>{event.rows.length * event.seatsPerRow - counts.held - counts.sold}</dd></div>
        <div><dt>Held</dt><dd>{counts.held}</dd></div>
        <div><dt>Sold</dt><dd>{counts.sold}</dd></div>
        <div><dt>Needs review</dt><dd>{counts.exceptions}</dd></div>
      </dl>
      <div className="admin-control">
        <div>
          <p className="eyebrow">Reservations · {snapshot.mode === "preview" ? "Simulation" : "Paystack " + snapshot.mode}</p>
          <h2>{snapshot.checkoutPaused ? "Checkout paused" : "Checkout open"}</h2>
          <p className="muted">Existing payments and tickets stay accessible during a pause.</p>
          {snapshot.checkoutChange && <p className="muted">Last change by {snapshot.checkoutChange.actor} · {localTime(snapshot.checkoutChange.at)} WAT</p>}
          {snapshot.forcePause && <p className="muted">Checkout is paused by server configuration.</p>}
        </div>
        <div className="actions">
          <button className="outline" disabled={busy || snapshot.forcePause} onClick={() => run(async () => {
            const paused = !snapshot.checkoutPaused;
            await api("admin/checkout", { paused });
            setNotice(paused ? "New reservations paused." : "New reservations reopened.");
            await refresh(detail?.ref);
          })}>{snapshot.checkoutPaused ? "Reopen checkout" : "Pause checkout"}</button>
          <a href="/api/admin/export" className="button">Export CSV</a>
        </div>
      </div>
      <div className="admin-toolbar">
        <p className="muted">Signed in as {snapshot.actor}</p>
        <button className="text-button" disabled={busy} onClick={() => run(async () => {
          await api("admin/logout", {});
          navigate("/admin-login", { replace: true });
        })}>Sign out</button>
      </div>
      {detail && <BookingDetail key={detail.ref} record={detail} mode={snapshot.mode} busy={busy}
        close={() => { setDetail(undefined); returnFocus.current?.focus(); }}
        release={() => run(async () => {
          const result = await api<{ released: boolean; status?: Status }>("admin/release", { ref: detail.ref });
          setNotice(result.released ? "The hold was released." : result.status === "paid" ?
            "Payment confirmed. The seat is sold." : result.status === "exception" ?
              "The payment needs organizer review." : "Payment is still unresolved. The hold is protected.");
          await refresh(detail.ref);
        })}
        resolve={(outcome, note) => run(async () => {
          await api("admin/resolution", { ref: detail.ref, outcome, note });
          setNotice("Resolution recorded.");
          await refresh(detail.ref);
        })} />}
      <div className="admin-filters">
        <label>Search by seat or reference<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label>Status<select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All attempts</option><option value="held">Held</option><option value="paid">Sold</option>
          <option value="review">Needs review</option><option value="resolved">Resolved</option>
        </select></label>
      </div>
      {shown?.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Booking attempts"><table className="admin-table">
        <caption>Booking attempts · {shown.length}</caption>
        <thead><tr><th scope="col">Seat</th><th scope="col">Status</th><th scope="col">Updated (WAT)</th><th scope="col">Booking</th></tr></thead>
        <tbody>{shown.map((record) => <tr key={record.ref}>
          <td>{record.seat}</td><td><span className={`admin-state state-${record.resolution ? "resolved" : record.status}`}>{record.resolution ? "Resolved" : states[record.status]}</span></td>
          <td>{localTime(record.updatedAt)}</td>
          <td><button className="text-button" aria-label={`View seat ${record.seat}, ${record.resolution ? "resolved" : states[record.status]}, updated ${localTime(record.updatedAt)}`}
            disabled={busy} onClick={(e) => { returnFocus.current = e.currentTarget; void run(() => loadDetail(record.ref)); }}>View</button></td>
        </tr>)}</tbody>
      </table></div> : <p role="status">{snapshot.records.length ? "No attempts match this search." : "No booking attempts yet."}</p>}
    </>}
  </section></EventShell>;
}

function BookingDetail({ record, mode, busy, close, release, resolve }: {
  record: Detail; mode: Snapshot["mode"]; busy: boolean; close: () => void;
  release: () => Promise<void>; resolve: (outcome: Resolution, note: string) => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [outcome, setOutcome] = useState<Resolution | "">("");
  const [note, setNote] = useState("");

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (confirm) confirmButton.current?.focus(); }, [confirm]);

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (outcome && note.trim()) void resolve(outcome, note.trim());
  }

  return <section className="panel admin-detail" aria-labelledby="booking-detail-heading">
    <div className="admin-toolbar">
      <h2 id="booking-detail-heading" tabIndex={-1} ref={heading}>Seat {record.seat} · {record.resolution ? "Resolved" : states[record.status]}</h2>
      <button className="text-button" type="button" onClick={close} disabled={busy}>Close details</button>
    </div>
    <dl>
      <div><dt>Attendee</dt><dd>{record.name}</dd></div>
      <div><dt>Email</dt><dd>{record.email}</dd></div>
      <div><dt>Payment reference</dt><dd>{record.ref}</dd></div>
      <div><dt>Last updated</dt><dd>{localTime(record.updatedAt)} WAT</dd></div>
      {record.ticketId && <div><dt>Ticket ID</dt><dd>{record.ticketId}</dd></div>}
      {held(record.status) && <div><dt>Checkout deadline</dt><dd>{localTime(record.expiresAt)} WAT</dd></div>}
    </dl>
    {held(record.status) && (mode !== "preview" ? <div className="actions">
      <button className="outline" disabled={busy} onClick={release}>Check payment for release</button>
    </div> : <div className="actions">
      {confirm ? <>
        <p>Release this simulated hold and make seat {record.seat} available again?</p>
        <button className="button" ref={confirmButton} disabled={busy} onClick={() => { setConfirm(false); heading.current?.focus(); void release(); }}>Confirm release</button>
        <button className="outline" disabled={busy} onClick={() => { setConfirm(false); heading.current?.focus(); }}>Keep hold</button>
      </> : <button className="outline" disabled={busy} onClick={() => setConfirm(true)}>Release simulated hold</button>}
    </div>)}
    {record.status === "exception" && (record.resolution ?
      <div className="admin-resolution">
        <p><strong>{outcomes[record.resolution.outcome]}</strong> · {record.resolution.actor} · {localTime(record.resolution.at)} WAT</p>
        <p>{record.resolution.note}</p>
      </div> : <form className="admin-resolution" onSubmit={save}>
        <h3>Record a resolution</h3>
        <p className="muted">Confirm the outcome with the payment provider before recording it here.</p>
        <label>Outcome<select required value={outcome} onChange={(e) => setOutcome(e.target.value as Resolution | "")}>
          <option value="">Choose an outcome</option>
          {Object.entries(outcomes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Resolution note<input required maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="button" disabled={busy || !outcome || !note.trim()}>Save resolution</button>
      </form>)}
    {record.auditTrail.length > 0 && <div className="admin-audit">
      <h3>Recent activity</h3>
      <ul>{record.auditTrail.map(({ action, actor, at }, index) =>
        <li key={`${action}-${at}-${index}`}>{action} · {actor} · {localTime(at)} WAT</li>)}</ul>
    </div>}
  </section>;
}
