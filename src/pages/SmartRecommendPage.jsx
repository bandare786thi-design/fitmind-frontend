import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFaceMood,
  analyzeFusion,
  analyzeTextMood,
  analyzeVoiceInsights,
  createMood,
  getMe,
  getWorkoutAlternatives,
  getWorkoutsByState,
} from "../api";
import { downsampleBuffer, encodeWav } from "../utils/wav";
import LogWorkoutModal from "../components/LogWorkoutModal";

function fmtPct(x) {
  return typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—";
}

function fmtSec(sec) {
  const whole = Number.isFinite(sec) ? sec : 0;
  const m = Math.floor(whole / 60);
  const s = Math.floor(whole % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function pretty(v) {
  if (!v && v !== 0) return "—";
  return String(v)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function Badge({ children, tone = "", style = {} }) {
  return (
    <span
      className={`badge ${tone}`}
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.10)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function ModeButton({ active, onClick, children, disabled = false }) {
  return (
    <button
      className={`btn ${active ? "btn-primary" : ""}`}
      onClick={onClick}
      type="button"
      disabled={disabled}
      style={{ minWidth: 120 }}
    >
      {children}
    </button>
  );
}

function SectionCard({ title, right, children }) {
  return (
    <div className="card glass" style={{ padding: 16 }}>
      <div className="card-header">
        <h2>{title}</h2>
        {right}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function PresetLine({ w }) {
  const sets = w?.prescription?.sets ?? 3;
  const reps = w?.prescription?.reps ?? "10-12";
  const rest = w?.prescription?.rest_seconds ?? 60;
  return `${sets} sets × ${reps} reps • Rest ${rest}s`;
}

function normalizeRec(rec) {
  if (Array.isArray(rec)) {
    return {
      workouts: rec,
      reason: "Recommended from your detected mood state.",
      mood: null,
      energy: null,
      stress: null,
      source: "state",
    };
  }
  return {
    workouts: Array.isArray(rec?.workouts) ? rec.workouts : [],
    reason: rec?.reason || "Recommended from your detected mood state.",
    mood: rec?.mood ?? null,
    energy: rec?.energy ?? null,
    stress: rec?.stress ?? null,
    source: rec?.source || "state",
  };
}

function normalizeAlternatives(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.alternatives)) return data.alternatives;
  if (Array.isArray(data?.workouts)) return data.workouts;
  return [];
}

function bmiFromProfile(profile) {
  const height = safeNum(profile?.height_cm || profile?.height);
  const weight = safeNum(profile?.weight_kg || profile?.weight);
  if (!height || !weight) return null;
  const meters = height / 100;
  if (!meters) return null;
  return weight / (meters * meters);
}

function profileHealthText(profile) {
  return (
    profile?.medical_history ||
    profile?.health_issues ||
    profile?.conditions ||
    profile?.injuries ||
    ""
  );
}

function profileSummary(profile) {
  if (!profile) return [];
  const parts = [];
  if (profile?.age) parts.push(`Age ${profile.age}`);
  if (profile?.height_cm || profile?.height) parts.push(`Height ${profile.height_cm || profile.height} cm`);
  if (profile?.weight_kg || profile?.weight) parts.push(`Weight ${profile.weight_kg || profile.weight} kg`);
  const bmi = bmiFromProfile(profile);
  if (bmi) parts.push(`BMI ${bmi.toFixed(1)}`);
  const health = profileHealthText(profile);
  if (health) parts.push(`Health: ${health}`);
  return parts;
}

function combineAI(textAI, voiceAI) {
  const textConf = safeNum(textAI?.confidence, 0.5);
  const voiceConf = safeNum(voiceAI?.confidence, 0.5);
  const total = Math.max(0.01, textConf + voiceConf);

  const weightedEnergy = Math.round(
    (safeNum(textAI?.mapped_energy, 5) * textConf + safeNum(voiceAI?.mapped_energy, 5) * voiceConf) / total
  );
  const weightedStress = Math.round(
    (safeNum(textAI?.mapped_stress, 5) * textConf + safeNum(voiceAI?.mapped_stress, 5) * voiceConf) / total
  );

  const textMood = normalizeText(textAI?.mapped_mood);
  const voiceMood = normalizeText(voiceAI?.mapped_mood);

  let mappedMood = voiceConf >= textConf ? voiceMood : textMood;
  if (!mappedMood) mappedMood = textMood || voiceMood || "okay";

  if (weightedStress >= 7 && ["happy", "motivated", "energized"].includes(mappedMood)) {
    mappedMood = "stressed";
  }
  if (weightedEnergy <= 3 && ["motivated", "energized"].includes(mappedMood)) {
    mappedMood = "tired";
  }

  return {
    label: `${textAI?.label || "text"} + ${voiceAI?.label || "voice"}`,
    confidence: Math.min(0.99, total / 2),
    mapped_mood: mappedMood || "okay",
    mapped_energy: clamp(weightedEnergy, 1, 10),
    mapped_stress: clamp(weightedStress, 1, 10),
    summary:
      voiceAI?.summary ||
      `Combined result created from text sentiment and voice emotion using weighted confidence scores.`,
    transcript: voiceAI?.transcript || "",
    text_input: textAI?.text || textAI?.input || "",
    sub_analyses: {
      text: textAI,
      voice: voiceAI,
    },
  };
}

function scoreWorkout(workout, ctx) {
  const reasons = [];
  let score = 0;

  const title = normalizeText(workout?.title);
  const description = normalizeText(workout?.description);
  const category = normalizeText(workout?.category);
  const intensity = normalizeText(workout?.intensity);
  const difficulty = normalizeText(workout?.difficulty);
  const equipment = normalizeText(workout?.equipment);
  const muscleGroup = normalizeText(workout?.muscle_group);
  const movement = normalizeText(workout?.movement_pattern);
  const blob = [title, description, category, intensity, difficulty, equipment, muscleGroup, movement].join(" ");
  const duration = safeNum(workout?.duration_min, 20);

  const goal = normalizeText(ctx?.goal);
  const preferredEquipment = normalizeText(ctx?.equipment);
  const preferredDifficulty = normalizeText(ctx?.difficulty);
  const preferredMuscleGroup = normalizeText(ctx?.muscleGroup);
  const availableTime = safeNum(ctx?.availableTime, 0);
  const mood = normalizeText(ctx?.mood);
  const energy = safeNum(ctx?.energy, 5);
  const stress = safeNum(ctx?.stress, 5);
  const health = normalizeText(ctx?.health);
  const bmi = safeNum(ctx?.bmi, 0);

  if (goal === "lose_weight") {
    if (["cardio", "hiit", "fat loss"].some((k) => blob.includes(k))) {
      score += 6;
      reasons.push("matches fat-loss goal");
    }
  }

  if (goal === "build_muscle") {
    if (["strength", "hypertrophy", "upper", "lower", "push", "pull"].some((k) => blob.includes(k))) {
      score += 6;
      reasons.push("supports muscle-building goal");
    }
  }

  if (goal === "improve_stamina") {
    if (["cardio", "stamina", "endurance", "conditioning"].some((k) => blob.includes(k))) {
      score += 6;
      reasons.push("supports stamina improvement");
    }
  }

  if (goal === "reduce_stress") {
    if (["yoga", "mobility", "stretch", "recovery", "breathing"].some((k) => blob.includes(k))) {
      score += 7;
      reasons.push("good for stress reduction");
    }
  }

  if (goal === "beginner_fitness") {
    if (["beginner", "easy", "foundation", "basic"].some((k) => blob.includes(k))) {
      score += 7;
      reasons.push("beginner-friendly choice");
    }
  }

  if (preferredEquipment) {
    if (equipment === preferredEquipment || blob.includes(preferredEquipment)) {
      score += 5;
      reasons.push("matches equipment preference");
    } else if (preferredEquipment === "none" && equipment && equipment !== "none") {
      score -= 3;
    }
  }

  if (preferredDifficulty) {
    if (difficulty === preferredDifficulty) {
      score += 4;
      reasons.push("matches difficulty preference");
    }
  }

  if (preferredMuscleGroup) {
    if (muscleGroup === preferredMuscleGroup || blob.includes(preferredMuscleGroup)) {
      score += 4;
      reasons.push("targets your chosen muscle group");
    }
  }

  if (availableTime > 0) {
    const diff = Math.abs(duration - availableTime);
    if (diff <= 5) {
      score += 5;
      reasons.push("fits your available time");
    } else if (duration <= availableTime) {
      score += 3;
      reasons.push("fits inside your time window");
    } else if (duration > availableTime + 10) {
      score -= 4;
    }
  }

  if (energy <= 3) {
    if (["yoga", "stretch", "mobility", "recovery", "walk"].some((k) => blob.includes(k))) {
      score += 6;
      reasons.push("better for low energy");
    }
    if (["hiit", "max", "advanced"].some((k) => blob.includes(k))) score -= 4;
  }

  if (energy >= 7) {
    if (["strength", "cardio", "hiit", "power"].some((k) => blob.includes(k))) {
      score += 5;
      reasons.push("good for high energy");
    }
  }

  if (stress >= 7 || mood === "stressed") {
    if (["yoga", "stretch", "mobility", "recovery", "breathing"].some((k) => blob.includes(k))) {
      score += 6;
      reasons.push("supports stress relief");
    }
  }

  if (mood === "motivated" || mood === "happy" || mood === "energized") {
    if (["strength", "cardio", "hiit", "challenge"].some((k) => blob.includes(k))) {
      score += 4;
      reasons.push("matches your current mood");
    }
  }

  if (health) {
    const risky = ["back pain", "knee", "injury", "shoulder", "pregnan", "asthma", "hypertension"];
    if (risky.some((k) => health.includes(k)) && ["hiit", "plyometric", "jump"].some((k) => blob.includes(k))) {
      score -= 3;
      reasons.push("may be less ideal for your health notes");
    }
  }

  if (bmi >= 30) {
    if (["walk", "bike", "low impact", "mobility", "beginner"].some((k) => blob.includes(k))) {
      score += 2;
      reasons.push("more suitable as a lower-impact option");
    }
  }

  return { score, reasons };
}

function rerankWorkouts(workouts, ctx) {
  return toArray(workouts)
    .map((workout, index) => {
      const scored = scoreWorkout(workout, ctx);
      return {
        ...workout,
        rank_score: scored.score,
        rank_reason: scored.reasons.slice(0, 3).join(" • "),
        _originalIndex: index,
      };
    })
    .sort((a, b) => {
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
      return a._originalIndex - b._originalIndex;
    });
}

function sourceLabel(source) {
  if (source === "text") return "Text AI";
  if (source === "voice") return "Voice AI";
  if (source === "face") return "Face AI";
  if (source === "fusion") return "Text + Voice Fusion";
  return "AI";
}

function AlternativesBlock({ state, onUse }) {
  if (!state?.open) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        background: "rgba(34, 197, 94, 0.08)",
        border: "1px solid rgba(34, 197, 94, 0.18)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Alternative Exercises</div>

      {state.loading ? <div className="muted">Loading alternatives…</div> : null}
      {state.error ? <div className="muted">{state.error}</div> : null}
      {!state.loading && !state.error && !state.items?.length ? (
        <div className="muted">No alternatives found for this workout.</div>
      ) : null}

      {toArray(state.items).map((alt) => (
        <div
          key={alt.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 0",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>{alt.title}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              {alt.description || "Alternative exercise with similar training focus."}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {alt.muscle_group ? <Badge>{pretty(alt.muscle_group)}</Badge> : null}
              {alt.equipment ? <Badge>{pretty(alt.equipment)}</Badge> : null}
              {alt.difficulty ? <Badge>{pretty(alt.difficulty)}</Badge> : null}
            </div>
          </div>
          <div>
            <button className="btn btn-primary" type="button" onClick={() => onUse?.(alt)}>
              Use Instead
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkoutCard({ workout, onLog, onToggleAlternatives, altState, onUseAlternative }) {
  return (
    <div
      className="card glass"
      style={{
        padding: 14,
        borderRadius: 16,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{workout.title}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {workout.description || "Personalized workout selected for your current mood and energy level."}
          </div>
        </div>
        <Badge>{pretty(workout.difficulty || "—")}</Badge>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {workout.category ? <Badge>{pretty(workout.category)}</Badge> : null}
        {workout.intensity ? <Badge>{pretty(workout.intensity)}</Badge> : null}
        {workout.duration_min != null ? <Badge>{workout.duration_min} min</Badge> : null}
        {workout.equipment ? <Badge>{pretty(workout.equipment)}</Badge> : null}
        {workout.muscle_group ? <Badge>{pretty(workout.muscle_group)}</Badge> : null}
        {workout.movement_pattern ? <Badge>{pretty(workout.movement_pattern)}</Badge> : null}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          background: "rgba(124, 58, 237, 0.10)",
          border: "1px solid rgba(124, 58, 237, 0.22)",
        }}
      >
        <div style={{ fontWeight: 700 }}>Workout Prescription</div>
        <div style={{ marginTop: 6 }}>{PresetLine({ w: workout })}</div>
        {workout?.prescription?.note ? (
          <div className="muted" style={{ marginTop: 6 }}>
            {workout.prescription.note}
          </div>
        ) : null}
      </div>

      {workout.why || workout.rank_reason ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Why this was chosen</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {workout.why || workout.rank_reason}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="button" onClick={() => onLog?.(workout)}>
          Log this workout
        </button>
        <button className="btn" type="button" onClick={() => onToggleAlternatives?.(workout)}>
          {altState?.open ? "Hide alternatives" : "Don’t like this exercise?"}
        </button>
      </div>

      <AlternativesBlock state={altState} onUse={onUseAlternative} />
    </div>
  );
}

export default function SmartRecommendPage() {
  const [mode, setMode] = useState("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [analysis, setAnalysis] = useState(null);
  const [recommendation, setRecommendation] = useState(null);

  const [goal, setGoal] = useState("reduce_stress");
  const [availableTime, setAvailableTime] = useState(20);
  const [equipment, setEquipment] = useState("none");
  const [difficulty, setDifficulty] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");

  const [text, setText] = useState("");

  const [recording, setRecording] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceUrl, setVoiceUrl] = useState("");

  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const processorRef = useRef(null);
  const silentGainRef = useRef(null);
  const streamRef = useRef(null);
  const sampleRateRef = useRef(44100);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const rafRef = useRef(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceStreamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [imageBlob, setImageBlob] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [faceStatus, setFaceStatus] = useState("");
  const [mirror, setMirror] = useState(true);

  const [altMap, setAltMap] = useState({});

  const [logOpen, setLogOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const profileParts = useMemo(() => profileSummary(profile), [profile]);
  const profileBmi = useMemo(() => bmiFromProfile(profile), [profile]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        const me = await getMe();
        if (!mounted) return;
        setProfile(me || null);
      } catch {
        if (!mounted) return;
        setProfile(null);
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanupVoice();
      cleanupFace();
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [voiceUrl, imageUrl]);

  const recMeta = useMemo(() => normalizeRec(recommendation), [recommendation]);

  const recommendationContext = useMemo(
    () => ({
      goal,
      availableTime,
      equipment,
      difficulty,
      muscleGroup,
      mood: analysis?.mapped_mood || recMeta.mood,
      energy: analysis?.mapped_energy ?? recMeta.energy ?? 5,
      stress: analysis?.mapped_stress ?? recMeta.stress ?? 5,
      bmi: profileBmi,
      health: profileHealthText(profile),
    }),
    [goal, availableTime, equipment, difficulty, muscleGroup, analysis, recMeta, profileBmi, profile]
  );

  const workouts = useMemo(
    () => rerankWorkouts(recMeta.workouts, recommendationContext),
    [recMeta.workouts, recommendationContext]
  );

  function clearResult() {
    setError("");
    setAnalysis(null);
    setRecommendation(null);
    setAltMap({});
  }

  function noteForMoodSave(prefix, ai) {
    return `${prefix}: ${ai?.label || "unknown"} (${Math.round((safeNum(ai?.confidence, 0) || 0) * 100)}%)`;
  }

  async function saveDetectedMood(ai, prefix) {
    try {
      await createMood({
        mood: ai?.mapped_mood || "okay",
        energy: Number(ai?.mapped_energy ?? 5),
        stress: Number(ai?.mapped_stress ?? 5),
        note: noteForMoodSave(prefix, ai),
      });
    } catch {
      // keep recommendation flow working even if saving mood fails
    }
  }

  function buildStatePayload(ai) {
    return {
      mood: ai?.mapped_mood || "okay",
      energy: Number(ai?.mapped_energy ?? 5),
      stress: Number(ai?.mapped_stress ?? 5),
      limit: 12,
    };
  }

  async function runStateRecommendation(ai, source) {
    const rec = await getWorkoutsByState(buildStatePayload(ai));
    setAnalysis({
      ...ai,
      source,
      goal,
      available_time: availableTime,
      equipment_preference: equipment,
      difficulty_preference: difficulty,
      muscle_group_preference: muscleGroup,
    });
    setRecommendation(rec);
  }

  async function runTextRecommendation() {
    const value = text.trim();
    if (!value) {
      setError("Please type how you feel first.");
      return;
    }

    setBusy(true);
    clearResult();

    try {
      const ai = await analyzeTextMood(value);
      await saveDetectedMood(ai, "Text AI");
      await runStateRecommendation({ ...ai, text: value }, "text");
    } catch (e) {
      setError(e?.message || "Text analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function cleanupVoice() {
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      silentGainRef.current?.disconnect();
    } catch {}

    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}

    streamRef.current = null;
    processorRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    silentGainRef.current = null;

    try {
      audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;

    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setVoiceLevel(0);
  }

  function resetVoicePreview() {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceBlob(null);
    setVoiceUrl("");
    setVoiceSeconds(0);
    setVoiceStatus("");
    chunksRef.current = [];
  }

  function startLevelMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);

    const loop = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setVoiceLevel(Math.min(1, rms * 3));
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }

  async function startRecording() {
    setVoiceStatus("");
    setError("");
    clearResult();
    resetVoicePreview();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate || 44100;
      await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      source.connect(analyser);
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      setRecording(true);
      setVoiceStatus("Recording… speak clearly for 3–8 seconds.");
      tickRef.current = setInterval(() => setVoiceSeconds((s) => s + 1), 1000);
      startLevelMeter();
    } catch (e) {
      cleanupVoice();
      setRecording(false);
      setVoiceStatus(e?.message || "Microphone access denied.");
    }
  }

  async function stopRecording() {
    setRecording(false);
    setVoiceStatus("Preparing audio preview…");

    try {
      cleanupVoice();

      const buffers = chunksRef.current || [];
      if (!buffers.length) {
        setVoiceStatus("No audio captured. Please record again.");
        return;
      }

      const length = buffers.reduce((sum, b) => sum + b.length, 0);
      const merged = new Float32Array(length);
      let offset = 0;
      for (const b of buffers) {
        merged.set(b, offset);
        offset += b.length;
      }

      const recordedRate = sampleRateRef.current || 44100;
      const down = downsampleBuffer(merged, recordedRate, 16000);
      const wavBlob = encodeWav(down, 16000, 1);

      setVoiceBlob(wavBlob);
      const url = URL.createObjectURL(wavBlob);
      setVoiceUrl(url);
      setVoiceStatus("Preview ready. Click Detect & Get Workouts or run Fusion.");
    } catch (e) {
      setVoiceStatus(e?.message || "Audio preparation failed.");
    }
  }

  async function runVoiceRecommendation() {
    if (!voiceBlob) {
      setError("Please record your voice first.");
      return;
    }

    setBusy(true);
    clearResult();

    try {
      const ai = await analyzeVoiceInsights(voiceBlob);
      await saveDetectedMood(ai, "Voice AI");
      await runStateRecommendation(ai, "voice");
      setVoiceStatus("Voice detected and workout list generated.");
    } catch (e) {
      setError(e?.message || "Voice analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function cleanupFace() {
    try {
      faceStreamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    faceStreamRef.current = null;
    setCameraOn(false);
  }

  function resetPhoto() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(null);
    setImageUrl("");
  }

  async function startCamera() {
    setFaceStatus("");
    setError("");
    clearResult();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      faceStreamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      setCameraOn(true);
      setFaceStatus("Camera started. Position your face and capture a photo.");
    } catch (e) {
      setFaceStatus(e?.message || "Camera permission denied.");
      setCameraOn(false);
    }
  }

  function stopCamera() {
    cleanupFace();
    setFaceStatus("Camera stopped.");
  }

  async function capturePhoto() {
    if (!cameraOn || !videoRef.current || !canvasRef.current) {
      setFaceStatus("Start the camera first.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      setFaceStatus("Camera is not ready yet. Wait a moment and try again.");
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.save();
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setFaceStatus("Failed to capture photo.");
      return;
    }

    resetPhoto();
    setImageBlob(blob);
    setImageUrl(URL.createObjectURL(blob));
    setFaceStatus("Photo captured. Click Detect & Get Workouts.");
  }

  async function runFaceRecommendation() {
    if (!imageBlob) {
      setError("Please capture a photo first.");
      return;
    }

    setBusy(true);
    clearResult();

    try {
      const ai = await analyzeFaceMood(imageBlob);
      await saveDetectedMood(ai, "Face AI");
      await runStateRecommendation(ai, "face");
      setFaceStatus("Face detected and workout list generated.");
    } catch (e) {
      setError(e?.message || "Face analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runFusionRecommendation() {
    const value = text.trim();
    if (!value) {
      setError("Type how you feel so Fusion can combine text and voice.");
      return;
    }
    if (!voiceBlob) {
      setError("Record your voice first so Fusion can combine text and voice.");
      return;
    }

    setBusy(true);
    clearResult();

    try {
      const [textAI, voiceAI] = await Promise.all([
        analyzeTextMood(value),
        analyzeVoiceInsights(voiceBlob),
      ]);

      let fused;
      try {
        fused = await analyzeFusion({
          text: value,
          text_result: textAI,
          voice_result: voiceAI,
          profile: profile || null,
          goal,
          available_time: availableTime,
          equipment,
          difficulty,
          muscle_group: muscleGroup,
        });
      } catch {
        fused = combineAI({ ...textAI, text: value }, voiceAI);
      }

      const finalAI = {
        ...combineAI({ ...textAI, text: value }, voiceAI),
        ...fused,
        source: "fusion",
        sub_analyses: {
          text: textAI,
          voice: voiceAI,
        },
      };

      await saveDetectedMood(finalAI, "Fusion AI");
      await runStateRecommendation(finalAI, "fusion");
      setVoiceStatus("Fusion completed using both text and voice.");
    } catch (e) {
      setError(e?.message || "Fusion recommendation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAlternatives(workout) {
    if (!workout?.id) return;

    const current = altMap[workout.id];
    if (current?.open) {
      setAltMap((prev) => ({
        ...prev,
        [workout.id]: { ...prev[workout.id], open: false },
      }));
      return;
    }

    if (current?.items?.length) {
      setAltMap((prev) => ({
        ...prev,
        [workout.id]: { ...prev[workout.id], open: true },
      }));
      return;
    }

    setAltMap((prev) => ({
      ...prev,
      [workout.id]: { open: true, loading: true, error: "", items: [] },
    }));

    try {
      const data = await getWorkoutAlternatives(workout.id, 5);
      setAltMap((prev) => ({
        ...prev,
        [workout.id]: {
          open: true,
          loading: false,
          error: "",
          items: normalizeAlternatives(data),
        },
      }));
    } catch (e) {
      setAltMap((prev) => ({
        ...prev,
        [workout.id]: {
          open: true,
          loading: false,
          error: e?.message || "Failed to load alternatives.",
          items: [],
        },
      }));
    }
  }

  function replaceWorkout(originalId, alternative) {
    setRecommendation((prev) => {
      const normalized = normalizeRec(prev);
      const updatedWorkouts = normalized.workouts.map((w) =>
        w.id === originalId
          ? {
              ...alternative,
              why: `Replaced with an alternative targeting the same focus area.`,
            }
          : w
      );
      return {
        ...normalized,
        workouts: updatedWorkouts,
      };
    });

    setAltMap((prev) => ({
      ...prev,
      [originalId]: { ...(prev[originalId] || {}), open: false },
    }));
  }

  function openLog(workout) {
    setSelectedWorkout(workout);
    setLogOpen(true);
  }

  return (
    <div className="page-stack">
      <div className="row-between">
        <div>
          <h1>Smart Recommend</h1>
          <p className="muted" style={{ maxWidth: 860 }}>
            Analyze <b>text</b>, <b>voice</b>, <b>face</b>, or combine <b>text + voice</b> in one flow.
            Recommendations are re-ranked using your goal, available time, equipment choice, difficulty,
            muscle group, and saved profile details.
          </p>
        </div>
        <Badge tone="accent">Proposal-aligned AI Flow</Badge>
      </div>

      {error ? (
        <div
          className="card glass"
          style={{
            padding: 14,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <strong>Error</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <SectionCard
        title="Recommendation context"
        right={<span className="badge">{profileLoading ? "Loading profile…" : profile ? "Profile connected" : "Profile optional"}</span>}
      >
        <div className="page-grid-2" style={{ alignItems: "start" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Use saved profile</div>
            {profileLoading ? <div className="muted">Loading your profile…</div> : null}
            {!profileLoading && !profile ? (
              <div className="muted">
                No profile was loaded. The page still works, but profile-aware ranking will be weaker.
              </div>
            ) : null}
            {!profileLoading && profile ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {profileParts.length ? profileParts.map((part) => <Badge key={part}>{part}</Badge>) : <Badge>Basic profile only</Badge>}
              </div>
            ) : null}
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Session preferences</div>
            <div className="page-grid-2">
              <label className="field">
                <span>Goal</span>
                <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                  <option value="lose_weight">Lose weight</option>
                  <option value="build_muscle">Build muscle</option>
                  <option value="improve_stamina">Improve stamina</option>
                  <option value="reduce_stress">Reduce stress</option>
                  <option value="beginner_fitness">Beginner fitness</option>
                </select>
              </label>

              <label className="field">
                <span>Available time (minutes)</span>
                <select value={availableTime} onChange={(e) => setAvailableTime(Number(e.target.value))}>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                  <option value={60}>60</option>
                </select>
              </label>

              <label className="field">
                <span>Equipment</span>
                <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                  <option value="none">None / Home workout</option>
                  <option value="dumbbell">Dumbbell</option>
                  <option value="barbell">Barbell</option>
                  <option value="machine">Machine</option>
                  <option value="band">Resistance band</option>
                  <option value="kettlebell">Kettlebell</option>
                  <option value="mixed">Any / Mixed</option>
                </select>
              </label>

              <label className="field">
                <span>Difficulty</span>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="">Any</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Muscle group focus</span>
                <select value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
                  <option value="">Any</option>
                  <option value="fullbody">Full body</option>
                  <option value="chest">Chest</option>
                  <option value="back">Back</option>
                  <option value="legs">Legs</option>
                  <option value="core">Core</option>
                  <option value="shoulders">Shoulders</option>
                  <option value="arms">Arms</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Select mood detection mode" right={<span className="badge">{busy ? "Working…" : "Ready"}</span>}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <ModeButton active={mode === "text"} onClick={() => setMode("text")} disabled={busy}>
            ✍️ Text
          </ModeButton>
          <ModeButton active={mode === "voice"} onClick={() => setMode("voice")} disabled={busy}>
            🎙️ Voice
          </ModeButton>
          <ModeButton active={mode === "fusion"} onClick={() => setMode("fusion")} disabled={busy}>
            ⚡ Fusion
          </ModeButton>
          <ModeButton active={mode === "face"} onClick={() => setMode("face")} disabled={busy}>
            📷 Face
          </ModeButton>
        </div>

        {mode === "text" ? (
          <div>
            <label className="field">
              <span>Describe how you feel</span>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Example: I feel tired but I still want a short upper-body workout with dumbbells today."
              />
            </label>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="button" onClick={runTextRecommendation} disabled={busy}>
                {busy ? "Detecting…" : "Detect Mood & Get Workouts"}
              </button>
              <button className="btn" type="button" onClick={() => setText("")} disabled={busy}>
                Clear text
              </button>
            </div>
          </div>
        ) : null}

        {mode === "voice" || mode === "fusion" ? (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Record your voice, preview it, then generate workouts from the detected state.
              {mode === "fusion" ? " Fusion also combines your typed text with the voice result." : ""}
            </p>

            {mode === "fusion" ? (
              <label className="field" style={{ marginBottom: 14 }}>
                <span>Text input for Fusion</span>
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Example: I am stressed from work, low on energy, and I only have 20 minutes."
                />
              </label>
            ) : null}

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                Mic Level {recording ? `(live • ${fmtSec(voiceSeconds)})` : ""}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.10)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(4, Math.round(voiceLevel * 100))}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #8b5cf6, #22c55e)",
                    transition: "width 80ms linear",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!recording ? (
                <button className="btn btn-primary" type="button" onClick={startRecording} disabled={busy}>
                  Start Recording
                </button>
              ) : (
                <button className="btn btn-secondary" type="button" onClick={stopRecording} disabled={busy}>
                  Stop Recording
                </button>
              )}

              <button className="btn" type="button" onClick={resetVoicePreview} disabled={busy}>
                Reset
              </button>

              {mode === "voice" ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={runVoiceRecommendation}
                  disabled={busy || !voiceBlob}
                >
                  {busy ? "Detecting…" : "Detect Mood & Get Workouts"}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={runFusionRecommendation}
                  disabled={busy || !voiceBlob || !text.trim()}
                >
                  {busy ? "Running Fusion…" : "Run Text + Voice Fusion"}
                </button>
              )}
            </div>

            {voiceStatus ? <p style={{ marginTop: 12 }}>{voiceStatus}</p> : null}

            {voiceUrl ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>
                <audio controls src={voiceUrl} style={{ width: "100%" }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "face" ? (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              Start the camera, capture your photo, then generate workouts from the detected face emotion.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {!cameraOn ? (
                <button className="btn btn-primary" type="button" onClick={startCamera} disabled={busy}>
                  Start Camera
                </button>
              ) : (
                <button className="btn" type="button" onClick={stopCamera} disabled={busy}>
                  Stop Camera
                </button>
              )}

              <button className="btn" type="button" onClick={() => setMirror((m) => !m)} disabled={busy}>
                {mirror ? "Mirror ON" : "Mirror OFF"}
              </button>

              <button className="btn btn-secondary" type="button" onClick={capturePhoto} disabled={!cameraOn || busy}>
                Capture Photo
              </button>

              <button
                className="btn"
                type="button"
                onClick={resetPhoto}
                disabled={busy || !imageBlob}
              >
                Reset Photo
              </button>

              <button
                className="btn btn-primary"
                type="button"
                onClick={runFaceRecommendation}
                disabled={busy || !imageBlob}
              >
                {busy ? "Detecting…" : "Detect Mood & Get Workouts"}
              </button>
            </div>

            {faceStatus ? <p>{faceStatus}</p> : null}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
              <div style={{ width: 360, maxWidth: "100%" }}>
                <div className="badge" style={{ marginBottom: 8 }}>Live Camera</div>
                <div style={{ borderRadius: 12, overflow: "hidden", background: "#000" }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      display: "block",
                      transform: mirror ? "scaleX(-1)" : "none",
                    }}
                  />
                </div>
              </div>

              <div style={{ width: 360, maxWidth: "100%" }}>
                <div className="badge" style={{ marginBottom: 8 }}>Captured Photo</div>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Captured"
                    style={{ width: "100%", borderRadius: 12, display: "block", background: "#111" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 240,
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px dashed rgba(255,255,255,0.12)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <span className="muted">No photo captured yet</span>
                  </div>
                )}
              </div>
            </div>

            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Unified recommendation result"
        right={<span className="badge">{workouts.length ? `${workouts.length} workouts` : "No result yet"}</span>}
      >
        {!analysis && !workouts.length ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Run Text, Voice, Face, or Fusion detection to generate your workout list.
          </p>
        ) : null}

        {analysis ? (
          <div
            style={{
              padding: 14,
              borderRadius: 14,
              background: "rgba(124,58,237,0.10)",
              border: "1px solid rgba(124,58,237,0.22)",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Badge>{sourceLabel(analysis?.source)}</Badge>
              <Badge>Detected: {analysis?.label || analysis?.mapped_mood || "—"}</Badge>
              <Badge>Confidence: {fmtPct(analysis?.confidence)}</Badge>
              <Badge>Mapped Mood: {pretty(analysis?.mapped_mood || recMeta.mood || "—")}</Badge>
              <Badge>Energy: {analysis?.mapped_energy ?? recMeta.energy ?? "—"}</Badge>
              <Badge>Stress: {analysis?.mapped_stress ?? recMeta.stress ?? "—"}</Badge>
              <Badge>Goal: {pretty(goal)}</Badge>
              <Badge>Time: {availableTime} min</Badge>
              <Badge>Equipment: {pretty(equipment)}</Badge>
            </div>

            {analysis?.text_input ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700 }}>Text input</div>
                <div className="muted" style={{ marginTop: 6 }}>{analysis.text_input}</div>
              </div>
            ) : null}

            {analysis?.transcript ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Transcript</div>
                <div className="muted" style={{ marginTop: 6 }}>{analysis.transcript}</div>
              </div>
            ) : null}

            {analysis?.summary ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>AI Summary</div>
                <div className="muted" style={{ marginTop: 6 }}>{analysis.summary}</div>
              </div>
            ) : null}

            {analysis?.sub_analyses ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Fusion breakdown</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Text mood: {pretty(analysis.sub_analyses?.text?.mapped_mood)} • Voice mood: {pretty(analysis.sub_analyses?.voice?.mapped_mood)}
                </div>
              </div>
            ) : null}

            {recMeta.reason ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Recommendation reason</div>
                <div className="muted" style={{ marginTop: 6 }}>{recMeta.reason}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {workouts.length ? (
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {workouts.map((w) => (
              <WorkoutCard
                key={`${w.id}-${w.title}`}
                workout={w}
                onLog={openLog}
                altState={altMap[w.id]}
                onToggleAlternatives={toggleAlternatives}
                onUseAlternative={(alt) => replaceWorkout(w.id, alt)}
              />
            ))}
          </div>
        ) : null}
      </SectionCard>

      <LogWorkoutModal
        open={logOpen}
        workout={selectedWorkout}
        onClose={() => {
          setLogOpen(false);
          setSelectedWorkout(null);
        }}
        onLogged={() => {
          setLogOpen(false);
          setSelectedWorkout(null);
        }}
      />
    </div>
  );
}
