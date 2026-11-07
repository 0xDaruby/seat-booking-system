import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import EventShell from "../components/EventShell";
import { api, event, isLoopback, price } from "../booking";
import type { Inventory } from "../booking";
import { useStore } from "../store/useStore";

const programme = [
  "The Problem That Built You", "Value, Visibility & Leverage",
  "The Hidden Rules of Opportunity", "Becoming Irreplaceable",
];
const [themeFirst, themeSecond, themeThird, themeLast] = event.theme.split(" ");

export default function SeatBooking() {
  const draft = useStore();
  const [inventory, setInventory] = useState<Inventory>();
  const [loadingError, setLoadingError] = useState(false);
  const [preview, setPreview] = useState(false);
  const [checkoutPaused, setCheckoutPaused] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [seatError, setSeatError] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [validating, setValidating] = useState(false);
  const referralInput = useRef<HTMLInputElement>(null);
  const reviewing = useRef(false);
  const reviewRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const map = useRef<HTMLFieldSetElement>(null);
  const loading = useRef(false);
  const navigate = useNavigate();
  const selected = draft.seat && inventory && !inventory[draft.seat] ? draft.seat : "";
  const stale = Boolean(inventory && draft.seat && inventory[draft.seat]);

  async function loadSeats() {
    if (loading.current) return;
    loading.current = true;
    try {
      const result = await api<{ seats: Inventory; preview: boolean; recovery: boolean; checkoutPaused: boolean }>("seats");
      if (result.preview && !isLoopback()) {
        setInventory(undefined);
        setLoadingError(true);
        return;
      }
      setInventory(result.seats);
      setPreview(result.preview);
      setRecovery(result.recovery);
      setCheckoutPaused(result.checkoutPaused);
      setLoadingError(false);
    } catch {
      setLoadingError(true);
    } finally {
      loading.current = false;
    }
  }

  useEffect(() => {
    void loadSeats();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reviewRequest.current?.abort(); };
  }, []);

  function focusSeats() {
    const group = map.current;
    (group?.querySelector<HTMLInputElement>("input:not(:disabled)") ?? group)?.focus();
  }

  async function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inventory || loadingError || recovery || checkoutPaused) return;
    if (!selected) {
      setSeatError(true);
      focusSeats();
      return;
    }
    if (reviewing.current) return;
    reviewing.current = true;
    setValidating(true);
    setReferralError("");
    const controller = new AbortController();
    reviewRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      if (draft.referralCode.trim()) {
        const result = await api<{ referralCode: string }>("referral/validate", { referralCode: draft.referralCode }, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        draft.update({ referralCode: result.referralCode });
      }
      if (!mounted.current) return;
      navigate("/payment?review=1");
    } catch (error) {
      if (!mounted.current) return;
      setReferralError(controller.signal.aborted ? "The referral code check timed out. Try again or leave it blank." :
        error instanceof Error ? error.message : "The referral code could not be checked. Try again or leave it blank.");
      referralInput.current?.focus();
    } finally {
      window.clearTimeout(timeout);
      reviewRequest.current = null;
      reviewing.current = false;
      if (mounted.current) setValidating(false);
    }
  }

  return <EventShell booking>
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker">{event.edition} <span /> Live conversation</p>
          <h1>{themeFirst} {themeSecond}<br />{themeThird} <em>{themeLast}</em></h1>
          <p className="subtitle">{event.subtitle}</p>
          <p className="byline">{event.byline}</p>
          <a className="button" href="#booking">Reserve a seat <span aria-hidden="true">↘</span></a>
          <dl className="event-facts">
            <div><dt>When</dt><dd>{event.date}<br />{event.time}</dd></div>
            <div><dt>Where</dt><dd>{event.venue}</dd></div>
            <div><dt>Admission</dt><dd>{price} per seat</dd></div>
          </dl>
        </div>
        <img className="poster" src="/series-004-flyer.jpg" width={1024} height={1280}
          alt="Edwin Clinton on the My Highs & I Series 004 flyer for The Life You Offer." />
      </div>
    </section>
    <section className="wrap booking" id="booking">
      <div className="section-heading">
        <p className="eyebrow">Reservations / {event.edition}</p>
        <h2>Take your seat.</h2>
        <p>Choose one seat and add your details to book.</p>
      </div>
      {preview && <p className="preview-banner">Local preview · No money will be charged.</p>}
      {checkoutPaused && <p className="preview-banner" role="status">New reservations are paused. You can still <Link to="/payment">check an existing booking</Link>.</p>}
      {recovery && <p className="preview-banner">You have a booking in this browser. <Link to="/payment">Check your booking</Link></p>}
      <form className="booking-grid" onSubmit={review}>
        <section className="panel">
          <h3><span className="step">01</span> Choose a seat</h3>
          {loadingError ? <p role="alert">Seat availability couldn’t load. <button className="text-button" type="button" onClick={loadSeats}>Try again</button></p> :
            !inventory ? <p role="status">Loading seats…</p> :
            <fieldset ref={map} tabIndex={-1} className="seat-field" aria-describedby="seat-note">
              <legend className="sr-only">Choose one seat</legend>
              <div className="legend"><span><i /> Available</span><span><i className="legend-selected">✓</i> Selected</span><span><i className="legend-unavailable">×</i> Unavailable</span></div>
              <div className="stage">Stage</div>
              <div className="map">
                {[...event.rows].map((row) => <div className="seat-row" key={row}>
                  <span aria-hidden="true">{row}</span>
                  {Array.from({ length: event.seatsPerRow }, (_, index) => {
                    const id = row + (index + 1);
                    const unavailable = Boolean(inventory[id]);
                    return <label className="seat" key={id}>
                      <input className="sr-only" type="radio" name="seat" value={id}
                        disabled={unavailable} checked={selected === id}
                        aria-label={`Seat ${id}${unavailable ? ", unavailable" : ""}`}
                        onChange={() => { draft.update({ seat: id }); setSeatError(false); }} />
                      <span aria-hidden="true">{unavailable ? "×" : selected === id ? "✓" : index + 1}</span>
                    </label>;
                  })}
                </div>)}
              </div>
              <p id="seat-note" className={seatError || stale ? "error" : "muted"}>
                {stale ? "That seat is unavailable. Choose another seat." :
                  seatError ? "Choose an available seat to continue." :
                  Object.keys(inventory).length === event.rows.length * event.seatsPerRow ? "All seats are currently held or sold. Check again later." : "Rows A–J · Row A is closest to the stage."}
              </p>
              <button className="text-button" type="button" onClick={loadSeats}>Refresh seats</button>
            </fieldset>}
        </section>
        <section className="panel details">
          <h3><span className="step">02</span> Your details</h3>
          <label>Full name<input required autoComplete="name" name="name" maxLength={120}
            pattern={".*\\S.*"} title="Enter your full name."
            placeholder="e.g. Ada Okafor" value={draft.name}
            onChange={(e) => draft.update({ name: e.target.value })} /></label>
          <label>Email address<input required type="email" autoComplete="email" name="email" maxLength={254}
            placeholder="you@example.com" value={draft.email}
            onChange={(e) => draft.update({ email: e.target.value })} /></label>
          <label className="referral-field">Referral code <span className="muted">Optional</span>
            <input ref={referralInput} name="referralCode" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              maxLength={32} placeholder="e.g. MHI04 001" value={draft.referralCode} readOnly={validating}
              aria-invalid={Boolean(referralError)} aria-describedby={referralError ? "referral-help referral-error" : "referral-help"}
              onChange={(e) => { draft.update({ referralCode: e.target.value.toUpperCase() }); setReferralError(""); }} />
            <span id="referral-help" className="muted referral-help">An ambassador invited you? Enter their code here.</span>
          </label>
          {referralError && <p id="referral-error" className="error" role="alert">{referralError}</p>}
          <div className="order" aria-live="polite">
            <p className="eyebrow">Order summary</p>
            <p><strong>{event.edition} · 1 ticket</strong><span>{selected ? "Seat " + selected : "Choose a seat"}</span></p>
            <p className="total"><span>Total</span><strong>{price}</strong></p>
          </div>
          <button className="button pay" disabled={!inventory || loadingError || recovery || checkoutPaused || validating}>
            {checkoutPaused ? "Reservations paused" : validating ? "Checking referral code…" : "Review booking"}<span aria-hidden="true">→</span>
          </button>
        </section>
      </form>
    </section>
    <section className="programme">
      <div className="wrap programme-grid">
        <div><p className="eyebrow">The conversation</p><h2>Programme.</h2></div>
        <ol>{programme.map((item, index) => <li key={item}><span>0{index + 1}</span>{item}</li>)}</ol>
      </div>
    </section>
  </EventShell>;
}
