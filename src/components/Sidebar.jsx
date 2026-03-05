// frontend/src/components/Sidebar.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { clearToken, getMe } from "../api";
import { useEffect, useState } from "react";

function NavItem({ to, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `fm-nav-item ${isActive ? "active" : ""}`}
    >
      <span className="fm-nav-icon" aria-hidden="true">
        {icon}
      </span>

      <span className="fm-nav-label">{label}</span>

      {badge ? <span className={`fm-badge ${badge.tone || ""}`}>{badge.text}</span> : null}
    </NavLink>
  );
}

function SectionLabel({ children }) {
  return <div className="fm-section-label">{children}</div>;
}

export default function Sidebar() {
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setIsAdmin(!!me?.is_admin);
      } catch {
        setIsAdmin(false);
      }
    })();
  }, []);

  function logout() {
    clearToken();
    nav("/login", { replace: true });
  }

  return (
    <aside className="fm-sidebar">
      <div className="fm-brand">
        <div className="fm-brand-title">FitMind</div>
        <div className="fm-brand-sub">Train Smart. Live Strong.</div>
      </div>

      <div className="fm-nav">
        <SectionLabel>MAIN</SectionLabel>
        <NavItem to="/dashboard" icon="🏠" label="Dashboard" />

        <SectionLabel>TRACK</SectionLabel>
        <NavItem
          to="/mood"
          icon="🧠"
          label="Mood Check-in"
          badge={{ text: "AI", tone: "tone-ai" }}
        />
        <NavItem to="/plan" icon="📅" label="Weekly Plan" badge={{ text: "PRO", tone: "tone-pro" }} />
        <NavItem to="/workouts" icon="🏋️" label="Workouts" />

        <SectionLabel>INSIGHTS</SectionLabel>
        <NavItem to="/insights" icon="📈" label="Insights" badge={{ text: "NEW", tone: "tone-new" }} />
        <NavItem to="/notifications" icon="🔔" label="Notifications" />

        <SectionLabel>ACCOUNT</SectionLabel>
        <NavItem to="/privacy" icon="🛡️" label="Privacy" />
        <NavItem to="/profile" icon="👤" label="Profile" />

        {isAdmin ? (
          <>
            <SectionLabel>ADMIN</SectionLabel>
            <NavItem to="/admin" icon="🧰" label="Admin Panel" badge={{ text: "STAFF", tone: "tone-staff" }} />
          </>
        ) : null}
      </div>

      <div className="fm-sidebar-footer">
        <button className="fm-logout" onClick={logout}>
          <span aria-hidden="true">🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}