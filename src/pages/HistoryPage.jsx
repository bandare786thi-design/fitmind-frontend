import { useEffect, useMemo, useState } from "react";
import { getMoods, getWorkoutLogs, getWorkouts } from "../api";
import AlertBanner from "../components/AlertBanner";
import HistoryList from "../components/HistoryList";
import { titleCase } from "../utils/format";

export default function HistoryPage() {
  const [moods, setMoods] = useState([]);
  const [logs, setLogs] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setError("");
    try {
      const [moodsData, logsData, workoutsData] = await Promise.all([
        getMoods(),
        getWorkoutLogs(),
        getWorkouts()
      ]);
      setMoods(Array.isArray(moodsData) ? moodsData : []);
      setLogs(Array.isArray(logsData) ? logsData : []);
      setWorkouts(Array.isArray(workoutsData) ? workoutsData : []);
      setMessage("History loaded.");
    } catch (e) {
      setError(e.message);
    }
  }

  const workoutMap = useMemo(() => {
    const map = {};
    workouts.forEach((w) => (map[w.id] = w));
    return map;
  }, [workouts]);

  return (
    <div className="page-stack">
      <AlertBanner
        message={message}
        error={error}
        onClose={() => {
          setError("");
          setMessage("");
        }}
      />

      <div className="page-grid-2">
        <HistoryList
          title="Mood History"
          items={moods}
          emptyTitle="No moods yet"
          emptyText="Create mood check-ins from Dashboard."
          onRefresh={loadAll}
          renderItem={(m) => (
            <>
              <strong>{titleCase(m.mood)}</strong>
              <p className="muted">Energy {m.energy} • Stress {m.stress}</p>
              {m.note ? <p className="muted">{m.note}</p> : null}
            </>
          )}
        />

        <HistoryList
          title="Workout Log History"
          items={logs}
          emptyTitle="No workout logs yet"
          emptyText="Log a recommended workout from Dashboard."
          onRefresh={loadAll}
          renderItem={(l) => {
            const w = workoutMap[l.workout_id];
            return (
              <>
                <strong>{w ? w.title : `Workout ID #${l.workout_id}`}</strong>
                <p className="muted">
                  {w ? `${w.intensity} • ${w.duration_min} min` : "Workout details unavailable"}
                </p>
                {l.feedback ? <p className="muted">{l.feedback}</p> : null}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}