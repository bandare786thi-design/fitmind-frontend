import { useEffect, useRef, useState } from "react";
import { analyzeVoiceInsights, getMoods, getWorkoutsByState } from "../api";
import { downsampleBuffer, encodeWav } from "../utils/wav";

function fmt(sec) {
  const value = Number.isFinite(sec) ? sec : 0;
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pct(x) {
  const v = typeof x === "number" ? x : 0;
  return `${(v * 100).toFixed(1)}%`;
}

function pretty(v) {
  return String(v || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeRecommendations(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.workouts)) return data.workouts;
  return [];
}

function WorkoutCard({ w }) {
  return (
    <div
      className="card glass"
      style={{
        padding: 12,
        borderRadius: 14,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>{w.title}</div>
        <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
          {pretty(w.difficulty)}
        </span>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {w.category ? <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>{pretty(w.category)}</span> : null}
        {w.duration_min != null ? <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>{w.duration_min} min</span> : null}
        {w.equipment ? <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>{pretty(w.equipment)}</span> : null}
        {w.muscle_group ? <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>{pretty(w.muscle_group)}</span> : null}
      </div>

      {w.description ? <div className="muted small" style={{ marginTop: 10 }}>{w.description}</div> : null}
    </div>
  );
}

export default function VoiceMoodCapture({ onSaved }) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [seconds, setSeconds] = useState(0);

  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [level, setLevel] = useState(0);

  const [recoStatus, setRecoStatus] = useState("");
  const [recommendations, setRecommendations] = useState([]);

  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const silentGainRef = useRef(null);
  const sampleRateRef = useRef(44100);

  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const levelRafRef = useRef(null);

  useEffect(() => {
    return () => {
      try {
        stopAll();
      } catch {}
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAll() {
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

    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }

    setLevel(0);
  }

  function startLevelMeter() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 3));
      levelRafRef.current = requestAnimationFrame(tick);
    };

    levelRafRef.current = requestAnimationFrame(tick);
  }

  async function startRecording() {
    setStatus("");
    setResult(null);
    setRecoStatus("");
    setRecommendations([]);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewBlob(null);

    setSeconds(0);
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
      setStatus("Recording… Speak clearly for 3–8 seconds.");
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startLevelMeter();
    } catch (e) {
      setStatus(e?.message || "Microphone permission denied. Please allow microphone access.");
      setRecording(false);
      stopAll();
    }
  }

  async function stopRecording() {
    setRecording(false);
    setStatus("Preparing preview…");

    try {
      stopAll();

      const buffers = chunksRef.current || [];
      if (!buffers.length) {
        setStatus("No audio captured. Try again.");
        return;
      }

      const length = buffers.reduce((sum, b) => sum + b.length, 0);
      const merged = new Float32Array(length);
      let offset = 0;
      for (const b of buffers) {
        merged.set(b, offset);
        offset += b.length;
      }

      const realRate = sampleRateRef.current || 44100;
      const down = downsampleBuffer(merged, realRate, 16000);
      const wavBlob = encodeWav(down, 16000, 1);

      setPreviewBlob(wavBlob);
      const url = URL.createObjectURL(wavBlob);
      setPreviewUrl(url);
      setStatus("Preview ready. Play it to confirm, then click Analyze & Save.");
    } catch (e) {
      setStatus(e?.message || "Failed to process audio. Try again.");
    }
  }

  async function analyzeAndSave() {
    if (!previewBlob) {
      setStatus("No preview available. Record first.");
      return;
    }

    setStatus("Uploading audio for Voice Insights…");
    setResult(null);
    setRecoStatus("");
    setRecommendations([]);

    try {
      const data = await analyzeVoiceInsights(previewBlob);
      setResult(data);
      setStatus("Voice emotion detected successfully.");

      onSaved?.(data);

      const moods = await getMoods({ limit: 1 });
      const latest = Array.isArray(moods) ? moods[0] : null;
      const mood = data?.mapped_mood || latest?.mood || "okay";
      const energy = Number(data?.mapped_energy ?? latest?.energy ?? 5);
      const stress = Number(data?.mapped_stress ?? latest?.stress ?? 5);

      setRecoStatus("Generating workout recommendations…");
      const rec = await getWorkoutsByState({ mood, energy, stress, limit: 6 });
      const list = normalizeRecommendations(rec);
      setRecommendations(list);
      setRecoStatus(list.length ? "Recommended workouts ready." : "No workouts matched this mood state.");
    } catch (e) {
      setStatus(e?.message || "Voice analysis failed.");
    }
  }

  return (
    <div className="page-stack">
      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>Voice Mood Capture</h2>
          <span className="badge">Live Mic</span>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Record a short voice sample, analyze your current emotion, and get workout suggestions.
        </p>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
            Mic Level {recording ? `(live • ${fmt(seconds)})` : ""}
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
                width: `${Math.max(4, Math.round(level * 100))}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #8b5cf6, #22c55e)",
                transition: "width 80ms linear",
              }}
            />
          </div>
        </div>

        <div className="btn-row">
          {!recording ? (
            <button className="btn btn-primary" onClick={startRecording}>
              Start Recording
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={stopRecording}>
              Stop Recording
            </button>
          )}

          <button
            className="btn"
            onClick={() => {
              if (previewUrl) URL.revokeObjectURL(previewUrl);
              setPreviewBlob(null);
              setPreviewUrl("");
              setStatus("");
              setResult(null);
              setRecoStatus("");
              setRecommendations([]);
            }}
          >
            Reset
          </button>

          <button className="btn btn-primary" onClick={analyzeAndSave} disabled={!previewBlob}>
            Analyze & Save
          </button>
        </div>

        {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}

        {previewUrl ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview</div>
            <audio controls src={previewUrl} style={{ width: "100%" }} />
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="card glass" style={{ padding: 16 }}>
          <div className="card-header">
            <h2>Voice Analysis Result</h2>
            <span className="badge">Confidence {pct(result?.confidence)}</span>
          </div>

          <div className="tag-row">
            <span className="tag">Detected: {pretty(result?.label || result?.mapped_mood)}</span>
            <span className="tag">Mood: {pretty(result?.mapped_mood)}</span>
            <span className="tag">Energy: {result?.mapped_energy ?? "—"}</span>
            <span className="tag">Stress: {result?.mapped_stress ?? "—"}</span>
          </div>

          {result?.transcript ? (
            <div className="mini-panel">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Transcript</div>
              <div className="muted">{result.transcript}</div>
            </div>
          ) : null}

          {result?.summary ? (
            <div className="mini-panel">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>AI Summary</div>
              <div className="muted">{result.summary}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header">
          <h2>Recommended Workouts</h2>
          <span className="badge">{recommendations.length} items</span>
        </div>

        {recoStatus ? <p className="muted">{recoStatus}</p> : null}

        {!recommendations.length ? (
          <div className="empty-state">
            <p>No recommendations yet</p>
            <span>Analyze your voice to generate mood-based workout suggestions.</span>
          </div>
        ) : (
          <div className="catalog-grid">
            {recommendations.map((w) => (
              <WorkoutCard key={w.id} w={w} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
