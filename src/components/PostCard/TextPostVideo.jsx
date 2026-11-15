import { useState, useEffect, useRef } from "react";

import { FaPlay, FaPause, FaVolumeMute, FaVolumeUp, FaEye, FaDownload } from "react-icons/fa";
import socket from "../../sockets/sockets";
import { withDownload } from "../../utils/downloadUrl";
import { markViewOnce } from "../../utils/viewOnce";

/* ════════════════════════════════════════════════════════════════════════
   TextPostVideo — the video tile used inside TEXT posts (TextPostView,
   Home, Explore).

   • Same footprint as the image tiles next to it (width / height props).
   • objectFit: "contain" on a black box, so the whole video is always visible.
   • Right-side overlay buttons, same look as userProfileVideoPost:
       pause/play · mute · views (opens viewers sheet) · download
   • Autoplays (muted by default) while ≥60% visible, pauses + rewinds when
     scrolled away. The first time it becomes visible it records a view.
   • Download respects post.disableDownload (owner can always download).

   Props
     post     the post document
     media    the media item ({ url, type: "video" })
     width    CSS width of the tile  (e.g. "100%" or 240)
     height   CSS height of the tile (e.g. 380 or 240)
     isOwner  boolean
   ════════════════════════════════════════════════════════════════════════ */
const API = import.meta.env.VITE_API_URL;
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

function formatCount(num) {
  const n = Number(num) || 0;
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}b`;
}

// Views are recorded once per post per page-load, even if the post has
// several videos or the tile scrolls in and out repeatedly.



export default function TextPostVideo({ post, media, width = "100%", height = 380, isOwner = false }) {
  const boxRef = useRef(null);
  const videoRef = useRef(null);

  const [isVisible, setIsVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true); // muted by default so browsers allow autoplay
  
  const [viewsCount, setViewsCount] = useState(post?.viewsCount ?? post?.views?.length ?? 0);
  const [downloadCount, setDownloadCount] = useState(post?.downloadsCount || post?.downloads?.length || 0);

  const canDownload = !post?.disableDownload || isOwner;

  // play only while visible
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.6 });
    if (boxRef.current) obs.observe(boxRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!isVisible) {
      v.pause();
      v.currentTime = 0;
      setPaused(false);
      return;
    }
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, muted, isVisible]);

  // record one view the first time the video is actually seen
  useEffect(() => {
     if (!isVisible || !post?._id || !markViewOnce(post._id)) return;
    (async () => {
      try {
        const res = await fetch(`${API}/auth/views/posts/${post._id}/views`, { method: "POST", headers: authHeaders() });
        const data = await res.json();
        if (data?.totalViews != null) setViewsCount(data.totalViews);
      } catch {}
    })();
  }, [isVisible, post?._id]);


  // live view count
  useEffect(() => {
    if (!post?._id) return;
    const onViews = ({ totalViews }) => { if (totalViews != null) setViewsCount(totalViews); };
    socket.on(`post:${post._id}:views`, onViews);
    return () => socket.off(`post:${post._id}:views`, onViews);
  }, [post?._id]);

  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

  const handleDownload = () => {
    if (!canDownload || !media?.url) return;
    try {
      const randomName = Math.floor(Math.random() * 9000000000 + 1000000000);
      const link = document.createElement("a");
      link.href = withDownload(media.url, randomName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadCount((c) => c + 1);
    } catch (err) { console.log(err); }
  };

  return (
    <>
      <div
        ref={boxRef}
        style={{
          position: "relative", flexShrink: 0, width, height,
          borderRadius: 14, overflow: "hidden", background: "#000",
        }}
      >
        <video
          ref={videoRef}
          src={media?.url || ""}
          loop playsInline muted={muted}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />

        {/* bottom fade so white icons stay readable on bright video */}
        <div style={{ position: "absolute", right: 0, bottom: 0, top: "35%", width: 80, background: "linear-gradient(270deg, rgba(0,0,0,0.45), transparent)", pointerEvents: "none" }} />

        <div style={rightActions} onClick={(e) => e.stopPropagation()}>
          <button style={actionBtn} onClick={stop(() => setPaused((p) => !p))} aria-label={paused ? "Play" : "Pause"}>
            {paused ? <FaPlay size={20} color="#fff" /> : <FaPause size={20} color="#fff" />}
          </button>

          <button style={actionBtn} onClick={stop(() => setMuted((m) => !m))} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <FaVolumeMute size={22} color="#fff" /> : <FaVolumeUp size={22} color="#fff" />}
          </button>

                 <div style={col}>
            <FaEye size={22} color="#fff" style={{ filter: shadow }} />
            <span style={actionLabel}>{formatCount(viewsCount)}</span>
          </div>

          {canDownload && (
            <div style={col}>
              <button style={actionBtn} onClick={stop(handleDownload)} aria-label="Download">
                <FaDownload size={22} color="#fff" />
              </button>
              {downloadCount > 0 && <span style={actionLabel}>{formatCount(downloadCount)}</span>}
            </div>
          )}
        </div>
      </div>

     
    </>
  );
}

const shadow = "drop-shadow(0 1px 3px rgba(0,0,0,0.6))";
const rightActions = {
  position: "absolute", right: 10, bottom: 12,
  display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
};
const col = { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 };
// same look as userProfileVideoPost's S.actionBtn / S.actionLabel
const actionBtn = { background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: 0, filter: shadow };
const actionLabel = { color: "#fff", fontSize: 12, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.6)" };
const emptyStyle = { textAlign: "center", color: "#aaa", padding: "28px 0", fontSize: 14, margin: 0 };