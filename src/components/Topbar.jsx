import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getMe } from "../api";
import { useTheme } from "../contexts/ThemeContext";
import { getProfilePrefs } from "../utils/storage";

export default function Topbar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadMe() {
    setBusy(true);
    try {
      const data = await getMe();
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  const prefs = getProfilePrefs();
  const displayName = prefs.displayName?.trim() || user?.name || "User";

  function handleLogout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar glass">
      <div className="topbar-left">
        <p className="eyebrow">Mood-aware fitness recommendation</p>
        <h1>FitMind</h1>
      </div>

      <div className="topbar-actions">
        <button className="btn btn-ghost" onClick={toggleTheme}>
          {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
        </button>

        <button className="btn btn-ghost" onClick={loadMe} disabled={busy} title="Refresh profile">
          {busy ? "⏳" : "🔄"}
        </button>

        <div className="user-chip" title={user?.email || ""}>
          <span className="dot" />
          {displayName}
        </div>

        <button className="btn btn-secondary" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}