import { useMemo, useState } from "react";
import { loginUser } from "../api";
import { useNavigate, Link } from "react-router-dom";
import VideoBackground from "../components/VideoBackground";
import { useToast } from "../contexts/ToastContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hint = useMemo(() => "Use the email/password you registered in Swagger or Register page.", []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      toast.warn("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const data = await loginUser({ email: email.trim(), password });

      if (!data?.access_token) {
        throw new Error("Login succeeded but access_token not returned.");
      }

      toast.success("Login successful!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err?.message || "Login failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* ✅ Video background restored */}
      <VideoBackground src="/media/fitmind-bg.mp4" dim={0.70} />

      <div className="auth-box glass">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Login to FitMind</h1>

        <p className="helper" style={{ marginTop: 6 }}>{hint}</p>

        {error ? <div className="alert alert-error glass">{error}</div> : null}

        <form onSubmit={handleSubmit} className="form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="helper">
          Don’t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}