import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPopularWorkoutsReport, getWorkoutLogs, getWorkouts } from "../api";
import "../fitmind-upgrade.css";

function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

export default function ReportsPage() {
  const [range, setRange] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [popular, setPopular] = useState([]);
  const [logs, setLogs] = useState([]);
  const [workouts, setWorkouts] = useState([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [popularRes, logsRes, workoutsRes] = await Promise.all([
        getPopularWorkoutsReport(range, 10),
        getWorkoutLogs({ limit: 300 }).catch(() => []),
        getWorkouts({ limit: 200 }).catch(() => []),
      ]);
      setPopular(Array.isArray(popularRes?.top) ? popularRes.top : []);
      setLogs(Array.isArray(logsRes) ? logsRes : []);
      setWorkouts(Array.isArray(workoutsRes) ? workoutsRes : []);
    } catch (e) {
      setError(e?.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const workoutMap = useMemo(
    () => Object.fromEntries(workouts.map((w) => [String(w.id), w])),
    [workouts]
  );

  const likedExercises = useMemo(() => {
    const stats = {};
    logs.forEach((log) => {
      if (!log?.liked) return;
      const workoutId = String(log?.workout_id || log?.workout?.id || "");
      if (!workoutId) return;
      const workout = workoutMap[workoutId] || log?.workout || {};
      if (!stats[workoutId]) {
        stats[workoutId] = {
          workout_id: workoutId,
          title: workout?.title || `Workout #${workoutId}`,
          liked_count: 0,
          avg_rating: 0,
          rating_total: 0,
          rating_count: 0,
        };
      }
      stats[workoutId].liked_count += 1;
      if (Number.isFinite(Number(log?.rating))) {
        stats[workoutId].rating_total += Number(log.rating);
        stats[workoutId].rating_count += 1;
      }
    });

    return Object.values(stats)
      .map((item) => ({
        ...item,
        avg_rating: item.rating_count ? item.rating_total / item.rating_count : null,
      }))
      .sort((a, b) => b.liked_count - a.liked_count || (b.avg_rating || 0) - (a.avg_rating || 0))
      .slice(0, 10);
  }, [logs, workoutMap]);

  const ratingBreakdown = useMemo(() => {
    const map = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    logs.forEach((log) => {
      const rating = Number(log?.rating || 0);
      if (map[rating] !== undefined) map[rating] += 1;
    });
    return Object.entries(map).map(([rating, count]) => ({ rating, count }));
  }, [logs]);

  const effortSummary = useMemo(() => {
    const map = { too_easy: 0, ok: 0, too_hard: 0 };
    logs.forEach((log) => {
      const key = normalizeText(log?.effort);
      if (map[key] !== undefined) map[key] += 1;
    });
    return Object.entries(map).map(([key, value]) => ({ name: key.replaceAll("_", " "), value }));
  }, [logs]);

  return (
    <div className="fm-home">
      <section className="fm-hero">
        <div className="fm-hero-grid">
          <div>
            <div className="fm-kicker">Engagement + popularity reports</div>
            <h1>Workout Reports</h1>
            <p>
              Track Top 10 Most Popular Workouts, your most liked exercises, rating patterns,
              and engagement trends from manual feedback.
            </p>
            <div className="fm-chip-row" style={{ marginTop: 16 }}>
              {[
                { key: "weekly", label: "Last 7 days" },
                { key: "monthly", label: "Last 30 days" },
                { key: "all", label: "All time" },
              ].map((item) => (
                <button
                  key={item.key}
                  className={`fm-chip ${range === item.key ? "active" : ""}`}
                  onClick={() => setRange(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="fm-hero-stats">
            <div className="fm-hero-stat">
              <div className="muted">Popular workouts</div>
              <div className="big">{popular.length}</div>
              <div className="muted" style={{ marginTop: 8 }}>Top ranked list</div>
            </div>
            <div className="fm-hero-stat">
              <div className="muted">Liked exercises</div>
              <div className="big">{likedExercises.length}</div>
              <div className="muted" style={{ marginTop: 8 }}>Personal favorites</div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="fm-panel" style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)" }}>
          {error}
        </div>
      ) : null}

      <section className="fm-home-grid">
        <div className="fm-table-card">
          <div className="fm-section-title">
            <div>
              <h2>Top 10 Most Popular Workouts</h2>
              <div className="muted">Based on times logged, likes, and ratings.</div>
            </div>
            <button className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="fm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Workout</th>
                  <th>Times logged</th>
                  <th>Likes</th>
                  <th>Avg rating</th>
                </tr>
              </thead>
              <tbody>
                {popular.length ? popular.map((item, index) => (
                  <tr key={item.workout_id || `${item.title}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{item.title}</td>
                    <td>{item.times_logged}</td>
                    <td>{item.likes}</td>
                    <td>{item.avg_rating == null ? "—" : Number(item.avg_rating).toFixed(2)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>No popularity data yet. Log a few workouts with ratings/likes first.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fm-table-card">
          <div className="fm-section-title">
            <div>
              <h2>Your Most Liked Exercises</h2>
              <div className="muted">Manual user feedback only, exactly as required in the proposal.</div>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="fm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Workout</th>
                  <th>Liked count</th>
                  <th>Avg rating</th>
                </tr>
              </thead>
              <tbody>
                {likedExercises.length ? likedExercises.map((item, index) => (
                  <tr key={item.workout_id}>
                    <td>{index + 1}</td>
                    <td>{item.title}</td>
                    <td>{item.liked_count}</td>
                    <td>{item.avg_rating == null ? "—" : item.avg_rating.toFixed(2)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4}>Nothing liked yet. Save a few workout logs with “I liked this workout”.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="fm-home-grid">
        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Rating distribution</h2>
              <div className="muted">How users scored completed workouts.</div>
            </div>
          </div>
          <div className="fm-spark">
            <ResponsiveContainer>
              <BarChart data={ratingBreakdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="rating" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Effort feedback</h2>
              <div className="muted">Shows whether workouts feel too easy, okay, or too hard.</div>
            </div>
          </div>
          <div className="fm-spark">
            <ResponsiveContainer>
              <BarChart data={effortSummary}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
