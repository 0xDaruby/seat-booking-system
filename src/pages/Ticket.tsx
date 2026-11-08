import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EventShell from "../components/EventShell";
import TicketArtwork from "../components/TicketArtwork";
import BookAnotherSeat from "../components/BookAnotherSeat";
import { api } from "../booking";
import type { Booking } from "../booking";

export default function Ticket() {
  const [tickets, setTickets] = useState<NonNullable<Booking["ticket"]>[]>([]);
  const [params] = useSearchParams();
  const requestedId = params.get("id");
  const [exportTicket, setExportTicket] = useState<Booking["ticket"]>();
  const ticket = exportTicket ?? (requestedId ? tickets.find(ticket => ticket.id === requestedId) : tickets[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const exporting = Boolean(exportTicket);
  const artwork = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    heading.current?.focus();
    api<{ tickets: NonNullable<Booking["ticket"]>[] }>("tickets").then((data) => {
      if (active) setTickets(data.tickets);
    }).catch(() => {
      if (active) setError("We couldn’t open a confirmed ticket for this booking session.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function download(format: "PNG" | "PDF") {
    if (!artwork.current || !ticket || exporting) return;
    setExportTicket(ticket);
    setError("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      await document.fonts.ready;
      await Promise.all([...artwork.current.querySelectorAll("img")].map((image) => image.decode()));
      const canvas = await html2canvas(artwork.current, {
        scale: 2, width: 1440, height: 640, backgroundColor: "#eeece2", logging: false,
        onclone: (document) => {
          const ticket = document.querySelector<HTMLElement>("[data-ticket-artwork]");
          if (ticket) {
            ticket.style.width = "1440px";
            ticket.style.maxWidth = "none";
            ticket.style.height = "640px";
            const lettering = ticket.querySelector<SVGSVGElement>("svg");
            if (lettering) {
              lettering.setAttribute("width", "1440");
              lettering.setAttribute("height", "640");
              lettering.style.width = "1440px";
              lettering.style.height = "640px";
            }
          }
        },
      });
      const filename = "My-Highs-and-I-Series-004-" + ticket.seat;
      if (format === "PDF") {
        const { jsPDF } = await import("jspdf");
        const width = canvas.width / 2;
        const height = canvas.height / 2;
        const pdf = new jsPDF({ unit: "px", format: [width, height], orientation: width >= height ? "landscape" : "portrait", hotfixes: ["px_scaling"] });
        pdf.addImage(canvas, "PNG", 0, 0, width, height);
        pdf.save(filename + ".pdf");
      } else {
        const png = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png");
        });
        const url = URL.createObjectURL(png);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename + ".png";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch {
      setError("The download failed. Please try again.");
    } finally {
      setExportTicket(undefined);
    }
  }

  return <EventShell>
    <section className="wrap ticket-page">
      <p className="eyebrow">Series 004 / Admission</p>
      <h1 ref={heading} tabIndex={-1}>{ticket ? "Your ticket." : "Ticket confirmation."}</h1>
      {loading && <p role="status">Loading your ticket…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {tickets.length > 1 && <nav className="ticket-picker" aria-label="Your confirmed tickets">
        <p className="muted">Your tickets · {tickets.length} confirmed seats</p>
        <div className="actions">{tickets.map(item => <Link className="outline" key={item.id}
          aria-disabled={exporting || undefined} onClick={e => { if (exporting) e.preventDefault(); }}
          aria-current={item.id === ticket?.id ? "page" : undefined} to={`/ticket?id=${encodeURIComponent(item.id)}`}>
          Seat {item.seat}
        </Link>)}</div>
      </nav>}
      {ticket ? <>
        <TicketArtwork ticket={ticket} ref={artwork} />
        <p className="ticket-summary">{ticket.name} · Seat {ticket.seat}</p>
        <div className="actions">
          <button className="button" disabled={exporting} onClick={() => download("PNG")}>Download PNG</button>
          <button className="outline" disabled={exporting} onClick={() => download("PDF")}>Download PDF</button>
          <BookAnotherSeat ticketId={ticket.id} disabled={exporting} />
        </div>
        {exporting && <p role="status">Preparing your download…</p>}
        <p className="muted">Another seat requires a separate payment. Your confirmed tickets stay available in this browser.</p>
      </> : !loading && <>
        <p>No confirmed ticket found{requestedId ? " for this link" : " in this browser"}.</p>
        <Link className="outline" to="/payment">Check payment</Link>
      </>}
    </section>
  </EventShell>;
}
