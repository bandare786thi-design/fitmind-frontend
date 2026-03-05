import { useState } from "react";
import { resetPassword } from "../api";
import { useLocation, useNavigate } from "react-router-dom";

export default function ResetPasswordPage() {
  const loc = useLocation();
  const nav = useNavigate();
  const params = new URLSearchParams(loc.search);
  const token = params.get("token") || "";

  const [pw, setPw] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const res = await resetPassword(token, pw);
      setStatus(res?.message || "Password updated. Redirecting to login...");
      setTimeout(() => nav("/login", { replace: true }), 800);
    } catch (e2) {
      setStatus(e2?.message || "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card glass" style={{ maxWidth: 560, margin: "40px auto", padding: 18 }}>
      <h2>Reset password</h2>
      {!token ? <p style={{ color: "salmon" }}>Missing token in URL.</p> : null}
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input
          className="input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password"
        />
        <button className="btn btn-primary" disabled={busy || !token}>
          Reset
        </button>
      </form>
      {status ? <p style={{ marginTop: 10 }}>{status}</p> : null}
    </div>
  );
}