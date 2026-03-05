import { useEffect, useState } from "react";
import { createMood, getMoods, getRecommendation, getWorkoutLogs } from "../api";

import MoodForm from "../components/MoodForm";
import VoiceMoodCapture from "../components/VoiceMoodCapture";
import FaceMoodCapture from "../components/FaceMoodCapture";
import RecommendationCard from "../components/RecommendationCard";
import AlertBanner from "../components/AlertBanner";
import LogWorkoutModal from "../components/LogWorkoutModal";
import { useToast } from "../contexts/ToastContext";

export default function MoodPage() {
  const toast = useToast();

  const [moods, setMoods] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // log modal
  const [logOpen, setLogOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const moodsData = await getMoods();
      setMoods(Array.isArray(moodsData) ? moodsData : []);
      const rec = await getRecommendation().catch(() => null);
      setRecommendation(rec);
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
      setMessage("Mood check-in saved.");
      await load();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGetRecommendation() {
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
        explanation:
          "You replaced the recommended workout. FitMind will learn your preferences.",
      };
    });
    toast.success("Recommendation replaced");
    setMessage("Recommendation replaced. You can log it now.");
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

      <div className="page-grid-2">
        <MoodForm
          onSubmit={handleMoodSubmit}
          onRecommend={handleGetRecommendation}
          loading={loading}
        />

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

      <div className="card glass">
        <div className="card-header">
          <h2>Mood History</h2>
          <span className="badge">{moods.length} entries</span>
        </div>

        {moods.length ? (
          <div className="list">
            {moods.slice(0, 10).map((m) => (
              <div key={m.id} className="list-item">
                <div className="list-main">
                  <strong>{m.mood}</strong>
                  <div className="muted small">
                    Energy: {m.energy} • Stress: {m.stress}
                  </div>
                  {m.note ? <div className="muted small">“{m.note}”</div> : null}
                </div>
                <div className="timestamp">{new Date(m.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No moods yet.</p>
            <span>Add a mood check-in to unlock better recommendations.</span>
          </div>
        )}
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
          setMessage("Workout saved. Recommendations will adapt next time.");
          // refresh recommendation/moods quickly
          await load();
          // optional: touch logs endpoint to keep server warmed
          await getWorkoutLogs({ limit: 1 }).catch(() => {});
        }}
      />
    </div>
  );
}