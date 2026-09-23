import React, { useEffect, useState, useRef } from "react";
import { FaThumbsUp, FaPaperPlane, FaRegPaperPlane, FaEye, FaEllipsisV } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import socket from "../../sockets/sockets";
import {
  getStoryRuntime,
  subscribeStory,
  pushComment,
  setRuntimeComments,
  setLikeState,
} from "../state/syncstorystore.js";
import { consumeStoryViewers } from "../../utils/notificationHandoff.js"

const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
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

// ── Real "time since posted" formatter — was a hardcoded "2h ago" string
// before, never actually computed from the story's real timestamp. Falls
// back through a few likely field names since the exact one the story
// object uses upstream (createdAt is the standard Mongoose default seen
// elsewhere in this app) may differ depending on how `slides` got built.
function formatTimeAgo(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Compact number formatter — 950, 1k, 1.1k, 12.3k, 1m, 2.5m, etc. ──────
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

function Avatar({ src, username, size = 36, style: extra = {} }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
  if (src) return <img src={src} alt={username} style={{ ...base, ...extra }} />;
  return (
    <div style={{ ...base, ...extra, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.38 }}>
      {letter}
    </div>
  );
}

// ── Tiny avatar used next to "X joined/left the live" lines ──────────────
function MiniAvatar({ src, username, size = 16 }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
  if (src) return <img src={src} alt={username} style={base} />;
  return (
    <div style={{ ...base, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.55 }}>
      {letter}
    </div>
  );
}

// ── Floating emoji burst when a reaction is sent ──────────────────────────
function EmojiFloat({ emojis }) {
  return (
    <div style={{ position: "absolute", bottom: 90, right: 16, zIndex: 12, pointerEvents: "none", display: "flex", flexDirection: "column-reverse", gap: 6 }}>
      {emojis.map((e, i) => (
        <span key={e.id} style={{ fontSize: 24, animation: "floatUp 2s ease-out forwards", opacity: 0 }}>{e.emoji}</span>
      ))}
      <style>{`@keyframes floatUp { 0%{transform:translateY(0);opacity:1} 100%{transform:translateY(-120px);opacity:0} }`}</style>
    </div>
  );
}

function StoryShareSheet({ storyId, onClose }) {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
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
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/auth/share/story`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ storyId, toUserIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.success) { setSent(true); setTimeout(onClose, 900); }
    } catch (err) { console.error("Story share failed:", err); }
    finally { setSending(false); }
  };

  return (
    <div style={S.sheetOverlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={S.sheetHandle} />
        <div style={S.sheetHeader}><span style={S.sheetTitle}>{sent ? "Sent!" : "Send to"}</span></div>
        {!sent && (
          <>
            <div style={{ padding: "0 0 10px" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…" style={S.shareSearchInput} autoFocus />
            </div>
            <div style={S.viewerList}>
              {loading && <p style={S.emptyText}>Loading…</p>}
              {!loading && users.length === 0 && <p style={S.emptyText}>No users found</p>}
              {!loading && users.map(u => (
                <div key={u._id} style={S.viewerRow} onClick={() => toggle(u._id)}>
                  <Avatar src={u.profilePic} username={u.username} size={42} />
                  <span style={S.viewerName}>{u.username}</span>
                  <div style={{ ...S.shareCheckbox, ...(selected.has(u._id) ? S.shareCheckboxChecked : {}) }}>
                    {selected.has(u._id) && "✓"}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 0 4px" }}>
              <button style={{ ...S.shareSendBtn, opacity: selected.size > 0 && !sending ? 1 : 0.5 }} disabled={selected.size === 0 || sending} onClick={handleSend}>
                {sending ? "Sending…" : `Send${selected.size > 0 ? ` (${selected.size})` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const LIVE_REACTIONS = ["❤️", "😂", "😮", "🔥", "👏"];

function StoryViewer({ stories, index, close, initialStoryId = null }) {
  // if (!stories || stories.length === 0 || index === undefined) return null;

  const navigate    = useNavigate();
  const currentUser = safeParseUser();
  const MY_ID       = (currentUser?._id || currentUser?.id)?.toString();

  const [current,        setCurrent]        = useState(index);
  // ← FIX — this used to always start at 0 and get corrected a moment
  // later by an effect once initialStoryId was resolved. That gap meant
  // this component's very first render (and everything that fires off
  // slide?.id on that render — the socket join, the story-data fetch,
  // and consumeStoryViewers() opening the sheet) briefly ran against
  // the WRONG slide before snapping to the right one, which is exactly
  // why the like indicator flashed on then vanished: it first loaded
  // (and consumed the one-shot Viewers-sheet flag) for slide 0, then a
  // second fetch for the real target slide overwrote it a moment later.
  // Resolving the correct index synchronously, before the first render,
  // means every one of those effects only ever sees the right slide.
  const [slideIndex,     setSlideIndex]     = useState(() => {
    if (!initialStoryId) return 0;
    const initialSlides = stories?.[index]?.slides || [];
    const idx = initialSlides.findIndex(s => s.id === initialStoryId || s._id === initialStoryId);
    return idx >= 0 ? idx : 0;
  });
  const [progress,       setProgress]       = useState(0);
  const [liked,          setLiked]          = useState(false);
  const [likesCount,     setLikesCount]     = useState(0);
  const [viewsCount,     setViewsCount]     = useState(0);
  const [liveViewers,    setLiveViewers]    = useState(0);
  const [comment,        setComment]        = useState("");
  const [liveComments,   setLiveComments]   = useState([]);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [showMenu,       setShowMenu]       = useState(false);
  const [showViewers,    setShowViewers]    = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [paused,         setPaused]         = useState(false);
  const [viewers,        setViewers]        = useState([]);
  // ← NEW — who among the viewers also liked this story, so the Viewers
  // sheet can show a heart next to their name (there's no separate
  // "who liked" sheet — story_like notifications land here instead, so
  // this is the only place that distinction can show up).
  const [likedByIds,     setLikedByIds]     = useState(() => new Set());
  const [sending,        setSending]        = useState(false);
  const [accessDenied,   setAccessDenied]   = useState(null);
  const [isHidden,       setIsHidden]       = useState(false);

  const [liveStatus, setLiveStatus] = useState(null);
  const [liveStream, setLiveStream] = useState(null);
  const liveVideoRef = useRef(null);
  const livePcRef    = useRef(null);
  const timerRef     = useRef(null);

  // ← NEW — "real time" here means the displayed "Xm/Xh ago" text actually
  // ticks forward as time passes, not just gets computed once and frozen.
  // Nothing else depends on this — it exists purely to force a re-render
  // every 30s so formatTimeAgo() below recomputes against a fresh Date.now().
  const [, forceTimeTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTimeTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const videoRef     = useRef(null);
  const commentsEndRef = useRef(null);

  const story     = stories?.[current];
  const slides    = story?.slides || [];
  const slide     = slides[slideIndex] || {};
  const isOwn     = story?.isOwn;
  const isLiveSlide = slide?.type === "live" || slide?.isLive === true;

 // if (!story) return null;

  // ← Initial slideIndex is now resolved synchronously above (see its
  // useState initializer) instead of corrected here a render later —
  // that's what was causing the like-indicator flash/race. Nothing else
  // needs initialStoryId after the first render (swiping to another
  // author always starts that author's reel at slide 0, same as
  // before), so there's no effect needed here at all anymore.

  // ── DEBUG NOTE (safe to delete once verified): if textOverlays/mentions
  // still don't show, log this once to confirm the data actually reached
  // this component — if it logs `[] []`, the bug is upstream in whatever
  // builds the `stories` prop (e.g. Home.jsx's story-grouping function),
  // not in this file.
  // console.log("slide overlays:", slide.textOverlays, slide.mentions);

  // ── Join story socket room ─────────────────────────────────────────────
  useEffect(() => {
    if (!slide?.id) return;
    setAccessDenied(null);
    setIsHidden(slide?.isHiddenFromNonFollowers || false);
    socket.emit("joinStory", { storyId: slide.id, viewerId: MY_ID });
    // ← NEW — never let a denial event apply to the owner's own story
    // (matches the same isOwn-bypass already applied on the RN side in
    // StoryViewer.js). Belt-and-suspenders alongside the render guard
    // below, in case a stray/late socket event fires for your own slide.
    const onDenied = ({ storyId, reason }) => {
      if (storyId !== slide.id || isOwn) return;
      setAccessDenied(reason);
      setPaused(true);
    };
    socket.on("storyAccessDenied", onDenied);
    return () => {
      socket.emit("leaveStory", slide.id);
      socket.off("storyAccessDenied", onDenied);
    };
  }, [slide?.id, MY_ID, isOwn]);

  // ← NEW — a story_view / story_like notification leaves a flag asking
  // us to pop the Viewers sheet open as soon as the story is up (see
  // stashStoryViewers()/consumeStoryViewers() in notificationHandoff.js).
  // Live slides don't have a Viewers sheet, so skip those.
  useEffect(() => {
    if (!slide?.id || isLiveSlide) return;
    if (consumeStoryViewers()) setShowViewers(true);
  }, [slide?.id, isLiveSlide]);

  // ── Live WebRTC — viewer side ──────────────────────────────────────────
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
      setTimeout(() => { close(); navigate("/home"); }, 1000);
    };

    socket.on("liveStoryOffer", handleOffer);
    socket.on("iceCandidate", handleIce);
    socket.on("liveAccessDenied", handleDenied);
    socket.on("liveEnded", handleEnded);
    socket.on("liveOffer", handleOffer);
    socket.emit("joinLive", { roomId: slide.liveRoomId, viewerId: MY_ID, username: currentUser.username });

    return () => {
      socket.off("liveStoryOffer", handleOffer);
      socket.off("iceCandidate", handleIce);
      socket.off("liveAccessDenied", handleDenied);
      socket.off("liveEnded", handleEnded);
      socket.off("liveOffer", handleOffer);
      socket.emit("leaveLive", { roomId: slide.liveRoomId, viewerId: MY_ID });
      pc.close();
      livePcRef.current = null;
    };
  }, [isLiveSlide, slide?.liveRoomId, slide?.authorId, MY_ID]);

  useEffect(() => {
    if (liveVideoRef.current && liveStream) {
      liveVideoRef.current.srcObject = liveStream;
    }
  }, [liveStream]);

  useEffect(() => {
    if (!isLiveSlide || !slide?.id) return;
    const onViewerJoined = ({ username, profilePic }) => {
      if (isOwn) setLiveViewers(v => v + 1);
      pushComment(slide.id, { system: true, username: username || "Someone", profilePic, text: "joined the live" });
    };
    const onViewerLeft = ({ username, profilePic }) => {
      if (isOwn) setLiveViewers(v => Math.max(0, v - 1));
      pushComment(slide.id, { system: true, username: username || "Someone", profilePic, text: "left the live" });
    };
    socket.on("viewerJoined", onViewerJoined);
    socket.on("viewerLeft",   onViewerLeft);
    return () => {
      socket.off("viewerJoined", onViewerJoined);
      socket.off("viewerLeft",   onViewerLeft);
    };
  }, [isLiveSlide, isOwn, slide?.id]);

  useEffect(() => {
    if (!slide?.id) return;

    const runtime = getStoryRuntime(slide.id);
    setLiveComments(runtime.comments);
    setLikesCount(runtime.likesCount || slide.likes || 0);
    setLiked(runtime.liked);

    const fetchStoryData = async () => {
      try {
        if (isOwn) {
          const res  = await fetch(`${API}/stories/viewers/${slide.id}`, { headers: authHeaders() });
          const data = await res.json();
          if (data.success) {
            setViewers(data.viewers ?? []);
            const count = data.likesCount ?? slide.likes ?? 0;
            const likedNow = (data.likedBy ?? []).some(u => u._id === MY_ID);
            setLikesCount(count);
            setLiked(likedNow);
            setLikeState(slide.id, { likesCount: count, liked: likedNow });
            // ← NEW — track every liker's id so each row in the Viewers
            // sheet below can show whether that person also liked it.
            setLikedByIds(new Set((data.likedBy ?? []).map(u => u._id)));
          }
        } else {
          const res  = await fetch(`${API}/stories/like-state/${slide.id}`, { headers: authHeaders() });
          const data = await res.json();
          if (data.success) {
            const count = data.likesCount ?? slide.likes ?? 0;
            setLikesCount(count);
            setLiked(!!data.liked);
            setLikeState(slide.id, { likesCount: count, liked: !!data.liked });
          } else if (res.status === 403) {
            setAccessDenied("not_following");
          }
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
      } catch {}
    };
    fetchStoryData();

    const unsubscribe = subscribeStory(slide.id, (s) => {
      setLiveComments(s.comments);
      setLikesCount(s.likesCount);
      setLiked(s.liked);
    });

    const onLikes   = ({ likesCount: count }) => setLikeState(slide.id, { likesCount: count });
    const onViews   = ({ viewsCount: count }) => setViewsCount(count);
    const onComment = (payload) => {
      pushComment(slide.id, payload);
      if (LIVE_REACTIONS.includes(payload.text)) {
        const id = Date.now() + Math.random();
        setFloatingEmojis(prev => [...prev.slice(-5), { id, emoji: payload.text }]);
        setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2200);
      }
    };

    socket.on(`story:${slide.id}:likes`,   onLikes);
    socket.on(`story:${slide.id}:views`,   onViews);
    socket.on(`story:${slide.id}:comment`, onComment);

    return () => {
      socket.off(`story:${slide.id}:likes`,   onLikes);
      socket.off(`story:${slide.id}:views`,   onViews);
      socket.off(`story:${slide.id}:comment`, onComment);
      unsubscribe();
    };
  }, [slide?.id, MY_ID, isOwn]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveComments.length]);

  const accessDeniedRef = useRef(accessDenied);
  accessDeniedRef.current = accessDenied;

  useEffect(() => {
    if (!slide?.id || accessDeniedRef.current) return;
    fetch(`${API}/stories/view-story/${slide.id}`, { method: "PUT", headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (data.success) setViewsCount(data.viewsCount ?? 0); })
      .catch(() => {});
  }, [slide?.id]);

 useEffect(() => {
  setProgress(0);
  clearInterval(timerRef.current);
  if (paused || accessDenied || isLiveSlide) return;
  timerRef.current = setInterval(() => {
    setProgress(p => {
      if (p >= 100) return 100;
      return p + 2;
    });
  }, 100);
  return () => clearInterval(timerRef.current);
}, [current, slideIndex, paused, accessDenied, isLiveSlide]);

useEffect(() => {
  if (progress >= 100) {
    handleNext();
  }
}, [progress]);

useEffect(() => { setPaused(showMenu || showViewers || showShareSheet); }, [showMenu, showViewers, showShareSheet]);
  useEffect(() => {
    if (!videoRef.current) return;
    paused ? videoRef.current.pause() : videoRef.current.play().catch(() => {});
  }, [paused]);

  const handleNext = () => {
    if (slideIndex < slides.length - 1) setSlideIndex(slideIndex + 1);
    else if (current < stories.length - 1) { setCurrent(current + 1); setSlideIndex(0); }
    else close();
  };

  const handlePrev = () => {
    if (slideIndex > 0) setSlideIndex(slideIndex - 1);
    else if (current > 0) {
      const prev = stories[current - 1];
      setCurrent(current - 1);
      setSlideIndex((prev?.slides?.length || 1) - 1);
    }
  };

  const handleLike = async () => {
    try {
      const res  = await fetch(`${API}/stories/like-story/${slide.id}`, { method: "PUT", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        const nextLiked = !liked;
        setLiked(nextLiked);
        setLikesCount(data.likesCount);
        setLikeState(slide.id, { likesCount: data.likesCount, liked: nextLiked });
      } else if (res.status === 403) setAccessDenied("not_following");
    } catch {}
  };

  const sendReaction = (emoji) => {
    socket.emit("storyComment", {
      storyId: slide.id,
      userId: MY_ID,
      username: currentUser.username,
      text: emoji,
    });
  };

  const handleSendComment = () => {
    if (!comment.trim() || accessDenied) return;
    setSending(true);
    socket.emit("storyComment", {
      storyId: slide.id,
      userId: MY_ID,
      username: currentUser.username,
      text: comment,
    });
    setComment("");
    setSending(false);
  };

  const handleDelete = async (storyId) => {
    if (!storyId) { alert("Story ID not found"); return; }
    if (!window.confirm("Delete this story?")) return;
    try {
      const res  = await fetch(`${API}/stories/delete-story/${storyId}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { close(); window.location.reload(); }
      else alert(data.message);
    } catch (err) { console.log(err); }
  };

  const handleHideFromNonFollowers = async () => {
    if (!slide?.id) return;
    try {
      const res  = await fetch(`${API}/stories/hide-from-non-followers/${slide.id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setIsHidden(data.isHiddenFromNonFollowers);
        setShowMenu(false);
      } else {
        alert(data.message || "Couldn't update visibility");
      }
    } catch (err) { console.log(err); }
  };

  const goToProfile = () => { if (story.id) navigate(`/profile/${story.id}`); };
  const isVideo = slide.type === "video" || slide.image?.includes(".mp4") || slide.image?.includes("video");

  // ── Access denied screen ───────────────────────────────────────────────
  // ← NEW — never show "Follow to view this story" on your own story
  // (own-story exemption, matching the RN StoryViewer.js fix).
  if (accessDenied && !isOwn) {
    return (
      <div style={S.container}>
        <div style={S.deniedWrap}>
          <Avatar src={story.userProfile} username={story.username} size={64} />
          <p style={S.deniedTitle}>
            {accessDenied === "not_following" ? "Follow to view this story" : "This story isn't available"}
          </p>
          <p style={S.deniedText}>
            {accessDenied === "not_following"
              ? `Only ${story.username}'s followers can see their story.`
              : "It may have expired or been removed."}
          </p>
          <button style={S.deniedBtn} onClick={close}>Close</button>
        </div>
      </div>
    );
  }
if (!stories || stories.length === 0 || index === undefined || !story) return null;
  return (
    <div style={S.container}>
      <style>{`
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>

      {/* PROGRESS BARS — hidden for live */}
      {!isLiveSlide && (
        <div style={S.progressWrap}>
          {slides.map((_, i) => (
            <div key={i} style={S.progressBg}>
              <div style={{ ...S.progressFill, width: i < slideIndex ? "100%" : i === slideIndex ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>
      )}

      {/* MEDIA */}
      {isLiveSlide ? (
        liveStatus === "live" ? (
          <video ref={liveVideoRef} autoPlay playsInline style={S.img} />
        ) : (
          <div style={{ ...S.img, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            {liveStatus === "denied" && (
              <>
                <span style={{ fontSize: 40 }}>🔒</span>
                <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Follow to watch</p>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0, textAlign: "center", padding: "0 32px" }}>
                  Only {story.username}'s followers can watch their live
                </p>
              </>
            )}
            {liveStatus === "ended" && (
              <>
                <span style={{ fontSize: 40 }}>📺</span>
                <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0 }}>Live has ended</p>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>Returning to home…</p>
              </>
            )}
            {(liveStatus === "connecting" || !liveStatus) && (
              <>
                <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, margin: 0 }}>Connecting to live…</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </>
            )}
          </div>
        )
      ) : isVideo ? (
        <video ref={videoRef} key={slide.image} src={slide.image} style={S.img} autoPlay playsInline loop onEnded={handleNext} />
      ) : (
        <img src={slide.image} style={S.img} alt="story" />
      )}

      {/* ── NEW: text overlays + mentions baked in at story-creation time.
          Rendered as an absolutely-positioned layer above the media but
          below the header/nav-zones (zIndex 4), matching the % coords
          saved from StoryPreview.jsx. Hidden entirely for live slides —
          filters/overlays never apply to live streaming. */}
      {!isLiveSlide && (slide.textOverlays?.length > 0 || slide.mentions?.length > 0) && (
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
                fontSize: t.fontSize || 24,
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
              onClick={() => m.user && navigate(`/profile/${m.user}`)}
              style={{
                position: "absolute",
                left: `${m.x}%`,
                top: `${m.y}%`,
                transform: "translate(-50%, -50%)",
                background: "rgba(255,255,255,0.92)",
                color: "#111",
                borderRadius: 20,
                padding: "6px 12px",
                fontSize: 13,
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
      )}
{/* ── NEW: "Story by @username" attribution card on a reposted story ── */}
{!isLiveSlide && slide.repostAttribution?.username && (
  <div
    onClick={() => slide.repostAttribution.user && navigate(`/profile/${slide.repostAttribution.user}`)}
    style={{
      position: "absolute", top: 66, left: "50%", transform: "translateX(-50%)", zIndex: 6,
      display: "flex", alignItems: "center", gap: 7,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
      border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20,
      padding: "5px 12px 5px 5px", cursor: "pointer",
    }}
  >
    {slide.repostAttribution.profilePic ? (
      <img src={slide.repostAttribution.profilePic} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
    ) : (
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>
        {slide.repostAttribution.username[0]?.toUpperCase()}
      </div>
    )}
    <span style={{ color: "#fff", fontSize: 12.5, fontWeight: 600 }}>Story by @{slide.repostAttribution.username}</span>
  </div>
)}
      <div style={S.topGradient} />
      <div style={S.bottomGradient} />

      {/* HEADER */}
      <div style={S.header}>
        <div style={{ cursor: isOwn ? "default" : "pointer" }} onClick={!isOwn ? goToProfile : undefined}>
          <Avatar src={story.userProfile} username={story.username} size={38} style={{ border: "2px solid white" }} />
        </div>
        <div style={S.headerInfo} onClick={!isOwn ? goToProfile : undefined}>
          <span style={{ ...S.username, cursor: isOwn ? "default" : "pointer" }}>{story.username}</span>
          <span style={S.timeText}>
            {isLiveSlide ? (
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff3b30", display: "inline-block", animation: "pulse 1.2s infinite" }} />
                LIVE
                <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
              </span>
            ) : formatTimeAgo(slide.createdAt || slide.postedAt || slide.timestamp)}
          </span>
        </div>
        {isLiveSlide && liveStatus === "live" && (
          <div style={{ marginLeft: "auto", marginRight: 8, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.45)", borderRadius: 20, padding: "4px 10px" }}>
            <FaEye size={12} color="#fff" />
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>
              {isOwn ? formatCount(liveViewers) : "Live"}
            </span>
          </div>
        )}
        <button onClick={close} style={S.closeBtn}><IoClose size={24} /></button>
      </div>

      {/* NAV ZONES — disabled for live */}
      {!isLiveSlide && (
        <>
          <div style={S.navLeft}  onClick={handlePrev} />
          <div style={S.navRight} onClick={handleNext} />
        </>
      )}

      {/* FLOATING EMOJI REACTIONS */}
      <EmojiFloat emojis={floatingEmojis} />

      {/* LIVE COMMENTS FEED */}
      {liveComments.length > 0 && (
        <div style={S.commentsFeed} className="no-scrollbar">
          {liveComments.map((c, i) => (
            c.system ? (
              <div key={i} style={S.systemBubble}>
                <MiniAvatar src={c.profilePic} username={c.username} size={16} />
                <span style={S.systemText}>{c.username} {c.text}</span>
              </div>
            ) : (
              <div key={i} style={S.commentBubble}>
                <span style={S.commentUser}>{c.username}</span>
                <span style={S.commentText}>{c.text}</span>
              </div>
            )
          ))}
          <div ref={commentsEndRef} />
        </div>
      )}

      {/* BOTTOM BAR */}
      <div style={S.bottom}>
        {isOwn ? (
          <div style={S.ownBottom}>
            {!isLiveSlide && (
              <button style={S.sendBtn} onClick={() => setShowShareSheet(true)}>
                <FaPaperPlane size={16} /><span>Send</span>
              </button>
            )}
            <button style={S.viewsBtn} onClick={() => !isLiveSlide && setShowViewers(true)}>
              <FaEye size={16} />
              <span>{isLiveSlide ? formatCount(liveViewers) : formatCount(viewsCount || viewers.length)}</span>
            </button>
            <button style={S.viewsBtn}>
              <FaThumbsUp size={16} /><span>{formatCount(likesCount)}</span>
            </button>
            {!isLiveSlide && (
              <div style={{ position: "relative" }}>
                <button style={S.iconBtn} onClick={() => setShowMenu(!showMenu)}><FaEllipsisV size={18} /></button>
                {showMenu && (
                  <>
                    <div style={S.menuOverlay} onClick={() => setShowMenu(false)} />
                    <div style={S.feedStyleMenu}>
                      <button className="feed-menu-item" style={S.feedMenuItem} onClick={handleHideFromNonFollowers}>
                        {isHidden ? "Show to everyone" : "Hide from non-followers"}
                      </button>
                      <button
                        className="feed-menu-item"
                        style={{ ...S.feedMenuItem, color: "#ff3b30", borderBottom: "none" }}
                        onClick={() => handleDelete(slide._id || slide.id)}
                      >
                        Delete Story
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {isLiveSlide && liveStatus === "live" && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {LIVE_REACTIONS.map(emoji => (
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

            <div style={S.otherBottom}>
              <input
                placeholder={isLiveSlide ? "Say something…" : "Send message..."}
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendComment()}
                style={S.input}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
              />
              <button onClick={handleLike} style={S.iconBtn}>
                <span style={S.likeWrap}>
                  <FaThumbsUp size={16} color={liked ? GOLDEN : "#fff"} />
                  <span style={{ fontSize: 13 }}>{formatCount(likesCount)}</span>
                </span>
              </button>
              {!isLiveSlide && (
                <button onClick={() => setShowShareSheet(true)} style={S.iconBtn} title="Share story">
                  <FaRegPaperPlane size={20} style={{ transform: "rotate(20deg)" }} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SHARE SHEET */}
      {showShareSheet && <StoryShareSheet storyId={slide.id} onClose={() => setShowShareSheet(false)} />}

      {/* VIEWERS SHEET */}
      {showViewers && (
        <div style={S.sheetOverlay} onClick={() => setShowViewers(false)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.sheetHeader}>
              <FaEye size={16} color="#555" />
              <span style={S.sheetTitle}>{formatCount(viewers.length)} viewers</span>
            </div>
            <div style={S.viewerList}>
              {viewers.length === 0 ? (
                <p style={S.emptyText}>No viewers yet</p>
              ) : (
                viewers.map((v, i) => (
                  <div key={v._id ?? i} style={S.viewerRow} onClick={() => { setShowViewers(false); navigate(`/profile/${v._id}`); }}>
                    <Avatar src={v.profilePic} username={v.username} size={42} />
                    <span style={S.viewerName}>{v.username}</span>
                    {/* ← CHANGED — this app's like glyph everywhere else
                        (the bottom bar's like button, both web and RN)
                        is a thumbs-up, not a heart — matching that here
                        instead of introducing a second "like" symbol. */}
                    {likedByIds.has(v._id) && <FaThumbsUp size={15} color={GOLDEN} />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StoryViewer;

const S = {
  container:      { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "#000", zIndex: 1000, display: "flex", flexDirection: "column", maxWidth: "480px", margin: "0 auto", right: 0 },
  progressWrap:   { display: "flex", gap: "3px", padding: "10px 10px 0", position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  progressBg:     { flex: 1, height: "2px", background: "rgba(255,255,255,0.35)", borderRadius: "2px", overflow: "hidden" },
  progressFill:   { height: "100%", background: "white", borderRadius: "2px", transition: "width 0.1s linear" },
  img:            { width: "100%", height: "100%", objectFit: "cover" },
  topGradient:    { position: "absolute", top: 0, left: 0, right: 0, height: "120px", background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)", zIndex: 3 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "180px", background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)", zIndex: 3 },
  header:         { position: "absolute", top: "20px", left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: "10px", padding: "0 12px" },
  headerInfo:     { display: "flex", flexDirection: "column", gap: "1px", cursor: "pointer" },
  username:       { color: "white", fontSize: "14px", fontWeight: "600" },
  timeText:       { color: "rgba(255,255,255,0.65)", fontSize: "11px" },
  closeBtn:       { background: "none", border: "none", color: "white", cursor: "pointer", marginLeft: 4 },
  navLeft:        { position: "absolute", left: 0, top: 0, width: "40%", height: "100%", zIndex: 5, cursor: "pointer" },
  navRight:       { position: "absolute", right: 0, top: 0, width: "60%", height: "100%", zIndex: 5, cursor: "pointer" },
  bottom:         { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "0 14px 32px" },
  ownBottom:      { display: "flex", alignItems: "center", gap: "10px" },
  otherBottom:    { display: "flex", alignItems: "center", gap: "10px" },
  input:          { flex: 1, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "24px", padding: "10px 16px", color: "white", outline: "none", fontSize: 14 },
  iconBtn:        { background: "none", border: "none", color: "white", cursor: "pointer", flexShrink: 0 },
  likeWrap:       { display: "flex", alignItems: "center", gap: "5px", color: "white" },
  sendBtn:        { display: "flex", alignItems: "center", gap: "8px", background: GOLDEN, border: "none", borderRadius: "24px", padding: "10px 18px", color: "white", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  viewsBtn:       { display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "24px", padding: "10px 18px", color: "white", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  feedStyleMenu:  { position: "absolute", right: 0, bottom: "50px", background: "#fff", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 20, minWidth: 210, overflow: "hidden", border: "0.5px solid #eee" },
  feedMenuItem:   { display: "block", width: "100%", padding: "12px 16px", border: "none", background: "#fff", textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#222", borderBottom: "0.5px solid #f0f0f0" },
  menuOverlay:    { position: "fixed", inset: 0, zIndex: 19 },
  sheetOverlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 20, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet:          { background: "#fff", width: "100%", maxWidth: "480px", borderRadius: "20px 20px 0 0", padding: "12px 16px 32px", maxHeight: "60vh", overflowY: "auto" },
  sheetHandle:    { width: "36px", height: "4px", background: "#ddd", borderRadius: "4px", margin: "0 auto 14px" },
  sheetHeader:    { display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", paddingBottom: "12px", borderBottom: "1px solid #f0f0f0" },
  sheetTitle:     { fontSize: "15px", fontWeight: "700", color: "#111" },
  viewerList:     { display: "flex", flexDirection: "column", gap: "2px" },
  viewerRow:      { display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid #f8f8f8", cursor: "pointer" },
  viewerName:     { flex: 1, fontSize: "14px", fontWeight: "600", color: "#111" },
  viewerTime:     { fontSize: "12px", color: "#999" },
  commentsFeed:   { position: "absolute", bottom: 110, left: 14, right: 14, zIndex: 9, display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto", pointerEvents: "none" },
  commentBubble:  { background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", borderRadius: "16px", padding: "6px 12px", display: "flex", gap: "6px", alignItems: "baseline", maxWidth: "85%", alignSelf: "flex-start" },
  commentUser:    { color: GOLDEN, fontSize: "12px", fontWeight: "700", flexShrink: 0 },
  commentText:    { color: "#fff", fontSize: "13px", wordBreak: "break-word" },
  systemBubble:   { background: "rgba(0,0,0,0.35)", borderRadius: "12px", padding: "4px 10px", alignSelf: "center", maxWidth: "88%", display: "flex", alignItems: "center", gap: 6 },
  systemText:     { color: "rgba(255,255,255,0.65)", fontSize: "11.5px", fontStyle: "italic" },
  deniedWrap:     { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 32px", textAlign: "center" },
  deniedTitle:    { color: "#fff", fontSize: 17, fontWeight: 700, margin: "10px 0 0" },
  deniedText:     { color: "rgba(255,255,255,0.6)", fontSize: 14, margin: 0, lineHeight: 1.5 },
  deniedBtn:      { marginTop: 16, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "10px 28px", borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  shareSearchInput:     { width: "100%", border: "none", outline: "none", fontSize: 14, color: "#111", background: "#f2f2f2", borderRadius: 10, padding: "10px 14px", boxSizing: "border-box" },
  shareCheckbox:        { width: 22, height: 22, borderRadius: "50%", border: "2px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0, marginLeft: "auto" },
  shareCheckboxChecked: { background: GOLDEN, border: "none" },
  shareSendBtn:         { width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: GOLDEN, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  emptyText:      { textAlign: "center", color: "#aaa", padding: "20px 0", margin: 0, fontSize: 14 },
};