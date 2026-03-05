import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../api";
import VideoBackground from "../components/VideoBackground";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const pwHint = useMemo(() => "Use 8+ characters (letters + numbers recommended).", []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      await registerUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password
      });

      setMessage("Registration successful. Redirecting to login...");
      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (e) {
      setError(e.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <VideoBackground src="/media/fitmind-bg.mp4" dim={0.70} />

      <div className="auth-box glass">
        <p className="eyebrow">Get started</p>
        <h1>Create FitMind Account</h1>

        {message ? <div className="alert alert-success glass">{message}</div> : null}
        {error ? <div className="alert alert-error glass">{error}</div> : null}

        <form className="form" onSubmit={onSubmit}>
          <label>
            Name
            <input
              type="text"
              placeholder="Pavi"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              autoComplete="name"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              placeholder="pavi@test.com"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <div className="input-row">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Minimum 8 characters"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required
                autoComplete="new-password"
                minLength={8}
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowPw((v) => !v)}
                title={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
            <span className="helper" style={{ marginTop: 6 }}>{pwHint}</span>
          </label>

          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="helper">
          Already have an account? <Link to="/login">Go to login</Link>
        </p>
      </div>
    </div>
  );
}