import { useEffect, useRef, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePaystackPayment } from "react-paystack";
import { useStore } from "../store/useStore";

interface PaystackResponse {
  reference: string;
  trans: string;
  status: string;
  message: string;
  transaction: string;
}

/**
 * Payment — Lemon Noir
 * ---------------------------------------------------------------------
 * Visual redesign + non-functional hardening. Store contract, Paystack
 * config, and the core booking flow are unchanged, but the following
 * behavioural gaps have been patched:
 *
 *  - confirmBooking() now runs BEFORE navigate("/ticket"), so the
 *    ticket page can never mount with paymentReference still unset.
 *  - The reservation timer is no longer decorative: reaching 0:00
 *    releases the seat back to "available" (once, guarded by a ref)
 *    and swaps the page into an "expired" view instead of leaving the
 *    seat soft-locked forever.
 *  - The Pay button now has a real isPaying state, so a double
 *    click/tap can't fire initializePayment twice, and it's disabled
 *    entirely once the reservation has expired.
 *  - handlePay is wrapped in try/catch so a missing/blocked Paystack
 *    script fails with a visible inline message instead of doing
 *    nothing silently.
 *  - onClose no longer uses window.alert (blocks the JS thread on
 *    mobile); it sets an inline dismissible note instead.
 * ---------------------------------------------------------------------
 */

const RESERVATION_SECONDS = 5 * 60;
const CRITICAL_THRESHOLD_SECONDS = 60; // last minute shifts to warning accent

export default function Payment() {
  const navigate = useNavigate();

  // Store State
  const name = useStore((s) => s.name);
  const email = useStore((s) => s.email);
  const profilePicture = useStore((s) => s.profilePicture);
  const selectedSeat = useStore((s) => s.selectedSeat);
  const paymentReference = useStore((s) => s.paymentReference);
  const confirmBooking = useStore((s) => s.confirmBooking);
  const releaseSeat = useStore((s) => s.releaseSeat);

  const eventName = "My Highs & I";
  const ticketPriceNgn = 2000;

  const referenceRef = useRef(`EBP-${Date.now()}`);

  const config = {
    reference: referenceRef.current,
    email,
    amount: ticketPriceNgn * 100,
    publicKey: "pk_live_858dbf8453a3f29316e932e74b51f9b4e1baed85",
  };

  const initializePayment = usePaystackPayment(config);

  // Re-entrancy guard so a double click/tap can't open two Paystack
  // popups, plus inline (non-blocking) status messaging.

  const [isPaying, setIsPaying] = useState(false);
  const [paymentNote, setPaymentNote] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Timer logic
  const [secondsLeft, setSecondsLeft] = useState(RESERVATION_SECONDS);
  const [isExpired, setIsExpired] = useState(false);
  const hasReleasedRef = useRef(false);

  // If this booking was already confirmed (e.g. user navigated back
  // to /payment after a successful payment), don't let them attempt
  // to pay again — send them straight to their ticket.
  useEffect(() => {
    if (paymentReference) {
      navigate("/ticket", { replace: true });
    }
  }, [paymentReference, navigate]);

  const handlePay = () => {
    if (isPaying || isExpired) return;

    setPaymentNote(null);
    setPaymentError(null);
    setIsPaying(true);

    try {
      initializePayment({
        onSuccess: (reference: PaystackResponse) => {
          // Confirm the booking in the store BEFORE navigating, so the
          // Ticket page never mounts with paymentReference still null.
          confirmBooking(reference.reference);
          setIsPaying(false);
          navigate("/ticket", { replace: true });
        },
        onClose: () => {
          setIsPaying(false);
          setPaymentNote("Payment window closed. You can try again whenever you're ready.");
        },
      });
    } catch {
      // Paystack's script may be blocked (ad blocker) or fail to load
      // (network hiccup). Fail loudly instead of doing nothing.
      setIsPaying(false);
      setPaymentError(
        "We couldn't start the secure payment window. Check your connection and try again."
      );
    }
  };

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  // Once the reservation window hits zero, release the seat exactly
  // once so it doesn't stay soft-locked as "pending" forever, and
  // stop the flow from proceeding to payment.
  useEffect(() => {
    if (secondsLeft === 0 && !hasReleasedRef.current) {
      hasReleasedRef.current = true;
      if (selectedSeat) releaseSeat(selectedSeat);
      setIsExpired(true);
    }
  }, [secondsLeft, selectedSeat, releaseSeat]);

  const timerText = useMemo(() => {
    const mm = Math.floor(secondsLeft / 60);
    const ss = secondsLeft % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }, [secondsLeft]);

  const isCritical = secondsLeft <= CRITICAL_THRESHOLD_SECONDS;
  const progressPct = Math.max(
    0,
    Math.min(100, (secondsLeft / RESERVATION_SECONDS) * 100)
  );

  // Guard: Ensure user has data
  if (!name || !email || !profilePicture || !selectedSeat) {
    return (
      <div className="pm-page pm-guard">
        <style>{`
          .pm-guard {
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
            font-family: 'Inter', system-ui, sans-serif; color: #F3F5EE; padding: 24px;
            background:
              radial-gradient(circle at 15% 0%, rgba(215,242,58,0.11), transparent 28%),
              radial-gradient(circle at 100% 20%, rgba(215,242,58,0.06), transparent 30%),
              linear-gradient(180deg, #0d110d 0%, #090b0a 45%, #060807 100%);
          }
          .pm-guard-card {
            max-width: 420px; width: 100%; padding: 32px; border-radius: 24px;
            background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.03));
            border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 18px 48px rgba(0,0,0,.34);
            text-align: center;
          }
          .pm-guard-icon {
            width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 18px;
            display: grid; place-items: center;
            background: linear-gradient(180deg, rgba(255,101,90,.16), rgba(255,101,90,.06));
            border: 1px solid rgba(255,101,90,.24); color: #FF655A;
          }
          .pm-guard-card h1 { margin: 0 0 8px; font: 700 18px 'Space Grotesk', sans-serif; }
          .pm-guard-card p { margin: 0 0 22px; color: #B8BEAF; font-size: 14px; line-height: 1.6; }
          .pm-guard-link {
            display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
            padding: 13px 22px; border-radius: 14px; font-weight: 700; font-size: 14px;
            background: linear-gradient(180deg, #E7FA72 0%, #D7F23A 100%); color: #111507;
          }
        `}</style>
        <div className="pm-guard-card">
          <div className="pm-guard-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16v.01" />
            </svg>
          </div>
          <h1>Missing booking info</h1>
          <p>We couldn't find your attendee details or seat selection. Please head back and complete the booking form first.</p>
          <Link to="/" className="pm-guard-link">
            ← Back to seat selection
          </Link>
        </div>
      </div>
    );
  }

  // Guard: reservation window expired. The seat has already been
  // released back to "available" by the effect above — don't let the
  // user proceed to Paystack with a seat that's no longer theirs.
  if (isExpired) {
    return (
      <div className="pm-page pm-guard">
        <style>{`
          .pm-guard {
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
            font-family: 'Inter', system-ui, sans-serif; color: #F3F5EE; padding: 24px;
            background:
              radial-gradient(circle at 15% 0%, rgba(255,101,90,0.10), transparent 28%),
              radial-gradient(circle at 100% 20%, rgba(215,242,58,0.06), transparent 30%),
              linear-gradient(180deg, #0d110d 0%, #090b0a 45%, #060807 100%);
          }
          .pm-guard-card {
            max-width: 420px; width: 100%; padding: 32px; border-radius: 24px;
            background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.03));
            border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 18px 48px rgba(0,0,0,.34);
            text-align: center;
          }
          .pm-guard-icon {
            width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 18px;
            display: grid; place-items: center;
            background: linear-gradient(180deg, rgba(255,101,90,.16), rgba(255,101,90,.06));
            border: 1px solid rgba(255,101,90,.24); color: #FF655A;
          }
          .pm-guard-card h1 { margin: 0 0 8px; font: 700 18px 'Space Grotesk', sans-serif; }
          .pm-guard-card p { margin: 0 0 22px; color: #B8BEAF; font-size: 14px; line-height: 1.6; }
          .pm-guard-link {
            display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
            padding: 13px 22px; border-radius: 14px; font-weight: 700; font-size: 14px;
            background: linear-gradient(180deg, #E7FA72 0%, #D7F23A 100%); color: #111507;
          }
        `}</style>
        <div className="pm-guard-card">
          <div className="pm-guard-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l3 2M10 2h4" />
            </svg>
          </div>
          <h1>Reservation expired</h1>
          <p>
            Your 5-minute hold on seat {selectedSeat} ran out before payment was completed, so it's
            been released back into the pool. Please pick a seat again to continue.
          </p>
          <Link to="/" className="pm-guard-link">
            ← Choose a seat again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pm-page">
      <style>{`
        .pm-page {
          --pm-text: #F3F5EE;
          --pm-text-dim: #B8BEAF;
          --pm-text-faint: #7C8378;
          --pm-accent: #D7F23A;
          --pm-accent-2: #B9D629;
          --pm-accent-ink: #111507;
          --pm-danger: #FF655A;
          --pm-stroke: rgba(255,255,255,0.08);
          --pm-shadow: 0 18px 48px rgba(0,0,0,.34);

          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--pm-text);
          display: flex; align-items: center; justify-content: center;
          padding: 40px 20px;
          position: relative;
          background:
            radial-gradient(circle at 15% 0%, rgba(215,242,58,0.11), transparent 28%),
            radial-gradient(circle at 100% 20%, rgba(215,242,58,0.06), transparent 30%),
            linear-gradient(180deg, #0d110d 0%, #090b0a 45%, #060807 100%);
        }
        .pm-page::before {
          content: ""; position: fixed; inset: 0; pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(circle at center, black 38%, transparent 100%);
          opacity: .22;
        }
        .pm-page * { box-sizing: border-box; }
        .pm-page h1, .pm-page h2, .pm-page h3, .pm-page h4, .pm-page p { margin: 0; }
        .pm-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }

        .pm-frame { width: 100%; max-width: 1180px; display: grid; grid-template-columns: 1.08fr .92fr; gap: 28px; position: relative; z-index: 1; }
        @media (max-width: 980px) { .pm-frame { grid-template-columns: 1fr; max-width: 640px; } }

        .pm-surface { border-radius: 28px; border: 1px solid var(--pm-stroke); box-shadow: var(--pm-shadow); overflow: hidden; position: relative; }
        .pm-solid { background: linear-gradient(180deg, rgba(18,22,19,.98), rgba(12,15,13,.98)); padding: 32px; display: flex; flex-direction: column; }
        .pm-glass {
          background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.03));
          backdrop-filter: blur(22px) saturate(135%); -webkit-backdrop-filter: blur(22px) saturate(135%);
          padding: 28px; display: flex; flex-direction: column; gap: 18px;
        }

        .pm-brand { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 24px; }
        .pm-brand-left { display: flex; align-items: center; gap: 14px; }
        .pm-mark {
          width: 46px; height: 46px; border-radius: 16px; display: grid; place-items: center;
          background: linear-gradient(145deg, var(--pm-accent), var(--pm-accent-2)); color: var(--pm-accent-ink); flex-shrink: 0;
        }
        .pm-brand-copy h2 { font-size: 18px; font-weight: 700; }
        .pm-brand-copy h2 span { color: var(--pm-accent); }
        .pm-brand-copy p { margin-top: 4px; font-size: 12px; color: var(--pm-text-faint); letter-spacing: .08em; text-transform: uppercase; }
        .pm-step {
          display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-radius: 999px;
          background: rgba(215,242,58,.08); border: 1px solid rgba(215,242,58,.16); color: #DDEAB0; font-size: 12px; font-weight: 700; white-space: nowrap;
        }

        .pm-eyebrow {
          display: inline-flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 999px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); color: var(--pm-text-dim);
          font-size: 12px; font-weight: 700; width: max-content; margin-bottom: 18px;
        }
        .pm-eyebrow i { width: 24px; height: 1px; background: rgba(215,242,58,.5); display: block; }

        .pm-title { font: 700 34px/1.08 'Space Grotesk', sans-serif; letter-spacing: -.02em; max-width: 620px; margin-bottom: 12px; }
        .pm-copy { color: var(--pm-text-dim); line-height: 1.7; font-size: 14px; max-width: 620px; }

        .pm-progress { margin: 22px 0; }
        .pm-progress-top { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 10px; flex-wrap: wrap; }
        .pm-progress-top p { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--pm-text-faint); font-weight: 700; }
        .pm-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,.05); overflow: hidden; border: 1px solid rgba(255,255,255,.04); }
        .pm-fill { height: 100%; background: linear-gradient(90deg,#E8FB73 0%, var(--pm-accent) 55%, #B5D61F 100%); }

        .pm-booking-card {
          padding: 26px; border-radius: 24px; background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.025));
          border: 1px solid rgba(255,255,255,.07); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        }
        .pm-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 22px; }
        .pm-head h3 { margin-bottom: 6px; font: 700 18px 'Space Grotesk', sans-serif; }
        .pm-head p { color: var(--pm-text-dim); font-size: 13px; line-height: 1.6; max-width: 420px; }

        .pm-seat-badge {
          padding: 12px 16px; border-radius: 16px; background: linear-gradient(180deg, rgba(215,242,58,.14), rgba(215,242,58,.07));
          border: 1px solid rgba(215,242,58,.18); color: #ECF8B8; text-align: center; min-width: 120px; flex-shrink: 0;
        }
        .pm-seat-badge .pm-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 5px; }
        .pm-seat-badge .pm-v { font: 700 22px 'Space Grotesk', sans-serif; color: var(--pm-accent); }

        .pm-identity { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-bottom: 24px; }
        .pm-avatar {
          width: 88px; height: 88px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
          border: 3px solid rgba(255,255,255,.08); box-shadow: 0 0 0 8px rgba(255,255,255,.02);
        }
        .pm-identity-copy h4 { font-size: 20px; margin-bottom: 8px; word-break: break-word; }
        .pm-identity-copy p { color: var(--pm-text-dim); font-size: 14px; margin-bottom: 12px; word-break: break-word; }
        .pm-pill {
          display: inline-flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 999px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); color: var(--pm-text-dim); font-size: 12px; font-weight: 600;
        }
        .pm-pill svg { color: var(--pm-accent); flex-shrink: 0; }

        .pm-info { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
        .pm-info-card { padding: 18px; border-radius: 18px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); min-width: 0; }
        .pm-info-card .pm-label { margin-bottom: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--pm-text-faint); font-weight: 700; }
        .pm-info-card .pm-v { font: 700 16px 'Space Grotesk', sans-serif; word-break: break-word; }
        .pm-info-card .pm-s { margin-top: 8px; font-size: 12px; color: var(--pm-text-dim); }
        .pm-info-card.critical .pm-v { color: var(--pm-danger); }

        .pm-change {
          margin-top: 24px; display: inline-flex; align-items: center; gap: 6px; color: var(--pm-text-dim);
          text-decoration: none; font-weight: 600; font-size: 13px; width: max-content;
        }
        .pm-change:hover { color: var(--pm-text); }

        .pm-summary-card { flex: 1; }
        .pm-line { display: flex; justify-content: space-between; gap: 18px; padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
        .pm-line:last-child { border-bottom: none; padding-bottom: 0; }
        .pm-line .pm-l { font-size: 11px; color: var(--pm-text-faint); text-transform: uppercase; letter-spacing: .08em; font-weight: 700; margin-bottom: 6px; }
        .pm-line .pm-v { font-size: 15px; font-weight: 700; }
        .pm-line .pm-m { margin-top: 6px; font-size: 12px; color: var(--pm-text-dim); }
        .pm-amount { font: 700 16px 'Space Grotesk', sans-serif; text-align: right; white-space: nowrap; }

        .pm-total {
          margin-top: 6px; padding: 18px 20px; border-radius: 20px;
          background: linear-gradient(180deg, rgba(215,242,58,.08), rgba(215,242,58,.04)); border: 1px solid rgba(215,242,58,.14);
          display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; flex-wrap: wrap;
        }
        .pm-total-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #CFE67B; font-weight: 700; margin-bottom: 8px; }
        .pm-total .pm-big { font: 800 32px 'Space Grotesk', sans-serif; }
        .pm-total-note { font-size: 12px; color: #D4DEBA; margin-top: 8px; }

        .pm-pay {
          margin-top: 22px; width: 100%; border: none; border-radius: 18px; padding: 17px 20px; cursor: pointer;
          background: linear-gradient(180deg,#E7FA72 0%, var(--pm-accent) 100%); color: var(--pm-accent-ink);
          font: 800 15px 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; gap: 10px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 28px rgba(215,242,58,.24); transition: .16s ease;
        }
        .pm-pay:hover:not(:disabled) { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 38px rgba(215,242,58,.32); }
        .pm-pay:active:not(:disabled) { transform: translateY(0) scale(.985); }
        .pm-pay:disabled { opacity: .7; cursor: not-allowed; }
        .pm-pay:focus-visible { outline: 2px solid var(--pm-accent); outline-offset: 3px; }

        .pm-spinner {
          width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(17,21,7,.28);
          border-top-color: var(--pm-accent-ink); animation: pm-spin .7s linear infinite; flex-shrink: 0;
        }
        @keyframes pm-spin { to { transform: rotate(360deg); } }

        .pm-banner {
          display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px; border-radius: 14px;
          font-size: 13px; line-height: 1.55; margin-top: 14px;
        }
        .pm-banner svg { flex-shrink: 0; margin-top: 1px; }
        .pm-banner-error {
          background: rgba(255,101,90,.08); border: 1px solid rgba(255,101,90,.22); color: #FFD3CE;
        }
        .pm-banner-error svg { color: var(--pm-danger); }
        .pm-banner-note {
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); color: var(--pm-text-dim);
        }
        .pm-banner-note svg { color: var(--pm-text-faint); }

        .pm-timer {
          display: flex; gap: 16px; align-items: flex-start; padding: 22px; border-radius: 22px;
          background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
        }
        .pm-timer.critical { background: rgba(255,101,90,.06); border-color: rgba(255,101,90,.22); }
        .pm-timer-icon {
          width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; flex-shrink: 0;
          background: linear-gradient(180deg, rgba(215,242,58,.12), rgba(215,242,58,.06)); border: 1px solid rgba(215,242,58,.14); color: var(--pm-accent);
        }
        .pm-timer.critical .pm-timer-icon {
          background: linear-gradient(180deg, rgba(255,101,90,.16), rgba(255,101,90,.06)); border-color: rgba(255,101,90,.24); color: var(--pm-danger);
        }
        .pm-timer-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--pm-text-faint); font-weight: 700; margin-bottom: 6px; }
        .pm-timer-text { font-size: 15px; line-height: 1.6; color: var(--pm-text-dim); }
        .pm-timer-text strong { color: var(--pm-accent); }
        .pm-timer.critical .pm-timer-text strong { color: var(--pm-danger); }

        @media (max-width: 640px) {
          .pm-page { padding: 20px 14px; }
          .pm-solid, .pm-glass { padding: 22px; }
          .pm-title { font-size: 26px; }
          .pm-info { grid-template-columns: 1fr; }
          .pm-head { flex-direction: column; }
          .pm-seat-badge { align-self: flex-start; }
        }
      `}</style>

      <div className="pm-frame">
        {/* Left: booking identity + context */}
        <section className="pm-surface pm-solid">
          <div className="pm-brand">
            <div className="pm-brand-left">
              <div className="pm-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path d="M4 18v-6a8 8 0 0 1 16 0v6M2 18h20M4 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M14 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />
                </svg>
              </div>
              <div className="pm-brand-copy">
                <h2 className="pm-display">
                  My Highs &<span> I</span>
                </h2>
              </div>
            </div>
            <div className="pm-step">
              <span aria-hidden="true">●</span> Step 2 of 3 · Payment
            </div>
          </div>

          <div className="pm-eyebrow">
            <i /> Secure payment handoff · seat reservation protected
          </div>

          <h1 className="pm-title pm-display">
            Confirm the booking and complete payment before the reservation expires.
          </h1>
          <p className="pm-copy">
            Review your attendee details, seat, and total below, then hand off to Paystack to finish
            checkout securely.
          </p>

          <div className="pm-progress">
            <div className="pm-progress-top">
              <p>Booking progress</p>
              <p>Seat selected → payment → ticket issued</p>
            </div>
            <div className="pm-track">
              <div className="pm-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="pm-booking-card">
            <div className="pm-head">
              <div>
                <h3 className="pm-display">Booking Identity</h3>
                <p>Review the attendee details, seat assignment, and event information before handing off to Paystack.</p>
              </div>
              <div className="pm-seat-badge">
                <div className="pm-label">Selected seat</div>
                <div className="pm-v">{selectedSeat}</div>
              </div>
            </div>

            <div className="pm-identity">
              <img className="pm-avatar" src={profilePicture} alt={`${name}'s profile`} />
              <div className="pm-identity-copy">
                <h4>{name}</h4>
                <p>{email}</p>
                <div className="pm-pill">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Identity captured · ready for payment
                </div>
              </div>
            </div>

            <div className="pm-info">
              <div className="pm-info-card">
                <p className="pm-label">Event</p>
                <p className="pm-v pm-display">{eventName} Live</p>
                <p className="pm-s">Primary event label from booking state</p>
              </div>
              <div className={`pm-info-card${isCritical ? " critical" : ""}`}>
                <p className="pm-label">Reservation window</p>
                <p className="pm-v pm-display">{timerText} mins</p>
                <p className="pm-s">Seat remains locked while payment is in progress</p>
              </div>
              <div className="pm-info-card">
                <p className="pm-label">Payment gateway</p>
                <p className="pm-v pm-display">Paystack</p>
                <p className="pm-s">Secure handoff for live checkout</p>
              </div>
              <div className="pm-info-card">
                <p className="pm-label">Reference</p>
                <p className="pm-v pm-display">{referenceRef.current}</p>
                <p className="pm-s">Generated before gateway handoff</p>
              </div>
            </div>
          </div>

          <Link to="/" className="pm-change">
            ← Change seat selection
          </Link>
        </section>

        {/* Right: payment summary + timer */}
        <aside className="pm-surface pm-glass">
          <div className="pm-summary-card">
            <div className="pm-head">
              <div>
                <h3 className="pm-display">Payment Summary</h3>
                <p>A clear, trust-oriented view of the total, seat, and event details before you pay.</p>
              </div>
              <div className="pm-pill">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                Secure checkout
              </div>
            </div>

            <div className="pm-line">
              <div>
                <p className="pm-l">Event ticket</p>
                <p className="pm-v pm-display">{eventName} Live</p>
                <p className="pm-m">Single access ticket · seat-based reservation</p>
              </div>
              <div className="pm-amount">₦{ticketPriceNgn.toLocaleString()}</div>
            </div>

            <div className="pm-line">
              <div>
                <p className="pm-l">Seat allocation</p>
                <p className="pm-v pm-display">Seat {selectedSeat}</p>
                <p className="pm-m">Reserved for this checkout session</p>
              </div>
              <div className="pm-amount">Included</div>
            </div>

            <div className="pm-line">
              <div>
                <p className="pm-l">Service fee</p>
                <p className="pm-v pm-display"></p>
                <p className="pm-m">No additional charge</p>
              </div>
              <div className="pm-amount">₦0</div>
            </div>

            <div className="pm-total">
              <div>
                <div className="pm-total-label">Total payable</div>
                <div className="pm-big pm-display">₦{ticketPriceNgn.toLocaleString()}.00</div>
                <div className="pm-total-note">Charged via Paystack at checkout</div>
              </div>
            </div>

            <button
              onClick={handlePay}
              className="pm-pay"
              disabled={isPaying || isExpired}
              aria-busy={isPaying}
            >
              {isPaying ? (
                <>
                  <span className="pm-spinner" aria-hidden="true" />
                  Opening secure checkout…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                  Pay with Paystack
                </>
              )}
            </button>

            {paymentError && (
              <div className="pm-banner pm-banner-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16v.01" />
                </svg>
                <span>{paymentError}</span>
              </div>
            )}

            {paymentNote && !paymentError && (
              <div className="pm-banner pm-banner-note" role="status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-5M12 8v.01" />
                </svg>
                <span>{paymentNote}</span>
              </div>
            )}
          </div>

          <div className={`pm-timer${isCritical ? " critical" : ""}`} role="status" aria-live="polite">
            <div className="pm-timer-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l3 2M10 2h4" />
              </svg>
            </div>
            <div>
              <div className="pm-timer-label">Reservation timer</div>
              <div className="pm-timer-text">
                Your seat is reserved for <strong>{timerText}</strong> while you complete payment.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
