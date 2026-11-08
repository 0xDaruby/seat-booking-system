import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import EventShell from "../components/EventShell";
import BookAnotherSeat from "../components/BookAnotherSeat";
import { api, ApiError, event, isLoopback, openCheckout, price } from "../booking";
import type { Booking, Inventory } from "../booking";
import { useStore } from "../store/useStore";

const outcomes = {
  paid: ["Payment confirmed.", "Your seat is booked and your ticket is ready."],
  pending: ["Payment pending.", "We’re waiting for Paystack to confirm your payment."],
  expired: ["Your hold expired.", "Return to booking to select an available seat."],
  failed: ["Payment didn’t go through.", "Return to booking to try again."],
  canceled: ["Checkout canceled.", "Your details are ready if you want to book again."],
  exception: ["Payment needs review.", "Keep your Paystack receipt for the event organizer. Please avoid making another payment for this booking."],
  resolved: ["Payment review complete.", "Keep your Paystack receipt and contact the event organizer for the outcome."],
};
const retryDelays = [1_500, 3_000, 5_000];
const verifyTimeout = 15_000;
const automaticCheckBudget = 60_000;
const organizerHelp = "If you were charged, keep your Paystack receipt and contact the event organizer before paying again.";

export default function Payment() {
  const [params] = useSearchParams();
  const returned = params.get("return") === "1" || params.has("reference") || params.has("trxref");
  const recovering = params.get("recover") === "1";
  const reference = [params.get("reference"), params.get("trxref")].find((value) => value && /^s004-[0-9a-f]{32}$/.test(value)) ?? undefined;
  return params.get("review") === "1" && !returned && !recovering ? <PaymentReview /> :
    <PaymentStatus key={`${reference ?? ""}:${returned}:${recovering}`} returned={returned} recovering={recovering} reference={reference} />;
}

function PaymentReview() {
  const { name, email, seat, referralCode, getRequestId, afterTicket } = useStore();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [seatConflict, setSeatConflict] = useState(false);

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  if (!name.trim() || !email || !seat) return <Navigate to="/#booking" replace />;

  async function pay() {
    if (submitting.current) return;
    submitting.current = true;
    setOpening(true);
    setError("");
    let checkoutRequested = false;
    try {
      const availability = await api<{
        seats: Inventory; preview: boolean; checkoutPaused: boolean; recovery: boolean; canBookAnother: boolean;
      }>("seats", undefined, AbortSignal.timeout(verifyTimeout));
      if (!mounted.current) return;
      if (availability.preview && !isLoopback()) throw new Error("Checkout is temporarily unavailable.");
      if (availability.recovery && !(availability.canBookAnother && afterTicket)) {
        navigate("/payment?recover=1", { replace: true });
        return;
      }
      if (availability.checkoutPaused) throw new Error("New reservations are paused. Please check back later.");
      if (availability.seats[seat]) throw new ApiError("That seat is unavailable. Choose another seat to continue.", 409);
      checkoutRequested = true;
      const result = await api<Booking>("checkout", { name, email, seat, referralCode, afterTicket, requestId: getRequestId() }, AbortSignal.timeout(verifyTimeout));
      if (!mounted.current) return;
      if (result.checkoutUrl) openCheckout(result.checkoutUrl);
      else navigate("/payment?recover=1", { replace: true });
    } catch (err) {
      if (!mounted.current) return;
      if (checkoutRequested && (!(err instanceof ApiError) || err.status < 400 || err.status >= 500)) {
        navigate("/payment?recover=1", { replace: true });
        return;
      }
      setSeatConflict(err instanceof ApiError && err.status === 409);
      setError(err instanceof DOMException && err.name === "TimeoutError" ? "Seat availability couldn’t be checked. Please try again." :
        err instanceof Error ? err.message : "Checkout could not be opened.");
    } finally {
      submitting.current = false;
      if (mounted.current) setOpening(false);
    }
  }

  return <EventShell>
    <section className="wrap booking">
      <div className="section-heading">
        <p className="eyebrow">{event.edition} / Checkout</p>
        <h1 className="checkout-heading" ref={heading} tabIndex={-1}>Review your booking.</h1>
        <p>Confirm your details and seat before continuing to Paystack.</p>
      </div>
      <div className="booking-grid">
        <section className="panel">
          <h2 className="checkout-subheading">Attendee details</h2>
          <dl className="checkout-details">
            <div><dt>Full name</dt><dd>{name}</dd></div>
            <div><dt>Email address</dt><dd>{email}</dd></div>
            <div><dt>Selected seat</dt><dd>{seat}</dd></div>
            <div><dt>Referral code</dt><dd>{referralCode.trim() || "Not used"}</dd></div>
          </dl>
          <a className="outline" href="/#booking">Edit booking</a>
        </section>
        <section className="panel">
          <h2 className="checkout-subheading">Order summary</h2>
          <p className="eyebrow">{event.edition} · 1 ticket</p>
          <p><strong>{event.theme}</strong></p>
          <p className="muted">{event.date} · {event.time}<br />{event.venue}</p>
          <div className="order">
            <p className="eyebrow">Amount due</p>
            <p><span>Seat {seat}</span><strong>{price}</strong></p>
          </div>
          <p className="muted">{event.refundPolicy} For payment or ticket issues, contact the organizer at <a href={`mailto:${event.supportEmail}`}>{event.supportEmail}</a>.</p>
          {error && <p className="error" role="alert">{error}</p>}
          {seatConflict ? <a className="button pay" href="/#booking">Return to seat selection <span aria-hidden="true">→</span></a> :
            <button className="button pay" type="button" disabled={opening} onClick={pay}>
              {opening ? "Opening checkout…" : `Pay ${price} with Paystack`}<span aria-hidden="true">→</span>
            </button>}
        </section>
      </div>
    </section>
  </EventShell>;
}

function PaymentStatus({ returned, recovering, reference }: { returned: boolean; recovering: boolean; reference?: string }) {
  const [booking, setBooking] = useState<Booking | null>();
  const [checking, setChecking] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const [manualCheck, setManualCheck] = useState<{ resume: boolean }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const automatic = (returned || recovering) && !manualCheck;

  useEffect(() => { heading.current?.focus(); }, []);

  useEffect(() => {
    let active = true;
    let controller: AbortController;
    let deadline: number;
    const stopAt = performance.now() + automaticCheckBudget;

    async function check(attempt: number) {
      controller = new AbortController();
      deadline = window.setTimeout(() => controller.abort(), verifyTimeout);
      setChecking(true);
      setWaiting(false);
      setVerifyError(false);
      setCheckoutError(false);
      let needsRetry = true;
      try {
        const { booking: current } = await api<{ booking: Booking | null }>("verify", reference ? { reference } : {}, controller.signal);
        if (!active) return;
        const freshCheckoutUrl = current?.status === "pending" && current.expiresAt > Date.now() ? current.checkoutUrl : undefined;
        setBooking(current && { ...current, checkoutUrl: freshCheckoutUrl });
        needsRetry = !current || current.status === "pending";
        if (manualCheck?.resume) {
          if (freshCheckoutUrl) {
            try { openCheckout(freshCheckoutUrl); } catch { setCheckoutError(true); }
          } else heading.current?.focus();
        }
      } catch {
        if (!active) return;
        setVerifyError(true);
      } finally {
        window.clearTimeout(deadline);
      }
      setChecking(false);
      const nextDelay = retryDelays[attempt];
      if (automatic && needsRetry && nextDelay !== undefined && performance.now() + nextDelay + verifyTimeout < stopAt) {
        setWaiting(true);
        timer = window.setTimeout(() => { void check(attempt + 1); }, nextDelay);
      }
    }

    let timer = window.setTimeout(() => { void check(0); }, 0);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(deadline);
      window.clearTimeout(timer);
    };
  }, [automatic, manualCheck, reference]);

  const inProgress = checking || waiting;
  const pending = booking?.status === "pending";
  const canRetryBooking = booking && ["failed", "expired", "canceled"].includes(booking.status);
  const [title, copy] = booking ? outcomes[booking.status] : checking || waiting ?
    ["Checking payment…", "We’re looking up your booking."] : verifyError ?
    ["Payment status unavailable.", "Check your payment again in a moment."] : returned ?
    ["Booking not found in this browser.", "Open this page in the browser where you reserved your seat."] :
    ["Find your booking.", "Open checkout from the booking page to reserve a seat."];
  const checkoutUrl = !returned && pending ? booking.checkoutUrl : undefined;
  const canReturn = !inProgress && !verifyError && (canRetryBooking || (booking === null && !returned));
  const showHelp = !inProgress && (verifyError || pending || booking?.status === "exception" || booking?.status === "resolved" || (returned && (!booking || canRetryBooking)));

  return <EventShell>
    <section className="wrap centered">
      <div className="panel state-card">
        <p className="eyebrow">{event.edition} / Checkout</p>
        <h1 ref={heading} tabIndex={-1}>{title}</h1>
        <p role="status">{inProgress && booking ? "We’re checking your payment with Paystack." : copy}</p>
        {!inProgress && verifyError && booking && <p className="error" role="alert">We couldn’t refresh your payment status.</p>}
        {checkoutError && <p className="error" role="alert">Checkout could not be opened.</p>}
        {showHelp && <p>{organizerHelp} Email <a href={`mailto:${event.supportEmail}`}>{event.supportEmail}</a>.</p>}
        {pending && booking.checkoutUrl && <p className="muted">
          Hold deadline · {new Date(booking.expiresAt).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })} WAT
        </p>}
        {checkoutUrl && <p className="muted">Resume only if you haven’t paid. If you’ve paid, check your payment here.</p>}
        <div className="actions">
          {booking?.status === "paid" && booking.ticket && <>
            <Link className="button" to={`/ticket?id=${encodeURIComponent(booking.ticket.id)}`}>View your ticket →</Link>
            <BookAnotherSeat ticketId={booking.ticket.id} />
          </>}
          {(pending || verifyError || (returned && !booking) || (manualCheck && inProgress)) && <button className="button" type="button"
            disabled={inProgress} onClick={() => setManualCheck({ resume: false })}>Check payment</button>}
          {checkoutUrl && <button className="outline" type="button" disabled={inProgress || verifyError}
            onClick={() => setManualCheck({ resume: true })}>Resume checkout</button>}
          {canReturn && <a className="outline" href="/#booking" onClick={() => {
            if (canRetryBooking) useStore.getState().update({});
          }}>Back to booking</a>}
        </div>
      </div>
    </section>
  </EventShell>;
}
