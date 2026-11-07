import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import EventShell from "../components/EventShell";
import { api, event } from "../booking";
import type { Booking } from "../booking";

export default function Ticket() {
  const [ticket, setTicket] = useState<Booking["ticket"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const artwork = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    heading.current?.focus();
    api<{ ticket: Booking["ticket"] }>("ticket").then((data) => {
      if (active) setTicket(data.ticket);
    }).catch(() => {
      if (active) setError("We couldn’t open a confirmed ticket for this booking session.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function download(format: "PNG" | "PDF") {
    if (!artwork.current || !ticket || exporting) return;
    setExporting(true);
    setError("");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(artwork.current, { scale: 2, backgroundColor: "#eeece2" });
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
      setExporting(false);
    }
  }

  return <EventShell>
    <section className="wrap centered">
      <p className="eyebrow">Series 004 / Admission</p>
      <h1 ref={heading} tabIndex={-1}>{ticket ? "Your ticket." : "Ticket confirmation."}</h1>
      {loading && <p role="status">Loading your ticket…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {ticket ? <>
        <article className="ticket" ref={artwork}>
          <p className="eyebrow">{event.name} · {event.edition}</p>
          <h2>{event.theme}</h2>
          <p>{event.date} · {event.time}<br />{event.venue}</p>
          <dl>
            <div><dt>Attendee</dt><dd>{ticket.name}</dd></div>
            <div><dt>Seat</dt><dd>{ticket.seat}</dd></div>
          </dl>
          <p className="ticket-id"><span>Ticket ID</span> {ticket.id}</p>
        </article>
        <div className="actions">
          <button className="button" disabled={exporting} onClick={() => download("PNG")}>Download PNG</button>
          <button className="outline" disabled={exporting} onClick={() => download("PDF")}>Download PDF</button>
        </div>
        {exporting && <p role="status">Preparing your download…</p>}
      </> : !loading && <Link className="outline" to="/payment">Check payment</Link>}
    </section>
  </EventShell>;
}
