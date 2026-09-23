import React, { useState, useEffect, useRef } from "react";
import { FiSearch, FiArrowLeft, FiX } from "react-icons/fi";
import { FaLock, FaThumbsUp, FaComment, FaPaperPlane, FaBookmark, FaRegBookmark,
  FaEllipsisV, FaDownload, FaHeart, FaRegHeart, FaRegPaperPlane,
  FaEllipsisH, FaEye } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar/navbar";
import socket from "../../sockets/sockets";
import CommentSection from "../../components/PostCard/CommentSection";
import ShareSheet from "../../components/PostCard/ShareSheet";

import { useFollowStore, initFollowStore, addFollowing, removeFollowing } from "../Profile/usefollowState.jsx";
import {
  getStoryRuntime,
  subscribeStory,
  pushComment,
  setRuntimeComments,
  setLikeState,
  setRuntimeViews,} from "../../components/state/syncstorystore.js";
import { isPostSaved, toggleSavedPost, subscribeSavedPosts } from "../../components/state/savedPostsStore.js";
const API = import.meta.env.VITE_API_URL;

/* ───────────────────────── global CSS (navbar drops below open sheets) ───────────────────────── */
const exploreGlobalCSS = `
  body.comments-open .navbar-root { z-index: -1 !important; }
  @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-120px); opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes heartBurst {
    0%   { transform: scale(0.3); opacity: 0; }
    25%  { transform: scale(1.15); opacity: 1; }
    45%  { transform: scale(0.95); opacity: 1; }
    65%  { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(1); opacity: 0; }
  }
`;
if (!document.getElementById("explore-global-style")) {
  const s = document.createElement("style");
  s.id = "explore-global-style";
  s.innerHTML = exploreGlobalCSS;
  document.head.appendChild(s);
}

/* ───────────────────────── helpers (same pattern as Homepage.jsx) ───────────────────────── */

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

function shareCount(shares) {
  if (Array.isArray(shares)) return shares.length;
  if (typeof shares === "number") return shares;
  return 0;
}

// ── Compact number formatter — 950, 1k, 1.1k, 12.3k, 1m, 2.5m, etc. ──────
function formatCount(num) {
  const n = Number(num) || 0;
  if (n < 1000) return `${n}`;
  const format = (value, suffix) => {
    const rounded = Math.floor(value * 10) / 10; // one decimal, truncated
    const str = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return `${str}${suffix}`;
  };
  if (n < 1_000_000) return format(n / 1000, "k");
  if (n < 1_000_000_000) return format(n / 1_000_000, "m");
  return format(n / 1_000_000_000, "b");
}

function timeAgo(createdAt) {
  if (!createdAt) return "";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
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
    : "rgb(234,182,118)"; // same as the gradient used in the navbar for new stories

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

// ── Caption with "...more" / "less" — Instagram-style truncation with
// click-to-expand and click-to-collapse.
function CaptionText({ text, limit = 100 }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const isLong = text.length > limit;

  if (!isLong || expanded) {
    return (
      <>
        {text}
        {isLong && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={moreBtnStyle}
          >
            {" "}less
          </span>
        )}
      </>
    );
  }

  return (
    <>
      {text.slice(0, limit).trimEnd()}...
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        style={moreBtnStyle}
      >
        {" "}more
      </span>
    </>
  );
}

// ── Mutual/social-proof likes line — "Liked by X and N others", tappable
// to open the full likers sheet. Reads whatever order the backend's
// getPostLikers already returns likedByUsers in — that endpoint sorts
// people the viewer follows to the front, so likedByUsers[0] is already
// a mutual/followed liker whenever one exists.
function LikesSummary({ likedByUsers, likesCount, hideLikeCount, isOwner, onOpen }) {
  if (hideLikeCount && !isOwner) return null;
  if (!likesCount) return null;
  const first = likedByUsers?.[0];
  const others = likesCount - (first ? 1 : 0);

  return (
    <p style={likesSummaryStyle} onClick={onOpen}>
      {first ? (
        <>
          Liked by <b>{first.username}</b>
          {others > 0 && <> and {formatCount(others)} other{others > 1 ? "s" : ""}</>}
        </>
      ) : (
        <>{formatCount(likesCount)} like{likesCount > 1 ? "s" : ""}</>
      )}
    </p>
  );
}

/* ───────────────────────── STORY PREVIEW (ported from Home.jsx) ───────────────────────── */
const FEED_PREVIEW_REACTIONS = ["❤️", "😂", "😮", "🔥", "👏"];

function FeedStoryPreview({ story, onClose, navigate }) {
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
  const [showViewers,    setShowViewers]    = useState(false);
  const [liveComments,   setLiveComments]   = useState([]);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [accessDenied,   setAccessDenied]   = useState(null);
  const menuRef = useRef(null);
  const commentsEndRef = useRef(null);

  const slides = story?.slides || [];
  const slide  = slides[slideIndex] || {};
  const isOwn  = !!story?.isOwn;
  const isLiveSlide = slide?.type === "live" || slide?.isLive === true;
  const isVideo = slide.type === "video" || slide.image?.includes(".mp4") || slide.image?.includes("video");

  useEffect(() => { setSlideIndex(0); }, [story?.id]);

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

  const handlePrev = () => { if (slideIndex > 0) setSlideIndex(i => i - 1); };
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
const sendReaction = (emoji) => {
  if (accessDenied || !slide?.id) return;
  socket.emit("storyComment", {
    storyId:  slide.id,
    userId:   currentUserId,
    username: currentUser.username,
    text:     emoji,
  });
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

        {slides.length > 1 && (
          <div style={feedPreviewProgressWrap}>
            {slides.map((_, i) => (
              <div key={i} style={feedPreviewProgressBg}>
                <div style={{ ...feedPreviewProgressFill, width: i <= slideIndex ? "100%" : "0%" }} />
              </div>
            ))}
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
              ? <video key={slide.image} src={slide.image} style={feedPreviewMediaEl} autoPlay playsInline loop muted />
              : <img src={slide.image} alt="story" style={feedPreviewMediaEl} />
          ) : (
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>No story to show</span>
          )}
          {/* ── NEW: text overlays + mentions ── */}
{!isLiveSlide && (slide.textOverlays?.length > 0 || slide.mentions?.length > 0) && (
  <div style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}>
    {(slide.textOverlays || []).map((t, i) => (
      <div
        key={`text-${i}`}
        style={{
          position: "absolute", left: `${t.x}%`, top: `${t.y}%`,
          transform: "translate(-50%, -50%)",
          color: t.color || "#fff", fontSize: t.fontSize || 20, fontWeight: 700,
          textAlign: t.align || "center", textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          maxWidth: "80%", wordBreak: "break-word", whiteSpace: "pre-wrap",
        }}
      >
        {t.text}
      </div>
    ))}
    {(slide.mentions || []).map((m, i) => (
      <div
        key={`mention-${i}`}
        onClick={() => { if (!m.user) return; onClose(); navigate(`/profile/${m.user}`); }}
        style={{
          position: "absolute", left: `${m.x}%`, top: `${m.y}%`,
          transform: "translate(-50%, -50%)",
          background: "rgba(255,255,255,0.92)", color: "#111",
          borderRadius: 20, padding: "5px 10px", fontSize: 11.5, fontWeight: 700,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)", pointerEvents: "auto", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        @{m.username || "user"}
      </div>
    ))}
  </div>
)}

{/* ── NEW: "Story by @username" attribution on a reposted story ── */}
{!isLiveSlide && slide.repostAttribution?.username && (
  <div
    onClick={(e) => { e.stopPropagation(); if (!slide.repostAttribution.user) return; onClose(); navigate(`/profile/${slide.repostAttribution.user}`); }}
    style={{
      position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 4,
      display: "flex", alignItems: "center", gap: 5,
      background: "rgba(0,0,0,0.55)", borderRadius: 16, padding: "3px 9px 3px 3px", cursor: "pointer",
    }}
  >
    {slide.repostAttribution.profilePic ? (
      <img src={slide.repostAttribution.profilePic} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
    ) : (
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700 }}>
        {slide.repostAttribution.username[0]?.toUpperCase()}
      </div>
    )}
    <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 600 }}>Story by @{slide.repostAttribution.username}</span>
  </div>
)}

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
                  <button onClick={handleHideFromNonFollowers}
                    style={{ display: "block", padding: "12px 16px", border: "none", background: "#fff", width: "100%", textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#222", borderBottom: "0.5px solid #f0f0f0" }}>
                    {isHidden ? "Show to everyone" : "Hide from non-followers"}
                  </button>
                  <button onClick={handleDelete}
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

/* ───────────────────────── read-only tags/collab rows (same pattern as Home.jsx) ───────────────────────── */

// FIX: tags previously had no click behavior at all. They're used as
// username mentions, so tapping one now resolves it against the
// username-search endpoint and navigates there.
function FeedTagsRow({ tags, navigate }) {
  if (!tags?.length) return null;

  const goToTaggedUser = async (tag) => {
    try {
      const res = await fetch(`${API}/auth/search?q=${encodeURIComponent(tag)}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const results = Array.isArray(data) ? data : data.users || [];
      const match = results.find(u => u.username?.toLowerCase() === tag.toLowerCase());
      if (match) navigate(`/profile/${match._id}`);
    } catch {}
  };

  return (
    <div style={{ padding: "2px 12px 6px", display: "flex", flexWrap: "wrap", gap: 5 }}>
      {tags.map(t => (
        <span
          key={t}
          onClick={(e) => { e.stopPropagation(); goToTaggedUser(t); }}
          style={{ background: "#fff3e0", color: "#f5a623", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          #{t}
        </span>
      ))}
    </div>
  );
}

function FeedCollabRow({ collaborators, navigate }) {
  const accepted = (collaborators || []).filter(c => c.status === "accepted");
  if (!accepted.length) return null;
  return (
    <div style={{ padding: "2px 12px 8px", display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600 }}>WITH</span>
      {accepted.map(c => (
        <div
          key={c.user?._id ?? c._id}
          onClick={() => navigate(`/profile/${c.user?._id}`)}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "#e8f5e9", borderRadius: 20, padding: "2px 8px", cursor: "pointer" }}
        >
          {c.user?.profilePic
            ? <img src={c.user.profilePic} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
            : <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>
                {c.user?.username?.[0]?.toUpperCase()}
              </div>
          }
          <span style={{ fontSize: 11, fontWeight: 600 }}>{c.user?.username}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── follow button — mirrors Home.jsx's local pattern ───────────────────────── */
// followState is derived from myFollowingIds, which the top-level Explore()
// component keeps in sync with the server (see fetchProfileAndFollowing).
function useFollowState(authorId, authorPrivate, onFollowChange, myFollowingIds) {
  const { follow, unfollow } = useFollowStore();
  const [followState, setFollowState] = useState("none");

  useEffect(() => {
    setFollowState(
      myFollowingIds?.includes(authorId?.toString()) ? "following" : "none"
    );
  }, [authorId, myFollowingIds]);

  const handleFollowBtn = async () => {
    try {
      if (followState === "none") {
        const res = await fetch(`${API}/auth/follow/${authorId}`, { method: "POST", headers: authHeaders() });
        const data = await res.json();
        if (!data.success) return;
        setFollowState(authorPrivate ? "requested" : "following");
        if (!authorPrivate) {
          follow(authorId);
          onFollowChange(authorId, true);
        }
      } else if (followState === "requested") {
        const res = await fetch(`${API}/auth/cancel-follow/${authorId}`, { method: "DELETE", headers: authHeaders() });
        const data = await res.json();
        if (!data.success) return;
        setFollowState("none");
        unfollow(authorId);
        onFollowChange(authorId, false);
        socket.emit("unfollowUser", { toUserId: authorId });
      } else if (followState === "following") {
        if (!window.confirm("Unfollow this user?")) return;
        const res = await fetch(`${API}/auth/unfollow/${authorId}`, { method: "DELETE", headers: authHeaders() });
        const data = await res.json();
        if (!data.success) return;
        setFollowState("none");
        unfollow(authorId);
        onFollowChange(authorId, false);
        socket.emit("unfollowUser", { toUserId: authorId });
      }
    } catch (err) { console.log(err); }
  };

  const followLabel    = followState === "following" ? "Following" : followState === "requested" ? "Requested" : "Follow";
  const followBtnBg    = followState !== "none" ? "#f0f0f0" : "rgb(234,182,118)";
  const followBtnColor = followState !== "none" ? "#333" : "#fff";

  return { followState, handleFollowBtn, followLabel, followBtnBg, followBtnColor };
}

function FollowButton({ authorId, isPrivate, isOwner, isBlocked, username, onFollowChange, myFollowingIds }) {
  const { followLabel, handleFollowBtn, followBtnBg, followBtnColor, followState } =
    useFollowState(authorId, isPrivate, onFollowChange, myFollowingIds);

  if (isOwner || isBlocked) return null;
  return (
    <button onClick={handleFollowBtn} style={{
      padding: "8px 12px", borderRadius: "8px", fontSize: 12, fontWeight: 600,
      border: followState !== "none" ? "1px solid #ddd" : "none",
      background: followBtnBg, color: followBtnColor, cursor: "pointer",
    }}>
      {followLabel}
    </button>
  );
}

/* ───────────────────────── bottom sheets (likers / comments) ───────────────────────── */

function BottomSheet({ title, onClose, children, inputBar }) {
  const ref = useRef(null);
  const startY = useRef(0);
  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0 && ref.current) ref.current.style.transform = `translateY(${diff}px)`;
  };
  const handleTouchEnd = (e) => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 120) onClose();
    else if (ref.current) ref.current.style.transform = "translateY(0)";
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div ref={ref} onClick={e => e.stopPropagation()}
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

function LikersSheet({ postId, onClose, onNavigate }) {
  const [likers, setLikers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLikers = async () => {
      try {
        const res = await fetch(`${API}/auth/likers/${postId}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setLikers(data.likedBy ?? []);
      } catch {}
      finally { setLoading(false); }
    };
    fetchLikers();

    const onPostLikes = ({ likedBy }) => { if (likedBy) setLikers(likedBy); };
    socket.emit("joinPost", postId);
    socket.on(`post:${postId}:likes`, onPostLikes);
    return () => {
      socket.emit("leavePost", postId);
      socket.off(`post:${postId}:likes`, onPostLikes);
    };
  }, [postId]);

  const filtered = likers.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()));
  return (
    <BottomSheet title="Liked by" onClose={onClose}>
      <div style={{ padding: "10px 12px 4px" }}>
        <div style={searchWrapStyle}>
          <FiSearch size={14} color="#999" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" style={searchInputStyle} />
          {search && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
        </div>
      </div>
      <div style={{ padding: "8px 16px 20px" }}>
        {loading ? <p style={emptyStyle}>Loading...</p>
        : filtered.length === 0 ? <p style={emptyStyle}>{search ? "No results found" : "No likes yet"}</p>
        : filtered.map((u, i) => (
          <div key={u._id ?? i} onClick={() => { onClose(); onNavigate(u._id); }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", borderBottom: i < filtered.length - 1 ? "0.5px solid #f5f5f5" : "none" }}>
            <Avatar src={u.profilePic} username={u.username} size={40} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{u.username}</div>
              {u.bio && <div style={{ fontSize: 12, color: "#999" }}>{u.bio}</div>}
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

function CommentsSheet({ postId, comments, setComments, onClose, onInteract }) {
  const currentUser = safeParseUser();
  const username = currentUser?.username || "Me";
  const [commentText, setCommentText] = useState("");

  const addComment = async () => {
    if (!commentText.trim()) return;
    try {
      const res = await fetch(`${API}/auth/comment/${postId}`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ text: commentText }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => {
          if (prev.some(c => c._id === data.comment._id)) return prev;
          return [...prev, data.comment];
        });
        setCommentText("");
        onInteract?.(postId);
      }
    } catch (err) { console.log(err); }
  };

  const inputBar = (
    <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid #f0f0f0", padding: "10px 12px", gap: 8 }}>
      <Avatar src={currentUser?.profilePic} username={username} size={32} />
      <input value={commentText} onChange={e => setCommentText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && addComment()}
        placeholder="Add a comment..." style={{ flex: 1, border: "none", outline: "none", fontSize: 14 }} />
      <button onClick={addComment} disabled={!commentText.trim()}
        style={{ border: "none", background: "none", color: "#1877f2", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
        Post
      </button>
    </div>
  );

  return (
    <BottomSheet title={`Comments (${formatCount(comments.length)})`} onClose={onClose} inputBar={inputBar}>
      <CommentSection comments={comments} setComments={setComments} currentUser={currentUser} postId={postId} />
    </BottomSheet>
  );
}

/* ───────────────────────── double-tap-to-like helper (Instagram-style) ───────────────────────── */
const DOUBLE_TAP_DELAY = 300;

function useDoubleTap(onDoubleTap) {
  const lastTapRef = useRef(0);
  return () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      lastTapRef.current = 0;
      onDoubleTap();
    } else {
      lastTapRef.current = now;
    }
  };
}

function HeartBurst({ show }) {
  if (!show) return null;
  return (
    <div style={heartBurstOverlay}>
      <FaThumbsUp size={84} color="#fff" style={heartBurstIcon} />
    </div>
  );
}

/* ───────────────────────── feed carousel (multi-image) ───────────────────────── */
// NEW: horizontal swipe (left = next, right = previous), in addition to
// the existing arrow buttons/dots. Only treated as a slide-change once
// the drag is clearly horizontal and past a threshold, so it doesn't
// fight with the page's normal vertical scroll or the double-tap-to-like
// click handler on the wrapping element.
function FeedCarousel({ media, onOpen }) {
  const [current, setCurrent] = useState(0);
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const total = media?.length || 0;
  if (!total) return null;

  const SWIPE_THRESHOLD = 50;
const handleTouchStart = (e) => {
  e.stopPropagation();
  swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
};
const handleTouchMove = (e) => {
  e.stopPropagation();
};
const handleTouchEnd = (e) => {
  e.stopPropagation();
  const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
  const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
  if (dx < 0) setCurrent(c => Math.min(c + 1, total - 1));
  else        setCurrent(c => Math.max(c - 1, 0));
};

  return (
    <div style={{ position: "relative" }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <img src={media[current]?.url} alt="post" style={postImg} onClick={onOpen}
        onError={e => { e.target.style.display = "none"; }} />
      {total > 1 && (
        <>
          {current > 0 && (
            <button onClick={e => { e.stopPropagation(); setCurrent(i => i - 1); }}
              style={carouselArrow("left")}>‹</button>
          )}
          {current < total - 1 && (
            <button onClick={e => { e.stopPropagation(); setCurrent(i => i + 1); }}
              style={carouselArrow("right")}>›</button>
          )}
          <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
            {media.map((_, i) => (
              <div key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }}
                style={{ width: i === current ? 16 : 5, height: 5, borderRadius: 3, background: i === current ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.2s" }} />
            ))}
          </div>
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>
            {current + 1}/{total}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── image post card (full, reused styling) ───────────────────────── */
function ImagePostCard({ p, navigate, onBlock, onNotInterested, onHide, onDeleted, onFollowChange, myFollowingIds, storyAuthorIds, seenStoryIds, onOpenStory }) {
  const currentUser = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const isOwner = currentUserId === p?.author?._id?.toString() || currentUserId === p?.author?.toString();
  const authorId = p?.author?._id || p?.author;
  const username = p?.author?.username || p?.username || "Unknown";
  const isPrivate = p?.author?.isPrivate ?? false;
  const authorHasStory = storyAuthorIds?.has(authorId?.toString());
  const authorStoryState = authorHasStory ? (seenStoryIds?.has(authorId?.toString()) ? "seen" : "unseen") : null;

  // ── per-post visibility/interaction flags set at creation time.
  // Owner always sees/can do everything regardless of these.
  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableDownload  = !!p?.disableDownload;
  const disableComments  = !!p?.disableComments;
  const canDownload      = !disableDownload || isOwner;
  const canComment       = !disableComments || isOwner;

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(p?.likes?.length || 0);
  const [likedByUsers, setLikedByUsers] = useState([]);
  const [saved, setSaved] = useState(() => isPostSaved(p?._id));
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isHidden, setIsHidden] = useState(p?.isHiddenFromNonFollowers || false);
  const [comments, setComments] = useState(p?.comments ?? []);
  const [isNotInterested, setIsNotInterested] = useState(p?.isNotInterested || false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [removedFromView, setRemovedFromView] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  // ← NEW: collaborators kept as live state instead of reading the raw
  // `p.collaborators` prop directly — refetched on mount and updated via
  // socket, so an accept/decline/removal that happened elsewhere shows
  // up here without a full page reload.
  const [collaborators, setCollaborators] = useState(p?.collaborators ?? []);
  const menuRef = useRef(null);

  useEffect(() => {
    if (showComments || showLikers || showShare) document.body.classList.add("comments-open");
    else document.body.classList.remove("comments-open");
    return () => document.body.classList.remove("comments-open");
  }, [showComments, showLikers, showShare]);

  useEffect(() => {
    if (!p?._id) return;
    socket.emit("joinPost", p._id);
    const fetchLikers = async () => {
      try {
        const res = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setLikesCount(data.totalLikes ?? 0);
          setLikedByUsers(data.likedBy ?? []);
          setLiked((data.likedBy ?? []).some(u => u._id?.toString() === currentUserId));
        }
      } catch (err) { console.log(err); }
    };
    fetchLikers();
    const fetchComments = async () => {
      try {
        const res = await fetch(`${API}/auth/get-comment/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setComments(data.comments);
      } catch (err) { console.log(err); }
    };
    fetchComments();

    // ← NEW: refresh collaborators from the DB on every mount, so an
    // accept/decline/removal that happened while this card wasn't
    // mounted shows up immediately.
    const fetchCollaborators = async () => {
      try {
        const res  = await fetch(`${API}/auth/get-post/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setCollaborators(data.post.collaborators ?? []);
      } catch {}
    };
    fetchCollaborators();

    const onPostLikes = ({ totalLikes, likedBy }) => {
      setLikesCount(totalLikes);
      if (likedBy) { setLikedByUsers(likedBy); setLiked(likedBy.some(u => u._id?.toString() === currentUserId)); }
    };
    const onNewComment = ({ comment }) => {
      setComments(prev => prev.some(c => c._id === comment._id) ? prev : [...prev, comment]);
    };
    const onCommentDeleted = ({ commentId }) => {
      setComments(prev => prev.filter(c => c._id !== commentId));
    };
    const onPostDeletedForMe = ({ postId }) => {
      if (postId === p._id) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      }
    };
    // ← NEW: live collaborator updates
    const onCollabResponded = ({ postId }) => { if (postId === p._id) fetchCollaborators(); };
    const onCollabRemoved = ({ postId, userId }) => {
      if (postId !== p._id) return;
      setCollaborators(prev => prev.filter(c => (c.user?._id ?? c.user)?.toString() !== userId));
    };
    socket.on(`post:${p._id}:likes`, onPostLikes);
    socket.on(`post:${p._id}:newComment`, onNewComment);
    socket.on(`post:${p._id}:commentDeleted`, onCommentDeleted);
    socket.on("postDeleted", onPostDeletedForMe);
    socket.on("collabResponded", onCollabResponded);
    socket.on("collabRemoved", onCollabRemoved);
    return () => {
      socket.emit("leavePost", p._id);
      socket.off(`post:${p._id}:likes`, onPostLikes);
      socket.off(`post:${p._id}:newComment`, onNewComment);
      socket.off(`post:${p._id}:commentDeleted`, onCommentDeleted);
      socket.off("postDeleted", onPostDeletedForMe);
      socket.off("collabResponded", onCollabResponded);
      socket.off("collabRemoved", onCollabRemoved);
    };
  }, [p?._id]);

useEffect(() => {
    const unsub = subscribeSavedPosts((postId, savedState) => {
      if (postId === p?._id) setSaved(savedState);
    });
    return unsub;
  }, [p?._id]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

const toggleSave = () => {
    toggleSavedPost(p);
  };

  // FIX: previously only ever downloaded media[0] — a multi-image post
  // silently dropped every image after the first. Now downloads every
  // image, staggered slightly so the browser doesn't treat the burst of
  // simultaneous downloads as a popup and block the rest.
  const download = () => {
    if (!canDownload) return;
    try {
      const mediaList = p?.media || [];
      if (!mediaList.length) return;
      mediaList.forEach((m, i) => {
        setTimeout(() => {
          const randomName = Math.floor(Math.random() * 9000000000 + 1000000000);
          const link       = document.createElement("a");
          link.href        = m.url.replace("/upload/", `/upload/fl_attachment:${randomName}/`);
          // No target="_blank" — a new tab is what gets popup-blocked.
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, i * 400);
      });
    } catch (err) { console.log(err); }
  };

  const handleLike = async () => {
    try {
      const res = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setLiked(data.liked); setLikesCount(data.totalLikes); }
    } catch (err) { console.log(err); }
  };

  const triggerDoubleTapLike = () => {
    if (!liked) handleLike();
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };
  const handleMediaTap = useDoubleTap(triggerDoubleTapLike);

  const handleNotInterested = async () => {
    try {
      const res = await fetch(`${API}/auth/not-interested/${p._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setIsNotInterested(prev => !prev);
        if (!isNotInterested) onNotInterested(p._id);
        else alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this post?")) return;
    try {
      const res = await fetch(`${API}/auth/delete-post/${p._id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      } else {
        alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleBlock = async () => {
    if (!window.confirm(`Block ${username}?`)) return;
    try {
      const res = await fetch(`${API}/auth/block/${authorId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setIsBlocked(true); onBlock(authorId); }
      else alert(data.message || "Block failed");
    } catch (err) { console.log(err); }
  };

  const handleHideFromNonFollowers = async () => {
    try {
      const res = await fetch(`${API}/auth/hide-from-non-followers/${p._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setIsHidden(data.isHidden);
        if (data.isHidden) onHide(p._id);
        else alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const goToProfile = (id) => { if (id) navigate(`/profile/${id}`); };

  const handleAvatarClick = () => {
    if (authorHasStory) onOpenStory?.(authorId);
    else goToProfile(authorId);
  };

  const menuOptions = isOwner
    ? [
        { label: "Delete", color: "#e53935", action: () => { setMenuOpen(false); handleDelete(); } },
        { label: isHidden ? "Show to everyone" : "Hide from non-followers", color: "#222", action: () => { setMenuOpen(false); handleHideFromNonFollowers(); } },
      ]
    : isBlocked
      ? [{ label: "Blocked", color: "#888", action: () => {} }]
      : [
          { label: isNotInterested ? "Interested" : "Not Interested", color: "#222", action: () => { setMenuOpen(false); handleNotInterested(); } },
          { label: `Block ${username}`, color: "#e53935", action: () => { setMenuOpen(false); handleBlock(); } },
        ];

  if (removedFromView) return null;

  return (
    <>
      <div style={imgCard}>
        <div style={imgHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar src={p?.author?.profilePic} username={username} size={38} onClick={handleAvatarClick} storyState={authorStoryState} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ ...uname, cursor: "pointer" }} onClick={() => goToProfile(authorId)}>{username}</span>
                <span style={{ fontSize: 11, color: "#aaa" }}>{timeAgo(p?.createdAt)}</span>
                {!isOwner && !isBlocked && (
                  <FollowButton
                    authorId={authorId}
                    isPrivate={isPrivate}
                    isOwner={isOwner}
                    isBlocked={isBlocked}
                    myFollowingIds={myFollowingIds}
                    username={username}
                    onFollowChange={onFollowChange}
                  />
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }} ref={menuRef}>
            <button onClick={toggleSave} style={{ ...headerIconBtn, background: saved ? "#fff8e1" : "#f0f0f0" }}>
              <FaBookmark color={saved ? "#f5a623" : "#888"} size={14} />
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen(v => !v)} style={{ ...headerIconBtn, background: menuOpen ? "#e8e8e8" : "#f0f0f0" }}>
                <FaEllipsisV size={14} color="#555" />
              </button>
              {menuOpen && (
                <div style={dropdownStyle}>
                  {menuOptions.map((opt, i) => (
                    <button key={i} onClick={opt.action}
                      style={{ display: "block", padding: "12px 16px", border: "none", background: "#fff", width: "100%", textAlign: "left", cursor: opt.label === "Blocked" ? "default" : "pointer", fontSize: 14, fontWeight: 500, color: opt.color, borderBottom: i < menuOptions.length - 1 ? "0.5px solid #f0f0f0" : "none" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }} onClick={handleMediaTap}>
          <FeedCarousel media={p.media} onOpen={() => {}} />
          <HeartBurst show={showHeartBurst} />
        </div>

        <LikesSummary
          likedByUsers={likedByUsers}
          likesCount={likesCount}
          hideLikeCount={hideLikeCount}
          isOwner={isOwner}
          onOpen={() => setShowLikers(true)}
        />

        {(p?.caption || p?.text) && (
          <p style={captionStyle}>
            <span style={{ fontWeight: 600, marginRight: 6, cursor: "pointer" }} onClick={() => goToProfile(authorId)}>
              {username}
            </span>
            <CaptionText text={p?.caption || p?.text} />
          </p>
        )}

        <FeedTagsRow tags={p?.tags} navigate={navigate} />
        <FeedCollabRow collaborators={collaborators} navigate={navigate} />

        <div style={imgActions}>
          <button onClick={handleLike} style={imgActionBtn}>
            <FaThumbsUp color={liked ? "#f5a623" : "#555"} size={17} />
            {(!hideLikeCount || isOwner) && (
              <span onClick={e => { e.stopPropagation(); setShowLikers(true); }}
                style={{ fontSize: 13, fontWeight: 600, color: liked ? "#f5a623" : "#555", cursor: "pointer" }}>
                {formatCount(likesCount)}
              </span>
            )}
          </button>
          {canComment && (
            <button onClick={() => setShowComments(true)} style={imgActionBtn}>
              <FaComment color="#555" size={17} />
              {(!hideCommentCount || isOwner) && comments.length > 0 && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{formatCount(comments.length)}</span>
              )}
            </button>
          )}
          <button onClick={() => { setMenuOpen(false); setShowShare(true); }} style={imgActionBtn}>
            <FaPaperPlane color="#555" size={17} />
          </button>
          {canDownload && (
            <button onClick={download} style={imgActionBtn}>
              <FaDownload color="#555" size={16} />
            </button>
          )}
        </div>
      </div>

      {showLikers && <LikersSheet postId={p._id} onClose={() => setShowLikers(false)} onNavigate={goToProfile} />}
      {showComments && canComment && (
        <CommentsSheet postId={p._id} comments={comments} setComments={setComments} onClose={() => setShowComments(false)} />
      )}
      {showShare && <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />}
    </>
  );
}

/* ───────────────────────── text post card (full, reused styling) ───────────────────────── */
function TextPostCard({ p, navigate, onBlock, onNotInterested, onHide, onDeleted, onFollowChange, myFollowingIds, storyAuthorIds, seenStoryIds, onOpenStory }) {
  const currentUser = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const isOwner = currentUserId === p?.author?._id?.toString() || currentUserId === p?.author?.toString();
  const authorId = p?.author?._id || p?.author;
  const username = p?.author?.username || "Unknown";
  const isPrivate = p?.author?.isPrivate ?? false;
  const authorHasStory = storyAuthorIds?.has(authorId?.toString());
  const authorStoryState = authorHasStory ? (seenStoryIds?.has(authorId?.toString()) ? "seen" : "unseen") : null;

  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableComments  = !!p?.disableComments;
  const canComment       = !disableComments || isOwner;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(p?.likes?.length || 0);
  const [likedByUsers, setLikedByUsers] = useState([]);
  const [saved, setSaved] = useState(() => isPostSaved(p?._id));
  const [menuOpen, setMenuOpen] = useState(false);
  const [heartAnim, setHeartAnim] = useState(false);
  const [showLikers, setShowLikers] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [comments, setComments] = useState(p?.comments ?? []);
  const [isHidden, setIsHidden] = useState(p?.isHiddenFromNonFollowers || false);
  const [isNotInterested, setIsNotInterested] = useState(p?.isNotInterested || false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [removedFromView, setRemovedFromView] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  // ← NEW: live share count, kept in sync via the "postShared" socket
  // event instead of only ever reading the value the page loaded with.
  const [sharesCount, setSharesCount] = useState(shareCount(p?.shares) ?? p?.sharesCount ?? 0);
  // ← NEW: collaborators kept as live state, same reasoning as
  // ImagePostCard above.
  const [collaborators, setCollaborators] = useState(p?.collaborators ?? []);
  const menuRef = useRef(null);

  useEffect(() => {
    if (showComments || showLikers || showShare) document.body.classList.add("comments-open");
    else document.body.classList.remove("comments-open");
    return () => document.body.classList.remove("comments-open");
  }, [showComments, showLikers, showShare]);

  useEffect(() => {
    if (!p?._id) return;
    socket.emit("joinPost", p._id);
    const fetchLikers = async () => {
      try {
        const res = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setLikeCount(data.totalLikes ?? 0);
          setLikedByUsers(data.likedBy ?? []);
          setLiked((data.likedBy ?? []).some(u => u._id?.toString() === currentUserId));
        }
      } catch (err) { console.log(err); }
    };
    fetchLikers();
    const fetchComments = async () => {
      try {
        const res = await fetch(`${API}/auth/get-comment/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setComments(data.comments);
      } catch (err) { console.log(err); }
    };
    fetchComments();

    // ← NEW: refresh collaborators from the DB on every mount.
    const fetchCollaborators = async () => {
      try {
        const res  = await fetch(`${API}/auth/get-post/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setCollaborators(data.post.collaborators ?? []);
      } catch {}
    };
    fetchCollaborators();

    const onPostLikes = ({ totalLikes, likedBy }) => {
      setLikeCount(totalLikes);
      if (likedBy) { setLikedByUsers(likedBy); setLiked(likedBy.some(u => u._id?.toString() === currentUserId)); }
    };
    const onNewComment = ({ comment }) => {
      setComments(prev => prev.some(c => c._id === comment._id) ? prev : [...prev, comment]);
    };
    const onCommentDeleted = ({ commentId }) => {
      setComments(prev => prev.filter(c => c._id !== commentId));
    };
    const onPostDeletedForMe = ({ postId }) => {
      if (postId === p._id) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      }
    };
    // ← NEW: live share-count updates
    const onShareCount = ({ postId, totalShares }) => { if (postId === p._id && totalShares != null) setSharesCount(totalShares); };
    // ← NEW: live collaborator updates
    const onCollabResponded = ({ postId }) => { if (postId === p._id) fetchCollaborators(); };
    const onCollabRemoved = ({ postId, userId }) => {
      if (postId !== p._id) return;
      setCollaborators(prev => prev.filter(c => (c.user?._id ?? c.user)?.toString() !== userId));
    };
    socket.on(`post:${p._id}:likes`, onPostLikes);
    socket.on(`post:${p._id}:newComment`, onNewComment);
    socket.on(`post:${p._id}:commentDeleted`, onCommentDeleted);
    socket.on("postDeleted", onPostDeletedForMe);
    socket.on("postShared", onShareCount);
    socket.on("collabResponded", onCollabResponded);
    socket.on("collabRemoved", onCollabRemoved);
    return () => {
      socket.emit("leavePost", p._id);
      socket.off(`post:${p._id}:likes`, onPostLikes);
      socket.off(`post:${p._id}:newComment`, onNewComment);
      socket.off(`post:${p._id}:commentDeleted`, onCommentDeleted);
      socket.off("postDeleted", onPostDeletedForMe);
      socket.off("postShared", onShareCount);
      socket.off("collabResponded", onCollabResponded);
      socket.off("collabRemoved", onCollabRemoved);
    };
  }, [p?._id]);

useEffect(() => {
    const unsub = subscribeSavedPosts((postId, savedState) => {
      if (postId === p?._id) setSaved(savedState);
    });
    return unsub;
  }, [p?._id]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

const toggleSave = () => {
    toggleSavedPost(p);
  };

  const handleHideFromNonFollowers = async () => {
    try {
      const res = await fetch(`${API}/auth/hide-from-non-followers/${p._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setIsHidden(data.isHidden);
        if (data.isHidden) onHide(p._id);
        else alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleNotInterested = async () => {
    try {
      const res = await fetch(`${API}/auth/not-interested/${p._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setIsNotInterested(prev => !prev);
        if (!isNotInterested) onNotInterested(p._id);
        else alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleLike = async () => {
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 300);
    try {
      const res = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setLiked(data.liked); setLikeCount(data.totalLikes); }
    } catch (err) { console.log(err); }
  };

  const triggerDoubleTapLike = () => {
    if (!liked) handleLike();
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };
  const handleMediaTap = useDoubleTap(triggerDoubleTapLike);

  const handleDelete = async () => {
    if (!window.confirm("Delete this post?")) return;
    try {
      const res = await fetch(`${API}/auth/delete-post/${p._id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      } else {
        alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleBlock = async () => {
    if (!window.confirm(`Block ${username}?`)) return;
    try {
      const res = await fetch(`${API}/auth/block/${authorId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setIsBlocked(true); onBlock(authorId); }
    } catch (err) { console.log(err); }
  };

  const goToProfile = (id) => { if (id) navigate(`/profile/${id}`); };

  const handleAvatarClick = () => {
    if (authorHasStory) onOpenStory?.(authorId);
    else goToProfile(authorId);
  };

  const menuOptions = isOwner
    ? [
        { label: "Delete", color: "#e53935", action: () => { setMenuOpen(false); handleDelete(); } },
        { label: isHidden ? "Show to everyone" : "Hide from non-followers", color: "#222", action: () => { setMenuOpen(false); handleHideFromNonFollowers(); } },
      ]
    : isBlocked
      ? [{ label: "Blocked", color: "#888", action: () => {} }]
      : [
          { label: isNotInterested ? "Interested" : "Not Interested", color: "#222", action: () => { setMenuOpen(false); handleNotInterested(); } },
          { label: `Block ${username}`, color: "#e53935", action: () => { setMenuOpen(false); handleBlock(); } },
        ];

  if (removedFromView) return null;

  return (
    <>
      <div style={textCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar src={p?.author?.profilePic} username={username} size={38} onClick={handleAvatarClick} storyState={authorStoryState} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...uname, cursor: "pointer" }} onClick={() => goToProfile(authorId)}>{username}</span>
              <span style={{ color: "#999", fontSize: 12 }}>{timeAgo(p?.createdAt)}</span>
              {!isOwner && !isBlocked && (
                <FollowButton
                  authorId={authorId}
                  isPrivate={isPrivate}
                  isOwner={isOwner}
                  isBlocked={isBlocked}
                  myFollowingIds={myFollowingIds}
                  username={username}
                  onFollowChange={onFollowChange}
                />
              )}
            </div>
          </div>
          <div style={{ position: "relative" }} ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)}
              style={{ border: "none", background: menuOpen ? "#f0f0f0" : "none", cursor: "pointer", padding: "4px 6px", borderRadius: 8, color: "#666", display: "flex", alignItems: "center" }}>
              <FaEllipsisH size={14} />
            </button>
            {menuOpen && (
              <div style={dropdownStyle}>
                {menuOptions.map((opt, i) => (
                  <button key={i} onClick={opt.action}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 14px", border: "none", background: "#fff", textAlign: "left", cursor: opt.label === "Blocked" ? "default" : "pointer", fontSize: 14, fontWeight: 500, color: opt.color, borderBottom: i < menuOptions.length - 1 ? "0.5px solid #f0f0f0" : "none" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ width: "100%", marginTop: 10 }}>
          {(p?.text || p?.caption) && (
            <p style={{ fontSize: 15, lineHeight: 1.55, color: "#111", whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 0, marginLeft: 0 }}>
              <CaptionText text={p?.text || p?.caption} limit={220} />
            </p>
          )}

{p?.media?.length > 0 && (
  <div style={{ position: "relative" }} onClick={handleMediaTap}>
    <div
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 10, paddingBottom: 2, marginLeft: 0, paddingLeft: 0 }}
    >
      {p.media.map((m, i) => (
        <div key={i} style={{ flexShrink: 0, width: p.media.length === 1 ? "100%" : 220, borderRadius: 14, overflow: "hidden", background: "#f0f0f0" }}>
          <img src={m.url} alt="" onError={e => { e.target.style.display = "none"; }}
            style={{ width: "100%", height: p.media.length === 1 ? "auto" : 220, objectFit: "cover", display: "block", minHeight: 160, maxHeight: 400 }} />
        </div>
      ))}
    </div>
    <HeartBurst show={showHeartBurst} />
  </div>
)}

          <LikesSummary
            likedByUsers={likedByUsers}
            likesCount={likeCount}
            hideLikeCount={hideLikeCount}
            isOwner={isOwner}
            onOpen={() => setShowLikers(true)}
          />

          <FeedTagsRow tags={p?.tags} navigate={navigate} />
          <FeedCollabRow collaborators={collaborators} navigate={navigate} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingBottom: 4 }}>
            <button onClick={handleLike} style={textActionBtn}>
              <FaThumbsUp size={17} color={liked ? "#e53935" : "#555"} className={heartAnim ? "heart-pop" : ""} />
              {(!hideLikeCount || isOwner) && (
                <span onClick={e => { e.stopPropagation(); setShowLikers(true); }}
                  style={{ fontSize: 13, fontWeight: 600, color: liked ? "#e53935" : "#555", cursor: "pointer" }}>
                  {formatCount(likeCount)}
                </span>
              )}
            </button>
            {canComment && (
              <button onClick={() => setShowComments(true)} style={textActionBtn}>
                <FaComment size={16} color="#555" />
                {(!hideCommentCount || isOwner) && comments.length > 0 && <span style={textCount}>{formatCount(comments.length)}</span>}
              </button>
            )}
            <button onClick={() => { setMenuOpen(false); setShowShare(true); }} style={textActionBtn}>
              <FaRegPaperPlane size={16} color="#555" />
              <span style={textCount}>{formatCount(sharesCount)}</span>
            </button>
            <button onClick={toggleSave} style={{ ...textActionBtn, marginLeft: "auto", background: saved ? "#fff8e1" : "#efefef" }}>
              {saved ? <FaBookmark size={15} color="#f5a623" /> : <FaRegBookmark size={15} color="#555" />}
            </button>
          </div>
        </div>
      </div>

      {showLikers && <LikersSheet postId={p._id} onClose={() => setShowLikers(false)} onNavigate={goToProfile} />}
      {showComments && canComment && (
        <CommentsSheet postId={p._id} comments={comments} setComments={setComments} onClose={() => setShowComments(false)} />
      )}
      {showShare && <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />}
    </>
  );
}

/* ───────────────────────── post feed overlay (scrollable, opened from grid) ───────────────────────── */
function PostFeedOverlay({ posts, startIndex, onClose, navigate, onFollowChange, myFollowingIds, storyAuthorIds, seenStoryIds, onOpenStory }) {
  const containerRef = useRef(null);
  const [blockedIds, setBlockedIds] = useState([]);
  const [notInterestedIds, setNotInterestedIds] = useState([]);
  const [hiddenPostIds, setHiddenPostIds] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBlock = (id) => setBlockedIds(prev => [...prev, id.toString()]);
  const handleNotInterested = (id) => setNotInterestedIds(prev => [...prev, id]);
  const handleHide = (id) => setHiddenPostIds(prev => [...prev, id]);
  const handleDeleted = (id) => setDeletedIds(prev => [...prev, id]);

  const orderedPosts = React.useMemo(() => {
    if (!posts.length) return posts;
    const i = ((startIndex % posts.length) + posts.length) % posts.length;
    return [...posts.slice(i), ...posts.slice(0, i)];
  }, [posts, startIndex]);

  const visiblePosts = orderedPosts.filter(p => {
    const authorId = (p?.author?._id || p?.author)?.toString();
    if (blockedIds.includes(authorId)) return false;
    if (notInterestedIds.includes(p._id)) return false;
    if (hiddenPostIds.includes(p._id)) return false;
    if (deletedIds.includes(p._id)) return false;
    return true;
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 250, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #efefef", position: "sticky", top: 0, background: "#fff", zIndex: 5 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "#111" }}>
          <FiArrowLeft size={22} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Posts</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto" }}>
        {visiblePosts.map((p) => (
          <div key={p._id}>
            {p.postType === "text"
              ? <TextPostCard p={p} navigate={navigate} onBlock={handleBlock} onNotInterested={handleNotInterested} onHide={handleHide} onDeleted={handleDeleted} onFollowChange={onFollowChange} myFollowingIds={myFollowingIds} storyAuthorIds={storyAuthorIds} seenStoryIds={seenStoryIds} onOpenStory={onOpenStory} />
              : <ImagePostCard p={p} navigate={navigate} onBlock={handleBlock} onNotInterested={handleNotInterested} onHide={handleHide} onDeleted={handleDeleted} onFollowChange={onFollowChange} myFollowingIds={myFollowingIds} storyAuthorIds={storyAuthorIds} seenStoryIds={seenStoryIds} onOpenStory={onOpenStory} />
            }
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── main Explore component ───────────────────────── */

function Explore() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exploreLoading, setExploreLoading] = useState(true);
  const [explorePosts, setExplorePosts] = useState([]); // image/text/carousel
  const [exploreVideos, setExploreVideos] = useState([]); // video
  const [overlayStartIndex, setOverlayStartIndex] = useState(null);
  const navigate = useNavigate();
  const debounceRef = useRef(null);
  // ── myFollowingIds is kept in sync with the server by
  // fetchProfileAndFollowing() below (mirrors Home.jsx's fetchStories,
  // which calls initFollowStore(...) from a real /auth/profile fetch on
  // every mount). Every card's FollowButton reads this same array via
  // props, so there is one source of truth instead of each button
  // guessing from whatever was last written to localStorage.
  const { followingIds: myFollowingIds } = useFollowStore();

  const [stories, setStories] = useState([]);
  const [previewAuthorId, setPreviewAuthorId] = useState(null);
  const [seenStoryIds, setSeenStoryIds] = useState(() => new Set());

  const fetchStories = async () => {
    try {
     const storiesRes = await fetch(`${API}/stories/get-stories?includeMuted=true`, { headers: authHeaders() });
      const storiesData = await storiesRes.json();
      if (!storiesData.success) return;

      const currentUser = safeParseUser();
      const myId = (currentUser?._id || currentUser?.id)?.toString();

      const grouped = new Map();
      for (const s of storiesData.stories) {
        const sAuthorId = (s.author?._id || s.author)?.toString();
        if (!sAuthorId) continue;

        if (!grouped.has(sAuthorId)) {
          grouped.set(sAuthorId, {
            id: sAuthorId,
            username: s.author?.username || "Unknown",
            userProfile: s.author?.profilePic || "",
            isOwn: sAuthorId === myId,
            slides: [],
          });
        }

grouped.get(sAuthorId).slides.push({
  id: s._id,
  image: s.media?.url || "",
  type: s.media?.type || s.storyType,
  likes: s.likesCount || 0,
  isLive: s.storyType === "live",
  liveRoomId: s.liveRoomId || null,
  authorId: sAuthorId,
  isHiddenFromNonFollowers: s.isHiddenFromNonFollowers || false,
  viewedByMe: !!s.viewedByMe,
  textOverlays: s.textOverlays || [],
  mentions: s.mentions || [],
  repostAttribution: s.repostAttribution || null,
});
      }

      const groupedArr = Array.from(grouped.values());

      const persistedSeenIds = new Set(
        groupedArr
          .filter(s => !s.isOwn && s.slides.length > 0 && s.slides.every(sl => sl.viewedByMe))
          .map(s => s.id)
      );

      setStories(groupedArr);
      setSeenStoryIds(persistedSeenIds);
    } catch (err) { console.log(err); }
  };

  useEffect(() => {
    fetchStories();
    const refresh = () => fetchStories();
    socket.on("storyAdded", refresh);
    socket.on("storyDeleted", refresh);
    socket.on("liveStoryEnded", refresh);
    socket.on("someoneLive", refresh);
    socket.on("storyVisibilityChanged", refresh);
    return () => {
      socket.off("storyAdded", refresh);
      socket.off("storyDeleted", refresh);
      socket.off("liveStoryEnded", refresh);
      socket.off("someoneLive", refresh);
      socket.off("storyVisibilityChanged", refresh);
    };
  }, []);

  const storyAuthorIds = React.useMemo(
    () => new Set(stories.map(s => s.id?.toString())),
    [stories]
  );

  const openStoryForAuthor = React.useCallback((authorId) => {
    setPreviewAuthorId(authorId);
    setSeenStoryIds(prev => {
      const key = authorId?.toString();
      if (!key || prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const previewStory = previewAuthorId
    ? stories.find(s => s.id?.toString() === previewAuthorId?.toString()) || null
    : null;

  // ── NEW — this is the actual fix for the stale "Follow"/"Requested"/
  // 400-on-unfollow issue: Explore previously never synced the
  // followingIds store from the server, so myFollowingIds could be
  // empty or stale for an entire session. Home.jsx avoids this because
  // its fetchStories() always calls initFollowStore(...) from a fresh
  // /auth/profile fetch. Do the same thing here, once on mount.
  const fetchProfileAndFollowing = async () => {
    try {
      const res  = await fetch(`${API}/auth/profile`, { headers: authHeaders() });
      const data = await res.json();
      if (!data?.user) return;
      localStorage.setItem("user", JSON.stringify(data.user));
      const followingIds = (data.user.following || []).map(f => (f?._id ?? f).toString());
      initFollowStore(followingIds);
    } catch (err) { console.log(err); }
  };

  useEffect(() => { fetchProfileAndFollowing(); }, []);

useEffect(() => {
  const currentUser = safeParseUser();
  const myId = (currentUser?._id || currentUser?.id)?.toString();
  if (!myId) return;

  const handler = ({ fromUserId, toUserId }) => {
    if (fromUserId?.toString() !== myId) return;
    removeFollowing(toUserId);
  };

  socket.on("userUnfollowed", handler);
  return () => socket.off("userUnfollowed", handler);
}, []);
  useEffect(() => {
    const patchPrivacy = (list, userId, isPrivate) =>
      list.map(post => {
        const authorId = post.author?._id
          ? post.author._id.toString()
          : post.author?.toString();
        if (authorId !== userId.toString()) return post;
        return {
          ...post,
          author: {
            ...(post.author?._id ? post.author : { _id: post.author }),
            isPrivate,
          },
        };
      });

    const handler = ({ userId, isPrivate }) => {
      setExplorePosts(prev => patchPrivacy(prev, userId, isPrivate));
      setExploreVideos(prev => patchPrivacy(prev, userId, isPrivate));
    };

    socket.on("privacyChanged", handler);
    return () => socket.off("privacyChanged", handler);
  }, []);

  const fetchExplore = async () => {
    try {
      setExploreLoading(true);

const [feedRes, reelsRes] = await Promise.all([
  fetch(`${API}/auth/feed?includeMuted=true`, { headers: authHeaders() }),
  fetch(`${API}/auth/public-reels`, { headers: authHeaders() }),
]);
      const feedData = await feedRes.json();
      const reelsData = await reelsRes.json();

      const feedList = Array.isArray(feedData) ? feedData : feedData.posts || [];
      const reelsList = Array.isArray(reelsData) ? reelsData : reelsData.reels || reelsData.posts || [];

      const currentUser = safeParseUser();
      const myId = (currentUser?._id || currentUser?.id)?.toString();
      const amPrivate = !!currentUser?.isPrivate;

      const visibleFeed = amPrivate
        ? feedList.filter(p => (p?.author?._id || p?.author)?.toString() !== myId)
        : feedList;

      const visibleReels = amPrivate
        ? reelsList.filter(p => (p?.author?._id || p?.author)?.toString() !== myId)
        : reelsList;

      setExplorePosts(visibleFeed.filter(p => ["image", "text", "carousel"].includes(p?.postType)));
      setExploreVideos(visibleReels.filter(p => p?.postType === "video" || !p?.postType));
    } catch (err) {
      console.error("Explore fetch error:", err);
    } finally {
      setExploreLoading(false);
    }
  };

  useEffect(() => { fetchExplore(); }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/auth/search?query=${search}`, { headers: authHeaders() });
        const data = await res.json();
        setResults(data.users || []);
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [search]);

  const handleClear = () => {
    setSearch("");
    setResults([]);
    setIsSearching(false);
  };

  const handleFollowChange = (authorId, followed) => {
    if (followed) addFollowing(authorId);
    else removeFollowing(authorId);
  };

  // ── CHANGED — live privacy filtering, same rule as Home.jsx's
  // visiblePosts: a post/reel from a private account you don't follow
  // (and don't own) is hidden. This is recomputed on every render, so
  // the moment privacyChangedHandler (below) flips author.isPrivate to
  // true on a post already sitting in explorePosts/exploreVideos, it
  // disappears from the grid immediately — no refetch, no reload.
  const currentUserForFilter = safeParseUser();
  const myIdForFilter = (currentUserForFilter?._id || currentUserForFilter?.id)?.toString();

const visibleExplorePosts = React.useMemo(
  () => explorePosts.filter(p => {
    const authorId = (p?.author?._id || p?.author)?.toString();
    if (authorId === myIdForFilter) return true;
    if (p?.author?.isPrivate) return false;
    return true;
  }),
  [explorePosts, myIdForFilter]
);

const visibleExploreVideos = React.useMemo(
  () => exploreVideos.filter(p => {
    const authorId = (p?.author?._id || p?.author)?.toString();
    if (authorId === myIdForFilter) return true;
    if (p?.author?.isPrivate) return false;
    return true;
  }),
  [exploreVideos, myIdForFilter]
);

  const gridBlocks = [];
  const POSTS_PER_BLOCK = 4;
  const ADS_EVERY_N_BLOCKS = 2;
  let postCursor = 0;
  let videoCursor = 0;
  let blockIndex = 0;

  while (postCursor < visibleExplorePosts.length || videoCursor < visibleExploreVideos.length) {
    const blockPosts = visibleExplorePosts.slice(postCursor, postCursor + POSTS_PER_BLOCK);
    postCursor += blockPosts.length;

    const video = videoCursor < visibleExploreVideos.length ? visibleExploreVideos[videoCursor] : null;
    if (video) videoCursor++;

    if (blockPosts.length === 0 && !video) break;

    gridBlocks.push({ kind: "block", posts: blockPosts, video, reversed: blockIndex % 2 === 1 });

    blockIndex++;
    if (blockIndex % ADS_EVERY_N_BLOCKS === 0) {
      gridBlocks.push({ kind: "ad" });
    }
  }

  const openPostOverlay = (clickedPost) => {
    const idx = visibleExplorePosts.findIndex(p => p._id === clickedPost._id);
    setOverlayStartIndex(idx >= 0 ? idx : 0);
  };

  const openVideoReel = (clickedVideo) => {
    navigate(`/explore-reels/${clickedVideo._id}`, {
      state: {
        video: clickedVideo,
        allVideos: visibleExploreVideos,
      },
    });
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }

        .explore-wrapper {
          width: 100%;
          max-width: 400px;
          margin: auto;
          min-height: 100vh;
          background: #fff;
          font-family: sans-serif;
          position: relative;
        }

        .search-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          position: sticky;
          top: 0;
          background: white;
          z-index: 20;
          border-bottom: 1px solid #f0f0f0;
        }

        .back-btn {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px;
          color: #111;
          flex-shrink: 0;
        }

        .search-box {
          flex: 1;
          display: flex;
          align-items: center;
          background: #efefef;
          border-radius: 10px;
          padding: 8px 12px;
          gap: 8px;
        }

        .search-icon { color: #777; flex-shrink: 0; }

        .search-input {
          border: none;
          background: transparent;
          outline: none;
          width: 100%;
          font-size: 14px;
          color: #111;
        }

        .clear-btn {
          background: #bbb;
          border: none;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          color: white;
          font-size: 11px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-weight: bold;
          line-height: 1;
        }

        .search-results-page {
          position: absolute;
          top: 57px;
          left: 0; right: 0; bottom: 0;
          background: #fff;
          z-index: 15;
          overflow-y: auto;
          padding-bottom: 70px;
        }

        .loading-row {
          padding: 20px;
          text-align: center;
          color: #aaa;
          font-size: 14px;
        }

        .no-results {
          padding: 40px 20px;
          text-align: center;
          color: #999;
          font-size: 14px;
        }

        .user-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .user-row:hover { background: #f9f9f9; }

        .user-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          border: 2px solid #eee;
        }

        .user-avatar-placeholder {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e0e0e0, #c0c0c0);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 700;
          color: #888;
          flex-shrink: 0;
          text-transform: uppercase;
        }

        .user-info { display: flex; flex-direction: column; gap: 2px; }

        .user-username {
          font-size: 14px;
          font-weight: 600;
          color: #111;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .user-bio {
          font-size: 12px;
          color: #888;
          max-width: 220px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .explore-blocks {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 3px;
        }

        .explore-block {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-rows: 120px 120px;
          gap: 3px;
        }

        .explore-item { overflow: hidden; position: relative; cursor: pointer; background: #eee; }

        .explore-item img, .explore-item video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .explore-ad-row {
          grid-column: 1 / -1;
          background: #f7f7f7;
          border: 1px dashed #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #aaa;
          font-size: 12px;
          font-weight: 600;
          cursor: default;
          padding: 30px 0;
        }

        .video-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(0,0,0,0.55);
          color: #fff;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 700;
        }

        .explore-empty {
          padding: 60px 20px;
          text-align: center;
          color: #aaa;
          font-size: 14px;
        }

        @media (max-width: 600px) {
          .explore-block { grid-template-rows: 100px 100px; }
        }
      `}</style>

      <div className="explore-wrapper">

        <div className="search-bar">
          {isSearching && (
            <button className="back-btn" onClick={handleClear}>
              <FiArrowLeft size={22} />
            </button>
          )}
          <div className="search-box">
            <FiSearch className="search-icon" size={16} />
            <input
              type="text"
              placeholder="Search users..."
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search.length > 0 && (
              <button className="clear-btn" onClick={handleClear}>✕</button>
            )}
          </div>
        </div>

        {isSearching && (
          <div className="search-results-page">
            {loading ? (
              <div className="loading-row">Searching...</div>
            ) : results.length === 0 ? (
              <div className="no-results">No users found for "{search}"</div>
            ) : (
              results.map((user) => (
                <div
                  key={user._id}
                  className="user-row"
                  onClick={() => navigate(`/profile/${user._id}`)}
                >
                  {user.profilePic ? (
                    <img src={user.profilePic} alt={user.username} className="user-avatar" />
                  ) : (
                    <div className="user-avatar-placeholder">{user.username?.[0]}</div>
                  )}
                  <div className="user-info">
                    <span className="user-username">
                      {user.username}
                      {user.isPrivate && <FaLock size={10} color="#888" />}
                    </span>
                    {user.bio && <span className="user-bio">{user.bio}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

       {exploreLoading ? (
  <div style={exploreCentered}><div style={exploreSpinnerStyle} /></div>
) : gridBlocks.length === 0 ? (
          <div className="explore-empty">No posts to discover yet.</div>
        ) : (
          <div className="explore-blocks">
            {gridBlocks.map((block, idx) => {
              if (block.kind === "ad") {
                return (
                  <div key={`ad-${idx}`} className="explore-ad-row">
                    Ad space reserved
                  </div>
                );
              }

              const { posts: blockPosts, video, reversed } = block;
              const slots = [...blockPosts];
              while (slots.length < 4) slots.push(null);

              const imageColOffset = reversed ? 1 : 0;
              const videoColumn = reversed ? 1 : 3;

              return (
                <div key={`block-${idx}`} className="explore-block">
                  {(reversed ? [
                    <div
                      key={video ? video._id : `empty-video-${idx}`}
                      className="explore-item"
                      style={{ gridColumn: videoColumn, gridRow: "1 / 3" }}
                      onClick={() => video && openVideoReel(video)}
                    >
                      {video ? (
                        video.media?.[0]?.url ? (
                          <video src={video.media[0].url} muted autoPlay loop playsInline />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: "#222" }} />
                        )
                      ) : null}
                      {video && <span className="video-badge">VIDEO</span>}
                    </div>
                  ] : []).concat(
                    slots.map((p, i) => (
                      <div
                        key={p ? p._id : `empty-${idx}-${i}`}
                        className="explore-item"
                        style={{ gridColumn: (i % 2) + 1 + imageColOffset, gridRow: Math.floor(i / 2) + 1 }}
                        onClick={() => p && openPostOverlay(p)}
                      >
                        {p ? (
                          p.media?.[0]?.url ? (
                            <img src={p.media[0].url} alt="post" />
                          ) : (
                            <div style={{
                              width: "100%", height: "100%", background: "#fafafa",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              padding: 8, fontSize: 11, color: "#888", textAlign: "center",
                              overflow: "hidden",
                            }}>
                              {p.text || p.caption || ""}
                            </div>
                          )
                        ) : null}
                      </div>
                    ))
                  ).concat(reversed ? [] : [
                    <div
                      key={video ? video._id : `empty-video-${idx}`}
                      className="explore-item"
                      style={{ gridColumn: videoColumn, gridRow: "1 / 3" }}
                      onClick={() => video && openVideoReel(video)}
                    >
                      {video ? (
                        video.media?.[0]?.url ? (
                          <video src={video.media[0].url} muted autoPlay loop playsInline />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: "#222" }} />
                        )
                      ) : null}
                      {video && <span className="video-badge">VIDEO</span>}
                    </div>
                  ])}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {overlayStartIndex !== null && (
        <PostFeedOverlay
          posts={visibleExplorePosts}
          startIndex={overlayStartIndex}
          onClose={() => setOverlayStartIndex(null)}
          navigate={navigate}
          onFollowChange={handleFollowChange}
          myFollowingIds={myFollowingIds}
          storyAuthorIds={storyAuthorIds}
          seenStoryIds={seenStoryIds}
          onOpenStory={openStoryForAuthor}
        />
      )}

      {previewStory && (
        <FeedStoryPreview story={previewStory} onClose={() => setPreviewAuthorId(null)} navigate={navigate} />
      )}

      <Navbar />
    </>
  );
}

export default Explore;

/* ───────────────────────── shared style objects ───────────────────────── */

const uname = { fontWeight: 700, fontSize: 14, color: "#111" };
const dropdownStyle = { position: "absolute", right: 0, top: 34, background: "#fff", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 100, minWidth: 200, overflow: "hidden", border: "0.5px solid #eee" };
const imgCard = { borderBottom: "1px solid #efefef", background: "#fff" };
const imgHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" };
const headerIconBtn = { border: "none", cursor: "pointer", width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" };
const postImg = { width: "100%", display: "block", cursor: "pointer", maxHeight: 500, objectFit: "cover" };
const captionStyle = { padding: "8px 12px 4px", fontSize: 14, lineHeight: 1.5, margin: 0 };
const moreBtnStyle = { color: "#8e8e8e", fontWeight: 700, cursor: "pointer" };
const likesSummaryStyle = { padding: "2px 12px 0", margin: 0, fontSize: 13, color: "#333", cursor: "pointer" };
const imgActions = { display: "flex", alignItems: "center", padding: "8px 10px 12px", gap: 8 };
const imgActionBtn = { border: "none", flex: 1, height: 40, borderRadius: 10, background: "#efefef", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
const textCard = { background: "#fff", borderBottom: "1px solid #efefef", padding: "14px 0px 0" };
const textActionBtn = { border: "none", background: "#efefef", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 38, flex: 1, borderRadius: 10, padding: "0 8px" };
const textCount = { fontSize: 13, color: "#555", fontWeight: 600 };
const emptyStyle = { textAlign: "center", color: "#aaa", padding: "32px 0", fontSize: 15, margin: 0 };
const searchWrapStyle = { display: "flex", alignItems: "center", gap: 6, background: "#f0f0f0", borderRadius: 10, padding: "0 10px" };
const searchInputStyle = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: 14, outline: "none" };
const exploreCentered = { display: "flex", justifyContent: "center", alignItems: "center", padding: 60 };
const exploreSpinnerStyle = { width: 28, height: 28, border: "3px solid #eee", borderTop: "3px solid #f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite" };
function carouselArrow(side) {
  return {
    position: "absolute", top: "50%", [side]: 8, transform: "translateY(-50%)",
    background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%",
    width: 28, height: 28, color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
  };
}

/* ───────────────────────── double-tap heart burst styles ───────────────────────── */

const heartBurstOverlay = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  pointerEvents: "none", zIndex: 3,
};
const heartBurstIcon = {
  filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.35))",
  animation: "heartBurst 0.8s ease",
};

/* ───────────────────────── story preview styles (ported from Home.jsx) ───────────────────────── */

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
const feedPreviewLiveBadge      = { display: "flex", alignItems: "center", gap: 5, background: "rgba(255,59,48,0.85)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, marginRight: 4 };
const feedPreviewLiveDot        = { width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" };
const feedPreviewLiveStatusWrap = { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#fff" };
const feedPreviewLiveStatusText = { color: "rgba(255,255,255,0.75)", fontSize: 13, margin: 0, textAlign: "center", padding: "0 20px" };
const feedPreviewSpinner        = { width: 30, height: 30, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" };