// src/components/StoryBar/FeedStoryPreview.jsx
//
// ONE shared story preview for every page (Home, Explore, ExploreReels,
// video.jsx reels, userProfileVideoPost). Replaces the per-file copies of
// FeedStoryPreview / ReelStoryPreview.
//
// Props: { story, onClose, navigate, initialShowViewers?, initialStoryId? }
//
// Progress bar: each segment now fills over time (5s for images, the real
// duration for videos), pauses while a sheet / menu / input is active, and
// auto-advances to the next slide (closing after the last). Previously the
// current segment was always drawn at 100%.

import React, { useEffect, useState, useRef } from "react";
import { FaThumbsUp, FaPaperPlane, FaEye, FaRegPaperPlane, FaEllipsisV } from "react-icons/fa";
import { FiX, FiSearch } from "react-icons/fi";
import socket from "../../sockets/sockets.jsx";
import { getStoryRuntime, subscribeStory, pushComment, setRuntimeComments, setLikeState } from "../state/syncstorystore.js";

const API = import.meta.env.VITE_API_URL;
const IMAGE_STORY_MS = 5000;

const css = `
  .feed-menu-item:hover { background: #f5f5f5 !important; }
  body.comments-open .navbar-root { z-index: -1 !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
  @keyframes slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
  @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-120px); opacity: 0; } }
  @keyframes storyProgress { from { width: 0%; } to { width: 100%; } }
  .overlay-bg   { animation: fadeIn  0.2s ease forwards; }
  .bottom-sheet { animation: slideUp 0.25s ease forwards; }
`;
if (typeof document !== "undefined" && !document.getElementById("feed-story-preview-style")) {
  const s = document.createElement("style");
  s.id = "feed-story-preview-style";
  s.innerHTML = css;
  document.head.appendChild(s);
}

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

function safeParseUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "undefined" || raw === "null") return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function formatCount(num) {
  const n = Number(num) || 0;
  if (n < 1000) return `${n}`;
  const format = (value, suffix) => {
    const rounded = Math.floor(value * 10) / 10;
    const str = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return `${str}${suffix}`;
  };
  if (n < 1_000_000) return format(n / 1000, "k");
  if (n < 1_000_000_000) return format(n / 1_000_000, "m");
  return format(n / 1_000_000_000, "b");
}

function Avatar({ src, username, size = 38, style: extra = {}, onClick, storyState }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const innerBase = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" };

  const photo = src
    ? <img src={src} alt={username} style={{ ...innerBase, ...extra }} />
    : (
      <div style={{ ...innerBase, ...extra, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>
        {letter}
      </div>
    );

  if (!storyState) {
    return <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default", display: "inline-block", lineHeight: 0 }}>{photo}</div>;
  }

  const ringBg = storyState === "seen"
    ? "#c7c7c7"
    : "rgb(234,182,118)";

  const ringSize = size + 6;
  return (
    <div
      onClick={onClick}
      style={{
        width: ringSize, height: ringSize, borderRadius: "50%",
        background: ringBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: onClick ? "pointer" : "default", flexShrink: 0, padding: 2,
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 2 }}>
        {photo}
      </div>
    </div>
  );
}

const FEED_PREVIEW_REACTIONS = ["❤️", "😂", "😮", "🔥", "👏"];

// ── NEW: shared render helper for text overlays + mentions, drawn as an
// absolutely-positioned layer over the story media. Identical logic used
// in StoryViewer.jsx and every ReelStoryPreview — kept as one function
// here since FeedStoryPreview is the only story viewer defined in this
// file. Never rendered for live slides.
function StoryOverlayLayer({ slide, isLiveSlide, navigate, onNavigateAway }) {
  if (isLiveSlide) return null;
  const hasText = slide.textOverlays?.length > 0;
  const hasMentions = slide.mentions?.length > 0;
  if (!hasText && !hasMentions) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }}>
      {(slide.textOverlays || []).map((t, i) => (
        <div
          key={`text-${i}`}
          style={{
            position: "absolute",
            left: `${t.x}%`,
            top: `${t.y}%`,
            transform: "translate(-50%, -50%)",
            color: t.color || "#fff",
            fontSize: t.fontSize || 20,
            fontWeight: 700,
            textAlign: t.align || "center",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            maxWidth: "80%",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {t.text}
        </div>
      ))}
      {(slide.mentions || []).map((m, i) => (
        <div
          key={`mention-${i}`}
          onClick={() => { if (!m.user) return; onNavigateAway?.(); navigate(`/profile/${m.user}`); }}
          style={{
            position: "absolute",
            left: `${m.x}%`,
            top: `${m.y}%`,
            transform: "translate(-50%, -50%)",
            background: "rgba(255,255,255,0.92)",
            color: "#111",
            borderRadius: 20,
            padding: "5px 10px",
            fontSize: 11.5,
            fontWeight: 700,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            pointerEvents: "auto",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          @{m.username || "user"}
        </div>
      ))}
    </div>
  );
}

// ── NEW: "Story by @username" attribution card for a reposted story.
function RepostAttributionBadge({ slide, isLiveSlide, navigate, onNavigateAway }) {
  if (isLiveSlide || !slide.repostAttribution?.username) return null;
  const { user, username, profilePic } = slide.repostAttribution;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); if (!user) return; onNavigateAway?.(); navigate(`/profile/${user}`); }}
      style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 5,
        background: "rgba(0,0,0,0.55)",
        borderRadius: 16,
        padding: "3px 9px 3px 3px",
        cursor: "pointer",
      }}
    >
      {profilePic ? (
        <img src={profilePic} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700 }}>
          {username[0]?.toUpperCase()}
        </div>
      )}
      <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 600 }}>Story by @{username}</span>
    </div>
  );
}

export function FeedStoryPreview({ story, onClose, navigate, initialShowViewers = false, initialStoryId = null }) {
  const currentUser   = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();

  const [slideIndex,     setSlideIndex]     = useState(0);
  const [liked,          setLiked]          = useState(false);
  const [likesCount,     setLikesCount]     = useState(0);
  const [viewers,        setViewers]        = useState([]);
  const [isHidden,       setIsHidden]       = useState(false);
  const [comment,        setComment]        = useState("");
  const [showMenu,       setShowMenu]       = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  // ← NEW — a story_view / story_like notification asks us to land on
  // this preview with the Viewers sheet already open (see
  // stashStoryViewers()/consumeStoryViewers() in utils/notificationHandoff.js,
  // consumed once in Home.jsx and passed down as this initial value).
  const [showViewers,    setShowViewers]    = useState(initialShowViewers);
  const [liveComments,   setLiveComments]   = useState([]);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [accessDenied,   setAccessDenied]   = useState(null);
  const [inputFocused,   setInputFocused]   = useState(false);
  const [videoDuration,  setVideoDuration]  = useState(0); // ms, 0 until metadata loads
  const [restartKey,     setRestartKey]     = useState(0);
  const menuRef = useRef(null);
  const commentsEndRef = useRef(null);

  const slides = story?.slides || [];
  const slide  = slides[slideIndex] || {};
  const isOwn  = !!story?.isOwn;
  const isLiveSlide = slide?.type === "live" || slide?.isLive === true;
  const isVideo = slide.type === "video" || slide.image?.includes(".mp4") || slide.image?.includes("video");

  // FIXED — this always reset to the reel's first slide, regardless of
  // which specific story a story_like/story_view notification was
  // actually about (the id was being validated on the backend but never
  // carried through to here — see stashOpenStoryId() in
  // notificationHandoff.js). Now it jumps to that slide when one was
  // requested, and otherwise falls back to slide 0 as before. `story?.id`
  // is still the trigger — this only needs to run once per distinct
  // author's reel being opened, not on every slideIndex change from
  // handlePrev/handleNext.
  useEffect(() => {
    if (initialStoryId) {
      const idx = slides.findIndex(s => s.id === initialStoryId || s._id === initialStoryId);
      setSlideIndex(idx >= 0 ? idx : 0);
    } else {
      setSlideIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (showShareSheet || showViewers) document.body.classList.add("comments-open");
    else document.body.classList.remove("comments-open");
    return () => document.body.classList.remove("comments-open");
  }, [showShareSheet, showViewers]);

  useEffect(() => {
    if (!slide?.id) return;
    socket.emit("joinStory", { storyId: slide.id, viewerId: currentUserId });
    return () => { socket.emit("leaveStory", slide.id); };
  }, [slide?.id, currentUserId]);

  useEffect(() => {
    if (!slide?.id) return;
    setShowMenu(false);
    setAccessDenied(null);

    const runtime = getStoryRuntime(slide.id);
    setLiveComments(runtime.comments);
    setLikesCount(runtime.likesCount);
    setLiked(runtime.liked);

    const fetchData = async () => {
      try {
        if (isOwn) {
          const res  = await fetch(`${API}/stories/viewers/${slide.id}`, { headers: authHeaders() });
          const data = await res.json();
          if (data.success) {
            setViewers(data.viewers ?? []);
            const likedNow = (data.likedBy ?? []).some(u => u._id?.toString() === currentUserId);
            setLikesCount(data.likesCount ?? 0);
            setLiked(likedNow);
            setIsHidden(slide.isHiddenFromNonFollowers || false);
            setLikeState(slide.id, { likesCount: data.likesCount ?? 0, liked: likedNow });
          }
        } else if (!isLiveSlide) {
          const res = await fetch(`${API}/stories/like-state/${slide.id}`, { headers: authHeaders() });
          if (res.status === 403) { setAccessDenied("not_following"); return; }
          const data = await res.json();
          if (data.success) {
            setLikesCount(data.likesCount ?? 0);
            setLiked(!!data.liked);
            setLikeState(slide.id, { likesCount: data.likesCount ?? 0, liked: !!data.liked });
          }
          fetch(`${API}/stories/view-story/${slide.id}`, { method: "PUT", headers: authHeaders() }).catch(() => {});
        }

        if (!runtime.commentsFetched) {
          try {
            const cRes  = await fetch(`${API}/stories/comments/${slide.id}`, { headers: authHeaders() });
            const cData = await cRes.json();
            if (cData?.success && Array.isArray(cData.comments)) {
              setRuntimeComments(slide.id, cData.comments);
            }
          } catch { /* endpoint optional / non-fatal */ }
        }
      } catch { /* non-fatal */ }
    };
    fetchData();

    const unsubscribe = subscribeStory(slide.id, (s) => {
      setLiveComments(s.comments);
      setLikesCount(s.likesCount);
      setLiked(s.liked);
    });

    const onLikes = ({ likesCount: count }) => setLikeState(slide.id, { likesCount: count });
    const onComment = (payload) => {
      pushComment(slide.id, payload);
      if (FEED_PREVIEW_REACTIONS.includes(payload.text)) {
        const id = Date.now() + Math.random();
        setFloatingEmojis(prev => [...prev.slice(-5), { id, emoji: payload.text }]);
        setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2200);
      }
    };
    socket.on(`story:${slide.id}:likes`, onLikes);
    socket.on(`story:${slide.id}:comment`, onComment);
    return () => {
      socket.off(`story:${slide.id}:likes`, onLikes);
      socket.off(`story:${slide.id}:comment`, onComment);
      unsubscribe();
    };
  }, [slide?.id, isOwn, isLiveSlide]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveComments.length]);

  const [liveStatus, setLiveStatus] = useState(null);
  const [liveStream, setLiveStream] = useState(null);
  const livePcRef    = useRef(null);
  const liveVideoRef = useRef(null);

  useEffect(() => {
    if (!isLiveSlide || !slide?.liveRoomId) {
      setLiveStatus(null);
      setLiveStream(null);
      return;
    }

    setLiveStatus("connecting");
    setLiveStream(null);

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    livePcRef.current = pc;

    pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        setLiveStream(event.streams[0]);
        setLiveStatus("live");
      }
    };

    const iceBuffer = [];

    const handleOffer = async ({ from, offer }) => {
      if (pc.signalingState !== "stable") return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        for (const c of iceBuffer) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
        iceBuffer.length = 0;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("liveAnswer", { to: from, answer });
      } catch (e) { console.error("Failed to handle live offer:", e); }
    };

    const handleIce = async ({ candidate }) => {
      if (!candidate) return;
      try {
        if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        else iceBuffer.push(candidate);
      } catch (e) { console.error("ICE error:", e); }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("iceCandidate", { to: slide.authorId, candidate });
    };

    const handleDenied = ({ roomId, reason }) => {
      if (roomId !== slide.liveRoomId) return;
      setLiveStatus(reason === "not_following" ? "denied" : "ended");
    };

    const handleEnded = ({ roomId }) => {
      if (roomId !== slide.liveRoomId) return;
      setLiveStatus("ended");
      setTimeout(() => onClose(), 2500);
    };

    socket.on("liveOffer", handleOffer);
    socket.on("iceCandidate", handleIce);
    socket.on("liveAccessDenied", handleDenied);
    socket.on("liveEnded", handleEnded);

    socket.emit("joinLive", { roomId: slide.liveRoomId, viewerId: currentUserId });

    return () => {
      socket.off("liveOffer", handleOffer);
      socket.off("iceCandidate", handleIce);
      socket.off("liveAccessDenied", handleDenied);
      socket.off("liveEnded", handleEnded);
      socket.emit("leaveLive", { roomId: slide.liveRoomId, viewerId: currentUserId });
      pc.close();
      livePcRef.current = null;
    };
  }, [isLiveSlide, slide?.liveRoomId, slide?.authorId, currentUserId]);

  useEffect(() => {
    if (liveVideoRef.current && liveStream) liveVideoRef.current.srcObject = liveStream;
  }, [liveStream]);

  // reset per-slide state whenever the slide changes
  useEffect(() => { setVideoDuration(0); }, [slideIndex, slide?.id]);
  const barPaused = showShareSheet || showViewers || showMenu || inputFocused || !!accessDenied;
  const handlePrev = () => { if (slideIndex > 0) setSlideIndex(i => i - 1); else setRestartKey(k => k + 1); };
  const handleNext = () => { if (slideIndex < slides.length - 1) setSlideIndex(i => i + 1); else onClose(); };

  const handleLike = async () => {
    if (!slide?.id) return;
    try {
      const res  = await fetch(`${API}/stories/like-story/${slide.id}`, { method: "PUT", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        const nextLiked = !liked;
        setLiked(nextLiked);
        setLikesCount(data.likesCount);
        setLikeState(slide.id, { likesCount: data.likesCount, liked: nextLiked });
      } else if (res.status === 403) {
        setAccessDenied("not_following");
      }
    } catch { /* non-fatal */ }
  };

  const handleSendComment = () => {
    if (!comment.trim() || !slide?.id || accessDenied) return;
    socket.emit("storyComment", {
      storyId:  slide.id,
      userId:   currentUserId,
      username: currentUser.username,
      text:     comment,
    });
    setComment("");
  };
const sendReaction = (emoji) => {
  if (accessDenied || !slide?.id) return;
  socket.emit("storyComment", {
    storyId:  slide.id,
    userId:   currentUserId,
    username: currentUser.username,
    text:     emoji,
  });
};
  const handleHideFromNonFollowers = async () => {
    if (!slide?.id) return;
    try {
      const res  = await fetch(`${API}/stories/hide-from-non-followers/${slide.id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { setIsHidden(data.isHiddenFromNonFollowers); setShowMenu(false); }
      else alert(data.message);
    } catch { /* non-fatal */ }
  };

  const handleDelete = async () => {
    if (!slide?.id) return;
    if (!window.confirm("Delete this story?")) return;
    try {
      const res  = await fetch(`${API}/stories/delete-story/${slide.id}`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) { onClose(); window.location.reload(); }
    } catch { /* non-fatal */ }
  };

  const goToViewerProfile = (id) => { onClose(); if (id && navigate) navigate(`/profile/${id}`); };

  if (!story) return null;

  if (accessDenied) {
    return (
      <div style={feedPreviewOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ ...feedPreviewCard, alignItems: "center", justifyContent: "center", display: "flex" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 24px", textAlign: "center" }}>
            <Avatar src={story.userProfile} username={story.username} size={56} />
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: "8px 0 0" }}>Follow to view this story</p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
              Only {story.username}'s followers can see this story.
            </p>
            <button
              onClick={onClose}
              style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 22px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={feedPreviewOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={feedPreviewCard}>

        {slides.length > 0 && (
          <div style={feedPreviewProgressWrap}>
            {slides.map((_, i) => {
              const isCurrent = i === slideIndex;
              const waitingForDuration = isCurrent && isVideo && !isLiveSlide && !videoDuration;
              const ms = isVideo ? videoDuration : IMAGE_STORY_MS;
              return (
                <div key={i} style={feedPreviewProgressBg}>
                  {i < slideIndex || (isCurrent && isLiveSlide) ? (
                    <div style={{ ...feedPreviewProgressFill, width: "100%" }} />
                  ) : isCurrent && !waitingForDuration ? (
                    <div
                      key={`${slide?.id}-${slideIndex}-${restartKey}-${ms}`}
                      onAnimationEnd={handleNext}
                      style={{
                        ...feedPreviewProgressFill,
                        width: "0%",
                        animation: `storyProgress ${ms}ms linear forwards`,
                        animationPlayState: barPaused ? "paused" : "running",
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div style={feedPreviewHeader}>
          <Avatar src={story.userProfile} username={story.username} size={28} />
          <span style={feedPreviewUsername}>{story.username}</span>
          {isLiveSlide && liveStatus === "live" && (
            <span style={feedPreviewLiveBadge}>
              <span style={feedPreviewLiveDot} /> LIVE
            </span>
          )}
          <button onClick={onClose} style={feedPreviewCloseBtn}>
            <FiX size={18} />
          </button>
        </div>

        <div style={feedPreviewMedia}>
          {isLiveSlide ? (
            liveStatus === "live" ? (
              <video ref={liveVideoRef} autoPlay playsInline style={feedPreviewMediaEl} />
            ) : (
              <div style={feedPreviewLiveStatusWrap}>
                {liveStatus === "denied" && (
                  <>
                    <span style={{ fontSize: 32 }}>🔒</span>
                    <p style={feedPreviewLiveStatusText}>Follow to watch</p>
                  </>
                )}
                {liveStatus === "ended" && (
                  <>
                    <span style={{ fontSize: 32 }}>📺</span>
                    <p style={feedPreviewLiveStatusText}>Live has ended</p>
                  </>
                )}
                {(liveStatus === "connecting" || !liveStatus) && (
                  <>
                    <div style={feedPreviewSpinner} />
                    <p style={feedPreviewLiveStatusText}>Connecting to live…</p>
                  </>
                )}
              </div>
            )
          ) : slide.image ? (
            isVideo
              ? <video
                  key={`${slide.image}-${restartKey}`}
                  src={slide.image}
                  style={feedPreviewMediaEl}
                  autoPlay playsInline muted
                  ref={(el) => { if (el) { if (barPaused) el.pause(); else el.play?.().catch(() => {}); } }}
                  onLoadedMetadata={(e) => setVideoDuration(Math.max(Math.round((e.target.duration || 0) * 1000), 1000))}
                  onError={() => setVideoDuration(IMAGE_STORY_MS)}
                />
              : <img src={slide.image} alt="story" style={feedPreviewMediaEl} />
          ) : (
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>No story to show</span>
          )}

          {/* ── NEW: text overlays + mentions + repost attribution ── */}
          <StoryOverlayLayer slide={slide} isLiveSlide={isLiveSlide} navigate={navigate} onNavigateAway={onClose} />
          <RepostAttributionBadge slide={slide} isLiveSlide={isLiveSlide} navigate={navigate} onNavigateAway={onClose} />

          {slides.length > 1 && !isLiveSlide && (
            <>
              <div style={feedPreviewNavLeft} onClick={handlePrev} />
              <div style={feedPreviewNavRight} onClick={handleNext} />
            </>
          )}

          <div style={feedPreviewFloatZone}>
            {floatingEmojis.map(e => (
              <span key={e.id} style={feedPreviewFloatEmoji}>{e.emoji}</span>
            ))}
          </div>

          {liveComments.length > 0 && (
            <div style={feedPreviewCommentsFeed}>
              {liveComments.map((c, i) => (
                <div key={i} style={feedPreviewCommentBubble}>
                  <span style={feedPreviewCommentUser}>{c.username}</span>
                  <span style={feedPreviewCommentText}>{c.text}</span>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>

        {isOwn ? (
          <div style={feedPreviewOwnBar}>
            <button onClick={() => setShowShareSheet(true)} style={feedPreviewSendBtn}>
              <FaPaperPlane size={14} /><span>Send</span>
            </button>
            <button onClick={() => setShowViewers(true)} style={feedPreviewStatPill}>
              <FaEye size={13} /><span>{formatCount(viewers.length)}</span>
            </button>
            <div style={feedPreviewStatPill}>
              <FaThumbsUp size={13} /><span>{formatCount(likesCount)}</span>
            </div>
            <div style={{ position: "relative", marginLeft: "auto" }} ref={menuRef}>
              <button onClick={() => setShowMenu(v => !v)} style={feedPreviewIconBtn}>
                <FaEllipsisV size={16} />
              </button>
              {showMenu && (
                <div style={{ ...dropdownStyle, top: "auto", bottom: 34, right: 0 }}>
                  <button className="feed-menu-item" onClick={handleHideFromNonFollowers}
                    style={{ display: "block", padding: "12px 16px", border: "none", background: "#fff", width: "100%", textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#222", borderBottom: "0.5px solid #f0f0f0" }}>
                    {isHidden ? "Show to everyone" : "Hide from non-followers"}
                  </button>
                  <button className="feed-menu-item" onClick={handleDelete}
                    style={{ display: "block", padding: "12px 16px", border: "none", background: "#fff", width: "100%", textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#e53935" }}>
                    Delete Story
                  </button>
                </div>
              )}
            </div>
          </div>
 ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {isLiveSlide && liveStatus === "live" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {FEED_PREVIEW_REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 20, padding: "6px 10px", fontSize: 20, cursor: "pointer", backdropFilter: "blur(4px)" }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <div style={feedPreviewViewerBar}>
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendComment()}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Send message..."
                style={feedPreviewInput}
              />
              <button onClick={handleLike} style={feedPreviewIconBtn}>
                <FaThumbsUp size={17} color={liked ? "rgb(234,182,118)" : "#fff"} />
              </button>
              <button onClick={handleSendComment} disabled={!comment.trim()} style={{ ...feedPreviewIconBtn, opacity: comment.trim() ? 1 : 0.4 }}>
                <FaPaperPlane size={16} color="#fff" />
              </button>
              <button onClick={() => setShowShareSheet(true)} style={feedPreviewIconBtn}>
                <FaRegPaperPlane size={18} color="#fff" style={{ transform: "rotate(20deg)" }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showShareSheet && <FeedStoryShareSheet storyId={slide.id} onClose={() => setShowShareSheet(false)} />}
      {showViewers && (
        <FeedStoryViewersSheet viewers={viewers} onClose={() => setShowViewers(false)} onNavigate={goToViewerProfile} />
      )}
    </div>
  );
}

function FeedStoryShareSheet({ storyId, onClose }) {
  const [search, setSearch]   = useState("");
  const [users, setUsers]     = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    fetch(`${API}/auth/share/users`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (data.success) setUsers(data.users); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`${API}/auth/share/users?q=${encodeURIComponent(search)}`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => { if (data.success) setUsers(data.users); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer.current);
  }, [search]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0 || !storyId) return;
    setSending(true);
    try {
      const res  = await fetch(`${API}/auth/share/story`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ storyId, toUserIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.success) { setSent(true); setTimeout(onClose, 900); }
    } catch { /* non-fatal */ }
    finally { setSending(false); }
  };

  return (
    <BottomSheet title={sent ? "Sent!" : "Send to"} onClose={onClose}>
      {!sent && (
        <>
          <div style={{ padding: "0 16px 10px" }}>
            <div style={searchWrapStyle}>
              <FiSearch size={14} color="#999" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…" style={searchInputStyle} autoFocus />
              {search && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
            </div>
          </div>
          <div style={{ padding: "0 16px 8px" }}>
            {loading ? <p style={emptyStyle}>Loading…</p>
              : users.length === 0 ? <p style={emptyStyle}>No users found</p>
              : users.map(u => (
                <div key={u._id} onClick={() => toggle(u._id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer" }}>
                  <Avatar src={u.profilePic} username={u.username} size={42} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{u.username}</span>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: selected.has(u._id) ? "none" : "2px solid #ddd",
                    background: selected.has(u._id) ? "rgb(234,182,118)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, flexShrink: 0,
                  }}>
                    {selected.has(u._id) && "✓"}
                  </div>
                </div>
              ))}
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <button onClick={handleSend} disabled={selected.size === 0 || sending}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "rgb(234,182,118)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: selected.size > 0 && !sending ? 1 : 0.5 }}>
              {sending ? "Sending…" : `Send${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

function FeedStoryViewersSheet({ viewers, onClose, onNavigate }) {
  return (
    <BottomSheet title={`${formatCount(viewers.length)} viewers`} onClose={onClose}>
      <div style={{ padding: "8px 16px 20px" }}>
        {viewers.length === 0 ? (
          <p style={emptyStyle}>No viewers yet</p>
        ) : (
          viewers.map((v, i) => (
            <div key={v._id ?? i} onClick={() => onNavigate(v._id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", borderBottom: i < viewers.length - 1 ? "0.5px solid #f5f5f5" : "none" }}>
              <Avatar src={v.profilePic} username={v.username} size={40} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>{v.username}</div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

function BottomSheet({ title, onClose, children, inputBar }) {
  const ref    = useRef(null);
  const startY = useRef(0);
  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0 && ref.current) ref.current.style.transform = `translateY(${diff}px)`;
  };
  const handleTouchEnd = (e) => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 120) onClose();
    else if (ref.current) ref.current.style.transform = "translateY(0)";
  };
  return (
    <div className="overlay-bg" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={ref} className="bottom-sheet" onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        style={{ width: "100%", maxWidth: 600, background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "78vh", display: "flex", flexDirection: "column", transition: "transform 0.2s ease" }}>
        <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 10, margin: "12px auto 8px" }} />
        <div style={{ textAlign: "center", padding: "4px 16px 14px", borderBottom: "1px solid #f0f0f0", fontSize: 15, fontWeight: 700, position: "relative" }}>
          {title}
          <FiX size={18} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
        {inputBar}
      </div>
    </div>
  );
}

const dropdownStyle = { position: "absolute", right: 0, top: 34, background: "#fff", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 100, minWidth: 200, overflow: "hidden", border: "0.5px solid #eee" };
const emptyStyle    = { textAlign: "center", color: "#aaa", padding: "32px 0", fontSize: 15, margin: 0 };
const searchWrapStyle  = { display: "flex", alignItems: "center", gap: 6, background: "#f0f0f0", borderRadius: 10, padding: "0 10px" };
const searchInputStyle = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: 14, outline: "none" };
const feedPreviewOverlay  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const feedPreviewCard     = { width: "100%", maxWidth: 340, height: "70vh", maxHeight: 600, background: "#000", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", position: "relative" };
const feedPreviewHeader   = { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", flexShrink: 0, position: "relative", zIndex: 2 };
const feedPreviewUsername = { color: "#fff", fontWeight: 700, fontSize: 14, flex: 1 };
const feedPreviewCloseBtn = { background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const feedPreviewMedia    = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", overflow: "hidden", position: "relative" };
const feedPreviewMediaEl  = { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" };

const feedPreviewProgressWrap  = { display: "flex", gap: 3, padding: "8px 10px 0", flexShrink: 0, position: "relative", zIndex: 2 };
const feedPreviewProgressBg    = { flex: 1, height: 2, background: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" };
const feedPreviewProgressFill  = { height: "100%", background: "#fff", borderRadius: 2 };

const feedPreviewNavLeft  = { position: "absolute", left: 0, top: 0, width: "40%", height: "100%", cursor: "pointer" };
const feedPreviewNavRight = { position: "absolute", right: 0, top: 0, width: "60%", height: "100%", cursor: "pointer" };

const feedPreviewOwnBar     = { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,0,0,0.9)", flexShrink: 0 };
const feedPreviewViewerBar  = { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,0,0,0.9)", flexShrink: 0 };
const feedPreviewStatPill   = { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "6px 12px", color: "#fff", fontSize: 13, fontWeight: 600 };
const feedPreviewIconBtn    = { background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const feedPreviewInput      = { flex: 1, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 20, padding: "9px 14px", color: "#fff", outline: "none", fontSize: 13 };
const feedPreviewSendBtn    = { display: "flex", alignItems: "center", gap: 6, background: "rgb(234,182,118)", border: "none", borderRadius: 20, padding: "8px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 };

const feedPreviewFloatZone      = { position: "absolute", bottom: 12, right: 10, zIndex: 6, display: "flex", flexDirection: "column-reverse", gap: 6, pointerEvents: "none" };
const feedPreviewFloatEmoji     = { fontSize: 22, animation: "floatUp 2s ease-out forwards", opacity: 0 };
const feedPreviewCommentsFeed   = { position: "absolute", bottom: 8, left: 8, right: 46, zIndex: 5, display: "flex", flexDirection: "column", gap: 5, maxHeight: "45%", overflowY: "auto", pointerEvents: "none" };
const feedPreviewCommentBubble  = { background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", borderRadius: 14, padding: "4px 10px", display: "flex", gap: 5, alignItems: "baseline", maxWidth: "90%", alignSelf: "flex-start" };
const feedPreviewCommentUser    = { color: "rgb(234,182,118)", fontSize: 10, fontWeight: 700, flexShrink: 0 };
const feedPreviewCommentText    = { color: "#fff", fontSize: 12, wordBreak: "break-word" };
const feedPreviewLiveBadge      = { display: "flex", alignItems: "center", gap: 5, background: "rgb(234,182,118)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, marginRight: 4 };
const feedPreviewLiveDot        = { width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" };
const feedPreviewLiveStatusWrap = { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#fff" };
const feedPreviewLiveStatusText = { color: "rgba(255,255,255,0.75)", fontSize: 13, margin: 0, textAlign: "center", padding: "0 20px" };
const feedPreviewSpinner        = { width: 30, height: 30, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" };

export default FeedStoryPreview;