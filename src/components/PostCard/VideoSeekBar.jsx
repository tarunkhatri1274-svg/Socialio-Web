import { useState, useRef, useEffect } from "react";

/**
 * Instagram-style video seek bar (web).
 *
 * - A thin progress line at the bottom of the video fills as it plays.
 * - Press and drag it LEFT / RIGHT (mouse or touch) to reverse / forward the
 *   video. While dragging the line thickens, a thumb appears and a
 *   "0:12 / 0:45" label is shown. The video is paused while scrubbing and
 *   resumes on release (only if it was playing before).
 *
 * Usage: render it as a sibling of the video tap-area, inside the card
 * wrapper (which is position: relative):
 *
 *   <VideoSeekBar videoRef={videoRef} bottom={hasNavbar ? 50 : 0} />
 *
 * It listens to the <video> element directly, so the parent card doesn't
 * need any extra state.
 */

const fmt = (sec) => {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export default function VideoSeekBar({ videoRef, bottom = 0 }) {
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [hover, setHover] = useState(false);

  const barRef = useRef(null);
  const scrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);

  // ── follow the <video>: duration + current time ──────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const syncDuration = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
    const syncTime = () => { if (!scrubbingRef.current) setCurrent(v.currentTime || 0); };

    syncDuration();
    syncTime();
    v.addEventListener("loadedmetadata", syncDuration);
    v.addEventListener("durationchange", syncDuration);
    v.addEventListener("timeupdate", syncTime);
    v.addEventListener("seeked", syncTime);

    // timeupdate only fires ~4x/sec, which makes the bar look steppy —
    // smooth it with requestAnimationFrame while the video is playing.
    let raf;
    const tick = () => {
      if (!scrubbingRef.current && !v.paused) setCurrent(v.currentTime || 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("loadedmetadata", syncDuration);
      v.removeEventListener("durationchange", syncDuration);
      v.removeEventListener("timeupdate", syncTime);
      v.removeEventListener("seeked", syncTime);
    };
  }, [videoRef]);

  const seekFromClientX = (clientX) => {
    const v = videoRef.current;
    const bar = barRef.current;
    if (!v || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / (rect.width || 1), 0), 1);
    const t = ratio * duration;
    v.currentTime = t;
    setCurrent(t);
  };

  const onPointerDown = (e) => {
    if (!duration) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const v = videoRef.current;
    wasPlayingRef.current = !!v && !v.paused;
    v?.pause();
    scrubbingRef.current = true;
    setScrubbing(true);
    seekFromClientX(e.clientX);
  };

  const onPointerMove = (e) => {
    if (!scrubbingRef.current) return;
    e.stopPropagation();
    seekFromClientX(e.clientX);
  };

  const endScrub = (e) => {
    if (!scrubbingRef.current) return;
    e.stopPropagation();
    scrubbingRef.current = false;
    setScrubbing(false);
    if (wasPlayingRef.current) videoRef.current?.play().catch(() => {});
  };

  if (!duration) return null;

  const progress = Math.min(current / duration, 1) * 100;
  const active = scrubbing || hover;

  return (
    <div
      ref={barRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", left: 0, right: 0, bottom,
        height: 20, zIndex: 30,
        display: "flex", alignItems: "flex-end",
        cursor: "pointer",
        // stops the browser (and the scroll-snap reel feed) from hijacking
        // the horizontal drag as a scroll/swipe
        touchAction: "none",
        userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {scrubbing && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 26,
          textAlign: "center", pointerEvents: "none",
          color: "#fff", fontSize: 26, fontWeight: 700,
          textShadow: "0 1px 6px rgba(0,0,0,0.6)",
        }}>
          {fmt(current)}
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 18, fontWeight: 600 }}>
            {"  /  "}{fmt(duration)}
          </span>
        </div>
      )}

      <div style={{
        position: "relative", width: "100%",
        height: active ? 6 : 2, marginBottom: 0,
        background: "rgba(255,255,255,0.3)",
        transition: "height 0.12s ease",
        pointerEvents: "none",
      }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "#fff" }} />
        {scrubbing && (
          <div style={{
            position: "absolute", top: "50%", left: `${progress}%`,
            width: 12, height: 12, borderRadius: "50%", background: "#fff",
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 4px rgba(0,0,0,0.5)",
          }} />
        )}
      </div>
    </div>
  );
}