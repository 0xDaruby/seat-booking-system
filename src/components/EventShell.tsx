import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { event } from "../booking";

export default function EventShell({ children, booking = false }: { children: ReactNode; booking?: boolean }) {
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <header className="masthead">
      <div className="wrap masthead-inner">
        <Link className="wordmark" to="/" aria-label={event.name + " home"}>
          <span className="brand-my" aria-hidden="true">My</span>
          <span className="brand-stack" aria-hidden="true">
            <span className="brand-highs">Highs</span>
            <span className="brand-ending"><span className="brand-amp">&amp;</span><span>I</span></span>
          </span>
        </Link>
        {booking ? <a href="#booking">Book a seat <span aria-hidden="true">↗</span></a> : <Link to="/">Event home</Link>}
      </div>
    </header>
    <main id="main" tabIndex={-1}>{children}</main>
    <footer className="wrap footer">
      <span>{event.name} · {event.edition}</span>
      <a href={`mailto:${event.supportEmail}`}>Organizer support: {event.supportEmail}</a>
      <span>Useful. Rare. Irreplaceable.</span>
      <a href="https://oxdaruby.tech/">Built by 0xdaruby</a>
    </footer>
  </>;
}
