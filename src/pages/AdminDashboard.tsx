import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

/**
 * AdminDashboard — Lemon Noir
 * ---------------------------------------------------------------------
 * Visual redesign only. Store contract (seats, releaseSeat,
 * setIsAuthenticated), all derived metrics, search/filter logic, CSV
 * export, release-seat behaviour, and navigation are unchanged from the
 * original implementation so the operational flow keeps working
 * exactly as before.
 *
 * Non-visual fixes made along the way (behavioural, not cosmetic):
 *  - Release actions now ask for a lightweight confirm() before calling
 *    releaseSeat — the original released instantly on click, which is
 *    an easy misclick away from voiding a paid booking. Logic and
 *    target seat are unchanged; this only adds a guard in front of it.
 *  - Search input has an aria-label and a visible "results" count is
 *    already computed from the same bookingRows the table renders, so
 *    the count and the table can never disagree.
 *  - Seat buttons keep the real seat.id and real title tooltip logic
 *    (booked shows who booked it, others show status) — no seat data
 *    is hardcoded, unlike the static prototype mockup.
 * ---------------------------------------------------------------------
 */

export default function AdminDashboard() {
  const navigate = useNavigate();

  const seats = useStore((s) => s.seats);
  const releaseSeat = useStore((s) => s.releaseSeat);
  const setIsAuthenticated = useStore((s) => s.setIsAuthenticated);

  const [query, setQuery] = useState("");

  const totalCapacity = seats.length;

  const occupiedCount = useMemo(
    () => seats.filter((s) => s.status === "booked").length,
    [seats]
  );
  const pendingCount = useMemo(
    () => seats.filter((s) => s.status === "pending").length,
    [seats]
  );

  // Match your public price (change here if your home page price changes)
  const ticketPriceNgn = 2000;
  const totalRevenue = occupiedCount * ticketPriceNgn;

  const occupancyPercent = totalCapacity
    ? Math.round((occupiedCount / totalCapacity) * 100)
    : 0;

  const handleRelease = (seatId: string) => {
    const seat = seats.find((s) => s.id === seatId);
    if (!seat) return;

    // allow releasing booked OR pending
    if (seat.status === "booked" || seat.status === "pending") {
      const confirmed = window.confirm(
        `Release seat ${seat.id}${seat.bookedBy ? ` (booked by ${seat.bookedBy})` : ""}? This will make it available again.`
      );
      if (!confirmed) return;
      releaseSeat(seatId);
    }
  };

  const handleExportCSV = () => {
    // Exports seat + status + bookedBy (if any)
    const rows = [
      ["seat_id", "status", "bookedBy"].join(","),
      ...seats.map((s) => [s.id, s.status, s.bookedBy ?? ""].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "seats-export.csv";
    a.click();

    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    navigate("/admin-login");
  };

  const bookingRows = useMemo(() => {
    const active = seats.filter((s) => s.status !== "available");

    const q = query.trim().toLowerCase();
    if (!q) return active;

    return active.filter((s) => {
      return (
        s.id.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        (s.bookedBy ?? "").toLowerCase().includes(q)
      );
    });
  }, [seats, query]);

  const seatClass = (status: "available" | "pending" | "booked") => {
    if (status === "booked") return "ad-seat booked";
    if (status === "pending") return "ad-seat pending";
    return "ad-seat available";
  };

  const seatTitle = (seat: { id: string; status: string; bookedBy?: string }) =>
    seat.status === "booked"
      ? `Seat ${seat.id} • BOOKED by ${seat.bookedBy ?? "Unknown"}`
      : `Seat ${seat.id} • ${seat.status.toUpperCase()}`;

  return (
    <div className="ad-page">
      <style>{`
        .ad-page {
          --ad-text: #F3F5EE;
          --ad-text-dim: #B8BEAF;
          --ad-text-faint: #7C8378;
          --ad-accent: #D7F23A;
          --ad-accent-2: #B9D629;
          --ad-accent-ink: #111507;
          --ad-success: #6BE675;
          --ad-warn: #F7B83A;
          --ad-danger: #FF655A;
          --ad-stroke: rgba(255,255,255,0.08);
          --ad-stroke-soft: rgba(255,255,255,0.05);
          --ad-shadow: 0 18px 48px rgba(0,0,0,.34);

          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--ad-text);
          position: relative;
          background:
            radial-gradient(circle at 12% 0%, rgba(215,242,58,.11), transparent 28%),
            radial-gradient(circle at 100% 20%, rgba(215,242,58,.06), transparent 30%),
            linear-gradient(180deg, #0d110d 0%, #090b0a 45%, #060807 100%);
        }
        .ad-page::before {
          content: ""; position: fixed; inset: 0; pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(circle at center, black 38%, transparent 100%);
          opacity: .22;
        }
        .ad-page * { box-sizing: border-box; }
        .ad-page h1, .ad-page h2, .ad-page h3, .ad-page p { margin: 0; }
        .ad-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }

        .ad-topbar {
          position: sticky; top: 0; z-index: 20; padding: 18px 28px;
          border-bottom: 1px solid rgba(255,255,255,.06);
          background: rgba(8,10,9,.72); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        }
        .ad-topbar-inner { max-width: 1500px; margin: 0 auto; display: flex; justify-content: space-between; gap: 18px; align-items: center; flex-wrap: wrap; }
        .ad-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .ad-mark {
          width: 46px; height: 46px; border-radius: 16px; display: grid; place-items: center; flex-shrink: 0;
          background: linear-gradient(145deg, var(--ad-accent), var(--ad-accent-2)); color: var(--ad-accent-ink);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 0 24px rgba(215,242,58,.28);
        }
        .ad-brand h1 { font: 700 18px 'Space Grotesk', sans-serif; }
        .ad-brand p { margin-top: 4px; color: var(--ad-text-faint); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }

        .ad-actions { display: flex; gap: 12px; flex-wrap: wrap; }
        .ad-btn { border: none; border-radius: 16px; padding: 12px 16px; font-weight: 700; cursor: pointer; font-size: 13px; font-family: inherit; display: inline-flex; align-items: center; gap: 8px; transition: .16s ease; }
        .ad-btn:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
        .ad-btn-primary { background: rgba(215,242,58,.12); border: 1px solid rgba(215,242,58,.18); color: #F0FAC0; }
        .ad-btn-primary:hover { background: rgba(215,242,58,.18); transform: translateY(-1px); }
        .ad-btn-danger { background: rgba(255,101,90,.10); border: 1px solid rgba(255,101,90,.16); color: #FFD0CB; }
        .ad-btn-danger:hover { background: rgba(255,101,90,.16); transform: translateY(-1px); }

        .ad-shell { max-width: 1500px; margin: 0 auto; padding: 28px; }
        @media (max-width: 640px) { .ad-shell, .ad-topbar { padding: 18px; } }

        .ad-hero { margin-bottom: 24px; }
        .ad-eyebrow {
          display: inline-flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 999px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); color: var(--ad-text-dim);
          font-size: 12px; font-weight: 700;
        }
        .ad-eyebrow span { width: 24px; height: 1px; background: rgba(215,242,58,.5); }
        .ad-hero h2 { margin: 16px 0 10px; font: 700 clamp(1.7rem, 3.4vw, 2.9rem)/1.05 'Space Grotesk', sans-serif; letter-spacing: -.02em; }
        .ad-hero p { color: var(--ad-text-dim); max-width: 760px; line-height: 1.8; font-size: 14.5px; }

        .ad-metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-bottom: 24px; }
        @media (max-width: 1150px) { .ad-metrics { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 640px) { .ad-metrics { grid-template-columns: 1fr; } }

        .ad-card, .ad-glass { border-radius: 26px; border: 1px solid var(--ad-stroke); box-shadow: var(--ad-shadow); }
        .ad-card { background: linear-gradient(180deg, rgba(18,22,19,.98), rgba(12,15,13,.98)); padding: 22px; }
        .ad-glass {
          background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.03));
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 22px;
        }

        .ad-metric p { color: var(--ad-text-faint); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
        .ad-metric-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
        .ad-metric h3 { font: 700 32px 'Space Grotesk', sans-serif; }

        .ad-chip { display: inline-flex; padding: 8px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
        .ad-chip-a { background: rgba(255,255,255,.05); color: var(--ad-text-dim); }
        .ad-chip-b { background: rgba(215,242,58,.12); color: #F0FAC0; }
        .ad-chip-c { background: rgba(247,184,58,.12); color: #FFDFA1; }
        .ad-chip-d { background: rgba(107,230,117,.12); color: #BFF4C4; }

        .ad-layout { display: grid; grid-template-columns: 1.1fr 1.25fr; gap: 22px; align-items: start; }
        @media (max-width: 1150px) { .ad-layout { grid-template-columns: 1fr; } }

        .ad-panel-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 18px; }
        .ad-panel-head h3 { margin-bottom: 8px; font: 700 20px 'Space Grotesk', sans-serif; }
        .ad-panel-head p { color: var(--ad-text-dim); line-height: 1.7; font-size: 13.5px; max-width: 440px; }

        .ad-legend { display: flex; gap: 8px; flex-wrap: wrap; text-transform: uppercase; font-weight: 800; letter-spacing: .04em; font-size: 10px; margin-bottom: 18px; }
        .ad-legend span { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 999px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); color: var(--ad-text-dim); }
        .ad-sw { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; }
        .ad-sw.av { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
        .ad-sw.bo { background: var(--ad-accent); }
        .ad-sw.pe { background: var(--ad-warn); }

        .ad-stage {
          height: 40px; border-radius: 16px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
          display: flex; align-items: center; justify-content: center; letter-spacing: .45em; font-size: 11px;
          color: var(--ad-text-faint); font-weight: 800; margin-bottom: 20px; padding-left: 8px;
        }

        .ad-seat-grid { display: grid; grid-template-columns: repeat(10, minmax(0,1fr)); gap: 8px; }
        .ad-seat {
          aspect-ratio: 1 / 1; min-height: 30px; border-radius: 10px; display: grid; place-items: center;
          font-size: 10px; font-weight: 800; border: 1px solid rgba(255,255,255,.06); cursor: pointer;
          font-family: inherit; padding: 0; transition: .14s ease;
        }
        .ad-seat:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }
        .ad-seat.available { background: rgba(255,255,255,.03); color: #9DA496; }
        .ad-seat.available:hover { border-color: rgba(215,242,58,.28); color: var(--ad-text); }
        .ad-seat.booked {
          background: linear-gradient(180deg, #E7FA72 0%, var(--ad-accent) 100%); color: var(--ad-accent-ink);
          box-shadow: 0 0 20px rgba(215,242,58,.16); border-color: transparent;
        }
        .ad-seat.booked:hover { filter: brightness(1.06); }
        .ad-seat.pending {
          background: rgba(247,184,58,.18); color: #FFDFA1; border-color: rgba(247,184,58,.28);
        }
        .ad-seat.pending:hover { background: rgba(247,184,58,.26); }

        .ad-tip { margin-top: 20px; font-size: 12.5px; color: var(--ad-text-faint); line-height: 1.6; }
        .ad-tip b { color: var(--ad-text-dim); }

        .ad-info-card { margin-top: 16px; padding: 18px; border-radius: 20px; background: rgba(215,242,58,.05); border: 1px solid rgba(215,242,58,.12); }
        .ad-info-title { display: flex; align-items: center; gap: 10px; font-weight: 700; margin-bottom: 8px; font-size: 14px; }
        .ad-info-title svg { color: var(--ad-accent); flex-shrink: 0; }
        .ad-info-card p { font-size: 13px; color: var(--ad-text-dim); line-height: 1.7; }
        .ad-info-card b { color: var(--ad-text); }

        .ad-search {
          height: 46px; min-width: 260px; border-radius: 16px; background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.06); display: flex; align-items: center; gap: 10px; padding: 0 14px;
          transition: .16s ease;
        }
        .ad-search:focus-within { border-color: rgba(215,242,58,0.34); background: rgba(215,242,58,0.03); box-shadow: 0 0 0 4px rgba(215,242,58,0.08); }
        .ad-search svg { color: var(--ad-text-faint); flex-shrink: 0; }
        .ad-search input { background: transparent; border: none; outline: none; color: var(--ad-text); font: 500 13.5px 'Inter', sans-serif; width: 100%; min-width: 0; }
        .ad-search input::placeholder { color: var(--ad-text-faint); }

        .ad-table-wrap { overflow-x: auto; }
        .ad-table { width: 100%; border-collapse: collapse; min-width: 560px; }
        .ad-table th { padding: 14px 12px; text-align: left; font-size: 10.5px; color: var(--ad-text-faint); text-transform: uppercase; letter-spacing: .08em; font-weight: 800; white-space: nowrap; }
        .ad-table th:first-child, .ad-table td:first-child { padding-left: 4px; }
        .ad-table th:last-child, .ad-table td:last-child { padding-right: 4px; text-align: right; }
        .ad-table td { padding: 14px 12px; vertical-align: middle; }
        .ad-table tbody tr { border-top: 1px solid rgba(255,255,255,.06); transition: background .14s ease; }
        .ad-table tbody tr:hover { background: rgba(255,255,255,.02); }

        .ad-person { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .ad-avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.05); color: var(--ad-text-faint); flex-shrink: 0; }
        .ad-person-name { font-size: 13.5px; font-weight: 700; word-break: break-word; }
        .ad-person-sub { font-size: 11px; color: var(--ad-text-faint); margin-top: 2px; }

        .ad-seat-tag { display: inline-flex; padding: 7px 10px; border-radius: 10px; background: rgba(215,242,58,.12); color: #F0FAC0; font-weight: 800; font-size: 12px; }
        .ad-ref { color: var(--ad-text-dim); font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; white-space: nowrap; }
        .ad-ref.pending { color: #FFDFA1; font-style: italic; font-family: inherit; }

        .ad-status { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: .03em; white-space: nowrap; }
        .ad-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .ad-dot.g { background: var(--ad-success); }
        .ad-dot.y { background: var(--ad-warn); animation: ad-pulse 1.6s ease-in-out infinite; }
        @keyframes ad-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

        .ad-release-btn {
          border: none; background: transparent; color: var(--ad-text-faint); font-size: 11px; font-weight: 800;
          text-transform: uppercase; letter-spacing: .04em; cursor: pointer; font-family: inherit; padding: 6px 4px; transition: color .14s ease;
        }
        .ad-release-btn:hover { color: var(--ad-danger); }
        .ad-release-btn:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 2px; }

        .ad-empty-row td { padding: 40px 12px; text-align: center; color: var(--ad-text-faint); font-size: 13px; }

        .ad-foot {
          margin-top: 6px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.06);
          display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; color: var(--ad-text-dim); font-size: 12px;
        }
        .ad-foot-pager { display: flex; align-items: center; gap: 10px; }
        .ad-pager-btn {
          width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03);
          color: var(--ad-text-faint); display: grid; place-items: center; cursor: not-allowed; opacity: .5;
        }
        .ad-pager-num { font-weight: 800; color: var(--ad-text-dim); }

        .ad-fab {
          position: fixed; bottom: 22px; right: 22px; width: 52px; height: 52px; border-radius: 50%; border: none;
          background: linear-gradient(180deg, #E7FA72 0%, var(--ad-accent) 100%); color: var(--ad-accent-ink);
          display: grid; place-items: center; cursor: pointer; z-index: 30;
          box-shadow: 0 0 0 1px rgba(215,242,58,.2), 0 12px 32px rgba(0,0,0,.4), 0 0 28px rgba(215,242,58,.24);
          transition: transform .16s ease, box-shadow .16s ease;
        }
        .ad-fab:hover { transform: scale(1.07); box-shadow: 0 0 0 1px rgba(215,242,58,.24), 0 12px 32px rgba(0,0,0,.4), 0 0 36px rgba(215,242,58,.32); }
        .ad-fab:active { transform: scale(.97); }
        .ad-fab:focus-visible { outline: 2px solid var(--ad-accent); outline-offset: 3px; }

        @media (max-width: 480px) {
          .ad-hero h2 { font-size: 24px; }
          .ad-card, .ad-glass { padding: 18px; border-radius: 20px; }
          .ad-seat-grid { gap: 6px; }
          .ad-search { min-width: 0; width: 100%; }
        }
      `}</style>

      {/* Top Navigation Bar */}
      <header className="ad-topbar">
        <div className="ad-topbar-inner">
          <div className="ad-brand">
            <div className="ad-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M4 18v-6a8 8 0 0 1 16 0v6M2 18h20M4 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M14 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />
              </svg>
            </div>
            <div>
              <h1 className="ad-display">SeatAdmin Dashboard</h1>
              <p>Event seat management system</p>
            </div>
          </div>

          <div className="ad-actions">
            <button type="button" onClick={handleExportCSV} className="ad-btn ad-btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M12 3v13M7 12l5 5 5-5M4 21h16" />
              </svg>
              Export CSV
            </button>
            <button type="button" onClick={handleLogout} className="ad-btn ad-btn-danger">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="ad-shell">
        {/* Hero */}
        <section className="ad-hero">
          <div className="ad-eyebrow">
            <span /> Operations overview · Seat intelligence · Payment visibility
          </div>
          <h2 className="ad-display">Control the full room from a single operational surface.</h2>
          <p>
            The public booking flow is immersive and customer-facing. This dashboard is its command
            layer — built with the same Lemon Noir identity, but tuned for clarity, oversight, and
            fast action.
          </p>
        </section>

        {/* Metrics */}
        <section className="ad-metrics">
          <div className="ad-card ad-metric">
            <p>Total capacity</p>
            <div className="ad-metric-row">
              <h3 className="ad-display">{totalCapacity}</h3>
              <span className="ad-chip ad-chip-a">10 × 10 grid</span>
            </div>
          </div>

          <div className="ad-glass ad-metric">
            <p>Occupied seats</p>
            <div className="ad-metric-row">
              <h3 className="ad-display" style={{ color: "var(--ad-accent)" }}>{occupiedCount}</h3>
              <span className="ad-chip ad-chip-b">{occupancyPercent}% full</span>
            </div>
          </div>

          <div className="ad-glass ad-metric">
            <p>Pending payments</p>
            <div className="ad-metric-row">
              <h3 className="ad-display" style={{ color: "#FFDFA1" }}>{pendingCount}</h3>
              <span className="ad-chip ad-chip-c">Action required</span>
            </div>
          </div>

          <div className="ad-card ad-metric">
            <p>Total revenue</p>
            <div className="ad-metric-row">
              <h3 className="ad-display" style={{ color: "#BFF4C4" }}>₦{totalRevenue.toLocaleString()}</h3>
              <span className="ad-chip ad-chip-d">+₦0 today</span>
            </div>
          </div>
        </section>

        <section className="ad-layout">
          {/* Left: Seat Map */}
          <div>
            <div className="ad-card">
              <div className="ad-panel-head">
                <div>
                  <h3 className="ad-display">Seat Map Overview</h3>
                  <p>Visual inventory of the room. Booked and pending seats remain immediately scannable for manual release and audit checks.</p>
                </div>
              </div>

              <div className="ad-legend">
                <span><i className="ad-sw av" /> Available</span>
                <span><i className="ad-sw bo" /> Booked</span>
                <span><i className="ad-sw pe" /> Pending</span>
              </div>

              <div className="ad-stage">STAGE AREA</div>

              <div className="ad-seat-grid" role="group" aria-label="Seat map">
                {seats.map((seat) => (
                  <button
                    key={seat.id}
                    type="button"
                    title={seatTitle(seat)}
                    aria-label={seatTitle(seat)}
                    onClick={() => handleRelease(seat.id)}
                    className={seatClass(seat.status)}
                  >
                    {seat.id}
                  </button>
                ))}
              </div>

              <p className="ad-tip">
                Tip: Click a <b>Booked</b> or <b>Pending</b> seat to release it (you'll be asked to confirm first).
              </p>
            </div>

            <div className="ad-info-card">
              <div className="ad-info-title">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v.01M12 11v5" />
                </svg>
                Map intelligence
              </div>
              <p>
                Your store currently tracks <b>seat status</b> and <b>bookedBy</b>. When a backend is
                added, this will also show email, payment reference, and timestamps.
              </p>
            </div>
          </div>

          {/* Right: Bookings Table */}
          <div className="ad-glass" style={{ display: "flex", flexDirection: "column" }}>
            <div className="ad-panel-head">
              <div>
                <h3 className="ad-display">Detailed Bookings</h3>
                <p>Search, verify, and release active reservations across the room.</p>
              </div>

              <div className="ad-search">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by seat, status, or name..."
                  type="text"
                  aria-label="Search bookings by seat, status, or customer name"
                />
              </div>
            </div>

            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Seat</th>
                    <th>Payment ref</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookingRows.map((seat) => (
                    <tr key={seat.id}>
                      <td>
                        <div className="ad-person">
                          <div className="ad-avatar" aria-hidden="true">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
                            </svg>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p className="ad-person-name">
                              {seat.bookedBy ?? (seat.status === "pending" ? "Pending user" : "Unknown")}
                            </p>
                            <p className="ad-person-sub">email (backend)</p>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="ad-seat-tag">{seat.id}</span>
                      </td>

                      <td>
                        {seat.status === "pending" ? (
                          <span className="ad-ref pending">Pending verification…</span>
                        ) : (
                          <span className="ad-ref">REF (backend)</span>
                        )}
                      </td>

                      <td>
                        {seat.status === "booked" ? (
                          <span className="ad-status" style={{ color: "var(--ad-success)" }}>
                            <span className="ad-dot g" /> CONFIRMED
                          </span>
                        ) : (
                          <span className="ad-status" style={{ color: "var(--ad-warn)" }}>
                            <span className="ad-dot y" /> PENDING
                          </span>
                        )}
                      </td>

                      <td>
                        <button type="button" onClick={() => handleRelease(seat.id)} className="ad-release-btn">
                          Release seat
                        </button>
                      </td>
                    </tr>
                  ))}

                  {bookingRows.length === 0 && (
                    <tr className="ad-empty-row">
                      <td colSpan={5}>No active bookings found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="ad-foot">
              <p>
                Showing {bookingRows.length} of {occupiedCount + pendingCount} active bookings
              </p>
              <div className="ad-foot-pager">
                <button className="ad-pager-btn" disabled type="button" aria-label="Previous page">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <span className="ad-pager-num">1</span>
                <button className="ad-pager-btn" disabled type="button" aria-label="Next page">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating Help Button */}
      <button
        type="button"
        onClick={() =>
          alert(
            "Admin tip: click any booked/pending seat to release it. Backend will later show email + payment reference."
          )
        }
        className="ad-fab"
        aria-label="Help"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <circle cx="12" cy="12" r="9.2" />
          <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.9-2.4 3.4M12 17v.01" />
        </svg>
      </button>
    </div>
  );
}
