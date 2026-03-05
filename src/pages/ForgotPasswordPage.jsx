import { useState } from "react";
import { forgotPassword } from "../api";
import { Link } from "react-router-dom";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const res = await forgotPassword(email);
      setStatus(res?.message || "If the email exists, a reset link was sent.");
    } catch (e2) {
      setStatus(e2?.message || "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card glass" style={{ maxWidth: 560, margin: "40px auto", padding: 18 }}>
      <h2>Forgot password</h2>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <button className="btn btn-primary" disabled={busy}>
          Send reset link
        </button>
      </form>
      {status ? <p style={{ marginTop: 10 }}>{status}</p> : null}
      <p style={{ marginTop: 12 }}>
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}