import { useEffect, useMemo, useState } from "react";
import { completePlan, createPlan, getWeekPlan, getWorkouts, updatePlan } from "../api";
import LogWorkoutModal from "../components/LogWorkoutModal";
import AlertBanner from "../components/AlertBanner";
import { useToast } from "../contexts/ToastContext";

function startOfWeekISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0..6
  const diff = (day === 0 ? -6 : 1) - day; // Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(startISO, days) {
  const d = new Date(startISO);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function PlanPage() {
  const toast = useToast();

  const [weekStart, setWeekStart] = useState(startOfWeekISO());
  const [rows, setRows] = useState([]);
  const [workouts, setWorkouts] = useState([]);

  const [selectedWorkoutId, setSelectedWorkoutId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // modal state
  const [logOpen, setLogOpen] = useState(false);
  const [logWorkout, setLogWorkout] = useState(null);
  const [logId, setLogId] = useState(null);

  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDaysISO(weekStart, i)),
    [weekStart]
  );

  const byDate = useMemo(() => {
    const map = {};
    for (const r of rows) map[r.plan_date] = r;
    return map;
  }, [rows]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [plan, ws] = await Promise.all([getWeekPlan(weekStart), getWorkouts()]);
      setRows(plan || []);
      setWorkouts(ws || []);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().slice(0, 10));
  }

  async function addPlan() {
    setMessage("");
    setError("");

    if (!selectedDate || !selectedWorkoutId) {
      setError("Select a date and a workout first.");
      return;
    }

    try {
      await createPlan({
        plan_date: selectedDate,
        workout_id: Number(selectedWorkoutId)
      });
      toast.success("Planned workout saved");
      setMessage("Planned workout saved.");
      setSelectedDate("");
      setSelectedWorkoutId("");
      await load();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    }
  }

  async function setStatus(planId, status) {
    setMessage("");
    setError("");
    try {
      await updatePlan(planId, { status });
      toast.success("Plan updated");
      setMessage("Plan updated.");
      await load();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    }
  }

  async function completeAndRate(item) {
    setMessage("");
    setError("");
    try {
      // backend returns: { plan, log }
      const res = await completePlan(item.id);
      toast.success("Marked as completed");
      setMessage("Marked as completed. Please rate it.");

      await load();

      setLogWorkout(item.workout);
      setLogId(res?.log?.id || null);
      setLogOpen(true);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    }
  }

  return (
    <div className="page-stack">
      <AlertBanner
        message={message}
        error={error}
        onClose={() => {
          setMessage("");
          setError("");
        }}
      />

      <div className="row-between">
        <div>
          <h1>Weekly Plan</h1>
          <p className="muted">
            Plan one workout per day. Completing a planned workout auto-creates a log.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={prevWeek}>◀ Prev</button>
          <button className="btn" onClick={nextWeek}>Next ▶</button>
        </div>
      </div>

      <div className="card glass">
        <div className="card-header">
          <h2>Add to Plan</h2>
          <span className="badge">{weekStart} week</span>
        </div>

        <div className="plan-add">
          <label className="field">
            <span>Date</span>
            <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
              <option value="">Select day</option>
              {days.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Workout</span>
            <select value={selectedWorkoutId} onChange={(e) => setSelectedWorkoutId(e.target.value)}>
              <option value="">Select workout</option>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title} ({w.intensity}, {w.duration_min}m)
                </option>
              ))}
            </select>
          </label>

          <button className="btn btn-primary" onClick={addPlan} disabled={loading}>
            Add / Replace
          </button>
        </div>
      </div>

      <div className="card glass">
        <div className="card-header">
          <h2>This Week</h2>
          <span className="badge">7 days</span>
        </div>

        <div className="plan-table-wrap">
          <table className="plan-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Workout</th>
                <th>Status</th>
                <th style={{ width: 320 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const item = byDate[d];
                return (
                  <tr key={d}>
                    <td>{d}</td>
                    <td>{item?.workout?.title || <span className="muted">—</span>}</td>
                    <td>
                      <span className={`pill ${item?.status || "planned"}`}>
                        {item?.status || "planned"}
                      </span>
                    </td>
                    <td>
                      {item ? (
                        <div className="btn-row">
                          <button className="btn" onClick={() => setStatus(item.id, "planned")}>
                            Planned
                          </button>
                          <button className="btn btn-secondary" onClick={() => completeAndRate(item)}>
                            Complete + Rate
                          </button>
                          <button className="btn" onClick={() => setStatus(item.id, "skipped")}>
                            Skipped
                          </button>
                        </div>
                      ) : (
                        <span className="muted">Add above</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <LogWorkoutModal
        open={logOpen}
        workout={logWorkout}
        logId={logId}
        onClose={() => {
          setLogOpen(false);
          setLogWorkout(null);
          setLogId(null);
        }}
        onLogged={() => {
          toast.success("Workout log saved");
          setMessage("Workout log saved. Next recommendation will adapt.");
          load();
        }}
      />
    </div>
  );
}