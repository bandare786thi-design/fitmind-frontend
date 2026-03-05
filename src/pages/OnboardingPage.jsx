import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, updateMe } from "../api";
import AlertBanner from "../components/AlertBanner";
import { useToast } from "../contexts/ToastContext";

const goals = [
  { value: "general_fitness", label: "General fitness" },
  { value: "weight_loss", label: "Weight loss" },
  { value: "muscle_gain", label: "Muscle gain" },
  { value: "stress_relief", label: "Stress relief" },
  { value: "mobility", label: "Mobility" },
  { value: "endurance", label: "Endurance" }
];

const levels = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" }
];

export default function OnboardingPage() {
  const nav = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    fitness_level: "beginner",
    goal: "stress_relief",
    medical_notes: "",
    age: "",
    height_cm: "",
    weight_kg: ""
  });

  async function finish() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await updateMe({
        fitness_level: form.fitness_level || null,
        goal: form.goal || null,
        medical_notes: form.medical_notes.trim() ? form.medical_notes.trim() : null,
        age: form.age === "" ? null : Number(form.age),
        height_cm: form.height_cm === "" ? null : Number(form.height_cm),
        weight_kg: form.weight_kg === "" ? null : Number(form.weight_kg)
      });

      const me = await getMe();
      if (!me?.goal || !me?.fitness_level) {
        setError("Please complete goal and fitness level.");
        return;
      }

      toast.success("Onboarding completed");
      setMessage("Onboarding completed.");
      nav("/dashboard", { replace: true });
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack" style={{ maxWidth: 820 }}>
      <h1>Welcome to FitMind</h1>
      <p className="muted">
        This setup improves safety + recommendation quality. You can edit later in Profile.
      </p>

      <AlertBanner
        message={message}
        error={error}
        onClose={() => {
          setMessage("");
          setError("");
        }}
      />

      <div className="card glass">
        <div className="card-header">
          <h2>Step {step} / 2</h2>
          <span className="badge">Onboarding</span>
        </div>

        {step === 1 ? (
          <div className="form">
            <label className="field">
              <span>Fitness level</span>
              <select
                value={form.fitness_level}
                onChange={(e) => setForm((p) => ({ ...p, fitness_level: e.target.value }))}
              >
                {levels.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Main goal</span>
              <select value={form.goal} onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}>
                {goals.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </select>
            </label>

            <div className="action-row">
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="form">
            <div className="grid-3">
              <label className="field">
                <span>Age (optional)</span>
                <input value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} />
              </label>
              <label className="field">
                <span>Height cm (optional)</span>
                <input value={form.height_cm} onChange={(e) => setForm((p) => ({ ...p, height_cm: e.target.value }))} />
              </label>
              <label className="field">
                <span>Weight kg (optional)</span>
                <input value={form.weight_kg} onChange={(e) => setForm((p) => ({ ...p, weight_kg: e.target.value }))} />
              </label>
            </div>

            <label className="field">
              <span>Injuries / medical notes (optional)</span>
              <textarea
                rows={3}
                value={form.medical_notes}
                onChange={(e) => setForm((p) => ({ ...p, medical_notes: e.target.value }))}
                placeholder="Example: knee pain, asthma, back injury..."
              />
            </label>

            <div className="action-row">
              <button className="btn" onClick={() => setStep(1)} disabled={saving}>Back</button>
              <button className="btn btn-primary" onClick={finish} disabled={saving}>
                {saving ? "Saving..." : "Finish"}
              </button>
            </div>

            <p className="muted small">
              FitMind is not medical advice. Stop if pain occurs and consult a professional.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}