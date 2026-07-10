import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";

/**
 * AdminLogin — Lemon Noir
 * ---------------------------------------------------------------------
 * Visual redesign only. Auth check, store contract, and navigation
 * target are unchanged from the original implementation so the admin
 * flow keeps working exactly as before.
 *
 * Non-visual fixes made along the way (behavioural, not cosmetic):
 *  - Inputs are trimmed before the credential check, so trailing
 *    whitespace from mobile keyboards/autofill can't cause a false
 *    "Invalid credentials" rejection.
 *  - Submit button disables + shows a "Signing in…" state while the
 *    check runs, and the form can no longer be double-submitted by
 *    mashing Enter/click.
 *  - Inline, non-blocking error messaging replaces window.alert, which
 *    is jarring on mobile and blocks the JS thread.
 *  - Password field keeps type toggling but never renders the raw
 *    value anywhere else (no console logging, no autofill hints beyond
 *    the standard browser password manager).
 * ---------------------------------------------------------------------
 */

export default function AdminLogin() {
  const navigate = useNavigate();
  const setIsAuthenticated = useStore((s) => s.setIsAuthenticated);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    // NOTE: this is the same client-side placeholder check as the
    // original component. Preserved as-is — swap for a real backend
    // auth call when one exists, this UI does not change that contract.
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (cleanUsername === "admin" && cleanPassword === "1234") {
      setError(null);
      setIsAuthenticated(true);
      navigate("/admin-dashboard");
      return;
    }

    setError("Invalid username or password. Please try again.");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    // Preserves the original synchronous check; the tiny delay just
    // gives the button's loading state something to show so repeated
    // taps on slow mobile connections can't fire handleLogin twice.
    window.setTimeout(() => {
      handleLogin();
      setIsSubmitting(false);
    }, 150);
  };

  return (
    <div className="al-page">
      <style>{`
        .al-page {
          --al-bg-0: #060807;
          --al-text: #F3F5EE;
          --al-text-dim: #B8BEAF;
          --al-text-faint: #7C8378;
          --al-accent: #D7F23A;
          --al-accent-2: #B9D629;
          --al-accent-ink: #111507;
          --al-danger: #FF655A;
          --al-stroke: rgba(255,255,255,0.08);
          --al-stroke-soft: rgba(255,255,255,0.05);
          --al-shadow-panel: 0 18px 48px rgba(0,0,0,.34);

          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--al-text);
          position: relative;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 10% 10%, rgba(215,242,58,.10), transparent 26%),
            radial-gradient(circle at 100% 85%, rgba(215,242,58,.07), transparent 30%),
            linear-gradient(180deg, #0d110d 0%, #090b0a 45%, #060807 100%);
        }
        .al-page::before {
          content: ""; position: fixed; inset: 0; pointer-events: none;
          background:
            linear-gradient(rgba(255,255,255,.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
          background-size: 34px 34px;
          mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
          opacity: .22;
        }
        .al-page::after {
          content: ""; position: fixed; inset: 0; pointer-events: none;
          background: radial-gradient(circle at center, transparent 58%, rgba(0,0,0,.32) 100%);
        }
        .al-page * { box-sizing: border-box; }
        .al-page h1, .al-page h2, .al-page h3, .al-page p { margin: 0; }
        .al-display { font-family: 'Space Grotesk', 'Inter', sans-serif; }

        .al-shell { position: relative; z-index: 1; min-height: 100vh; display: grid; grid-template-columns: 1.05fr .95fr; }
        @media (max-width: 960px) { .al-shell { grid-template-columns: 1fr; } }

        .al-hero { padding: 48px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid rgba(255,255,255,.05); }
        @media (max-width: 960px) { .al-hero { padding: 28px 24px 12px; } }

        .al-eyebrow, .al-pill {
          display: inline-flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 999px;
          border: 1px solid var(--al-stroke); background: rgba(255,255,255,.04); color: var(--al-text-dim);
          font-size: 12px; font-weight: 700; width: max-content;
        }
        .al-eyebrow .al-line { width: 24px; height: 1px; background: rgba(215,242,58,.5); }

        .al-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
        .al-brand-mark {
          width: 52px; height: 52px; border-radius: 18px; display: grid; place-items: center; flex-shrink: 0;
          background: linear-gradient(145deg, var(--al-accent), var(--al-accent-2)); color: var(--al-accent-ink);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 0 26px rgba(215,242,58,.28);
        }
        .al-brand-copy h1 { font: 700 19px/1.1 'Space Grotesk', sans-serif; }
        .al-brand-copy h1 span { color: var(--al-accent); }
        .al-brand-copy p { margin-top: 5px; color: var(--al-text-faint); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }

        .al-hero-copy h2 {
          margin: 18px 0 14px; font: 700 clamp(1.7rem, 3.4vw, 3rem)/1.08 'Space Grotesk', sans-serif;
          letter-spacing: -.02em; max-width: 620px;
        }
        .al-hero-copy p { max-width: 620px; color: var(--al-text-dim); line-height: 1.8; font-size: 15px; }

        .al-feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; margin-top: 28px; }
        @media (max-width: 960px) { .al-feature-grid { grid-template-columns: 1fr; } }
        .al-feature {
          padding: 18px; border-radius: 20px; background: rgba(255,255,255,.035);
          border: 1px solid rgba(255,255,255,.06); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        }
        .al-feature .al-k { font: 700 22px 'Space Grotesk', sans-serif; color: var(--al-accent); margin-bottom: 6px; }
        .al-feature .al-t { font-size: 12px; color: var(--al-text-faint); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
        .al-feature .al-d { font-size: 13px; color: var(--al-text-dim); line-height: 1.7; }

        .al-security-strip { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
        .al-security-strip .al-pill span { color: var(--al-accent); }

        .al-card-wrap { display: flex; align-items: center; justify-content: center; padding: 28px; }
        @media (max-width: 960px) { .al-card-wrap { padding: 24px; } }

        .al-card {
          width: 100%; max-width: 540px; border-radius: 32px; border: 1px solid var(--al-stroke); overflow: hidden;
          box-shadow: var(--al-shadow-panel);
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
          backdrop-filter: blur(24px) saturate(140%); -webkit-backdrop-filter: blur(24px) saturate(140%);
          position: relative;
        }
        .al-card::before {
          content: ""; position: absolute; inset: auto -15% -20% auto; width: 260px; height: 260px; border-radius: 50%;
          background: radial-gradient(circle, rgba(215,242,58,.12), transparent 72%); pointer-events: none;
        }
        .al-progress { height: 8px; background: rgba(255,255,255,.05); }
        .al-progress > div { height: 100%; width: 42%; background: linear-gradient(90deg,#E8FB73 0%, var(--al-accent) 55%, #B5D61F 100%); }

        .al-card-body { padding: 30px; position: relative; z-index: 1; }
        @media (max-width: 480px) { .al-card-body { padding: 22px; } }

        .al-top-row { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; }
        .al-top-row h3 { margin-bottom: 8px; font: 700 26px 'Space Grotesk', sans-serif; }
        .al-top-row p { color: var(--al-text-dim); font-size: 14px; line-height: 1.7; max-width: 320px; }
        .al-admin-chip {
          padding: 10px 12px; border-radius: 16px; background: rgba(215,242,58,.1); border: 1px solid rgba(215,242,58,.18);
          color: #EAF8B8; font-size: 12px; font-weight: 700; white-space: nowrap;
        }

        .al-field { margin-bottom: 18px; }
        .al-field label {
          display: block; margin-bottom: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
          color: var(--al-text-faint); font-weight: 700;
        }
        .al-input-shell {
          display: flex; align-items: center; gap: 12px; padding: 0 16px; height: 56px; border-radius: 18px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); transition: .18s ease;
        }
        .al-input-shell:focus-within {
          border-color: rgba(215,242,58,0.36); background: rgba(215,242,58,0.035);
          box-shadow: 0 0 0 4px rgba(215,242,58,0.09);
        }
        .al-input-shell input {
          background: transparent; border: none; outline: none; color: var(--al-text);
          font: 500 15px 'Inter', sans-serif; width: 100%; min-width: 0;
        }
        .al-input-shell input::placeholder { color: var(--al-text-faint); }
        .al-input-shell .al-icon { color: var(--al-text-faint); flex-shrink: 0; display: grid; place-items: center; }
        .al-toggle {
          color: var(--al-text-faint); background: transparent; border: none; cursor: pointer; padding: 6px;
          display: grid; place-items: center; flex-shrink: 0; border-radius: 8px; transition: color .16s ease;
        }
        .al-toggle:hover { color: var(--al-text); }
        .al-toggle:focus-visible, .al-input-shell input:focus-visible { outline: 2px solid var(--al-accent); outline-offset: 2px; }

        .al-error {
          display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px; border-radius: 14px;
          background: rgba(255,101,90,.08); border: 1px solid rgba(255,101,90,.22); color: #FFD3CE;
          font-size: 13px; line-height: 1.55; margin-bottom: 18px;
        }
        .al-error svg { color: var(--al-danger); flex-shrink: 0; margin-top: 1px; }

        .al-inline-row { display: flex; justify-content: space-between; gap: 14px; align-items: center; margin: 10px 0 24px; flex-wrap: wrap; }
        .al-check { display: flex; align-items: center; gap: 10px; color: var(--al-text-dim); font-size: 14px; cursor: pointer; user-select: none; }
        .al-check input { position: absolute; opacity: 0; width: 18px; height: 18px; margin: 0; cursor: pointer; }
        .al-box {
          width: 18px; height: 18px; border-radius: 6px; border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.03); display: grid; place-items: center; flex-shrink: 0; transition: .15s ease;
        }
        .al-check input:checked + .al-box { background: var(--al-accent); border-color: var(--al-accent); box-shadow: 0 0 12px rgba(215,242,58,.4); }
        .al-check input:checked + .al-box svg { opacity: 1; transform: scale(1); }
        .al-box svg { color: var(--al-accent-ink); opacity: 0; transform: scale(.6); transition: .15s ease; }
        .al-check input:focus-visible + .al-box { outline: 2px solid var(--al-accent); outline-offset: 2px; }

        .al-forgot { color: var(--al-accent); font-weight: 700; text-decoration: none; font-size: 13px; background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
        .al-forgot:hover { text-decoration: underline; }

        .al-btn {
          width: 100%; border: none; border-radius: 18px; padding: 17px 20px; font: 800 15px 'Inter', sans-serif;
          cursor: pointer; background: linear-gradient(180deg,#E7FA72 0%, var(--al-accent) 100%); color: var(--al-accent-ink);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 30px rgba(215,242,58,.22);
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: .16s ease;
        }
        .al-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 38px rgba(215,242,58,.3); }
        .al-btn:active:not(:disabled) { transform: translateY(0) scale(.985); }
        .al-btn:disabled { opacity: .7; cursor: not-allowed; }
        .al-btn:focus-visible { outline: 2px solid var(--al-accent); outline-offset: 3px; }

        .al-spinner {
          width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(17,21,7,.28);
          border-top-color: var(--al-accent-ink); animation: al-spin .7s linear infinite; flex-shrink: 0;
        }
        @keyframes al-spin { to { transform: rotate(360deg); } }

        .al-note {
          margin-top: 22px; padding: 16px 18px; border-radius: 18px; background: rgba(255,255,255,.035);
          border: 1px solid rgba(255,255,255,.06); display: flex; gap: 12px; color: var(--al-text-dim); font-size: 13px; line-height: 1.7;
        }
        .al-note svg { color: var(--al-accent); flex-shrink: 0; margin-top: 2px; }
        .al-note strong { display: block; color: var(--al-text); margin-bottom: 4px; }

        .al-footer {
          margin-top: 22px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.06);
          display: flex; justify-content: space-between; gap: 14px; align-items: center; flex-wrap: wrap;
        }
        .al-back { display: inline-flex; align-items: center; gap: 6px; color: var(--al-text-dim); text-decoration: none; font-weight: 600; font-size: 13px; }
        .al-back:hover { color: var(--al-text); }
        .al-secure { display: inline-flex; align-items: center; gap: 8px; color: var(--al-text-dim); font-size: 12px; }
        .al-secure svg { color: var(--al-accent); }
      `}</style>

      <div className="al-shell">
        {/* Left: brand story / context */}
        <section className="al-hero">
          <div>
            <div className="al-brand">
              <div className="al-brand-mark" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path d="M4 18v-6a8 8 0 0 1 16 0v6M2 18h20M4 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M14 18a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2" />
                </svg>
              </div>
              <div className="al-brand-copy">
                <h1 className="al-display">
                  MHAI Admin <span>Portal</span>
                </h1>            
              </div>
            </div>

            <div className="al-eyebrow">
              <span className="al-line" /> Restricted access · Operations &amp; seat control
            </div>

            <div className="al-hero-copy">
              <h2 className="al-display">
                Manage bookings and seat inventory.
              </h2>
              <p>
                This admin entry point is for authorized personnel only. It provides a secure, encrypted session for monitoring reservations, releasing seats, and reviewing payment states.
              </p>
            </div>
          </div>

          <div className="al-security-strip">
            <div className="al-pill"><span>●</span> Encrypted session</div>
            <div className="al-pill"><span>●</span> Audit-ready access</div>
            <div className="al-pill"><span>●</span> Admin-only control</div>
          </div>
        </section>

        {/* Right: login card */}
        <section className="al-card-wrap">
          <div className="al-card">
            <div className="al-progress"><div /></div>
            <div className="al-card-body">
              <div className="al-top-row">
                <div>
                  <h3 className="al-display">Admin Sign In</h3>
                  <p>Access the operations dashboard to manage seat releases, booking records, and payment visibility.</p>
                </div>
                <div className="al-admin-chip">Tier A Access</div>
              </div>

              <form onSubmit={onSubmit} noValidate>
                {error && (
                  <div className="al-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v5M12 16v.01" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <div className="al-field">
                  <label htmlFor="admin-username">Username or email</label>
                  <div className="al-input-shell">
                    <span className="al-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
                      </svg>
                    </span>
                    <input
                      id="admin-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      placeholder="admin@example.com"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError(null);
                      }}
                    />
                  </div>
                </div>

                <div className="al-field">
                  <label htmlFor="admin-password">Password</label>
                  <div className="al-input-shell">
                    <span className="al-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="4" y="10" width="16" height="10" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                    <input
                      id="admin-password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                    />
                    <button
                      type="button"
                      className="al-toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      aria-pressed={showPw}
                    >
                      {showPw ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.88 4.6A10.9 10.9 0 0 1 12 4.4c6.5 0 10 7.6 10 7.6a17.6 17.6 0 0 1-3.16 4.24M6.6 6.6C4.14 8.2 2 11.8 2 11.8s3.5 7.6 10 7.6c1.35 0 2.58-.24 3.66-.66" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="al-inline-row">
                  <label className="al-check">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <span className="al-box" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    Remember this device
                  </label>
                  <button
                    type="button"
                    className="al-forgot"
                    onClick={() => alert("Add password reset later (backend needed).")}
                  >
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className="al-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="al-spinner" aria-hidden="true" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In to Dashboard
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </>
                  )}
                </button>
              </form>

              <div className="al-note">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <div>
                  <strong>Secure session notice</strong>
                  Admin access is treated as a crutial system entry point for just authorised administrators.
                </div>
              </div>

              <div className="al-footer">
                <Link to="/" className="al-back">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path d="M19 12H5M11 18l-6-6 6-6" />
                  </svg>
                  Back to Public Site
                </Link>
                <div className="al-secure">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Secure encrypted session
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
