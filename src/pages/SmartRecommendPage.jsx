import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFaceMood,
  analyzeTextMood,
  analyzeVoiceInsights,
  createMood,
  getWorkoutsByState,
} from "../api";
import { downsampleBuffer, encodeWav } from "../utils/wav";
import LogWorkoutModal from "../components/LogWorkoutModal";

function fmtPct(x) {
  return typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "—";
}

function fmtSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Badge({ children, tone = "" }) {
  return (
    <span
      className={`badge ${tone}`}
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {children}
    </span>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      className={`btn ${active ? "btn-primary" : ""}`}
      onClick={onClick}
      type="button"
      style={{ minWidth: 120 }}
    >
      {children}
    </button>
  );
}

function PresetLine({ w }) {
  const sets = w?.prescription?.sets ?? 3;
  const reps = w?.prescription?.reps ?? "10-12";
  const rest = w?.prescription?.rest_seconds ?? 60;
  return `${sets} sets × ${reps} reps • Rest ${rest}s`;
}

function WorkoutCard({ workout, onLog }) {
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
        <Badge>{workout.difficulty || "—"}</Badge>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {workout.category ? <Badge>{workout.category}</Badge> : null}
        {workout.intensity ? <Badge>{workout.intensity}</Badge> : null}
        {workout.duration_min != null ? <Badge>{workout.duration_min} min</Badge> : null}
        {workout.equipment ? <Badge>{workout.equipment}</Badge> : null}
        {workout.muscle_group ? <Badge>{workout.muscle_group}</Badge> : null}
        {workout.movement_pattern ? <Badge>{workout.movement_pattern}</Badge> : null}
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

      {workout.why ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>Why this was chosen</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {workout.why}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={() => onLog?.(workout)}>
          Log this workout
        </button>
      </div>
    </div>
  );
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

export default function SmartRecommendPage() {
  const [mode, setMode] = useState("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [analysis, setAnalysis] = useState(null);
  const [recommendation, setRecommendation] = useState(null);

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

  const [logOpen, setLogOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const workouts = useMemo(() => normalizeRec(recommendation).workouts, [recommendation]);
  const recMeta = useMemo(() => normalizeRec(recommendation), [recommendation]);

  useEffect(() => {
    return () => {
      cleanupVoice();
      cleanupFace();
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [voiceUrl, imageUrl]);

  function clearResult() {
    setError("");
    setAnalysis(null);
    setRecommendation(null);
  }

  async function runStateRecommendation(ai, source) {
    const rec = await getWorkoutsByState({
      mood: ai?.mapped_mood || "okay",
      energy: Number(ai?.mapped_energy ?? 5),
      stress: Number(ai?.mapped_stress ?? 5),
      limit: 12,
    });

    setAnalysis({ ...ai, source });
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

      try {
        await createMood({
          mood: ai?.mapped_mood || "okay",
          energy: Number(ai?.mapped_energy ?? 5),
          stress: Number(ai?.mapped_stress ?? 5),
          note: `Text AI: ${ai?.label || "unknown"} (${Math.round((ai?.confidence || 0) * 100)}%)`,
        });
      } catch {}

      await runStateRecommendation(ai, "text");
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

  function startLevelMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);

    const loop = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
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

    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceBlob(null);
    setVoiceUrl("");
    setVoiceSeconds(0);
    chunksRef.current = [];

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

      const down = downsampleBuffer(merged, 44100, 16000);
      const wavBlob = encodeWav(down, 16000, 1);

      setVoiceBlob(wavBlob);
      const url = URL.createObjectURL(wavBlob);
      setVoiceUrl(url);
      setVoiceStatus("Preview ready. Click Detect & Recommend.");
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

      try {
        await createMood({
          mood: ai?.mapped_mood || "okay",
          energy: Number(ai?.mapped_energy ?? 5),
          stress: Number(ai?.mapped_stress ?? 5),
          note: `Voice AI: ${ai?.label || "unknown"} (${Math.round((ai?.confidence || 0) * 100)}%)`,
        });
      } catch {}

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

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(blob);
    setImageUrl(URL.createObjectURL(blob));
    setFaceStatus("Photo captured. Click Detect & Recommend.");
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

      try {
        await createMood({
          mood: ai?.mapped_mood || "okay",
          energy: Number(ai?.mapped_energy ?? 5),
          stress: Number(ai?.mapped_stress ?? 5),
          note: `Face AI: ${ai?.label || "unknown"} (${Math.round((ai?.confidence || 0) * 100)}%)`,
        });
      } catch {}

      await runStateRecommendation(ai, "face");
      setFaceStatus("Face detected and workout list generated.");
    } catch (e) {
      setError(e?.message || "Face analysis failed.");
    } finally {
      setBusy(false);
    }
  }

  function openLog(workout) {
    setSelectedWorkout(workout);
    setLogOpen(true);
  }

  const sourceLabel =
    analysis?.source === "text"
      ? "Text AI"
      : analysis?.source === "voice"
      ? "Voice AI"
      : analysis?.source === "face"
      ? "Face AI"
      : "AI";

  return (
    <div className="page-stack">
      <div className="row-between">
        <div>
          <h1>Smart Recommend</h1>
          <p className="muted">
            Choose <b>text</b>, <b>voice</b>, or <b>face</b> mood detection and get one workout plan
            list with personalized prescriptions.
          </p>
        </div>
        <Badge tone="accent">Unified AI Flow</Badge>
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

      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>Select Mood Detection Mode</h2>
          <span className="badge">{busy ? "Working…" : "Ready"}</span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <ModeButton active={mode === "text"} onClick={() => setMode("text")}>
            ✍️ Text
          </ModeButton>
          <ModeButton active={mode === "voice"} onClick={() => setMode("voice")}>
            🎙️ Voice
          </ModeButton>
          <ModeButton active={mode === "face"} onClick={() => setMode("face")}>
            📷 Face
          </ModeButton>
        </div>

        {mode === "text" ? (
          <div style={{ marginTop: 16 }}>
            <label className="field">
              <span>Describe how you feel</span>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Example: I feel tired but I still want a strong upper-body session today."
              />
            </label>

            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={runTextRecommendation} disabled={busy}>
                {busy ? "Detecting…" : "Detect Mood & Get Workouts"}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "voice" ? (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              Record your voice, preview it, then generate workouts from your detected state.
            </p>

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
                <button className="btn btn-primary" onClick={startRecording} disabled={busy}>
                  Start Recording
                </button>
              ) : (
                <button className="btn btn-secondary" onClick={stopRecording} disabled={busy}>
                  Stop Recording
                </button>
              )}

              <button
                className="btn"
                onClick={() => {
                  if (voiceUrl) URL.revokeObjectURL(voiceUrl);
                  setVoiceBlob(null);
                  setVoiceUrl("");
                  setVoiceStatus("");
                }}
                disabled={busy}
              >
                Reset
              </button>

              <button
                className="btn btn-primary"
                onClick={runVoiceRecommendation}
                disabled={busy || !voiceBlob}
              >
                {busy ? "Detecting…" : "Detect Mood & Get Workouts"}
              </button>
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
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              Start the camera, capture your photo, then generate workouts from the detected face emotion.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {!cameraOn ? (
                <button className="btn btn-primary" onClick={startCamera} disabled={busy}>
                  Start Camera
                </button>
              ) : (
                <button className="btn" onClick={stopCamera} disabled={busy}>
                  Stop Camera
                </button>
              )}

              <button className="btn" onClick={() => setMirror((m) => !m)} disabled={busy}>
                {mirror ? "Mirror ON" : "Mirror OFF"}
              </button>

              <button className="btn btn-secondary" onClick={capturePhoto} disabled={!cameraOn || busy}>
                Capture Photo
              </button>

              <button
                className="btn btn-primary"
                onClick={runFaceRecommendation}
                disabled={busy || !imageBlob}
              >
                {busy ? "Detecting…" : "Detect Mood & Get Workouts"}
              </button>
            </div>

            {faceStatus ? <p>{faceStatus}</p> : null}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
              <div style={{ width: 360 }}>
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

              <div style={{ width: 360 }}>
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
      </div>

      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>Unified Recommendation Result</h2>
          <span className="badge">{workouts.length ? `${workouts.length} workouts` : "No result yet"}</span>
        </div>

        {!analysis && !workouts.length ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Run Text, Voice, or Face detection to generate your workout list.
          </p>
        ) : null}

        {analysis ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 14,
              background: "rgba(124,58,237,0.10)",
              border: "1px solid rgba(124,58,237,0.22)",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Badge>{sourceLabel}</Badge>
              <Badge>Detected: {analysis?.label || analysis?.mapped_mood || "—"}</Badge>
              <Badge>Confidence: {fmtPct(analysis?.confidence)}</Badge>
              <Badge>Mapped Mood: {analysis?.mapped_mood || recMeta.mood || "—"}</Badge>
              <Badge>Energy: {analysis?.mapped_energy ?? recMeta.energy ?? "—"}</Badge>
              <Badge>Stress: {analysis?.mapped_stress ?? recMeta.stress ?? "—"}</Badge>
            </div>

            {analysis?.transcript ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700 }}>Transcript</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {analysis.transcript}
                </div>
              </div>
            ) : null}

            {analysis?.summary ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>AI Summary</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {analysis.summary}
                </div>
              </div>
            ) : null}

            {recMeta.reason ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Reason</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {recMeta.reason}
                </div>
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
              <WorkoutCard key={w.id} workout={w} onLog={openLog} />
            ))}
          </div>
        ) : null}
      </div>

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