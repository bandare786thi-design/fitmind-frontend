import { useEffect, useState } from "react";
import { requestVerify, verifyEmail } from "../api";
import { useLocation, useNavigate } from "react-router-dom";

export default function VerifyEmailPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams(loc.search);
  const token = params.get("token");

  useEffect(() => {
    (async () => {
      if (!token) return;
      setBusy(true);
      try {
        await verifyEmail(token);
        setStatus("✅ Email verified! Redirecting...");
        setTimeout(() => nav("/dashboard", { replace: true }), 800);
      } catch (e) {
        setStatus(e?.message || "Verification failed.");
      } finally {
        setBusy(false);
      }
    })();
  }, [token, nav]);

  async function resend() {
    setBusy(true);
    setStatus("");
    try {
      await requestVerify();
      setStatus("✅ Verification email sent. Check your inbox (or console in dev).");
    } catch (e) {
      setStatus(e?.message || "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card glass" style={{ maxWidth: 560, margin: "40px auto", padding: 18 }}>
      <h2>Verify your email</h2>
      <p className="muted">
        Your account needs email verification. Click the link we sent you.
        (In dev mode it prints in backend terminal.)
      </p>

      <button className="btn btn-primary" onClick={resend} disabled={busy}>
        Resend verification email
      </button>

      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}