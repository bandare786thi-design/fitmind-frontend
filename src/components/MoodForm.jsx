import { useState } from "react";
import { analyzeTextMood } from "../api";

const initialState = { mood: "okay", energy: 5, stress: 5, note: "", text: "" };

export default function MoodForm({ onSubmit, onRecommend, loading }) {
  const [form, setForm] = useState(initialState);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  function submit(e) {
    e.preventDefault();
    onSubmit?.({
      mood: form.mood,
      energy: Number(form.energy),
      stress: Number(form.stress),
      note: form.note.trim() || null,
    });
  }

  async function runTextAI() {
    setAiError("");
    const txt = form.text.trim();
    if (!txt) {
      setAiError("Please type a short description first.");
      return;
    }
    setAiLoading(true);
    try {
      const out = await analyzeTextMood(txt);
      setForm((p) => ({
        ...p,
        mood: out.mapped_mood,
        energy: out.mapped_energy,
        stress: out.mapped_stress,
        note: `${p.note ? p.note + " | " : ""}${out.source}:${out.label}(${Math.round(
          out.confidence * 100
        )}%)`,
      }));
    } catch (e) {
      setAiError(String(e?.message || e));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="card glass">
      <div className="card-header">
        <h2>Mood Check-in</h2>
        <span className="badge">Protected</span>
      </div>

      <form className="form" onSubmit={submit}>
        <label>
          Describe how you feel (Text AI)
          <textarea
            rows={3}
            value={form.text}
            placeholder="e.g., I'm tired and stressed after work..."
            onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
          />
        </label>

        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={runTextAI}
            disabled={aiLoading || loading}
          >
            {aiLoading ? "Analyzing..." : "Analyze Text"}
          </button>
          {aiError ? <span className="error">{aiError}</span> : null}
        </div>

        <label>
          Mood
          <select
            value={form.mood}
            onChange={(e) => setForm((p) => ({ ...p, mood: e.target.value }))}
          >
            <option value="happy">happy</option>
            <option value="motivated">motivated</option>
            <option value="okay">okay</option>
            <option value="tired">tired</option>
            <option value="stressed">stressed</option>
            <option value="sad">sad</option>
            <option value="anxious">anxious</option>
          </select>
        </label>

        <label>
          Energy (1–10)
          <input
            type="range"
            min="1"
            max="10"
            value={form.energy}
            onChange={(e) => setForm((p) => ({ ...p, energy: e.target.value }))}
          />
          <span className="muted small">{form.energy}</span>
        </label>

        <label>
          Stress (1–10)
          <input
            type="range"
            min="1"
            max="10"
            value={form.stress}
            onChange={(e) => setForm((p) => ({ ...p, stress: e.target.value }))}
          />
          <span className="muted small">{form.stress}</span>
        </label>

        <label>
          Note
          <input
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="Optional note"
          />
        </label>

        <div className="row">
          <button type="submit" className="btn accent" disabled={loading}>
            {loading ? "Saving..." : "Save Check-in"}
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => onRecommend?.()}
            disabled={loading || !onRecommend}
            title={!onRecommend ? "Recommendation handler not connected" : ""}
          >
            Get Recommendation
          </button>
        </div>
      </form>
    </div>
  );
}