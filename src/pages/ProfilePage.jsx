import { useEffect, useMemo, useState } from "react";
import {
  changePassword,
  logoutAll,
  setup2FA,
  enable2FA,
  disable2FA,
  getMe,
  updateMe,
  clearToken,
} from "../api";
import { useNavigate } from "react-router-dom";

export default function ProfilePage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // profile data
  const [form, setForm] = useState({
    name: "",
    email: "",
    age: "",
    height_cm: "",
    weight_kg: "",
    fitness_level: "",
    goal: "",
    medical_notes: "",
    consent_ai_processing: true,
    consent_marketing: false,
  });

  // security
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwStatus, setPwStatus] = useState("");

  // 2FA
  const [twoFA, setTwoFA] = useState({
    enabled: false,
    otpauth_url: "",
    code: "",
    status: "",
  });

  const otpQrUrl = useMemo(() => {
    // We keep it simple: show otpauth URL as text.
    // If you want a QR image, tell me — I’ll add a small QR generator in frontend.
    return twoFA.otpauth_url || "";
  }, [twoFA.otpauth_url]);

  function setField(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function load() {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const me = await getMe();

      setForm({
        name: me?.name ?? "",
        email: me?.email ?? "",
        age: me?.age ?? "",
        height_cm: me?.height_cm ?? "",
        weight_kg: me?.weight_kg ?? "",
        fitness_level: me?.fitness_level ?? "",
        goal: me?.goal ?? "",
        medical_notes: me?.medical_notes ?? "",
        consent_ai_processing: me?.consent_ai_processing ?? true,
        consent_marketing: me?.consent_marketing ?? false,
      });

      setTwoFA((p) => ({
        ...p,
        enabled: !!me?.totp_enabled,
      }));
    } catch (e) {
      setError(e?.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function normalizeNumber(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    try {
      // Only send fields backend expects (safe)
      const payload = {
        name: form.name,
        age: normalizeNumber(form.age),
        height_cm: normalizeNumber(form.height_cm),
        weight_kg: normalizeNumber(form.weight_kg),
        fitness_level: form.fitness_level || null,
        goal: form.goal || null,
        medical_notes: form.medical_notes || null,
        consent_ai_processing: !!form.consent_ai_processing,
        consent_marketing: !!form.consent_marketing,
      };

      await updateMe(payload);
      setStatus("✅ Profile updated.");
      await load();
    } catch (e2) {
      setError(e2?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function doChangePassword() {
    setPwStatus("");
    setError("");

    if (!oldPw || !newPw) {
      setPwStatus("Please enter old password and new password.");
      return;
    }
    if (newPw.length < 6) {
      setPwStatus("New password should be at least 6 characters.");
      return;
    }

    try {
      const res = await changePassword(oldPw, newPw);
      setPwStatus(res?.message || "✅ Password changed. Please log in again.");

      // after changePassword backend invalidates sessions. Log out locally too.
      clearToken();
      setTimeout(() => nav("/login", { replace: true }), 800);
    } catch (e) {
      setPwStatus(e?.message || "Failed to change password.");
    }
  }

  async function doLogoutAll() {
    setError("");
    setStatus("");
    try {
      const res = await logoutAll();
      setStatus(res?.message || "✅ Logged out from all sessions.");
      clearToken();
      setTimeout(() => nav("/login", { replace: true }), 600);
    } catch (e) {
      setError(e?.message || "Failed to logout all sessions.");
    }
  }

  // 2FA flows
  async function doSetup2FA() {
    setTwoFA((p) => ({ ...p, status: "", otpauth_url: "" }));
    setError("");

    try {
      const res = await setup2FA();
      setTwoFA((p) => ({
        ...p,
        otpauth_url: res?.otpauth_url || "",
        status:
          "✅ 2FA setup created. Add this account in Google Authenticator / Microsoft Authenticator, then enter the 6-digit code to enable.",
      }));
    } catch (e) {
      setTwoFA((p) => ({ ...p, status: e?.message || "2FA setup failed." }));
    }
  }

  async function doEnable2FA() {
    setError("");
    const code = (twoFA.code || "").trim();

    if (!code) {
      setTwoFA((p) => ({ ...p, status: "Enter the 6-digit code from your authenticator app." }));
      return;
    }

    try {
      const res = await enable2FA(code);
      setTwoFA((p) => ({
        ...p,
        enabled: true,
        code: "",
        status: res?.message || "✅ 2FA enabled. Please log in again.",
      }));

      // enabling 2FA logs out sessions
      clearToken();
      setTimeout(() => nav("/login", { replace: true }), 900);
    } catch (e) {
      setTwoFA((p) => ({ ...p, status: e?.message || "Enable 2FA failed." }));
    }
  }

  async function doDisable2FA() {
    setError("");
    const code = (twoFA.code || "").trim();

    if (!code) {
      setTwoFA((p) => ({ ...p, status: "Enter the 6-digit code to disable 2FA." }));
      return;
    }

    try {
      const res = await disable2FA(code);
      setTwoFA((p) => ({
        ...p,
        enabled: false,
        otpauth_url: "",
        code: "",
        status: res?.message || "✅ 2FA disabled. Please log in again.",
      }));

      clearToken();
      setTimeout(() => nav("/login", { replace: true }), 900);
    } catch (e) {
      setTwoFA((p) => ({ ...p, status: e?.message || "Disable 2FA failed." }));
    }
  }

  if (loading) {
    return (
      <div className="card glass" style={{ padding: 16 }}>
        <h2>Profile</h2>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* PROFILE */}
      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>👤 Profile</h2>
          <span className="badge">Account</span>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Update your profile and preferences. Your email is read-only.
        </p>

        {error ? <p style={{ color: "salmon" }}>{error}</p> : null}
        {status ? <p>{status}</p> : null}

        <form onSubmit={saveProfile} style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Name</label>
              <input className="input" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Email (read-only)</label>
              <input className="input" value={form.email} readOnly />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Age</label>
              <input
                className="input"
                value={form.age}
                onChange={(e) => setField("age", e.target.value)}
                placeholder="e.g., 25"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Height (cm)</label>
              <input
                className="input"
                value={form.height_cm}
                onChange={(e) => setField("height_cm", e.target.value)}
                placeholder="e.g., 165"
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Weight (kg)</label>
              <input
                className="input"
                value={form.weight_kg}
                onChange={(e) => setField("weight_kg", e.target.value)}
                placeholder="e.g., 58"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Fitness Level</label>
              <select
                className="input"
                value={form.fitness_level}
                onChange={(e) => setField("fitness_level", e.target.value)}
              >
                <option value="">Select</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="muted small">Goal</label>
              <select className="input" value={form.goal} onChange={(e) => setField("goal", e.target.value)}>
                <option value="">Select</option>
                <option value="fat_loss">Fat loss</option>
                <option value="muscle_gain">Muscle gain</option>
                <option value="strength">Strength</option>
                <option value="stress_relief">Stress relief</option>
                <option value="fitness">General fitness</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label className="muted small">Medical Notes (optional)</label>
            <textarea
              className="input"
              rows={4}
              value={form.medical_notes}
              onChange={(e) => setField("medical_notes", e.target.value)}
              placeholder="e.g., knee pain, asthma..."
            />
          </div>

          {/* CONSENT */}
          <div className="mini-panel" style={{ padding: 12 }}>
            <div className="card-header" style={{ marginBottom: 8 }}>
              <h2>🛡️ Privacy Preferences</h2>
              <span className="badge">Consent</span>
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!form.consent_ai_processing}
                onChange={(e) => setField("consent_ai_processing", e.target.checked)}
              />
              <span>
                Allow AI processing (voice/face/text) for mood detection
                <div className="muted small">Turn off if you want manual-only mood tracking.</div>
              </span>
            </label>

            <div style={{ height: 10 }} />

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!form.consent_marketing}
                onChange={(e) => setField("consent_marketing", e.target.checked)}
              />
              <span>
                Receive product updates / tips (marketing)
                <div className="muted small">Optional. You can disable anytime.</div>
              </span>
            </label>
          </div>

          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>

      {/* SECURITY */}
      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>🔒 Security</h2>
          <span className="badge">Account</span>
        </div>

        {/* Change password */}
        <div className="mini-panel" style={{ padding: 12 }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2>Change Password</h2>
            <span className="badge">Password</span>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              className="input"
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder="Old password"
            />
            <input
              className="input"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password"
            />
            <button className="btn btn-primary" onClick={doChangePassword}>
              Change Password
            </button>
            {pwStatus ? <div className="muted">{pwStatus}</div> : null}
          </div>
        </div>

        <div style={{ height: 12 }} />

        {/* Logout all */}
        <div className="mini-panel" style={{ padding: 12 }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2>Logout All Sessions</h2>
            <span className="badge">Sessions</span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            This will invalidate all existing tokens, including other devices.
          </p>
          <button className="btn btn-danger" onClick={doLogoutAll}>
            Logout All
          </button>
        </div>
      </div>

      {/* 2FA */}
      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>🔐 Two-Factor Authentication (2FA)</h2>
          <span className="badge">{twoFA.enabled ? "Enabled" : "Disabled"}</span>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Use an authenticator app (Google Authenticator / Microsoft Authenticator).
        </p>

        {!twoFA.enabled ? (
          <div style={{ display: "grid", gap: 10 }}>
            <button className="btn btn-primary" onClick={doSetup2FA}>
              Setup 2FA
            </button>

            {otpQrUrl ? (
              <div className="mini-panel" style={{ padding: 12 }}>
                <div className="muted small">Add this in your Authenticator app:</div>
                <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{otpQrUrl}</pre>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <input
                    className="input"
                    value={twoFA.code}
                    onChange={(e) => setTwoFA((p) => ({ ...p, code: e.target.value }))}
                    placeholder="Enter 6-digit code"
                    style={{ maxWidth: 220 }}
                  />
                  <button className="btn btn-primary" onClick={doEnable2FA}>
                    Enable 2FA
                  </button>
                </div>
              </div>
            ) : null}

            {twoFA.status ? <p>{twoFA.status}</p> : null}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="mini-panel" style={{ padding: 12 }}>
              <p style={{ marginTop: 0 }}>
                ✅ 2FA is enabled. To disable, enter your current 6-digit code.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  className="input"
                  value={twoFA.code}
                  onChange={(e) => setTwoFA((p) => ({ ...p, code: e.target.value }))}
                  placeholder="6-digit code"
                  style={{ maxWidth: 220 }}
                />
                <button className="btn btn-danger" onClick={doDisable2FA}>
                  Disable 2FA
                </button>
              </div>
              {twoFA.status ? <p style={{ marginTop: 10 }}>{twoFA.status}</p> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}