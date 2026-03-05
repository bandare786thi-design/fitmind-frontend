import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createMood,
  getMoods,
  getRecommendation,
  getWorkoutLogs,
  getWorkouts,
  getProgressSummary,
  getProgressStreak
} from "../api";

import VoiceMoodCapture from "../components/VoiceMoodCapture";
import FaceMoodCapture from "../components/FaceMoodCapture";
import MoodForm from "../components/MoodForm";
import RecommendationCard from "../components/RecommendationCard";
import WorkoutCatalog from "../components/WorkoutCatalog";
import AlertBanner from "../components/AlertBanner";
import StatCard from "../components/StatCard";
import ChartCard from "../components/ChartCard";
import LogWorkoutModal from "../components/LogWorkoutModal";
import { useToast } from "../contexts/ToastContext";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

function dayKey(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const toast = useToast();
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [moods, setMoods] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [logs, setLogs] = useState([]);

  const [summary, setSummary] = useState(null);
  const [streak, setStreak] = useState(null);

  const [logOpen, setLogOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [moodsData, rec, ws, logsData, sum, st] = await Promise.all([
        getMoods({ limit: 30 }),
        getRecommendation().catch(() => null),
        getWorkouts({ limit: 60 }),
        getWorkoutLogs({ limit: 60 }),
        getProgressSummary("30d").catch(() => null),
        getProgressStreak().catch(() => null)
      ]);

      setMoods(Array.isArray(moodsData) ? moodsData : []);
      setRecommendation(rec);
      setWorkouts(Array.isArray(ws) ? ws : []);
      setLogs(Array.isArray(logsData) ? logsData : []);
      setSummary(sum);
      setStreak(st);
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
  }, []);

  async function handleMoodSubmit(payload) {
    setMessage("");
    setError("");
    setLoading(true);
    try {
      await createMood(payload);
      toast.success("Mood saved");
      setMessage("Mood saved. Recommendation updated.");
      await load();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAIMoodSaved(moodsData) {
    setMoods(Array.isArray(moodsData) ? moodsData : []);
    try {
      const rec = await getRecommendation();
      setRecommendation(rec);
      toast.success("AI mood saved. Recommendation updated.");
      setMessage("AI mood saved. Recommendation updated.");
    } catch {
      toast.success("AI mood saved.");
      setMessage("AI mood saved.");
    }
  }

  function handleOpenLogModal(workout) {
    setSelectedWorkout(workout);
    setLogOpen(true);
  }

  function handleReplaceWorkout(workout) {
    setRecommendation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workout,
        reason: (prev.reason || "Replaced by user") + " • User selected an alternative",
        explanation: "You replaced the recommended workout. FitMind will learn your preferences."
      };
    });
    toast.success("Recommendation replaced");
    setMessage("Recommendation replaced. You can log it now.");
  }

  // charts
  const moodTrend = useMemo(() => {
    const items = (moods || []).slice().reverse();
    return items.map((m) => ({
      date: (m.created_at || "").slice(0, 10),
      energy: Number(m.energy || 0),
      stress: Number(m.stress || 0)
    }));
  }, [moods]);

  const intensityDist = useMemo(() => {
    const map = { low: 0, medium: 0, high: 0 };
    for (const l of logs || []) {
      // if backend returns workout embedded, use it; else skip
      const intensity = l?.workout?.intensity;
      if (intensity && map[intensity] !== undefined) map[intensity] += 1;
    }
    return Object.entries(map).map(([k, v]) => ({ name: k, value: v }));
  }, [logs]);

  const ratingTrend = useMemo(() => {
    const map = {};
    for (const l of logs || []) {
      if (!l?.performed_at || !l?.rating) continue;
      const k = dayKey(l.performed_at);
      if (!map[k]) map[k] = [];
      map[k].push(Number(l.rating));
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, arr]) => ({
        date,
        rating: arr.reduce((s, x) => s + x, 0) / arr.length
      }));
  }, [logs]);

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
          <h1>Dashboard</h1>
          <p className="muted">Your mood, workouts, and progress — in one place.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => nav("/plan")}>
            📅 Weekly Plan
          </button>
          <button className="btn" onClick={() => nav("/mood")}>
            🧠 Mood Check-in
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Streak" value={streak?.days ?? "—"} subtitle="Days" />
        <StatCard title="Workouts (30d)" value={summary?.workouts ?? "—"} subtitle="Completed" />
        <StatCard title="Avg Rating" value={summary?.avg_rating ?? "—"} subtitle="Last 30 days" />
        <StatCard title="AI Latency" value="—" subtitle="Optional metric" />
      </div>

      <div className="page-grid-2">
        <MoodForm onSubmit={handleMoodSubmit} onRecommend={async () => {
  setMessage("");
  setError("");
  setLoading(true);
  try {
    const rec = await getRecommendation();
    setRecommendation(rec);
    toast.success("Recommendation updated");
    setMessage("Recommendation updated.");
  } catch (e) {
    setError(e.message);
    toast.error(e.message);
  } finally {
    setLoading(false);
  }
}} loading={loading} />
        <RecommendationCard
          recommendation={recommendation}
          loading={loading}
          onLogWorkout={handleOpenLogModal}
          onReplaceWorkout={handleReplaceWorkout}
        />
      </div>

      <div className="page-grid-2">
        <VoiceMoodCapture onSaved={handleAIMoodSaved} />
        <FaceMoodCapture onSaved={handleAIMoodSaved} />
      </div>

      <div className="page-grid-2">
        <ChartCard title="Mood Trend (Energy vs Stress)">
          <div className="chart-wrap">
            <ResponsiveContainer>
              <LineChart data={moodTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="energy" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="stress" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Avg Rating (by day)">
          <div className="chart-wrap">
            <ResponsiveContainer>
              <LineChart data={ratingTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis domain={[1, 5]} />
                <Tooltip />
                <Line type="monotone" dataKey="rating" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <WorkoutCatalog workouts={workouts} onLogWorkout={handleOpenLogModal} />

      <LogWorkoutModal
        open={logOpen}
        workout={selectedWorkout}
        onClose={() => {
          setLogOpen(false);
          setSelectedWorkout(null);
        }}
        onLogged={() => {
          toast.success("Workout log saved");
          setMessage("Workout saved. Recommendations will adapt next time.");
          load();
        }}
      />
    </div>
  );
}