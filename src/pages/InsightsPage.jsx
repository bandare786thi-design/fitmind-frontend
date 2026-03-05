// frontend/src/pages/InsightsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { getInsights } from "../api";

function Badge({ children }) {
  return (
    <span
      className="badge"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {children}
    </span>
  );
}

function fmtNum(v, digits = 1) {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function InsightsPage() {
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const workoutLogs = data?.workout_logs || {};
  const engagement = data?.engagement || {};

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr("");
      try {
        const res = await getInsights(range);
        if (!alive) return;
        setData(res);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to fetch insights.");
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [range]);

  const cards = useMemo(() => {
    return [
      {
        title: "Workout logs (total)",
        value: workoutLogs.total ?? "—",
        sub: "All time",
      },
      {
        title: `Workout logs (${range})`,
        value: workoutLogs.since_total ?? "—",
        sub: "In selected range",
      },
      {
        title: `Liked workouts (${range})`,
        value: engagement.liked_count ?? "—",
        sub: "Marked as liked",
      },
      {
        title: `Avg rating (${range})`,
        value: fmtNum(engagement.avg_rating, 2),
        sub: "If you rated workouts",
      },
    ];
  }, [workoutLogs, engagement, range]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 12px" }}>
      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header" style={{ marginBottom: 10 }}>
          <h2>📊 Insights</h2>
          <Badge>{loading ? "Loading…" : range}</Badge>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Range:
          </span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="btn"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <option value="7d">7d</option>
            <option value="14d">14d</option>
            <option value="30d">30d</option>
            <option value="90d">90d</option>
          </select>

          {data?.note ? (
            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85 }}>
              {data.note}
            </div>
          ) : null}
        </div>

        {err ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.12)" }}>
            <b>Failed to fetch</b>
            <div style={{ marginTop: 6 }}>{err}</div>
          </div>
        ) : null}

        {!err ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
              marginTop: 14,
            }}
          >
            {cards.map((c) => (
              <div
                key={c.title}
                className="card glass"
                style={{
                  padding: 14,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.85 }}>{c.title}</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{c.value}</div>
                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{c.sub}</div>
              </div>
            ))}
          </div>
        ) : null}

        {data?.workout_logs?.last_logged_at ? (
          <div style={{ marginTop: 14, opacity: 0.9 }}>
            <b>Last workout logged:</b> {fmtDate(data.workout_logs.last_logged_at)}
          </div>
        ) : null}
      </div>
    </div>
  );
}