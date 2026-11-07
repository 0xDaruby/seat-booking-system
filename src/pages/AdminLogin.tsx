import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import EventShell from "../components/EventShell";
import { api } from "../booking";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("admin/login", { username, password });
      navigate("/admin-dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return <EventShell><section className="wrap centered">
    <form className="panel state-card details" onSubmit={login}>
      <p className="eyebrow">Series 004 / Organizer</p>
      <h1>Admin sign-in.</h1>
      <label>Organizer username<input required autoComplete="username" autoCapitalize="none" maxLength={40} value={username} onChange={(e) => setUsername(e.target.value)} /></label>
      <label>Password<input type="password" required autoComplete="current-password" maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="button" disabled={busy}>{busy ? "Signing in…" : "Sign in →"}</button>
    </form>
  </section></EventShell>;
}
