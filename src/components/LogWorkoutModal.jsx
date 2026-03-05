import { useEffect, useState } from "react";
import { createWorkoutLog, updateWorkoutLog } from "../api";

export default function LogWorkoutModal({
  open,
  workout,
  logId,          // ✅ if provided, modal will PATCH instead of POST
  onClose,
  onLogged
}) {
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(5);
  const [liked, setLiked] = useState(true);
  const [effort, setEffort] = useState("ok"); // too_easy | ok | too_hard

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
  }, [open]);

  if (!open) return null;

  async function submit() {
    setErr("");
    if (!workout?.id) {
      setErr("Workout not found.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        feedback: feedback.trim() || null,
        rating: rating || null,
        liked: !!liked,
        effort: effort || null
      };

      let res;
      if (logId) {
        res = await updateWorkoutLog(logId, payload);
      } else {
        res = await createWorkoutLog({ workout_id: workout.id, ...payload });
      }

      onLogged?.(res);
      onClose?.();

      setFeedback("");
      setRating(5);
      setLiked(true);
      setEffort("ok");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal glass">
        <div className="modal-header">
          <h2>{logId ? "Update Workout Log" : "Log Workout"}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="muted">
            Workout: <b>{workout?.title}</b>
          </p>

          <label className="field">
            <span>Effort</span>
            <select value={effort} onChange={(e) => setEffort(e.target.value)}>
              <option value="too_easy">Too easy</option>
              <option value="ok">Okay</option>
              <option value="too_hard">Too hard</option>
            </select>
          </label>

          <label className="field" style={{ marginTop: 10 }}>
            <span>Rating (1–5)</span>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>

          <label className="field" style={{ marginTop: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={liked}
                onChange={(e) => setLiked(e.target.checked)}
              />
              I liked this workout
            </span>
          </label>

          <label className="field" style={{ marginTop: 10 }}>
            <span>Feedback (optional)</span>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="How was it? Any pain? Too hard? Too easy?"
            />
          </label>

          {err ? <p className="error">{err}</p> : null}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}