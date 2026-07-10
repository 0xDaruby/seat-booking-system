import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useStore } from "../store/useStore";

const FONT_LINK_ID = "lemon-noir-fonts";

/**
 * Injects the Space Grotesk / Inter Google Fonts stylesheet once per document,
 * so this page renders correctly on the Lemon Noir type system even if the
 * host app hasn't already loaded these fonts globally.
 */
function ensureFontsLoaded() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}

export default function Ticket() {
  const navigate = useNavigate();

  const name = useStore((s) => s.name);
  const email = useStore((s) => s.email);
  const profilePicture = useStore((s) => s.profilePicture);
  const selectedSeat = useStore((s) => s.selectedSeat);
  const paymentReference = useStore((s) => s.paymentReference);

  const eventName = "MY HIGHS & I";
  const supportEmail = "itsdavid4life@gmail.com";

  const previewUrl = profilePicture;

  const ticketId = useMemo(() => {
    if (!paymentReference) return "";
    const last4 = paymentReference.slice(-4); // Use last 4 digits of Paystack ref
    return `#EBP-${last4}`;
  }, [paymentReference]);

  useEffect(() => {
    ensureFontsLoaded();
  }, []);

  // Guard: this page is only reachable after a completed payment. Anyone
  // navigating here directly without a payment reference is bounced home.
  useEffect(() => {
    if (!paymentReference) {
      navigate("/", { replace: true });
    }
  }, [paymentReference, navigate]);

  const waitForImages = async (root: HTMLElement) => {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    );
  };

  const downloadPNG = async () => {
    const element = document.getElementById("ticket-card");
    if (!element) return;
    await waitForImages(element);
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: null });
    const imgData = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = imgData;
    link.download = `ticket-${selectedSeat}.png`;
    link.click();
  };

  const downloadPDF = async () => {
    const element = document.getElementById("ticket-card");
    if (!element) return;
    await waitForImages(element);
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: null });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`ticket-${selectedSeat}.pdf`);
  };

  // Same guard as before: if any required field is missing, refuse to render
  // ticket data. (The effect above will already be navigating away in the
  // no-paymentReference case; this is the synchronous fallback render.)
  if (!name || !email || !profilePicture || !selectedSeat || !paymentReference) {
    return (
      <div className="ln-guard">
        <style>{GUARD_STYLES}</style>
        <p>Incomplete booking info. Access denied.</p>
      </div>
    );
  }

  return (
    <div className="ln-ticket-page">
      <style>{STYLES}</style>

      <div className="ln-shell">
        {/* Success header */}
        <div className="ln-head">
          <div className="ln-head-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M9 12.5l2.2 2.2L16 9.5" />
              <circle cx="12" cy="12" r="9.2" />
            </svg>
          </div>
          <h1>Booking Confirmed!</h1>
          <p>Your digital ticket is ready.</p>
        </div>

        {/* Ticket card — captured by html2canvas, keep this element free of
            backdrop-filter (unsupported by html2canvas) so PNG/PDF exports
            render correctly instead of coming out blank/broken. */}
        <div id="ticket-card" className="ln-ticket-card">
          <div className="ln-ticket-top">
            <div className="ln-ticket-top-row">
              <div className="ln-ticket-eyebrow">
                <span className="ln-eyebrow-tag">Event Pass</span>
                <h2>{eventName}</h2>
              </div>
              {previewUrl && (
                <div className="ln-avatar-wrap">
                  <img alt="Attendee" className="ln-avatar" src={previewUrl} />
                </div>
              )}
            </div>

            <div className="ln-date-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M8 3v4M16 3v4M3 10h18" />
              </svg>
              <span>August &bull; 10:00 AM</span>
            </div>
          </div>

          <div className="ln-ticket-body">
            <div>
              <label>Attendee Name</label>
              <p className="ln-value">{name}</p>
            </div>
            <div>
              <label>Seat Number</label>
              <p className="ln-value ln-value-accent">{selectedSeat}</p>
            </div>
            <div>
              <label>Ticket ID</label>
              <p className="ln-value">{ticketId}</p>
            </div>
          </div>

          <div className="ln-stub">
            <span className="ln-cutout ln-cutout-left" aria-hidden="true"></span>
            <span className="ln-cutout ln-cutout-right" aria-hidden="true"></span>
            <span className="ln-stub-line" aria-hidden="true"></span>
          </div>

          <div className="ln-ticket-bottom">
            <div className="ln-qr">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#0B0E0C" strokeWidth="1.6" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" />
              </svg>
            </div>
            <p className="ln-qr-label">Scan at entrance</p>
          </div>
        </div>

        {/* Actions */}
        <div className="ln-actions">
          <button type="button" onClick={() => navigate("/")} className="ln-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
              <circle cx="12" cy="12" r="9.2" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Book Another Seat
          </button>

          <div className="ln-actions-grid">
            <button type="button" onClick={downloadPNG} className="ln-btn-secondary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="9.5" r="1.6" />
                <path d="M4 17l5-5 4 4 3-3 4 4" />
              </svg>
              PNG
            </button>
            <button type="button" onClick={downloadPDF} className="ln-btn-secondary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
                <path d="M6 2.5h8l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
                <path d="M14 2.5V7h4" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        {/* Footer help */}
        <div className="ln-footer">
          <p>
            Need help? Contact our support at{" "}
            <a href={`mailto:${supportEmail}`} className="ln-footer-link">
              {supportEmail}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

const GUARD_STYLES = `
  .ln-guard{
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#060807;
    color:#F3F5EE;
    font-family:'Inter',sans-serif;
    padding:24px;
    text-align:center;
  }
`;

const STYLES = `
  .ln-ticket-page{
    --bg-0:#060807;
    --bg-1:#0b0e0c;
    --bg-2:#101411;
    --bg-3:#141914;

    --stroke:rgba(255,255,255,0.08);
    --stroke-soft:rgba(255,255,255,0.05);
    --stroke-accent:rgba(215,242,58,0.24);

    --text:#F3F5EE;
    --text-dim:#B8BEAF;
    --text-faint:#7C8378;

    --accent:#D7F23A;
    --accent-2:#B9D629;
    --accent-ink:#111507;

    --success:#B8F255;

    --shadow-panel:0 18px 48px rgba(0,0,0,0.34);
    --shadow-soft:0 8px 24px rgba(0,0,0,0.24);
    --shadow-glow:0 0 0 1px rgba(215,242,58,0.08), 0 0 32px rgba(215,242,58,0.10);

    box-sizing:border-box;
    min-height:100vh;
    width:100%;
    font-family:'Inter',sans-serif;
    color:var(--text);
    background:
      radial-gradient(circle at 15% 0%, rgba(215,242,58,0.11), transparent 28%),
      radial-gradient(circle at 100% 20%, rgba(215,242,58,0.06), transparent 30%),
      radial-gradient(circle at 50% 45%, rgba(215,242,58,0.035), transparent 35%),
      linear-gradient(180deg, #0d110d 0%, #090b0a 45%, #060807 100%);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:48px 20px;
    position:relative;
    overflow-x:hidden;
  }

  .ln-ticket-page *{ box-sizing:border-box; }

  .ln-ticket-page::before{
    content:"";
    position:fixed;
    inset:0;
    pointer-events:none;
    background:
      linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
    background-size:34px 34px;
    -webkit-mask-image: radial-gradient(circle at center, black 38%, transparent 100%);
    mask-image: radial-gradient(circle at center, black 38%, transparent 100%);
    opacity:.22;
  }

  .ln-shell{
    position:relative;
    z-index:1;
    width:100%;
    max-width:440px;
    display:flex;
    flex-direction:column;
    align-items:center;
  }

  .ln-head{
    text-align:center;
    margin-bottom:28px;
  }

  .ln-head-icon{
    width:56px;
    height:56px;
    margin:0 auto 16px;
    border-radius:50%;
    display:grid;
    place-items:center;
    background:linear-gradient(180deg, rgba(215,242,58,.16), rgba(215,242,58,.06));
    border:1px solid rgba(215,242,58,.22);
    color:var(--accent);
    box-shadow:var(--shadow-glow);
  }

  .ln-head h1{
    margin:0;
    font-family:'Space Grotesk',sans-serif;
    font-size:26px;
    font-weight:700;
    letter-spacing:-0.01em;
  }

  .ln-head p{
    margin:8px 0 0;
    font-size:14px;
    color:var(--text-dim);
  }

  .ln-ticket-card{
    position:relative;
    width:100%;
    border-radius:24px;
    border:1px solid var(--stroke);
    overflow:hidden;
    box-shadow:var(--shadow-panel);
    background:
      radial-gradient(circle at 82% 0%, rgba(215,242,58,.08), transparent 40%),
      linear-gradient(180deg, rgba(255,255,255,0.02), transparent 12%),
      linear-gradient(180deg, #131813 0%, #0e120e 100%);
  }

  .ln-ticket-top{
    padding:26px 26px 18px;
    border-bottom:1px solid var(--stroke-soft);
  }

  .ln-ticket-top-row{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:14px;
  }

  .ln-eyebrow-tag{
    display:block;
    font-size:11px;
    font-weight:700;
    letter-spacing:.09em;
    text-transform:uppercase;
    color:var(--accent);
    margin-bottom:6px;
  }

  .ln-ticket-eyebrow h2{
    margin:0;
    font-family:'Space Grotesk',sans-serif;
    font-size:21px;
    font-weight:700;
    line-height:1.2;
    letter-spacing:-0.01em;
    color:var(--text);
    word-break:break-word;
  }

  .ln-avatar-wrap{
    flex-shrink:0;
    width:60px;
    height:60px;
    border-radius:14px;
    padding:2px;
    background:linear-gradient(145deg, rgba(215,242,58,.55), rgba(215,242,58,.08));
    box-shadow:0 0 20px rgba(215,242,58,.14);
  }

  .ln-avatar{
    width:100%;
    height:100%;
    object-fit:cover;
    border-radius:12px;
    display:block;
    background:#1a1f1b;
  }

  .ln-date-row{
    margin-top:18px;
    display:flex;
    align-items:center;
    gap:8px;
    color:var(--text-dim);
    font-size:12px;
    font-weight:600;
    letter-spacing:.03em;
  }

  .ln-date-row svg{
    color:var(--accent);
    flex-shrink:0;
  }

  .ln-ticket-body{
    padding:22px 26px;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:20px 16px;
  }

  .ln-ticket-body label{
    display:block;
    font-size:10px;
    font-weight:700;
    text-transform:uppercase;
    letter-spacing:.09em;
    color:var(--text-faint);
    margin-bottom:6px;
  }

  .ln-value{
    margin:0;
    font-size:15px;
    font-weight:700;
    color:var(--text);
    word-break:break-word;
  }

  .ln-value-accent{
    color:var(--accent);
    font-family:'Space Grotesk',sans-serif;
    font-size:18px;
  }

  .ln-stub{
    position:relative;
    height:22px;
  }

  .ln-cutout{
    position:absolute;
    top:50%;
    width:22px;
    height:22px;
    border-radius:50%;
    background:var(--bg-0);
    transform:translateY(-50%);
    box-shadow:inset 0 0 0 1px var(--stroke-soft);
  }

  .ln-cutout-left{ left:-11px; }
  .ln-cutout-right{ right:-11px; }

  .ln-stub-line{
    position:absolute;
    left:26px;
    right:26px;
    top:50%;
    height:1px;
    transform:translateY(-50%);
    background-image:linear-gradient(to right, rgba(255,255,255,0.16) 50%, transparent 50%);
    background-size:10px 1px;
    background-repeat:repeat-x;
  }

  .ln-ticket-bottom{
    padding:24px 26px 32px;
    display:flex;
    flex-direction:column;
    align-items:center;
  }

  .ln-qr{
    padding:12px;
    background:#F3F5EE;
    border-radius:16px;
    box-shadow:var(--shadow-soft);
    margin-bottom:12px;
    line-height:0;
  }

  .ln-qr-label{
    margin:0;
    font-size:10px;
    font-weight:700;
    text-transform:uppercase;
    letter-spacing:.12em;
    color:var(--text-faint);
  }

  .ln-actions{
    width:100%;
    margin-top:28px;
    display:flex;
    flex-direction:column;
    gap:12px;
  }

  .ln-btn-primary{
    width:100%;
    border:none;
    border-radius:16px;
    padding:15px 18px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    background:linear-gradient(180deg, #E7FA72 0%, var(--accent) 100%);
    color:var(--accent-ink);
    font-size:14px;
    font-weight:800;
    cursor:pointer;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.42),
      0 0 28px rgba(215,242,58,.20);
    transition:transform .16s ease, box-shadow .16s ease;
  }

  .ln-btn-primary:hover{
    transform:translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.42),
      0 0 36px rgba(215,242,58,.28);
  }

  .ln-btn-primary:active{
    transform:translateY(0) scale(.985);
  }

  .ln-btn-primary:focus-visible,
  .ln-btn-secondary:focus-visible{
    outline:2px solid var(--accent);
    outline-offset:2px;
  }

  .ln-actions-grid{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px;
  }

  .ln-btn-secondary{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:8px;
    padding:13px 14px;
    border-radius:14px;
    background:rgba(255,255,255,0.04);
    border:1px solid var(--stroke);
    color:var(--text);
    font-size:13px;
    font-weight:700;
    cursor:pointer;
    transition:background .16s ease, border-color .16s ease, transform .16s ease;
  }

  .ln-btn-secondary:hover{
    background:rgba(255,255,255,0.07);
    border-color:var(--stroke-accent);
    transform:translateY(-1px);
  }

  .ln-btn-secondary:active{
    transform:translateY(0);
  }

  .ln-footer{
    margin-top:36px;
    text-align:center;
    padding-bottom:12px;
  }

  .ln-footer p{
    margin:0;
    font-size:13px;
    color:var(--text-faint);
    line-height:1.6;
  }

  .ln-footer-link{
    color:var(--accent);
    font-weight:600;
    text-decoration:none;
  }

  .ln-footer-link:hover{
    text-decoration:underline;
  }

  @media (max-width: 480px){
    .ln-ticket-page{ padding:32px 14px; }
    .ln-head h1{ font-size:22px; }
    .ln-ticket-top{ padding:22px 20px 16px; }
    .ln-ticket-body{ padding:20px 20px; gap:18px 14px; }
    .ln-ticket-bottom{ padding:20px 20px 28px; }
    .ln-avatar-wrap{ width:52px; height:52px; }
    .ln-ticket-eyebrow h2{ font-size:19px; }
  }

  @media (max-width: 340px){
    .ln-actions-grid{ grid-template-columns:1fr; }
  }
`;
