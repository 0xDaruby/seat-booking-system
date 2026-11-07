import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import EventShell from "../components/EventShell";
import { api, price } from "../booking";

export default function PreviewCheckout() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<{ preview: boolean }>("seats", undefined, controller.signal)
      .then(({ preview }) => { if (!controller.signal.aborted) setPreview(preview === true); })
      .catch(() => { if (!controller.signal.aborted) setPreview(false); });
    return () => { controller.abort(); };
  }, []);

  async function simulate(outcome: string) {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("simulate", { outcome });
      navigate("/payment", { replace: true });
    } catch {
      setError("This booking session cannot use the simulator.");
      setBusy(false);
    }
  }

  return <EventShell>
    <section className="wrap centered">
      <div className="panel state-card">
        <p className="eyebrow">Local preview / Simulated checkout</p>
        <h1>{preview ? `Test ${price} checkout.` : "Simulated checkout"}</h1>
        <p role="status">{preview ? "Choose a result to review the booking flow." : preview === undefined ?
          "Checking preview availability…" : "The checkout simulator is unavailable."}</p>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="actions">
          {preview && <>
            <button className="button" disabled={busy} onClick={() => simulate("paid")}>Simulate success</button>
            <button className="outline" disabled={busy} onClick={() => simulate("failed")}>Simulate decline</button>
            <button className="outline" disabled={busy} onClick={() => simulate("canceled")}>Simulate cancellation</button>
          </>}
          <Link className="outline" to="/payment">Check pending status</Link>
        </div>
      </div>
    </section>
  </EventShell>;
}
