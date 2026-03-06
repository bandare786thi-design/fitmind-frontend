import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createMood,
  getMe,
  getMoods,
  getPopularWorkouts,
  getProgressStreak,
  getProgressSummary,
  getWorkoutAlternatives,
  getWorkoutLogs,
  getWorkouts,
  updateMe,
} from "../api";
import LogWorkoutModal from "../components/LogWorkoutModal";
import { useToast } from "../contexts/ToastContext";
import "../fitmind-upgrade.css";

const QUICK_GOALS = [
  { key: "weight_loss", label: "Lose weight", emoji: "🔥" },
  { key: "muscle_gain", label: "Build muscle", emoji: "💪" },
  { key: "endurance", label: "Improve stamina", emoji: "🏃" },
  { key: "stress_relief", label: "Reduce stress", emoji: "🧘" },
  { key: "beginner_fitness", label: "Beginner fitness", emoji: "🌱" },
];

const CATEGORY_PREVIEW = [
  { key: "home", title: "Home workouts", hint: "No- or low-equipment sessions" },
  { key: "gym", title: "Gym workouts", hint: "Machine and free-weight plans" },
  { key: "yoga", title: "Yoga", hint: "Mobility, breathing, recovery" },
  { key: "cardio", title: "Cardio", hint: "Walking, HIIT, heart health" },
  { key: "strength", title: "Strength", hint: "Muscle-building sessions" },
  { key: "10min", title: "Quick 10-min workouts", hint: "Fast sessions for busy days" },
];

const QUICK_MOODS = [
  { mood: "tired", energy: 3, stress: 6, label: "Tired" },
  { mood: "stressed", energy: 4, stress: 8, label: "Stressed" },
  { mood: "happy", energy: 7, stress: 3, label: "Happy" },
  { mood: "motivated", energy: 9, stress: 3, label: "Motivated" },
];

const CHALLENGES = [
  { title: "7-day challenge", blurb: "A short consistency boost with one achievable session per day." },
  { title: "30-day transformation", blurb: "Progressive strength + cardio mix with recovery support." },
  { title: "Beginner starter plan", blurb: "Confidence-building schedule focused on form and routine." },
];

const TESTIMONIALS = [
  { name: "Nadia", text: "FitMind finally gives me the right workout on low-energy days instead of pushing too hard." },
  { name: "Ryan", text: "The goal-based suggestions feel personal, and the dashboard keeps me consistent." },
  { name: "Mika", text: "I like that I can switch exercises quickly when I do not like a movement or lack equipment." },
];

const FAQS = [
  {
    q: "How does FitMind choose workouts?",
    a: "It blends your goal, fitness level, latest mood, energy, available time, equipment, and workout history.",
  },
  {
    q: "Can I still use it on bad days?",
    a: "Yes. Lower-energy and stress-aware suggestions are ranked higher when your check-in shows fatigue or stress.",
  },
  {
    q: "Can I replace a workout?",
    a: "Yes. The recommendation area loads alternatives so you can swap exercises while keeping the same training focus.",
  },
];

function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

function estimateCalories(log) {
  if (Number.isFinite(Number(log?.calories_burned))) return Number(log.calories_burned);
  const duration = Number(log?.duration_min || log?.workout?.duration_min || 0);
  const intensity = normalizeText(log?.workout?.intensity);
  const multiplier = intensity === "high" ? 9 : intensity === "medium" ? 6.5 : 4.5;
  return Math.round(duration * multiplier);
}

function getWeekSeries(logs = []) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const items = logs.filter((log) => String(log?.performed_at || "").slice(0, 10) === key);
    days.push({
      day: date.toLocaleDateString(undefined, { weekday: "short" }),
      workouts: items.length,
      calories: items.reduce((sum, item) => sum + estimateCalories(item), 0),
    });
  }
  return days;
}

function bmiValue(me) {
  const h = Number(me?.height_cm || 0) / 100;
  const w = Number(me?.weight_kg || 0);
  if (!h || !w) return null;
  return w / (h * h);
}

function bmiLabel(value) {
  if (!value) return "Add height and weight in Profile";
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Healthy range";
  if (value < 30) return "Overweight";
  return "Obesity range";
}

function workoutMatchesCategory(workout, categoryKey) {
  const category = normalizeText(workout?.category);
  const equipment = normalizeText(workout?.equipment);
  const title = normalizeText(workout?.title);
  const movement = normalizeText(workout?.movement_pattern);

  switch (categoryKey) {
    case "home":
      return equipment.includes("none") || equipment.includes("body") || title.includes("home");
    case "gym":
      return equipment.includes("barbell") || equipment.includes("machine") || equipment.includes("dumbbell") || title.includes("gym");
    case "yoga":
      return category.includes("yoga") || title.includes("yoga") || movement.includes("mobility");
    case "cardio":
      return category.includes("cardio") || normalizeText(workout?.intensity) === "high";
    case "strength":
      return category.includes("strength") || normalizeText(workout?.difficulty).includes("advanced");
    case "10min":
      return Number(workout?.duration_min || 0) <= 12;
    default:
      return true;
  }
}

function scoreWorkout(workout, context) {
  let score = 0;
  const goal = normalizeText(context.goal);
  const level = normalizeText(context.fitness_level);
  const medical = normalizeText(context.medical_notes);
  const search = normalizeText(context.search);
  const category = normalizeText(workout?.category);
  const title = normalizeText(workout?.title);
  const equipment = normalizeText(workout?.equipment || "none");
  const muscle = normalizeText(workout?.muscle_group);
  const difficulty = normalizeText(workout?.difficulty);
  const intensity = normalizeText(workout?.intensity);
  const duration = Number(workout?.duration_min || 0);

  if (search && (title.includes(search) || category.includes(search) || muscle.includes(search))) score += 5;

  if (goal.includes("weight") && (category.includes("cardio") || intensity === "high")) score += 5;
  if (goal.includes("muscle") && (category.includes("strength") || muscle.includes("chest") || muscle.includes("back") || muscle.includes("legs"))) score += 5;
  if (goal.includes("stress") && (category.includes("yoga") || category.includes("mobility") || intensity === "low")) score += 6;
  if (goal.includes("endurance") && (category.includes("cardio") || intensity === "medium" || intensity === "high")) score += 5;
  if (goal.includes("beginner") && difficulty === "beginner") score += 6;

  if (level === difficulty) score += 4;
  if (level === "beginner" && intensity === "high") score -= 3;
  if (level === "advanced" && difficulty === "advanced") score += 2;

  if (context.latestMood?.stress >= 7 && (category.includes("yoga") || intensity === "low")) score += 5;
  if (context.latestMood?.energy >= 7 && intensity === "high") score += 4;
  if (context.latestMood?.energy <= 4 && duration <= 20) score += 4;
  if (context.latestMood?.mood === "tired" && intensity === "low") score += 5;
  if (context.latestMood?.mood === "motivated" && intensity === "high") score += 5;

  if (context.availableTime && duration <= Number(context.availableTime)) score += 4;
  if (context.availableTime && duration > Number(context.availableTime) + 10) score -= 2;

  if (context.equipment === "none" && (equipment.includes("none") || equipment.includes("body"))) score += 5;
  else if (context.equipment && context.equipment !== "any" && equipment.includes(context.equipment)) score += 4;

  if (context.difficulty && context.difficulty !== "any" && difficulty === context.difficulty) score += 4;
  if (context.muscleGroup && context.muscleGroup !== "any" && muscle.includes(context.muscleGroup)) score += 4;
  if (context.workoutType && context.workoutType !== "any" && category.includes(context.workoutType)) score += 4;

  if (medical.includes("knee") && (title.includes("jump") || title.includes("squat"))) score -= 6;
  if (medical.includes("back") && (title.includes("deadlift") || title.includes("row"))) score -= 4;
  if (medical.includes("asthma") && intensity === "high") score -= 3;

  score += Math.max(0, 20 - Math.abs(duration - 20)) * 0.08;
  return score;
}

export default function DashboardPage() {
  const nav = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [savingMood, setSavingMood] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [me, setMe] = useState(null);
  const [moods, setMoods] = useState([]);
  const [logs, setLogs] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [streak, setStreak] = useState(null);
  const [popular, setPopular] = useState([]);
  const [alternatives, setAlternatives] = useState([]);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [logOpen, setLogOpen] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    availableTime: 20,
    difficulty: "any",
    equipment: "any",
    muscleGroup: "any",
    workoutType: "any",
  });

  const [selectedGoal, setSelectedGoal] = useState("stress_relief");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [meRes, moodsRes, logsRes, workoutsRes, summaryRes, streakRes, popularRes] = await Promise.all([
        getMe().catch(() => null),
        getMoods({ limit: 20 }).catch(() => []),
        getWorkoutLogs({ limit: 80 }).catch(() => []),
        getWorkouts({ limit: 120 }).catch(() => []),
        getProgressSummary("30d").catch(() => null),
        getProgressStreak().catch(() => null),
        getPopularWorkouts("30d", 6).catch(() => null),
      ]);

      setMe(meRes);
      setSelectedGoal(meRes?.goal || "stress_relief");
      setMoods(Array.isArray(moodsRes) ? moodsRes : []);
      setLogs(Array.isArray(logsRes) ? logsRes : []);
      setWorkouts(Array.isArray(workoutsRes) ? workoutsRes : []);
      setSummary(summaryRes);
      setStreak(streakRes);
      setPopular(Array.isArray(popularRes?.top) ? popularRes.top : []);
    } catch (e) {
      setError(e?.message || "Failed to load dashboard.");
      toast.error(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestMood = useMemo(() => {
    if (!moods.length) return { mood: "okay", energy: 5, stress: 5 };
    const item = moods[0];
    return {
      mood: normalizeText(item?.mood || "okay"),
      energy: Number(item?.energy ?? 5),
      stress: Number(item?.stress ?? 5),
      note: item?.note || "",
    };
  }, [moods]);

  const context = useMemo(
    () => ({
      ...filters,
      goal: selectedGoal || me?.goal || "stress_relief",
      fitness_level: me?.fitness_level || "beginner",
      latestMood,
      medical_notes: me?.medical_notes || "",
    }),
    [filters, latestMood, me?.fitness_level, me?.medical_notes, me?.goal, selectedGoal]
  );

  const rankedWorkouts = useMemo(() => {
    const items = Array.isArray(workouts) ? workouts : [];
    return items
      .map((workout) => ({ ...workout, __score: scoreWorkout(workout, context) }))
      .sort((a, b) => b.__score - a.__score);
  }, [workouts, context]);

  const todaysWorkout = rankedWorkouts[0] || null;
  const recommendationList = rankedWorkouts.slice(0, 6);
  const previewList = demoMode ? rankedWorkouts.slice(0, 8) : rankedWorkouts.slice(0, 4);

  useEffect(() => {
    async function loadAlternatives() {
      if (!todaysWorkout?.id) {
        setAlternatives([]);
        return;
      }
      try {
        const res = await getWorkoutAlternatives(todaysWorkout.id, 4);
        setAlternatives(Array.isArray(res) ? res : []);
      } catch {
        setAlternatives([]);
      }
    }
    loadAlternatives();
  }, [todaysWorkout?.id]);

  const weekSeries = useMemo(() => getWeekSeries(logs), [logs]);
  const totalCalories = useMemo(() => logs.reduce((sum, log) => sum + estimateCalories(log), 0), [logs]);
  const bmi = bmiValue(me);
  const weeklyCompletion = weekSeries.reduce((sum, item) => sum + item.workouts, 0);

  async function quickMoodSave(payload) {
    setSavingMood(true);
    setMessage("");
    setError("");
    try {
      await createMood({
        mood: payload.mood,
        energy: payload.energy,
        stress: payload.stress,
        note: `Quick dashboard check-in: ${payload.label}`,
      });
      toast.success("Mood saved");
      setMessage(`Saved your ${payload.label.toLowerCase()} check-in. Recommendations updated.`);
      await load();
    } catch (e) {
      setError(e?.message || "Could not save mood.");
      toast.error(e?.message || "Could not save mood.");
    } finally {
      setSavingMood(false);
    }
  }

  async function chooseGoal(goal) {
    setSelectedGoal(goal);
    try {
      await updateMe({ goal });
      toast.success("Goal updated");
    } catch {
      // keep UI responsive even if save fails
    }
  }

  function openWorkout(workout) {
    setSelectedWorkout(workout);
    setLogOpen(true);
  }

  const quote = latestMood.stress >= 7
    ? "Small steps still count. Recovery is part of progress."
    : latestMood.energy >= 7
    ? "You have momentum today. Use it well."
    : "Consistency beats intensity when building lasting fitness habits.";

  return (
    <div className="fm-home">
      <section className="fm-hero">
        <div className="fm-hero-grid">
          <div>
            <div className="fm-kicker">AI fitness + wellness dashboard</div>
            <h1>FitMind</h1>
            <p>
              Personalized workouts based on your mood, goals, fitness level, available time,
              and workout preferences.
            </p>

            <div className="fm-hero-actions" style={{ marginTop: 18 }}>
              <button className="btn btn-primary" onClick={() => document.getElementById("recommend-section")?.scrollIntoView({ behavior: "smooth" })}>
                Get Started
              </button>
              <button className="btn" onClick={() => setDemoMode((v) => !v)}>
                {demoMode ? "Hide Demo" : "Try Demo"}
              </button>
              <button className="btn" onClick={() => document.getElementById("workout-library")?.scrollIntoView({ behavior: "smooth" })}>
                View Workouts
              </button>
            </div>

            <div className="fm-chip-row" style={{ marginTop: 18 }}>
              <span className="fm-ai-pill">Mood check-in</span>
              <span className="fm-ai-pill">AI workout suggestions</span>
              <span className="fm-ai-pill">Quick workout start</span>
              <span className="fm-ai-pill">Progress dashboard preview</span>
              <span className="fm-ai-pill">Personalized daily plan</span>
            </div>
          </div>

          <div className="fm-hero-stats">
            <div className="fm-hero-stat">
              <div className="muted">Today’s workout</div>
              <div className="big">{todaysWorkout?.title || "Ready"}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                {todaysWorkout ? `${todaysWorkout.duration_min} min • ${todaysWorkout.intensity || "balanced"}` : "Complete a quick check-in to personalize this."}
              </div>
            </div>
            <div className="fm-hero-stat">
              <div className="muted">Current streak</div>
              <div className="big">{streak?.days ?? 0} days</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Weekly completed sessions: {weeklyCompletion}
              </div>
            </div>
            <div className="fm-hero-stat">
              <div className="muted">Mood snapshot</div>
              <div className="big" style={{ textTransform: "capitalize" }}>{latestMood.mood}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Energy {latestMood.energy}/10 • Stress {latestMood.stress}/10
              </div>
            </div>
            <div className="fm-hero-stat">
              <div className="muted">Focus goal</div>
              <div className="big">{QUICK_GOALS.find((g) => g.key === selectedGoal)?.label || "General fitness"}</div>
              <div className="muted" style={{ marginTop: 8 }}>
                Level: {me?.fitness_level || "beginner"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="fm-panel">
        <div className="fm-section-title">
          <div>
            <h2>User goal selection</h2>
            <div className="muted">Choose your primary focus so the homepage adapts instantly.</div>
          </div>
          <div className="muted small">Saved to your profile automatically</div>
        </div>
        <div className="fm-category-grid">
          {QUICK_GOALS.map((goal) => (
            <button
              key={goal.key}
              className={`fm-category-card ${selectedGoal === goal.key ? "active" : ""}`}
              onClick={() => chooseGoal(goal.key)}
              style={{ textAlign: "left", cursor: "pointer" }}
            >
              <div style={{ fontSize: 24 }}>{goal.emoji}</div>
              <h3 style={{ marginTop: 10 }}>{goal.label}</h3>
              <div className="muted" style={{ marginTop: 8 }}>
                {goal.key === "stress_relief" ? "Recovery-first movement and lower-stress sessions." :
                  goal.key === "muscle_gain" ? "Strength-forward routines with progressive overload." :
                  goal.key === "weight_loss" ? "Higher movement volume and calorie-supportive sessions." :
                  goal.key === "endurance" ? "Stamina-building cardio and steady training blocks." :
                  "Simple, confidence-building workouts with easy progress."}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="fm-panel">
        <div className="fm-section-title">
          <div>
            <h2>Workout category preview</h2>
            <div className="muted">Browse by format before you commit to a plan.</div>
          </div>
        </div>
        <div className="fm-category-grid">
          {CATEGORY_PREVIEW.map((item) => {
            const count = workouts.filter((w) => workoutMatchesCategory(w, item.key)).length;
            return (
              <div key={item.key} className="fm-category-card">
                <h3>{item.title}</h3>
                <div className="muted" style={{ marginTop: 8 }}>{item.hint}</div>
                <div className="fm-meta-row">
                  <span className="fm-meta">{count} workouts</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="recommend-section" className="fm-home-grid">
        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Recommended for you</h2>
              <div className="muted">
                Ranked using your goal, mood, energy level, available time, equipment, and current profile.
              </div>
            </div>
            <button className="btn" onClick={() => nav("/smart-recommend")}>AI recommendation</button>
          </div>

          <div className="fm-filter-row">
            <label className="field">
              <span>Search workouts</span>
              <input
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Search by name or muscle group"
              />
            </label>
            <label className="field">
              <span>Duration</span>
              <select value={filters.availableTime} onChange={(e) => setFilters((prev) => ({ ...prev, availableTime: Number(e.target.value) }))}>
                <option value={10}>10 min</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
            <label className="field">
              <span>Difficulty</span>
              <select value={filters.difficulty} onChange={(e) => setFilters((prev) => ({ ...prev, difficulty: e.target.value }))}>
                <option value="any">Any</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
            <label className="field">
              <span>Equipment</span>
              <select value={filters.equipment} onChange={(e) => setFilters((prev) => ({ ...prev, equipment: e.target.value }))}>
                <option value="any">Any</option>
                <option value="none">No equipment</option>
                <option value="dumbbell">Dumbbell</option>
                <option value="barbell">Barbell</option>
                <option value="machine">Machine</option>
                <option value="band">Band</option>
              </select>
            </label>
            <label className="field">
              <span>Muscle group</span>
              <select value={filters.muscleGroup} onChange={(e) => setFilters((prev) => ({ ...prev, muscleGroup: e.target.value }))}>
                <option value="any">Any</option>
                <option value="fullbody">Full body</option>
                <option value="legs">Legs</option>
                <option value="back">Back</option>
                <option value="chest">Chest</option>
                <option value="core">Core</option>
                <option value="shoulders">Shoulders</option>
              </select>
            </label>
            <label className="field">
              <span>Workout type</span>
              <select value={filters.workoutType} onChange={(e) => setFilters((prev) => ({ ...prev, workoutType: e.target.value }))}>
                <option value="any">Any</option>
                <option value="yoga">Yoga</option>
                <option value="cardio">Cardio</option>
                <option value="strength">Strength</option>
                <option value="mobility">Mobility</option>
              </select>
            </label>
          </div>

          <div className="fm-recommend-grid" style={{ marginTop: 16 }}>
            {recommendationList.map((workout) => (
              <div key={workout.id} className="fm-card">
                <div className="fm-workout-card-title">{workout.title}</div>
                <div className="muted" style={{ marginTop: 8 }}>
                  {workout.description || "Tailored to your current context and preferences."}
                </div>
                <div className="fm-meta-row">
                  <span className="fm-meta">{workout.duration_min || 0} min</span>
                  <span className="fm-meta">{workout.intensity || "balanced"}</span>
                  <span className="fm-meta">{workout.difficulty || "beginner"}</span>
                  <span className="fm-meta">{workout.equipment || "none"}</span>
                </div>
                <div className="fm-button-row" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => openWorkout(workout)}>Start workout</button>
                  <button className="btn" onClick={() => nav("/workouts")}>View details</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Today’s workout</h2>
              <div className="muted">One highlighted workout you can start instantly.</div>
            </div>
          </div>

          {todaysWorkout ? (
            <>
              <div className="fm-card" style={{ background: "rgba(124,58,237,0.12)" }}>
                <div className="fm-workout-card-title">{todaysWorkout.title}</div>
                <div className="muted" style={{ marginTop: 8 }}>{todaysWorkout.description || "Selected from your highest-ranked workouts."}</div>
                <div className="fm-meta-row">
                  <span className="fm-meta">Goal: {selectedGoal.replaceAll("_", " ")}</span>
                  <span className="fm-meta">Mood: {latestMood.mood}</span>
                  <span className="fm-meta">Energy: {latestMood.energy}/10</span>
                </div>
                <div className="fm-button-row" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => openWorkout(todaysWorkout)}>Start workout</button>
                  <button className="btn" onClick={() => nav("/plan")}>View plan</button>
                </div>
              </div>

              {alternatives.length ? (
                <div className="fm-card" style={{ marginTop: 14 }}>
                  <h3>Alternative exercise replacement</h3>
                  <div className="muted" style={{ marginTop: 6 }}>Do not like this one? Swap it while keeping the same training focus.</div>
                  <div className="fm-chip-row" style={{ marginTop: 12 }}>
                    {alternatives.map((alt) => (
                      <button key={alt.id} className="fm-chip" onClick={() => openWorkout(alt)}>
                        {alt.title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="muted">No workout available yet. Seed workouts first.</div>
          )}
        </div>
      </section>

      <section className="fm-home-grid">
        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Progress snapshot</h2>
              <div className="muted">Calories burned, workouts completed, streak count, and weekly activity chart.</div>
            </div>
          </div>
          <div className="fm-progress-grid">
            <div className="fm-stat">
              <div className="muted">Calories burned</div>
              <div className="value">{totalCalories}</div>
              <div className="sub">Estimated from your workout logs</div>
            </div>
            <div className="fm-stat">
              <div className="muted">Workouts completed</div>
              <div className="value">{summary?.workouts ?? logs.length}</div>
              <div className="sub">Last 30 days</div>
            </div>
            <div className="fm-stat">
              <div className="muted">Streak count</div>
              <div className="value">{streak?.days ?? 0}</div>
              <div className="sub">Consecutive days</div>
            </div>
            <div className="fm-stat">
              <div className="muted">Average rating</div>
              <div className="value">{summary?.avg_rating ?? "—"}</div>
              <div className="sub">Feedback quality</div>
            </div>
          </div>

          <div className="fm-card" style={{ marginTop: 16 }}>
            <div className="fm-section-title">
              <h3>Weekly activity chart</h3>
              <span className="fm-meta">7 days</span>
            </div>
            <div className="fm-spark">
              <ResponsiveContainer>
                <BarChart data={weekSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="workouts" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="fm-mini-grid">
          <div className="fm-tool">
            <div className="fm-section-title">
              <div>
                <h3>How are you feeling today?</h3>
                <div className="muted">The homepage adapts workout suggestions instantly.</div>
              </div>
            </div>
            <div className="fm-chip-row">
              {QUICK_MOODS.map((item) => (
                <button
                  key={item.label}
                  className="fm-quick-pill"
                  disabled={savingMood}
                  onClick={() => quickMoodSave(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="fm-cta-note">{message || error || "Quick check-ins improve personalization without filling a full form."}</div>
          </div>

          <div className="fm-tool">
            <h3>Quick action buttons</h3>
            <div className="fm-button-row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => todaysWorkout && openWorkout(todaysWorkout)}>Start workout</button>
              <button className="btn" onClick={() => nav("/mood")}>Log mood</button>
              <button className="btn" onClick={() => nav("/insights")}>Track progress</button>
              <button className="btn" onClick={() => nav("/plan")}>View plan</button>
              <button className="btn" onClick={() => nav("/smart-recommend")}>Voice / face / text AI</button>
            </div>
          </div>

          <div className="fm-tool">
            <h3>BMI / fitness calculator</h3>
            <div className="fm-quote">{bmi ? bmi.toFixed(1) : "—"}</div>
            <div className="muted" style={{ marginTop: 8 }}>{bmiLabel(bmi)}</div>
            <div className="fm-cta-note">Add age, height, and weight in Profile for more precise personalization.</div>
          </div>

          <div className="fm-tool">
            <h3>Workout of the day</h3>
            <div className="fm-quote">{todaysWorkout?.title || "Restorative mobility session"}</div>
            <div className="muted" style={{ marginTop: 8 }}>{quote}</div>
          </div>
        </div>
      </section>

      <section className="fm-panel">
        <div className="fm-section-title">
          <div>
            <h2>Featured challenges</h2>
            <div className="muted">Short programs that improve engagement and consistency.</div>
          </div>
        </div>
        <div className="fm-challenge-grid">
          {CHALLENGES.map((item) => (
            <div className="fm-challenge" key={item.title}>
              <h3>{item.title}</h3>
              <div className="muted" style={{ marginTop: 8 }}>{item.blurb}</div>
              <div className="fm-button-row" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => nav("/plan")}>View plan</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fm-home-grid">
        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Trainer / AI coach section</h2>
              <div className="muted">How recommendations work and why they feel personal.</div>
            </div>
          </div>
          <div className="fm-benefits-grid">
            <div className="fm-info-card">
              <h3>Personalized plans</h3>
              <div className="muted" style={{ marginTop: 8 }}>Goal, mood, fitness level, and time available shape the ranking.</div>
            </div>
            <div className="fm-info-card">
              <h3>Easy tracking</h3>
              <div className="muted" style={{ marginTop: 8 }}>Logs, ratings, likes, and streaks feed the dashboard and reports.</div>
            </div>
            <div className="fm-info-card">
              <h3>Mental wellness support</h3>
              <div className="muted" style={{ marginTop: 8 }}>Stress-aware suggestions reduce overload on lower-energy days.</div>
            </div>
            <div className="fm-info-card">
              <h3>Beginner-friendly guidance</h3>
              <div className="muted" style={{ marginTop: 8 }}>Difficulty and equipment filters prevent overwhelming recommendations.</div>
            </div>
          </div>

          <div className="fm-card" style={{ marginTop: 16 }}>
            <h3>How FitMind builds recommendations</h3>
            <ol className="muted" style={{ marginTop: 10, paddingLeft: 18 }}>
              <li>Read your latest mood, energy, and stress check-in.</li>
              <li>Blend your goal, level, available time, and preferred equipment.</li>
              <li>Rank matching workouts and present the best fit plus alternatives.</li>
            </ol>
          </div>
        </div>

        <div className="fm-panel">
          <div className="fm-section-title">
            <div>
              <h2>Success stories</h2>
              <div className="muted">Trust-building testimonial cards.</div>
            </div>
          </div>
          <div className="fm-testimonial-grid">
            {TESTIMONIALS.map((item) => (
              <div className="fm-testimonial" key={item.name}>
                <h3>{item.name}</h3>
                <div className="muted" style={{ marginTop: 10 }}>
                  “{item.text}”
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workout-library" className="fm-panel">
        <div className="fm-section-title">
          <div>
            <h2>Before signup preview / workout library</h2>
            <div className="muted">Let users explore sample workouts first. On your dashboard this becomes a discovery section.</div>
          </div>
          <div className="fm-chip-row">
            {popular.slice(0, 3).map((item) => (
              <span className="fm-meta" key={item.workout_id || item.title}>{item.title}</span>
            ))}
          </div>
        </div>
        <div className="fm-workout-grid">
          {previewList.map((workout) => (
            <div key={workout.id} className="fm-card">
              <div className="fm-workout-card-title">{workout.title}</div>
              <div className="muted" style={{ marginTop: 8 }}>{workout.description || "Sample workout preview."}</div>
              <div className="fm-meta-row">
                <span className="fm-meta">{workout.category || "general"}</span>
                <span className="fm-meta">{workout.duration_min || 0} min</span>
                <span className="fm-meta">{workout.equipment || "none"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fm-panel">
        <div className="fm-section-title">
          <div>
            <h2>FAQ</h2>
            <div className="muted">Answer key questions right on the homepage.</div>
          </div>
        </div>
        <div className="fm-faq-grid">
          {FAQS.map((item) => (
            <div className="fm-faq" key={item.q}>
              <h3>{item.q}</h3>
              <div className="muted" style={{ marginTop: 8 }}>{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="fm-footer">
        <div>FitMind • Personalized plans • Easy tracking • Mental wellness support • Beginner-friendly guidance</div>
      </div>

      <LogWorkoutModal
        open={logOpen}
        workout={selectedWorkout}
        onClose={() => {
          setLogOpen(false);
          setSelectedWorkout(null);
        }}
        onLogged={async () => {
          toast.success("Workout log saved");
          await load();
        }}
      />
    </div>
  );
}
