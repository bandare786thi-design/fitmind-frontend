// frontend/src/pages/SmartRecommendPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { recommendFromAI } from "../api";
import { downsampleBuffer, encodeWav } from "../utils/wav";

/**
 * SmartRecommendPage
 * - User selects input mode: Text / Voice / Face
 * - Runs AI analysis + returns recommended workout list via backend:
 *   POST /recommendations/from-ai
 *
 * Backend expects:
 *  - { mode:"text", text, limit }
 *  - { mode:"voice", audio_b64, limit }
 *  - { mode:"face", image_b64, limit }
 */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const dataUrl = r.result; // data:*/*;base64,xxxx
      const base64 = String(dataUrl).split(",")[1] || "";
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function fmtPct(x) {
  if (typeof x !== "number") return "";
  return `${(x * 100).toFixed(1)}%`;
}

function fmtSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Badge({ children }) {
  return (
    <span
      className="badge"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {children}
    </span>
  );
}

function WorkoutCard({ w }) {
  return (
    <div
      className="card glass"
      style={{
        padding: 12,
        borderRadius: 16,
        background: "rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>{w.title}</div>
        <Badge>{w.difficulty || "—"}</Badge>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {w.type ? <Badge>{w.type}</Badge> : null}
        {w.duration != null ? <Badge>{w.duration} min</Badge> : null}
        {w.equipment ? <Badge>{w.equipment}</Badge> : null}
      </div>
    </div>
  );
}

export default function SmartRecommendPage() {
  const [mode, setMode] = useState("text"); // "text" | "voice" | "face"
  const [limit, setLimit] = useState(8);

  // Text
  const [text, setText] = useState("");

  // Voice capture (WAV)
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
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

  // Face capture
  const videoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const [faceStatus, setFaceStatus] = useState("");
  const [imageBlob, setImageBlob] = useState(null);
  const [imageUrl, setImageUrl] = useState("");

  // Results
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [result, setResult] = useState(null);

  const canRecommend = useMemo(() => {
    if (loading) return false;
    if (mode === "text") return text.trim().length > 0;
    if (mode === "voice") return !!voiceBlob;
    if (mode === "face") return !!imageBlob;
    return false;
  }, [mode, text, voiceBlob, imageBlob, loading]);

  useEffect(() => {
    return () => {
      cleanupVoice();
      cleanupFace();
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- Voice helpers ----------
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
    setLevel(0);
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
      setLevel(Math.min(1, rms * 3));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  async function startRecording() {
    setApiError("");
    setResult(null);
    setVoiceStatus("");

    // reset previous blob
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceBlob(null);
    setVoiceUrl("");
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

      // capture raw PCM
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };

      // keep graph alive without echo
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      source.connect(analyser);
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      setRecording(true);
      setVoiceStatus("Recording… speak clearly for 3–8 seconds.");
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startLevelMeter();
    } catch (e) {
      cleanupVoice();
      setRecording(false);
      setVoiceStatus(e?.message || "Microphone permission denied.");
    }
  }

  async function stopRecording() {
    setRecording(false);
    setVoiceStatus("Preparing preview…");

    try {
      cleanupVoice();

      const buffers = chunksRef.current || [];
      if (!buffers.length) {
        setVoiceStatus("No audio captured. Try again.");
        return;
      }

      const length = buffers.reduce((sum, b) => sum + b.length, 0);
      const merged = new Float32Array(length);
      let offset = 0;
      for (const b of buffers) {
        merged.set(b, offset);
        offset += b.length;
      }

      // NOTE: We don’t know the real sampleRate from ScriptProcessor here reliably.
      // Your existing app used 44100 in the capture component, keep the same behavior:
      const assumedRate = 44100;
      const down = downsampleBuffer(merged, assumedRate, 16000);
      const wavBlob = encodeWav(down, 16000, 1);

      setVoiceBlob(wavBlob);
      const url = URL.createObjectURL(wavBlob);
      setVoiceUrl(url);

      setVoiceStatus("Preview ready. Play it to confirm, then click Recommend.");
    } catch (e) {
      setVoiceStatus(e?.message || "Failed to process audio.");
    }
  }

  function resetVoice() {
    setVoiceStatus("");
    setSeconds(0);
    setLevel(0);
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceUrl("");
    setVoiceBlob(null);
    chunksRef.current = [];
  }

  // -------- Face helpers ----------
  async function startFaceCamera() {
    setFaceStatus("");
    setApiError("");
    setResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      faceStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFaceStatus("Camera ready. Click Capture.");
    } catch (e) {
      setFaceStatus(e?.message || "Camera permission denied.");
    }
  }

  function cleanupFace() {
    try {
      faceStreamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    faceStreamRef.current = null;
  }

  async function captureFace() {
    setFaceStatus("");
    setApiError("");
    setResult(null);

    const video = videoRef.current;
    if (!video) {
      setFaceStatus("Camera not ready.");
      return;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );

    if (!blob) {
      setFaceStatus("Capture failed. Try again.");
      return;
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageBlob(blob);
    setImageUrl(URL.createObjectURL(blob));
    setFaceStatus("Captured. Click Recommend.");
  }

  function resetFace() {
    setFaceStatus("");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl("");
    setImageBlob(null);
  }

  // -------- Main action ----------
  async function recommendNow() {
    setApiError("");
    setResult(null);
    setLoading(true);

    try {
      const payload = { mode, limit: Number(limit) || 8 };

      if (mode === "text") {
        payload.text = text.trim();
      } else if (mode === "voice") {
        const audio_b64 = await blobToBase64(voiceBlob);
        payload.audio_b64 = audio_b64;
      } else if (mode === "face") {
        const image_b64 = await blobToBase64(imageBlob);
        payload.image_b64 = image_b64;
      }

      const data = await recommendFromAI(payload);
      setResult(data);
    } catch (e) {
      setApiError(e?.message || "Recommendation failed.");
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setApiError("");
    setResult(null);
    setText("");
    resetVoice();
    resetFace();
  }

  // auto-start camera when switching to face mode (optional UX)
  useEffect(() => {
    if (mode === "face" && !faceStreamRef.current) startFaceCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 12px" }}>
      <div className="card glass" style={{ padding: 16 }}>
        <div className="card-header" style={{ marginBottom: 10 }}>
          <h2>⚡ Smart Workout Recommendations</h2>
          <Badge>{loading ? "Analyzing…" : "AI → Workouts"}</Badge>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Choose an input method (Text / Voice / Face). We analyze your mood + energy/stress and return a recommended workout list.
        </p>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className={`btn ${mode === "text" ? "btn-primary" : ""}`}
            onClick={() => setMode("text")}
            disabled={loading}
          >
            Text
          </button>
          <button
            className={`btn ${mode === "voice" ? "btn-primary" : ""}`}
            onClick={() => setMode("voice")}
            disabled={loading}
          >
            Voice
          </button>
          <button
            className={`btn ${mode === "face" ? "btn-primary" : ""}`}
            onClick={() => setMode("face")}
            disabled={loading}
          >
            Face
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Limit
            </span>
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              type="number"
              min={1}
              max={30}
              style={{
                width: 80,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
              }}
              disabled={loading}
            />
            <button className="btn" onClick={resetAll} disabled={loading}>
              Reset
            </button>
            <button className="btn btn-primary" onClick={recommendNow} disabled={!canRecommend}>
              {loading ? "Working…" : "Recommend"}
            </button>
          </div>
        </div>

        {/* Content per mode */}
        <div style={{ marginTop: 14 }}>
          {mode === "text" ? (
            <div className="mini-panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>Text Input</div>
                <Badge>Type how you feel</Badge>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Example: I feel stressed and tired today. I want something light."
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "inherit",
                  resize: "vertical",
                }}
                disabled={loading}
              />
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
                Tip: Mention your energy + stress (“tired”, “excited”, “overwhelmed”, “calm”) for better recommendations.
              </div>
            </div>
          ) : null}

          {mode === "voice" ? (
            <div className="mini-panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>Voice Input</div>
                <Badge>{recording ? `REC • ${fmtSec(seconds)}` : "Record 3–8 seconds"}</Badge>
              </div>

              <div style={{ marginTop: 10 }}>
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
                  <button className="btn btn-primary" onClick={startRecording} disabled={loading}>
                    Start Recording
                  </button>
                ) : (
                  <button className="btn btn-secondary" onClick={stopRecording} disabled={loading}>
                    Stop & Preview
                  </button>
                )}
                <button className="btn" onClick={resetVoice} disabled={loading || recording}>
                  Reset Voice
                </button>
              </div>

              {voiceUrl ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Preview</div>
                  <audio controls src={voiceUrl} style={{ width: "100%" }} />
                </div>
              ) : null}

              {voiceStatus ? <div style={{ marginTop: 10 }}>{voiceStatus}</div> : null}
            </div>
          ) : null}

          {mode === "face" ? (
            <div className="mini-panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>Face Input</div>
                <Badge>Capture your face</Badge>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.25)",
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <button className="btn" onClick={startFaceCamera} disabled={loading}>
                      Start Camera
                    </button>
                    <button className="btn btn-primary" onClick={captureFace} disabled={loading}>
                      Capture
                    </button>
                    <button className="btn" onClick={resetFace} disabled={loading}>
                      Reset Face
                    </button>
                  </div>
                  {faceStatus ? <div style={{ marginTop: 10 }}>{faceStatus}</div> : null}
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Captured Image</div>
                  <div
                    style={{
                      width: "100%",
                      minHeight: 220,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt="captured" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ opacity: 0.7 }}>No capture yet</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
                    Tip: good lighting + face centered improves accuracy.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Errors */}
        {apiError ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "rgba(239,68,68,0.12)" }}>
            <b>Error:</b> {apiError}
          </div>
        ) : null}
      </div>

      {/* Results */}
      {result ? (
        <div className="card glass" style={{ padding: 16, marginTop: 14 }}>
          <div className="card-header" style={{ marginBottom: 10 }}>
            <h2>🧠 Your Analysis & Recommendations</h2>
            <Badge>{result.mode}</Badge>
          </div>

          {/* Mapped */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Badge>
              Mood: <b>{result.mapped?.mood ?? "—"}</b>
            </Badge>
            <Badge>
              Energy: <b>{result.mapped?.energy ?? "—"}</b>/10
            </Badge>
            <Badge>
              Stress: <b>{result.mapped?.stress ?? "—"}</b>/10
            </Badge>
            {result.ai?.label ? (
              <Badge>
                Detected: <b>{result.ai.label}</b> {typeof result.ai.confidence === "number" ? `(${fmtPct(result.ai.confidence)})` : ""}
              </Badge>
            ) : null}
          </div>

          {/* Voice extras (if present) */}
          {result.ai?.transcript ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                Transcript {result.ai?.language ? `(${result.ai.language})` : ""}
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>
                {result.ai.transcript}
              </div>
            </div>
          ) : null}

          {Array.isArray(result.ai?.top3) && result.ai.top3.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Top Emotions</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {result.ai.top3.slice(0, 3).map((x, idx) => (
                  <Badge key={`${x.label}-${idx}`}>
                    {x.label} • {fmtPct(x.score)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {result.ai?.summary ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Analysis</div>
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)" }}>
                {result.ai.summary}
              </div>
            </div>
          ) : null}

          {/* Workout list */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Recommended Workouts</h3>
              <Badge>{(result.workouts || []).length} items</Badge>
            </div>

            {Array.isArray(result.workouts) && result.workouts.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                {result.workouts.map((w) => (
                  <WorkoutCard key={w.id ?? `${w.title}-${Math.random()}`} w={w} />
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, opacity: 0.8 }}>No workouts returned. Add workouts to DB or relax filters.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}