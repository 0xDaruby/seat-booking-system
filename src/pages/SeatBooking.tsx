import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

/**
 * Seat Booking — Lemon Noir
 * ---------------------------------------------------------------------
 * Visual redesign only. Store contract, field names, navigation target,
 * and booking logic are unchanged from the original implementation so
 * the downstream payment flow keeps working exactly as before.
 *
 * Fixes made along the way (behavioural, not cosmetic):
 *  - handleProceed no longer uses a falsy check on `selectedSeat`, which
 *    would have silently broken booking for any seat id equal to 0.
 *  - File upload now validates MIME type as well as size, and resets
 *    the <input> value on rejection so the same bad file can't linger
 *    and get silently reused.
 *  - FileReader failures are caught instead of failing silently.
 * ---------------------------------------------------------------------
 */

const SEATS_PER_ROW = 10;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const SEAT_PRICE_LABEL = "₦2,000.00";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function rowLabelFor(index: number): string {
  // A, B, C ... Z, AA, AB ... for arbitrarily large venues
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export default function SeatBooking() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Store State
  const name = useStore((s) => s.name);
  const email = useStore((s) => s.email);
  const profilePicture = useStore((s) => s.profilePicture);
  const selectedSeat = useStore((s) => s.selectedSeat);
  const seats = useStore((s) => s.seats);

  // Store Actions
  const setName = useStore((s) => s.setName);
  const setEmail = useStore((s) => s.setEmail);
  const setProfilePicture = useStore((s) => s.setProfilePicture);
  const selectSeat = useStore((s) => s.selectSeat);

  const previewUrl = profilePicture;

  const availableCount = useMemo(
    () => seats.filter((s) => s.status === "available").length,
    [seats]
  );

  const seatRows = useMemo(() => chunk(seats, SEATS_PER_ROW), [seats]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFileError("Please upload a JPG, PNG, or WEBP image.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File is too large. Max 2MB.");
      e.target.value = "";
      return;
    }

    setFileError(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setProfilePicture(base64String);
    };
    reader.onerror = () => {
      setFileError("Couldn't read that file. Please try again.");
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleProceed = () => {
    if (
      !name.trim() ||
      !email.trim() ||
      !profilePicture ||
      selectedSeat === null ||
      selectedSeat === undefined
    ) {
      alert("Please fill in your name, email, upload a picture, and select a seat.");
      return;
    }
    navigate("/payment");
  };

  return (
    <div className="sb-page">
      <style>{`
        .sb-page {
          --sb-bg-0: #060807;
          --sb-panel-soft: rgba(255,255,255,0.045);
          --sb-stroke: rgba(255,255,255,0.08);
          --sb-stroke-strong: rgba(215,242,58,0.28);
          --sb-text: #F3F5EE;
          --sb-text-dim: #B7BDAF;
          --sb-text-faint: #7B8378;
          --sb-accent: #D7F23A;
          --sb-accent-2: #B8D629;
          --sb-accent-ink: #111507;
          --sb-danger: #FF655A;
          --sb-shadow-panel: 0 12px 40px rgba(0,0,0,0.28);
          --sb-shadow-glow: 0 0 0 1px rgba(215,242,58,0.08), 0 0 32px rgba(215,242,58,0.08);

          font-family: 'Inter', system-ui, sans-serif;
          color: var(--sb-text);
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 15% 0%, rgba(215,242,58,0.10), transparent 30%),
            radial-gradient(circle at 100% 18%, rgba(215,242,58,0.06), transparent 30%),
            radial-gradient(circle at 50% 45%, rgba(215,242,58,0.035), transparent 35%),
            linear-gradient(180deg, #0d110d 0%, #080a09 45%, #060807 100%);
        }
        .sb-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(circle at center, black 38%, transparent 100%);
          opacity: .24;
        }
        .sb-page * { box-sizing: border-box; }
        .sb-page h1, .sb-page h2, .sb-page h3, .sb-page p { margin: 0; }
        .sb-page .sb-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }

        .sb-header {
          position: sticky;
          top: 0;
          z-index: 40;
          backdrop-filter: blur(18px) saturate(135%);
          -webkit-backdrop-filter: blur(18px) saturate(135%);
          background: rgba(6,8,7,0.60);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sb-header-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 24px;
          min-height: 74px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .sb-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .sb-brand-mark {
          width: 42px; height: 42px; border-radius: 14px;
          display: grid; place-items: center; flex-shrink: 0;
          background: linear-gradient(145deg, var(--sb-accent), var(--sb-accent-2));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 0 26px rgba(215,242,58,.32);
          color: var(--sb-accent-ink);
        }
        .sb-brand-title { font-size: 18px; font-weight: 700; letter-spacing: .02em; line-height: 1.1; }
        .sb-brand-title span { color: var(--sb-accent); }
        .sb-brand-sub {
          margin-top: 4px; font-size: 12px; color: var(--sb-text-faint);
          letter-spacing: .04em; text-transform: uppercase;
        }
        .sb-header-actions { display: flex; align-items: center; gap: 12px; }
        .sb-status-pill {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: 999px;
          background: rgba(215,242,58,0.08); border: 1px solid rgba(215,242,58,0.16);
          color: #DDEAB0; font-size: 12px; font-weight: 600; white-space: nowrap;
        }
        .sb-status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--sb-accent); box-shadow: 0 0 12px rgba(215,242,58,.7); flex-shrink: 0;
        }
        .sb-admin-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 16px; border-radius: 12px; border: 1px solid var(--sb-stroke);
          color: var(--sb-text-dim); text-decoration: none; font-size: 13px; font-weight: 600;
          background: rgba(255,255,255,0.025); transition: .18s ease;
        }
        .sb-admin-btn:hover {
          color: var(--sb-text); border-color: var(--sb-stroke-strong);
          background: rgba(255,255,255,0.04); transform: translateY(-1px);
        }

        .sb-shell { max-width: 1280px; margin: 0 auto; padding: 0 24px 60px; position: relative; z-index: 1; }

        .sb-hero {
          padding: 34px 0 24px; display: flex; align-items: flex-end;
          justify-content: space-between; gap: 20px; flex-wrap: wrap;
        }
        .sb-hero-copy h2 {
          font-size: 34px; line-height: 1.05; letter-spacing: -0.02em; margin-bottom: 10px;
        }
        .sb-hero-copy p { max-width: 700px; color: var(--sb-text-dim); line-height: 1.65; font-size: 14px; }
        .sb-hero-meta { display: flex; gap: 12px; flex-wrap: wrap; }
        .sb-meta-card {
          min-width: 140px; padding: 14px 16px; border-radius: 16px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        }
        .sb-meta-label {
          font-size: 11px; color: var(--sb-text-faint); text-transform: uppercase;
          letter-spacing: .08em; margin-bottom: 6px;
        }
        .sb-meta-value { font-size: 18px; font-weight: 700; }

        .sb-layout { display: grid; grid-template-columns: 360px minmax(0,1fr); gap: 28px; align-items: start; }
        @media (max-width: 980px) { .sb-layout { grid-template-columns: 1fr; } }

        .sb-surface { border-radius: 24px; border: 1px solid var(--sb-stroke); box-shadow: var(--sb-shadow-panel); }
        .sb-surface-glass {
          background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.035));
          backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%);
        }
        .sb-surface-solid {
          background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent 12%),
                      linear-gradient(180deg, rgba(18,22,19,.98), rgba(12,15,13,.98));
        }
        .sb-panel { padding: 26px; position: relative; overflow: hidden; }
        .sb-panel-title-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 22px; }
        .sb-panel-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; letter-spacing: .01em; }
        .sb-panel-title svg { color: var(--sb-accent); flex-shrink: 0; }
        .sb-panel-kicker { font-size: 11px; color: var(--sb-text-faint); text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; }

        .sb-stack { display: flex; flex-direction: column; gap: 20px; }

        .sb-avatar-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 6px 0 22px; }
        .sb-avatar {
          position: relative; width: 116px; height: 116px; border-radius: 50%;
          background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
          border: 1px solid rgba(255,255,255,.10); display: grid; place-items: center; overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 0 0 10px rgba(255,255,255,.015), 0 0 36px rgba(215,242,58,.06);
        }
        .sb-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .sb-avatar svg { width: 34px; height: 34px; color: var(--sb-text-faint); }
        .sb-avatar-upload {
          position: absolute; right: 4px; bottom: 4px; width: 34px; height: 34px; border-radius: 50%;
          border: 2px solid rgba(9,12,10,0.95);
          background: linear-gradient(145deg, var(--sb-accent), var(--sb-accent-2));
          display: grid; place-items: center; color: var(--sb-accent-ink); cursor: pointer;
          box-shadow: 0 0 18px rgba(215,242,58,.35); transition: transform .16s ease;
        }
        .sb-avatar-upload:hover { transform: scale(1.05); }
        .sb-avatar-hint { text-align: center; font-size: 12px; line-height: 1.55; color: var(--sb-text-faint); }
        .sb-avatar-hint strong { color: var(--sb-text-dim); font-weight: 600; }
        .sb-file-error { text-align: center; font-size: 12px; color: var(--sb-danger); max-width: 240px; }

        .sb-field { margin-bottom: 18px; }
        .sb-field:last-child { margin-bottom: 0; }
        .sb-field-label {
          display: block; margin-bottom: 8px; font-size: 12px; font-weight: 600;
          color: var(--sb-text-dim); letter-spacing: .06em; text-transform: uppercase;
        }
        .sb-field-input {
          width: 100%; padding: 14px 15px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.018));
          color: var(--sb-text); font-size: 14px; outline: none; transition: .18s ease; font-family: inherit;
        }
        .sb-field-input::placeholder { color: var(--sb-text-faint); }
        .sb-field-input:focus {
          border-color: rgba(215,242,58,0.34); background: rgba(215,242,58,0.03);
          box-shadow: 0 0 0 4px rgba(215,242,58,0.09);
        }

        .sb-trust-card {
          display: flex; gap: 12px; align-items: flex-start; padding: 16px; border-radius: 18px;
          background: linear-gradient(180deg, rgba(215,242,58,.07), rgba(215,242,58,.04));
          border: 1px solid rgba(215,242,58,.16); box-shadow: var(--sb-shadow-glow);
        }
        .sb-trust-icon {
          width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
          background: rgba(215,242,58,.10); color: var(--sb-accent); flex-shrink: 0;
        }
        .sb-trust-copy h3 { font-size: 13px; font-weight: 700; color: #E7F4B5; margin-bottom: 6px; }
        .sb-trust-copy p { font-size: 12.5px; line-height: 1.6; color: #C8D2B0; }

        .sb-mini-stats { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
        .sb-mini-stat { padding: 16px; border-radius: 18px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
        .sb-mini-stat .sb-label { font-size: 11px; color: var(--sb-text-faint); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
        .sb-mini-stat .sb-value { font-size: 18px; font-weight: 700; }

        .sb-seat-panel { position: relative; overflow: hidden; }
        .sb-seat-panel::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(circle at 50% 18%, rgba(215,242,58,.08), transparent 32%); opacity: .95;
        }
        .sb-seat-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 26px; position: relative; z-index: 1; }
        .sb-seat-top-copy p { margin-top: 8px; max-width: 560px; color: var(--sb-text-dim); font-size: 13.5px; line-height: 1.65; }
        .sb-legend { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
        .sb-legend-item {
          display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 999px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          color: var(--sb-text-dim); font-size: 12px; font-weight: 600; white-space: nowrap;
        }
        .sb-legend-swatch { width: 14px; height: 14px; border-radius: 5px; flex-shrink: 0; }
        .sb-legend-swatch.available { background: rgba(255,255,255,0.035); border: 1px solid rgba(215,242,58,.30); }
        .sb-legend-swatch.selected { background: var(--sb-accent); box-shadow: 0 0 14px rgba(215,242,58,.5); }
        .sb-legend-swatch.booked { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,.08); opacity: .8; }

        .sb-venue-shell { position: relative; z-index: 1; padding: 8px 0 2px; }
        .sb-stage-wrap { position: relative; margin: 0 auto 34px; max-width: 720px; padding-top: 14px; }
        .sb-stage-glow {
          position: absolute; inset: 0 auto auto 50%; width: 62%; height: 120px; transform: translateX(-50%);
          background: radial-gradient(circle at center, rgba(215,242,58,.14), transparent 70%); filter: blur(12px); pointer-events: none;
        }
        .sb-stage { position: relative; margin: 0 auto; width: min(70%, 620px); text-align: center; }
        .sb-stage-arch { height: 20px; border: 1px solid rgba(215,242,58,.22); border-bottom: none; border-radius: 999px 999px 0 0; opacity: .9; }
        .sb-stage-bar {
          margin-top: 8px; height: 8px; border-radius: 999px;
          background: linear-gradient(90deg, transparent 0%, rgba(215,242,58,.22) 14%, rgba(215,242,58,.85) 50%, rgba(215,242,58,.22) 86%, transparent 100%);
          box-shadow: 0 0 20px rgba(215,242,58,.18);
        }
        .sb-stage-label { margin-top: 12px; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--sb-text-faint); }

        .sb-seat-map-wrap {
          max-width: 760px; margin: 0 auto 20px; padding: 20px 18px 16px; border-radius: 24px;
          background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.012));
          border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
          position: relative; overflow-x: auto;
        }
        .sb-seat-rows { display: flex; flex-direction: column; gap: 10px; min-width: 420px; }
        .sb-seat-row { display: grid; grid-template-columns: 32px 1fr; gap: 10px; align-items: center; }
        .sb-row-label {
          min-height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 12px;
          font-size: 11px; font-weight: 700; color: var(--sb-text-faint);
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        }
        .sb-seat-cells { display: grid; grid-template-columns: repeat(10, minmax(0,1fr)); gap: 10px; }

        .sb-seat {
          position: relative; aspect-ratio: 1 / 1; min-height: 40px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015));
          color: var(--sb-text-faint); display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 700; letter-spacing: .02em; cursor: pointer; transition: .16s ease;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.03); font-family: inherit; padding: 0;
        }
        .sb-seat:hover:not(:disabled):not(.selected) {
          transform: translateY(-1px); border-color: rgba(215,242,58,.26); color: var(--sb-text);
          background: linear-gradient(180deg, rgba(215,242,58,.08), rgba(215,242,58,.03));
          box-shadow: 0 0 0 1px rgba(215,242,58,.08), 0 0 18px rgba(215,242,58,.08);
        }
        .sb-seat.selected {
          color: var(--sb-accent-ink); border-color: rgba(215,242,58,.75);
          background: linear-gradient(180deg, #E4F86A 0%, var(--sb-accent) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 0 0 1px rgba(215,242,58,.22), 0 0 24px rgba(215,242,58,.32);
          transform: translateY(-1px);
        }
        .sb-seat:disabled {
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
          border-color: rgba(255,255,255,0.05); color: #5E665C; opacity: .55; cursor: not-allowed;
        }
        .sb-seat:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }

        .sb-venue-note { font-size: 12px; color: var(--sb-text-faint); line-height: 1.55; padding: 4px 4px 0; }
        .sb-venue-note strong { color: var(--sb-text-dim); font-weight: 600; }

        .sb-summary {
          position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between;
          gap: 18px; flex-wrap: wrap; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06);
        }
        .sb-summary-left { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .sb-summary-icon {
          width: 50px; height: 50px; border-radius: 16px; display: grid; place-items: center;
          background: linear-gradient(180deg, rgba(215,242,58,.12), rgba(215,242,58,.06));
          border: 1px solid rgba(215,242,58,.14); color: var(--sb-accent); box-shadow: var(--sb-shadow-glow); flex-shrink: 0;
        }
        .sb-summary-label { font-size: 11px; color: var(--sb-text-faint); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 5px; }
        .sb-summary-value { font-size: 22px; font-weight: 700; }
        .sb-summary-sub { font-size: 13px; color: var(--sb-text-dim); margin-top: 4px; }
        .sb-summary-right { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-left: auto; }
        .sb-price-wrap { text-align: right; }
        .sb-price-wrap .sb-summary-value { color: #F5F7EF; }

        .sb-btn-proceed {
          display: inline-flex; align-items: center; gap: 10px; padding: 15px 24px; border: none; border-radius: 16px;
          background: linear-gradient(180deg, #E7FA72 0%, var(--sb-accent) 100%); color: var(--sb-accent-ink);
          font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 28px rgba(215,242,58,.24); transition: .16s ease;
        }
        .sb-btn-proceed:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 38px rgba(215,242,58,.32); }
        .sb-btn-proceed:active { transform: translateY(0) scale(.985); }
        .sb-btn-proceed:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .sb-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        @media (max-width: 760px) {
          .sb-shell { padding: 0 16px 40px; }
          .sb-header-inner { padding: 0 16px; }
          .sb-hero { padding: 26px 0 18px; }
          .sb-hero-copy h2 { font-size: 26px; }
          .sb-panel { padding: 20px; }
          .sb-seat-rows { min-width: 380px; }
          .sb-seat { min-height: 34px; font-size: 9px; border-radius: 10px; }
          .sb-row-label { min-height: 34px; }
          .sb-summary-right { width: 100%; justify-content: space-between; }
          .sb-price-wrap { text-align: left; }
          .sb-status-pill { display: none; }
        }
        @media (max-width: 520px) {
          .sb-admin-btn { padding: 10px 12px; font-size: 12px; }
          .sb-brand-sub { display: none; }
          .sb-hero-copy h2 { font-size: 22px; }
          .sb-mini-stats { grid-template-columns: 1fr; }
          .sb-legend { justify-content: flex-start; }
          .sb-summary-right { flex-direction: column; align-items: stretch; }
          .sb-btn-proceed { justify-content: center; width: 100%; }
        }
      `}</style>

      {/* Header */}
      <header className="sb-header">
        <div className="sb-header-inner">
          <div className="sb-brand">
            <div className="sb-brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M4 18v-6a8 8 0 0 1 16 0v6M2 18h20M4 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M14 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />
              </svg>
            </div>
            <div>
              <h1 className="sb-brand-title sb-display">
                MY HIGHS &amp; <span>I</span>
              </h1>
              <p className="sb-brand-sub">Life Changing experience</p>
            </div>
          </div>

          <div className="sb-header-actions">
            <div className="sb-status-pill">
              <span className="sb-status-dot" />
              Seats updating live
            </div>
            <Link to="/admin-login" className="sb-admin-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
              </svg>
              Admin Login
            </Link>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="sb-shell">
        <section className="sb-hero">
          <div className="sb-hero-copy">
            <h2 className="sb-display">Reserve your seat for the experience.</h2>
            <p>
              Complete your attendee details, upload your photo for your e-card, then choose a seat from
              the venue map below.
            </p>
          </div>

          <div className="sb-hero-meta">
            <div className="sb-meta-card">
              <p className="sb-meta-label">Event pass</p>
              <p className="sb-meta-value sb-display">{SEAT_PRICE_LABEL.replace(".00", "")}</p>
            </div>
            <div className="sb-meta-card">
              <p className="sb-meta-label">Available seats</p>
              <p className="sb-meta-value sb-display">{availableCount}</p>
            </div>
          </div>
        </section>

        <section className="sb-layout">
          {/* Left Column: Attendee Info */}
          <div className="sb-stack">
            <div className="sb-surface sb-surface-glass">
              <div className="sb-panel">
                <div className="sb-panel-title-row">
                  <h2 className="sb-panel-title sb-display">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
                    </svg>
                    Attendee details
                  </h2>
                  <span className="sb-panel-kicker">Step 01</span>
                </div>

                {/* Profile Upload */}
                <div className="sb-avatar-wrap">
                  <div className="sb-avatar">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Profile preview" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
                      </svg>
                    )}

                    <label className="sb-avatar-upload" aria-label="Upload profile photo">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                        <path d="M4 8l1.5-2.5h13L20 8v11H4z" />
                        <circle cx="12" cy="13" r="3.2" />
                      </svg>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="sb-sr-only"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>

                  {fileError ? (
                    <p className="sb-file-error" role="alert">{fileError}</p>
                  ) : (
                    <p className="sb-avatar-hint">
                      <strong>Upload photo</strong>
                      <br />
                      JPG, PNG or WEBP · Max 2MB
                    </p>
                  )}
                </div>

                {/* Name Input */}
                <div className="sb-field">
                  <label className="sb-field-label" htmlFor="attendee-name">Full name</label>
                  <input
                    id="attendee-name"
                    type="text"
                    className="sb-field-input"
                    placeholder="John Doe"
                    autoComplete="name"
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Email Input */}
                <div className="sb-field">
                  <label className="sb-field-label" htmlFor="attendee-email">Email address</label>
                  <input
                    id="attendee-email"
                    type="email"
                    className="sb-field-input"
                    placeholder="john@example.com"
                    autoComplete="email"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="sb-surface sb-surface-glass">
              <div className="sb-panel" style={{ padding: "18px" }}>
                <div className="sb-trust-card" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0 }}>
                  <div className="sb-trust-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v.01M12 11v5" />
                    </svg>
                  </div>
                  <div className="sb-trust-copy">
                    <h3>E-card registration</h3>
                    <p>Your details are saved locally during the flow so you don't lose progress before payment is completed.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="sb-mini-stats">
              <div className="sb-mini-stat">
                <p className="sb-label">Seat price</p>
                <p className="sb-value sb-display">{SEAT_PRICE_LABEL.replace(".00", "")}</p>
              </div>
              <div className="sb-mini-stat">
                <p className="sb-label">Venue rows</p>
                <p className="sb-value sb-display">{seatRows.length || 0} Rows</p>
              </div>
            </div>
          </div>

          {/* Right Column: Seat Selection */}
          <div className="sb-surface sb-surface-solid sb-seat-panel">
            <div className="sb-panel">
              <div className="sb-seat-top">
                <div className="sb-seat-top-copy">
                  <div className="sb-panel-title-row" style={{ marginBottom: "10px" }}>
                    <h2 className="sb-panel-title sb-display">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                      </svg>
                      Select your seat
                    </h2>
                    <span className="sb-panel-kicker">Step 02</span>
                  </div>
                  <p>
                    Choose an available seat from the venue map. Selected seats are highlighted in lemon
                    green, while booked seats are dimmed and unavailable.
                  </p>
                </div>

                <div className="sb-legend">
                  <div className="sb-legend-item"><span className="sb-legend-swatch available" />Available</div>
                  <div className="sb-legend-item"><span className="sb-legend-swatch selected" />Selected</div>
                  <div className="sb-legend-item"><span className="sb-legend-swatch booked" />Booked</div>
                </div>
              </div>

              <div className="sb-venue-shell">
                <div className="sb-stage-wrap">
                  <div className="sb-stage-glow" />
                  <div className="sb-stage">
                    <div className="sb-stage-arch" />
                    <div className="sb-stage-bar" />
                    <p className="sb-stage-label">Stage / screen area</p>
                  </div>
                </div>

                <div className="sb-seat-map-wrap">
                  <div className="sb-seat-rows" role="group" aria-label="Seat map">
                    {seatRows.map((row, rowIndex) => (
                      <div className="sb-seat-row" key={`row-${rowIndex}`}>
                        <div className="sb-row-label" aria-hidden="true">
                          {rowLabelFor(rowIndex)}
                        </div>
                        <div className="sb-seat-cells">
                          {row.map((seat) => {
                            const isBooked = seat.status === "booked";
                            const isSelected = seat.status === "pending";
                            return (
                              <button
                                key={seat.id}
                                type="button"
                                disabled={isBooked}
                                onClick={() => selectSeat(seat.id)}
                                className={`sb-seat${isSelected ? " selected" : ""}`}
                                aria-pressed={isSelected}
                                aria-label={`Seat ${seat.id}, ${isBooked ? "booked" : isSelected ? "selected" : "available"}`}
                              >
                                {seat.id}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="sb-venue-note">
                  <strong>Tip:</strong> Tap a seat to select it. Your chosen seat appears in the booking
                  summary below.
                </p>
              </div>

              {/* Summary */}
              <div className="sb-summary">
                <div className="sb-summary-left">
                  <div className="sb-summary-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M5 8h14M5 8a2 2 0 0 0-2 2v3a1 1 0 0 0 1 1h1M19 8a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-1M6 14v4h12v-4M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </div>
                  <div>
                    <p className="sb-summary-label">Selected seat</p>
                    <p className="sb-summary-value sb-display">{selectedSeat ?? "—"}</p>
                    <p className="sb-summary-sub">
                      {selectedSeat != null ? "Seat reserved for checkout" : "No seat selected yet"}
                    </p>
                  </div>
                </div>

                <div className="sb-summary-right">
                  <div className="sb-price-wrap">
                    <p className="sb-summary-label">Price</p>
                    <p className="sb-summary-value sb-display">{SEAT_PRICE_LABEL}</p>
                  </div>
                  <button className="sb-btn-proceed" onClick={handleProceed}>
                    Proceed to payment
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
