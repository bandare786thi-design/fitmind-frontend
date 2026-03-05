import { useEffect, useState } from "react";
import { getPopularWorkoutsReport } from "../api";
import AlertBanner from "../components/AlertBanner";

export default function ReportsPage() {
  const [range, setRange] = useState("all");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const res = await getPopularWorkoutsReport(range, 10);
      setData(res);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted">Top workouts based on logs, likes, and ratings.</p>
        </div>

        <div className="row">
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="all">All time</option>
            <option value="weekly">Last 7 days</option>
            <option value="monthly">Last 30 days</option>
          </select>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <AlertBanner type="error" message={error} /> : null}

      <div className="card glass">
        <div className="card-header">
          <h2>Top 10 Most Popular Workouts</h2>
          <span className="badge">{data?.range || range}</span>
        </div>

        {!data?.top?.length ? (
          <div className="empty-state">
            <p>No data yet</p>
            <span>Log some workouts with likes/ratings to see this report.</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Workout</th>
                  <th>Times Logged</th>
                  <th>Likes</th>
                  <th>Avg Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.top.map((r, i) => (
                  <tr key={r.workout_id}>
                    <td>{i + 1}</td>
                    <td>{r.title}</td>
                    <td>{r.times_logged}</td>
                    <td>{r.likes}</td>
                    <td>{r.avg_rating === null ? "—" : r.avg_rating.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}