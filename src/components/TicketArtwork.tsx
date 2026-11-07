import { forwardRef, useLayoutEffect, useRef } from "react";
import { event } from "../booking";
import type { Booking } from "../booking";

type ConfirmedTicket = NonNullable<Booking["ticket"]>;

function nameLines(name: string) {
  if (name.length <= 28) return [name];
  const spaces = [...name.matchAll(/\s/g)].map((match) => match.index);
  const middle = spaces.reduce((best, index) =>
    Math.abs(index - name.length / 2) < Math.abs(best - name.length / 2) ? index : best, spaces[0] ?? -1);
  return middle < 0 ? [name] : [name.slice(0, middle), name.slice(middle + 1)];
}

const TicketArtwork = forwardRef<HTMLElement, { ticket: ConfirmedTicket }>(function TicketArtwork({ ticket }, ref) {
  const lines = nameLines(ticket.name);
  const attendee = useRef<SVGGElement>(null);
  const nameSize = Math.min(64, 1120 / Math.max(...lines.map((line) => line.length)));
  const title = event.theme.split(" ");
  const lastWord = title.pop();

  useLayoutEffect(() => {
    attendee.current?.querySelectorAll("text").forEach((line) => {
      line.removeAttribute("textLength");
      if (line.getComputedTextLength() > 690) {
        line.setAttribute("textLength", "690");
        line.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
    });
  }, [ticket.name]);

  return <article className="ticket" ref={ref} data-ticket-artwork aria-label="Admission ticket">
    <img className="ticket-background" src="/series-004-ticket-background.png" alt="" />
    <svg className="ticket-lettering" viewBox="0 0 1440 640" aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg" fontFamily="Arial, sans-serif" fill="#10110e">
      <g stroke="#79b82e" strokeWidth="2">
        <path d="M274 69V198 M35 320H1034 M35 490H934 M762 356V455" />
      </g>
      <text x="312" y="90" fill="#3e691e" fontSize="24" fontWeight="700" letterSpacing="4">
        {event.name.toUpperCase()} · {event.edition.toUpperCase()}
      </text>
      <text x="310" y="195" fontFamily="Georgia, serif" fontSize="96" fontWeight="700"
        letterSpacing="-5" textLength="754" lengthAdjust="spacingAndGlyphs">
        {title.join(" ")} <tspan fill="#71b91d">{lastWord}</tspan>
      </text>
      <g fill="none" stroke="#71b91d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="49" y="251" width="34" height="29" rx="3" />
        <path d="M49 260H83 M58 246V255 M75 246V255 M59 267H60 M71 267H72 M59 274H60 M71 274H72 M590 245V282" />
        <path d="M638 246C617 246 617 267 638 281C659 267 659 246 638 246Z" fill="#71b91d" stroke="none" />
        <circle cx="638" cy="258" r="6" fill="#eeece2" stroke="none" />
      </g>
      <text x="110" y="273" fontSize="24" fontWeight="700" textLength="447" lengthAdjust="spacingAndGlyphs">
        {event.date.toUpperCase()} · {event.time}
      </text>
      <text x="674" y="273" fontSize="24" fontWeight="700" textLength="355" lengthAdjust="spacingAndGlyphs">
        {event.venue.toUpperCase()}
      </text>
      <g fill="#487722" fontSize="26" fontWeight="700" letterSpacing="5">
        <text x="36" y="378">ATTENDEE</text>
        <text x="814" y="378">SEAT</text>
        <text x="36" y="540">TICKET ID</text>
      </g>
      <g fontFamily="Georgia, serif" fontWeight="700">
        <g ref={attendee}>
          {lines.map((line, index) => <text key={index} x="36" y={lines.length === 1 ? 447 : 419 + index * 48}
            fontSize={Math.min(nameSize, lines.length > 1 ? 44 : 64)}>{line}</text>)}
        </g>
        <text x="814" y="449" fontSize="76">{ticket.seat}</text>
      </g>
      <text x="36" y="579" fontSize="29" fontWeight="700"
        {...(ticket.id.length > 44 ? { textLength: 820, lengthAdjust: "spacingAndGlyphs" as const } : {})}>
        {ticket.id}
      </text>
      <path d="M36 598H113" stroke="#71b91d" strokeWidth="6" />
    </svg>
    <div className="sr-only">
      <h2>{event.name} · {event.edition}: {event.theme}</h2>
      <p>{event.date} · {event.time} · {event.venue}</p>
      <dl>
        <div><dt>Attendee</dt><dd>{ticket.name}</dd></div>
        <div><dt>Seat</dt><dd>{ticket.seat}</dd></div>
        <div><dt>Ticket ID</dt><dd>{ticket.id}</dd></div>
      </dl>
    </div>
  </article>;
});

export default TicketArtwork;
