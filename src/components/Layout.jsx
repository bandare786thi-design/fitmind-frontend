// frontend/src/components/Layout.jsx
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import VideoBackground from "./VideoBackground";
import { getMe } from "../api";

export default function Layout() {
  const nav = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const me = await getMe();
        if (!alive) return;

        const path = location.pathname || "";
        const onOnboarding = path.startsWith("/onboarding");

        // ✅ ONLY onboarding gate (email verify removed)
        const incomplete = !me?.goal || !me?.fitness_level;
        if (incomplete && !onOnboarding) {
          nav("/onboarding", { replace: true });
          return;
        }
      } catch {
        // ProtectedRoute handles auth failures.
      } finally {
        if (alive) setChecked(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.pathname, nav]);

  if (!checked) return null;

  return (
    <div className="app-shell">
      <VideoBackground />
      <Sidebar />
      <main className="main glass">
        <Topbar />
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}