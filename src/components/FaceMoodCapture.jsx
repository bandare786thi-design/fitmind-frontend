// frontend/src/components/FaceMoodCapture.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeFaceMood, getMoods, getWorkoutsByState } from "../api";

/**
 * FaceMoodCapture (Camera Preview + Capture Photo + AI Analyze + Emotion Chart Grid + Workout Recommendations)
 *
 * Flow:
 * 1) Start camera -> live preview
 * 2) Capture photo -> freezes the exact image that will be uploaded
 * 3) Analyze -> sends captured photo to backend AI endpoint
 * 4) Shows AI basic emotion + suggests a detailed emotion (from your chart list)
 * 5) Shows full emotion list (chart-like) so user can confirm/override
 * 6) ✅ Fetches recommended workouts using mapped mood/energy/stress and shows list
 */
export default function FaceMoodCapture({ onSaved }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureCanvasRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState("");
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedUrl, setCapturedUrl] = useState("");

  // AI output
  const [aiResult, setAiResult] = useState(null);

  // detailed emotion selection (from chart)
  const [selectedEmotion, setSelectedEmotion] = useState("");

  // ✅ NEW: Recommendations
  const [recoStatus, setRecoStatus] = useState("");
  const [recommendations, setRecommendations] = useState([]);

  // ------- Your emotion chart words -------
  const chartEmotions = useMemo(
    () => [
      "Aggressive","Agonized","Anxious","Apologetic","Arrogant","Bashful","Blissful",
      "Bored","Cautious","Cold","Concentrating","Confident","Curious","Demure",
      "Determined","Disappointed","Disapproving","Disbelieving","Disgusted","Distasteful","Eavesdropping",
      "Ecstatic","Enraged","Envious","Exasperated","Exhausted","Frightened","Frustrated",
      "Grieving","Guilty","Happy","Horrified","Hot","Hungover","Hurt",
      "Hysterical","Idiotic","Indifferent","Innocent","Interested","Jealous","Loaded",
      "Lonely","Lovestruck","Meditative","Mischievous","Miserable","Negative","Obstinate",
      "Optimistic","Pained","Paranoid","Perplexed","Prudish","Puzzled","Regretful",
      "Relieved","Sad","Satisfied","Sheepish","Shocked","Smug","Surly",
      "Surprised","Suspicious","Sympathetic","Thoughtful","Turned-on","Undecided","Withdrawn"
    ],
    []
  );

  // Map AI basic emotions -> “best guess” detailed emotions from your chart
  const basicToDetailed = useMemo(
    () => ({
      happy: ["Happy", "Ecstatic", "Blissful", "Optimistic", "Satisfied", "Relieved", "Lovestruck"],
      sad: ["Sad", "Grieving", "Miserable", "Hurt", "Lonely", "Regretful", "Pained"],
      angry: ["Aggressive", "Enraged", "Frustrated", "Disapproving", "Surly", "Negative", "Obstinate"],
      fear: ["Anxious", "Frightened", "Horrified", "Suspicious", "Paranoid", "Perplexed"],
      disgust: ["Disgusted", "Distasteful", "Disapproving", "Negative"],
      surprise: ["Surprised", "Shocked", "Disbelieving", "Perplexed", "Undecided"],
      neutral: ["Indifferent", "Thoughtful", "Concentrating", "Meditative", "Interested", "Cautious"],
      low_confidence: ["Undecided", "Cautious", "Thoughtful"],
      no_face_detected: ["Undecided", "Cautious", "Thoughtful"],
    }),
    []
  );

  function suggestDetailedEmotion(basicLabel) {
    const key = (basicLabel || "").toLowerCase();
    const suggestions = basicToDetailed[key];
    if (!suggestions || !suggestions.length) return "";
    return suggestions[0];
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setStatus("");
    setAiResult(null);
    setSelectedEmotion("");
    setVideoReady(false);
    clearCaptured();

    // ✅ NEW
    setRecoStatus("");
    setRecommendations([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise((resolve) => {
        const onLoaded = () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          resolve();
        };
        video.addEventListener("loadedmetadata", onLoaded);
      });

      setCameraOn(true);
      setVideoReady(true);
      setStatus("Camera started. Position your face and tap Capture Photo.");
    } catch (e) {
      setStatus(e?.message || "Cannot access camera. Please allow camera permission.");
      setCameraOn(false);
      setVideoReady(false);
    }
  }

  function stopCamera() {
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    streamRef.current = null;
    setCameraOn(false);
    setVideoReady(false);
  }

  function clearCaptured() {
    setCapturedBlob(null);
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl("");

    const c = captureCanvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
    }
  }

  async function capturePhoto() {
    setStatus("");
    setAiResult(null);
    setSelectedEmotion("");

    // ✅ NEW
    setRecoStatus("");
    setRecommendations([]);

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;

    if (!video || !canvas) return;
    if (!videoReady || video.videoWidth <= 0) {
      setStatus("Camera not ready yet. Wait 1–2 seconds and try again.");
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

    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );

    if (!blob) {
      setStatus("Failed to capture image. Try again.");
      return;
    }

    setCapturedBlob(blob);
    setCapturedUrl(URL.createObjectURL(blob));
    setStatus("Photo captured ✅ Now tap Analyze Photo.");
  }

  async function analyzePhoto() {
    if (!capturedBlob) {
      setStatus("Capture a photo first.");
      return;
    }

    setBusy(true);
    setStatus("Analyzing captured photo with AI…");
    setAiResult(null);

    // ✅ NEW
    setRecoStatus("");
    setRecommendations([]);

    try {
      const ai = await analyzeFaceMood(capturedBlob);

      // Expecting: { label, confidence, mapped_mood, mapped_energy, mapped_stress, ... }
      setAiResult(ai);

      const suggested = suggestDetailedEmotion(ai?.label) || ai?.mapped_mood || "";
      setSelectedEmotion(suggested);

      setStatus("AI done ✅ Select/confirm the emotion below (chart style).");

      // ✅ NEW: Fetch workout recommendations
      try {
        setRecoStatus("Getting recommended workouts…");
        const rec = await getWorkoutsByState({
          mood: ai?.mapped_mood || "neutral",
          energy: ai?.mapped_energy ?? 6,
          stress: ai?.mapped_stress ?? 5,
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
      setStatus(e?.message || "Face AI analysis failed. Try better lighting and recapture.");
    } finally {
      setBusy(false);
    }
  }

  function selectEmotion(emotion) {
    setSelectedEmotion(emotion);
  }

  const aiBasic = (aiResult?.label || "").toLowerCase();
  const aiConfidence =
    typeof aiResult?.confidence === "number"
      ? `${(aiResult.confidence * 100).toFixed(1)}%`
      : "";

  const suggestions = basicToDetailed[aiBasic] || [];

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

  return (
    <div className="card glass" style={{ padding: 16, marginTop: 12 }}>
      <div className="card-header">
        <h2>📷 Face Mood (AI)</h2>
        <span className="badge">{cameraOn ? "Camera ON" : "Camera OFF"}</span>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        You will see your face live. Tap <b>Capture Photo</b> to freeze an image, then <b>Analyze Photo</b>.
        This matches your emotion chart style by mapping AI results to detailed emotions.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {!cameraOn ? (
          <button className="btn btn-primary" onClick={startCamera} disabled={busy}>
            Start Camera
          </button>
        ) : (
          <>
            <button className="btn" onClick={stopCamera} disabled={busy}>
              Stop Camera
            </button>
            <button className="btn" onClick={() => setMirror((m) => !m)} disabled={busy}>
              {mirror ? "Mirror: ON" : "Mirror: OFF"}
            </button>
          </>
        )}

        <button className="btn btn-secondary" onClick={capturePhoto} disabled={!cameraOn || busy}>
          Capture Photo
        </button>

        <button className="btn btn-primary" onClick={analyzePhoto} disabled={!capturedBlob || busy}>
          {busy ? "Analyzing..." : "Analyze Photo"}
        </button>

        <button className="btn" onClick={clearCaptured} disabled={busy}>
          Clear Photo
        </button>
      </div>

      {/* Live Preview + Captured Preview */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
        {/* Live Camera */}
        <div style={{ width: 360 }}>
          <div className="badge" style={{ justifySelf: "start", marginBottom: 8 }}>
            Live Camera Preview
          </div>
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
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
            Tips: Face centered • Light in front • Avoid window behind • Hold still for 1–2 seconds
          </div>
        </div>

        {/* Captured Photo */}
        <div style={{ width: 360 }}>
          <div className="badge" style={{ justifySelf: "start", marginBottom: 8 }}>
            Captured Photo (This is what AI analyzes)
          </div>

          {capturedUrl ? (
            <img
              src={capturedUrl}
              alt="Captured"
              style={{ width: "100%", borderRadius: 12, display: "block", background: "#111" }}
            />
          ) : (
            <div style={{ width: "100%", height: 240, borderRadius: 12, background: "rgba(255,255,255,0.06)" }} />
          )}

          {/* hidden canvas used to capture */}
          <canvas ref={captureCanvasRef} style={{ display: "none" }} />
        </div>
      </div>

      {/* Status */}
      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}

      {/* AI Result Summary */}
      {aiResult ? (
        <div className="mini-panel" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge">AI Basic Emotion</span>
            <b style={{ fontSize: 16 }}>{aiResult.label}</b>
            {aiConfidence ? <span className="badge">{aiConfidence}</span> : null}

            {aiResult.mapped_mood ? (
              <span className="badge">
                Mapped: <b>{aiResult.mapped_mood}</b> • {aiResult.mapped_energy}/{aiResult.mapped_stress}
              </span>
            ) : null}
          </div>

          {suggestions.length ? (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
              <b>Suggested detailed emotions:</b> {suggestions.join(", ")}
            </div>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <span className="badge">Selected Emotion (Chart)</span>{" "}
            <b style={{ fontSize: 16 }}>{selectedEmotion || "—"}</b>
          </div>
        </div>
      ) : null}

      {/* ✅ NEW: Recommended Workouts */}
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
            {recoStatus ? "" : "No recommendations yet. Capture + Analyze to generate workouts."}
          </div>
        )}
      </div>

      {/* Emotion Chart Grid */}
      <div style={{ marginTop: 14 }}>
        <div className="card-header" style={{ marginBottom: 8 }}>
          <h2>🧠 Emotion Chart (Select one)</h2>
          <span className="badge">{selectedEmotion ? "Selected" : "Pick one"}</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 8,
            maxHeight: 260,
            overflow: "auto",
            paddingRight: 6,
          }}
        >
          {chartEmotions.map((emo) => {
            const active = selectedEmotion === emo;
            return (
              <button
                key={emo}
                className="btn"
                onClick={() => selectEmotion(emo)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: active ? "rgba(34,197,94,0.18)" : undefined,
                  border: active ? "1px solid rgba(34,197,94,0.55)" : undefined,
                }}
              >
                {emo}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
          If AI is slightly wrong, you can correct it by selecting the right emotion here (like your image).
        </div>
      </div>
    </div>
  );
}