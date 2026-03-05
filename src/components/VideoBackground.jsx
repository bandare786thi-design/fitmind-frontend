import { useEffect, useMemo, useRef, useState } from "react";

export default function VideoBackground({
  src = "/media/fitmind-bg.mp4",
  poster = "",
  dim = 0.6
}) {
  const videoRef = useRef(null);
  const [reduced, setReduced] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const overlayStyle = useMemo(() => ({ opacity: dim }), [dim]);

  async function toggleSound() {
    const v = videoRef.current;
    if (!v) return;

    try {
      if (!soundOn) {
        v.muted = false;
        v.volume = 0.5; // adjust volume
        await v.play(); // required on some browsers
        setSoundOn(true);
      } else {
        v.muted = true;
        setSoundOn(false);
      }
    } catch {
      // if play fails, keep muted
      v.muted = true;
      setSoundOn(false);
    }
  }

  if (reduced) {
    return (
      <div className="video-bg" aria-hidden="true">
        <div className="video-fallback" />
        <div className="video-overlay" style={overlayStyle} />
      </div>
    );
  }

  return (
    <div className="video-bg" aria-hidden="true">
      <video
        ref={videoRef}
        className="video-bg__video"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster={poster || undefined}
      >
        <source src={src} type="video/mp4" />
      </video>

      <div
  className={`video-overlay ${document.documentElement.getAttribute("data-theme") === "light" ? "video-overlay--light" : ""}`}
  style={overlayStyle}
/>

      {/* ✅ user interaction enables audio */}
      <button
        type="button"
        className="video-audio-btn glass"
        onClick={toggleSound}
        title={soundOn ? "Mute background video" : "Unmute background video"}
      >
        {soundOn ? "🔊 Sound On" : "🔇 Sound Off"}
      </button>
    </div>
  );
}