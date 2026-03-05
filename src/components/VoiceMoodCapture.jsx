// frontend/src/components/VoiceMoodCapture.jsx
import { useEffect, useRef, useState } from "react";
import { analyzeVoiceInsights, getMoods, getWorkoutsByState } from "../api";
import { downsampleBuffer, encodeWav } from "../utils/wav";

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pct(x) {
  const v = typeof x === "number" ? x : 0;
  return `${(v * 100).toFixed(1)}%`;
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
          {w.difficulty || "—"}
        </span>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {w.type ? (
          <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
            {w.type}
          </span>
        ) : null}
        {w.duration != null ? (
          <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
            {w.duration} min
          </span>
        ) : null}
        {w.equipment ? (
          <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
            {w.equipment}
          </span>
        ) : null}
      </div>
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

  const [level, setLevel] = useState(0); // 0..1 mic level

  // ✅ NEW: recommendations state
  const [recoStatus, setRecoStatus] = useState("");
  const [recommendations, setRecommendations] = useState([]);

  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const silentGainRef = useRef(null);

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
      for (let i = 0; i < data.length; i++) {
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

    // ✅ NEW: reset recommendations
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
      setStatus("Recording… Speak clearly for 3–8 seconds (normal voice).");

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

      const realRate = 44100; // ok for your downsample util
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

    // ✅ NEW: reset recommendations before new run
    setRecoStatus("");
    setRecommendations([]);

    try {
      const ai = await analyzeVoiceInsights(previewBlob);
      setResult(ai);
      setStatus("Saved as a mood check-in.");

      // ✅ NEW: fetch workout recommendations using mapped state
      try {
        setRecoStatus("Getting recommended workouts…");
        const rec = await getWorkoutsByState({
          mood: ai.mapped_mood,
          energy: ai.mapped_energy,
          stress: ai.mapped_stress,
          limit: 8,
        });
        setRecommendations(rec?.workouts || []);
        setRecoStatus("");
      } catch (e) {
        setRecoStatus(e?.message || "Failed to load recommendations.");
      }

      if (onSaved) {
        const moods = await getMoods();
        onSaved(moods, ai);
      }
    } catch (e) {
      setStatus(e?.message || "Voice analysis failed.");
    }
  }

  function reset() {
    setStatus("");
    setResult(null);

    // ✅ NEW
    setRecoStatus("");
    setRecommendations([]);

    setSeconds(0);
    setLevel(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewBlob(null);
  }

  return (
    <div className="card glass" style={{ padding: 16, marginTop: 12 }}>
      <div className="card-header">
        <h2>🎙️ Voice Mood (AI)</h2>
        <span className="badge">{recording ? `REC • ${fmt(seconds)}` : "Microphone"}</span>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        This records from your <b>microphone</b>. You can <b>see the mic level</b> while recording and{" "}
        <b>play the preview</b> after stopping to confirm it captured your voice.
      </p>

      {/* Live mic level meter */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
          Mic Level {recording ? "(live)" : ""}
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(level * 100)}%`,
              background: "rgba(34,197,94,0.85)",
              transition: "width 80ms linear",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        {!recording ? (
          <button className="btn btn-primary" onClick={startRecording}>
            Start Recording
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={stopRecording}>
            Stop & Preview
          </button>
        )}

        <button className="btn" onClick={reset} disabled={recording}>
          Reset
        </button>

        <button className="btn btn-primary" onClick={analyzeAndSave} disabled={recording || !previewBlob}>
          Analyze & Save
        </button>
      </div>

      {previewUrl ? (
        <div className="mini-panel" style={{ marginTop: 12 }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2>Preview</h2>
            <span className="badge">Play to confirm</span>
          </div>
          <audio controls src={previewUrl} style={{ width: "100%" }} />
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Tip: If preview is silent/too noisy, move closer to mic and record again.
          </div>
        </div>
      ) : null}

      {status ? <p style={{ marginTop: 10 }}>{status}</p> : null}

      {result ? (
        <div style={{ marginTop: 12, opacity: 0.95 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <b>Detected:</b> {result.label} ({pct(result.confidence)})
            </div>
            <div>
              <b>Mapped Mood:</b> {result.mapped_mood}
            </div>
            <div>
              <b>Energy/Stress:</b> {result.mapped_energy}/{result.mapped_stress}
            </div>
          </div>

          {/* Top-3 emotions */}
          {Array.isArray(result.top3) && result.top3.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Top Emotions</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {result.top3.map((x, idx) => (
                  <span key={`${x.label}-${idx}`} className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
                    {x.label} • {pct(x.score)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Transcript */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
              Transcript {result.language ? `(${result.language})` : ""}
            </div>
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                lineHeight: 1.5,
              }}
            >
              {result.transcript ? (
                result.transcript
              ) : (
                <span style={{ opacity: 0.75 }}>No transcript (enable Whisper on backend).</span>
              )}
            </div>
          </div>

          {/* Prosody */}
          {result.prosody ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Voice Signals</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
                  Energy: {result.prosody.energy ?? "-"} / 100
                </span>
                <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
                  Stress: {result.prosody.stress ?? "-"} / 100
                </span>
                <span className="badge" style={{ background: "rgba(255,255,255,0.10)" }}>
                  Speaking rate:{" "}
                  {typeof result.prosody.speaking_rate_wps === "number" ? `${result.prosody.speaking_rate_wps.toFixed(2)} w/s` : "-"}
                </span>
              </div>
            </div>
          ) : null}

          {/* Summary */}
          {result.summary ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Analysis</div>
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  lineHeight: 1.5,
                }}
              >
                {result.summary}
              </div>
            </div>
          ) : null}

          {/* ✅ NEW: Recommended workouts */}
          <div style={{ marginTop: 14 }}>
            <div className="card-header" style={{ marginBottom: 8 }}>
              <h2>🏋️ Recommended Workouts</h2>
              <span className="badge">{recommendations?.length ? `${recommendations.length} items` : "—"}</span>
            </div>

            {recoStatus ? <div style={{ marginBottom: 8, opacity: 0.9 }}>{recoStatus}</div> : null}

            {Array.isArray(recommendations) && recommendations.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {recommendations.map((w) => (
                  <WorkoutCard key={w.id ?? `${w.title}-${Math.random()}`} w={w} />
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                {recoStatus ? "" : "No recommendations yet. Run Analyze & Save to generate workouts."}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}