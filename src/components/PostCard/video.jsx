import { useState, useRef, useEffect, useCallback } from "react";
import {
  FaThumbsUp, FaRegThumbsUp, FaRegComment, FaEllipsisV,
  FaVolumeMute, FaVolumeUp, FaPause, FaPlay,
  FaBookmark, FaRegBookmark, FaEye, FaDownload, FaHeart, FaRegHeart,
} from "react-icons/fa";
import { FiX, FiSearch, FiUsers } from "react-icons/fi";
import { IoPaperPlane } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import socket from "../../sockets/sockets";
import CommentSection from "./CommentSection";
import ShareSheet from "./ShareSheet.jsx";
// ── CHANGED — same follow-state fix applied to Home.jsx / Explore.jsx /
// ExploreReels.jsx: a local FollowButton/useFollowState driven by
// myFollowingIds (kept in sync with the server via
// fetchProfileAndFollowing in Videopost() below), instead of the
// shared, self-contained FollowButton.jsx whose internal store never
// got reconciled with the server on this page — the same stale-state
// class of bug that caused "Follow"/"Requested" to get stuck and
// unfollow to 400 elsewhere in the app.
import { useFollowStore, initFollowStore, addFollowing, removeFollowing } from "../../pages/Profile/usefollowState.jsx";
import {
  getStoryRuntime,
  subscribeStory,
  pushComment,
  setRuntimeComments,
  setLikeState,
} from "../state/syncstorystore.js";
import { isPostSaved, toggleSavedPost, subscribeSavedPosts } from "../state/savedPostsStore.js";
const API = import.meta.env.VITE_API_URL;
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
  const units = [
    { value: 1_000_000_000, symbol: "B" },
    { value: 1_000_000, symbol: "M" },
    { value: 1_000, symbol: "K" },
  ];
  for (const u of units) {
    if (n >= u.value) {
      const scaled = n / u.value;
      const rounded = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1);
      return `${rounded}${u.symbol}`;
    }
  }
  return `${n}`;
}

function shareCount(shares) {
  if (Array.isArray(shares)) return shares.length;
  if (typeof shares === "number") return shares;
  return 0;
}

// ── The likers/viewers endpoints can return the same user more than once
// (e.g. multiple view events per viewer). Dedupe by _id before it hits
// state so list keys stay unique and React doesn't warn/duplicate rows.
function dedupeUsers(users) {
  if (!Array.isArray(users)) return [];
  const seen = new Set();
  return users.filter(u => {
    const id = u?._id ?? u;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ── One-time global keyframes for the double-tap "like burst" animation.
// Guarded so it's only injected once even with ExploreReels.jsx and
// UserProfileVideoPost.jsx mounted in the same app.
if (typeof document !== "undefined" && !document.getElementById("postcard-like-burst-keyframes")) {
  const styleTag = document.createElement("style");
  styleTag.id = "postcard-like-burst-keyframes";
  styleTag.innerHTML = `
    @keyframes likeBurstPop {
      0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
      30%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
      45%  { transform: translate(-50%, -50%) scale(0.95); opacity: 1; }
      65%  { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
  `;
  document.head.appendChild(styleTag);
}

function Avatar({ src, username, size = 35, style: extra = {}, onClick }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, cursor: onClick ? "pointer" : "default" };
  if (src) return <img src={src} alt={username} style={{ ...base, ...extra }} onClick={onClick} />;
  return (
    <div style={{
      ...base, ...extra, background: "#444", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: "bold", fontSize: size * 0.4,
    }} onClick={onClick}>
      {letter}
    </div>
  );
}

// ── Mutual/social-proof likes line — "Liked by X and N others", tappable
// to open the full likers sheet. Reads whatever order getPostLikers
// already returns likedByUsers in — that endpoint sorts people the
// viewer follows to the front, so likedByUsers[0] is already a
// mutual/followed liker whenever one exists.
function LikesSummary({ likedByUsers, likesCount, hideLikeCount, isOwner, onOpen }) {
  if (hideLikeCount && !isOwner) return null;
  if (!likesCount) return null;
  const first = likedByUsers?.[0];
  const others = likesCount - (first ? 1 : 0);

  return (
    <p style={S.likesSummary} onClick={onOpen}>
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

function ActionBtn({ icon, onClick }) {
  return (
    <button style={S.actionBtn} onClick={onClick}>
      {icon}
    </button>
  );
}

/* ───────────────────────── follow button — mirrors Home.jsx / Explore.jsx / ExploreReels.jsx's local pattern ───────────────────────── */
// followState is derived from myFollowingIds, which Videopost() keeps in
// sync with the server (see fetchProfileAndFollowing there).
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
          onFollowChange?.(authorId, true);
        }
      } else if (followState === "requested") {
        const res = await fetch(`${API}/auth/cancel-follow/${authorId}`, { method: "DELETE", headers: authHeaders() });
        const data = await res.json();
        if (!data.success) return;
        setFollowState("none");
        unfollow(authorId);
        onFollowChange?.(authorId, false);
        socket.emit("unfollowUser", { toUserId: authorId });
      } else if (followState === "following") {
        if (!window.confirm("Unfollow this user?")) return;
        const res = await fetch(`${API}/auth/unfollow/${authorId}`, { method: "DELETE", headers: authHeaders() });
        const data = await res.json();
        if (!data.success) return;
        setFollowState("none");
        unfollow(authorId);
        onFollowChange?.(authorId, false);
        socket.emit("unfollowUser", { toUserId: authorId });
      }
    } catch (err) { console.log(err); }
  };

  const followLabel = followState === "following" ? "Following" : followState === "requested" ? "Requested" : "Follow";

  return { followState, handleFollowBtn, followLabel };
}

function FollowButton({ authorId, isPrivate, isOwner, isBlocked, username, onFollowChange, myFollowingIds, variant = "pill", style: extraStyle = {} }) {
  const { followState, handleFollowBtn, followLabel } =
    useFollowState(authorId, isPrivate, onFollowChange, myFollowingIds);

  if (isOwner || isBlocked || !authorId) return null;

  const pillStyle = {
    padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    border: followState !== "none" ? "1px solid #ddd" : "none",
    background: followState !== "none" ? "#f0f0f0" : "rgb(234,182,118)",
    color: followState !== "none" ? "#333" : "#fff",
    cursor: "pointer",
  };

  const outlineStyle = {
    border: "1px solid #fff",
    color: "#fff",
    background: followState !== "none" ? "rgba(255,255,255,0.15)" : "transparent",
    padding: "6px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };

  const baseStyle = variant === "outline" ? outlineStyle : pillStyle;

  return (
    <button onClick={handleFollowBtn} style={{ ...baseStyle, ...extraStyle }}>
      {followLabel}
    </button>
  );
}

function CaptionText({ text, limit = 100 }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const isLong = text.length > limit;

  if (!isLong || expanded) {
    return (
      <p style={S.caption}>
        {text}
        {isLong && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={S.moreBtn}
          >
            {" "}less
          </span>
        )}
      </p>
    );
  }

  return (
    <p style={S.caption}>
      {text.slice(0, limit).trimEnd()}...
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        style={S.moreBtn}
      >
        {" "}more
      </span>
    </p>
  );
}

// ── Co-author names (Instagram-style, each name independently clickable) ──
function CoAuthorNames({ people, onNavigate }) {
  const NameSpan = ({ p }) => (
    <span
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onNavigate(p._id); }}
    >
      {p.username || "Unknown"}
    </span>
  );

  if (people.length === 1) return <NameSpan p={people[0]} />;

  if (people.length === 2) {
    return (
      <>
        <NameSpan p={people[0]} /> and <NameSpan p={people[1]} />
      </>
    );
  }

  if (people.length <= 4) {
    const head = people.slice(0, -1);
    const last = people[people.length - 1];
    return (
      <>
        {head.map((p, i) => (
          <span key={p._id ?? i}>
            <NameSpan p={p} />
            {i < head.length - 1 ? ", " : " and "}
          </span>
        ))}
        <NameSpan p={last} />
      </>
    );
  }

  const shown = people.slice(0, 3);
  const remaining = people.length - shown.length;
  return (
    <>
      {shown.map((p, i) => (
        <span key={p._id ?? i}>
          <NameSpan p={p} />
          {i < shown.length - 1 ? ", " : " and "}
        </span>
      ))}
      {remaining} other{remaining > 1 ? "s" : ""}
    </>
  );
}

// ── Co-author header for the bottom bar — stacked avatars + names when
// there are accepted collaborators, single avatar+name otherwise. NEW —
// this file previously only ever showed the single author, with no way
// to represent collaborators visually.
function CoAuthorHeader({ author, acceptedCollaborators, onNavigate }) {
  const people = [author, ...acceptedCollaborators.map((c) => c.user)].filter(Boolean);

  if (people.length <= 1) {
    return (
      <>
        <div onClick={(e) => onNavigate(author?._id, e)} style={{ cursor: "pointer" }}>
          <Avatar src={author?.profilePic} username={author?.username} size={42} style={{ border: "2px solid #fff" }} />
        </div>
        <span
          style={{ ...S.username, cursor: "pointer" }}
          onClick={(e) => onNavigate(author?._id, e)}
        >
          {author?.username}
        </span>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexShrink: 0 }}>
        {people.slice(0, 3).map((p, i) => (
          <Avatar
            key={p._id ?? i}
            src={p.profilePic}
            username={p.username}
            size={42}
            style={i === 0 ? { border: "2px solid #fff" } : { marginLeft: "-16px", border: "2px solid #fff" }}
            onClick={(e) => onNavigate(p._id, e)}
          />
        ))}
      </div>
      <span style={S.username}>
        <CoAuthorNames people={people} onNavigate={(id) => onNavigate(id)} />
      </span>
    </>
  );
}

// ── Tags Row — NEW to this file (previously missing entirely). Editable
// for the owner, read-only for everyone else; tapping a tag navigates to
// that username's profile either way — being the owner doesn't disable
// navigation, it only adds the edit/remove controls.
function TagsRow({ tags, postId, isOwner, onTagsUpdate }) {
  const [tagInput,  setTagInput]  = useState("");
  const [showInput, setShowInput] = useState(false);
  const navigate = useNavigate();

  const addTag = async () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (!t) return;
    try {
      const res  = await fetch(`${API}/auth/add-tag/${postId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ tag: t }) });
      const data = await res.json();
      if (data.success) { onTagsUpdate(data.tags); setTagInput(""); setShowInput(false); }
    } catch {}
  };

  const removeTag = async (tag) => {
    try {
      const res  = await fetch(`${API}/auth/remove-tag/${postId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ tag }) });
      const data = await res.json();
      if (data.success) onTagsUpdate(data.tags);
    } catch {}
  };

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

  if (!tags?.length && !isOwner) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
      {tags?.map(t => (
        <div key={t} style={S.tagChip}>
          <span style={{ cursor: "pointer" }} onClick={() => goToTaggedUser(t)}>#{t}</span>
          {isOwner && (
            <FiX
              size={10}
              style={{ cursor: "pointer", marginLeft: 3 }}
              onClick={(e) => { e.stopPropagation(); removeTag(t); }}
            />
          )}
        </div>
      ))}
      {isOwner && (
        showInput ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTag()}
              placeholder="tag..." autoFocus
              style={{ border: "1px solid rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.3)", color: "#fff", borderRadius: 20, padding: "3px 10px", fontSize: 12, outline: "none", width: 80 }}
            />
            <button onClick={addTag} style={S.addTagBtn}>+</button>
            <FiX size={12} style={{ cursor: "pointer", color: "#ddd" }} onClick={() => setShowInput(false)} />
          </div>
        ) : <button onClick={() => setShowInput(true)} style={S.addTagBtn}>+ tag</button>
      )}
    </div>
  );
}

// ── Collaborators Row — NEW to this file (previously missing entirely).
// Owner-only "invite more collaborators" search. A previously-declined
// collaborator can be found again and re-invited (matches the backend's
// addCollaborator, which resets a declined entry back to "pending"
// instead of rejecting the request).
function CollabRow({ collaborators, postId, isOwner, onCollabUpdate }) {
  const [search,     setSearch]     = useState("");
  const [results,    setResults]    = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const timer = useRef(null);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(timer.current);
    if (!val.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res  = await fetch(`${API}/auth/search?q=${val}`, { headers: authHeaders() });
        if (!res.ok) { setResults([]); return; }
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.users || []);
      } catch (err) {
        console.error("[collab-search] failed:", err.message);
      }
    }, 400);
  };

  const addCollab = async (userId) => {
    try {
      const res  = await fetch(`${API}/auth/add-collaborator/${postId}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ userId }) });
      const data = await res.json();
      if (data.success) { onCollabUpdate(data.collaborators); setSearch(""); setResults([]); setShowSearch(false); }
      else if (data.message) { alert(data.message); }
    } catch {}
  };

  if (!isOwner) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {showSearch ? (
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", border: "1px solid rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "6px 10px" }}>
            <FiSearch size={12} color="#ddd" />
            <input
              value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Invite a collaborator..." autoFocus
              style={{ border: "none", outline: "none", fontSize: 13, flex: 1, background: "transparent", color: "#fff" }}
            />
            <FiX size={12} style={{ cursor: "pointer", color: "#ddd" }} onClick={() => { setShowSearch(false); setSearch(""); setResults([]); }} />
          </div>
          {results.length > 0 && (
            <div style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, marginTop: 4, overflow: "hidden" }}>
              {results
                .filter(u => !collaborators.some(c => c.user?._id === u._id && c.status !== "declined"))
                .map(u => {
                  const declined = collaborators.some(c => c.user?._id === u._id && c.status === "declined");
                  return (
                    <div key={u._id} onClick={() => addCollab(u._id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                      <Avatar src={u.profilePic} username={u.username} size={28} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{u.username}</span>
                      {declined && <span style={{ fontSize: 11, color: "#999", marginLeft: "auto" }}>declined — invite again</span>}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setShowSearch(true)} style={{ ...S.addTagBtn, display: "flex", alignItems: "center", gap: 4 }}>
          <FiUsers size={11} /> + invite collaborator
        </button>
      )}
      {collaborators.some(c => c.status === "pending") && (
        <p style={{ fontSize: 11, color: "#bbb", margin: "8px 0 0" }}>
          {collaborators.filter(c => c.status === "pending").map(c => c.user?.username).join(", ")} invited — waiting for them to accept.
        </p>
      )}
    </div>
  );
}

// ── STORY PREVIEW — identical to ExploreReels.jsx's ReelStoryPreview.
function ReelStoryPreview({ story, onClose, navigate }) {
  const currentUser   = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();

  const [slideIndex,   setSlideIndex]   = useState(0);
  const [liked,        setLiked]        = useState(false);
  const [likesCount,   setLikesCount]   = useState(0);
  const [viewers,      setViewers]      = useState([]);
  const [isHidden,     setIsHidden]     = useState(false);
  const [comment,      setComment]      = useState("");
  const [showMenu,     setShowMenu]     = useState(false);
  const [showViewers,  setShowViewers]  = useState(false);
  const [liveComments, setLiveComments] = useState([]);
  const [accessDenied, setAccessDenied] = useState(null);
  const menuRef = useRef(null);
  const commentsEndRef = useRef(null);

  const slides = story?.slides || [];
  const slide  = slides[slideIndex] || {};
  const isOwn  = !!story?.isOwn;
  const isLiveSlide = slide?.type === "live" || slide?.isLive === true;
  const isVideo = slide.type === "video" || slide.image?.includes(".mp4") || slide.image?.includes("video");
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

  useEffect(() => { setSlideIndex(0); }, [story?.id]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    const onComment = (payload) => pushComment(slide.id, payload);
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
      <div style={rp.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ ...rp.card, alignItems: "center", justifyContent: "center", display: "flex" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 24px", textAlign: "center" }}>
            <Avatar src={story.userProfile} username={story.username} size={56} />
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: "8px 0 0" }}>Follow to view this story</p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
              Only {story.username}'s followers can see this story.
            </p>
            <button onClick={onClose} style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "8px 22px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={rp.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={rp.card}>

        {slides.length > 1 && (
          <div style={rp.progressWrap}>
            {slides.map((_, i) => (
              <div key={i} style={rp.progressBg}>
                <div style={{ ...rp.progressFill, width: i <= slideIndex ? "100%" : "0%" }} />
              </div>
            ))}
          </div>
        )}

        <div style={rp.header}>
          <Avatar src={story.userProfile} username={story.username} size={28} />
          <span style={rp.username}>{story.username}</span>
          <button onClick={onClose} style={rp.closeBtn}><FiX size={18} /></button>
        </div>

<div style={rp.media}>
  {isLiveSlide ? (
    liveStatus === "live" ? (
      <video ref={liveVideoRef} autoPlay playsInline style={rp.mediaEl} />
    ) : (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "#fff" }}>
        {liveStatus === "denied" && (
          <>
            <span style={{ fontSize: 32 }}>🔒</span>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Follow to watch</p>
          </>
        )}
        {liveStatus === "ended" && (
          <>
            <span style={{ fontSize: 32 }}>📺</span>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Live has ended</p>
          </>
        )}
        {(liveStatus === "connecting" || !liveStatus) && (
          <>
            <div style={{ width: 30, height: 30, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Connecting to live…</p>
          </>
        )}
      </div>
    )
  ) : slide.image ? (
            isVideo
              ? <video key={slide.image} src={slide.image} style={rp.mediaEl} autoPlay playsInline loop muted />
              : <img src={slide.image} alt="story" style={rp.mediaEl} />
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
          color: t.color || "#fff", fontSize: t.fontSize || 18, fontWeight: 700,
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
          borderRadius: 18, padding: "4px 9px", fontSize: 11, fontWeight: 700,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)", pointerEvents: "auto", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        @{m.username || "user"}
      </div>
    ))}
  </div>
)}

{/* ── NEW: repost attribution ── */}
{!isLiveSlide && slide.repostAttribution?.username && (
  <div
    onClick={(e) => { e.stopPropagation(); if (!slide.repostAttribution.user) return; onClose(); navigate(`/profile/${slide.repostAttribution.user}`); }}
    style={{
      position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", zIndex: 4,
      display: "flex", alignItems: "center", gap: 5,
      background: "rgba(0,0,0,0.55)", borderRadius: 14, padding: "3px 8px 3px 3px", cursor: "pointer",
    }}
  >
    {slide.repostAttribution.profilePic ? (
      <img src={slide.repostAttribution.profilePic} alt="" style={{ width: 15, height: 15, borderRadius: "50%", objectFit: "cover" }} />
    ) : (
      <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700 }}>
        {slide.repostAttribution.username[0]?.toUpperCase()}
      </div>
    )}
    <span style={{ color: "#fff", fontSize: 10, fontWeight: 600 }}>Story by @{slide.repostAttribution.username}</span>
  </div>
)}
          {slides.length > 1 && !isLiveSlide && (
            <>
              <div style={rp.navLeft} onClick={handlePrev} />
              <div style={rp.navRight} onClick={handleNext} />
            </>
          )}

          {liveComments.length > 0 && (
            <div style={rp.commentsFeed}>
              {liveComments.map((c, i) => (
                <div key={i} style={rp.commentBubble}>
                  <span style={rp.commentUser}>{c.username}</span>
                  <span style={rp.commentText}>{c.text}</span>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>

        {isOwn ? (
          <div style={rp.ownBar}>
            <button onClick={() => setShowViewers(true)} style={rp.statPill}>
              <span>{viewers.length} views</span>
            </button>
            <div style={rp.statPill}>
              <FaHeart size={13} /><span>{formatCount(likesCount)}</span>
            </div>
            <div style={{ position: "relative", marginLeft: "auto" }} ref={menuRef}>
              <button onClick={() => setShowMenu(v => !v)} style={rp.iconBtn}>
                <FaEllipsisV size={16} />
              </button>
              {showMenu && (
                <div style={{ ...rp.menu, bottom: 34, right: 0 }}>
                  <button onClick={handleHideFromNonFollowers} style={rp.menuItem}>
                    {isHidden ? "Show to everyone" : "Hide from non-followers"}
                  </button>
                  <button onClick={handleDelete} style={{ ...rp.menuItem, color: "#e53935", borderBottom: "none" }}>
                    Delete Story
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={rp.viewerBar}>
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSendComment()}
              placeholder="Send message..."
              style={rp.input}
            />
            <button onClick={handleLike} style={rp.iconBtn}>
              {liked ? <FaHeart size={17} color="#e53935" /> : <FaRegHeart size={17} color="#fff" />}
            </button>
            <button onClick={handleSendComment} disabled={!comment.trim()} style={{ ...rp.iconBtn, opacity: comment.trim() ? 1 : 0.4 }}>
              <IoPaperPlane size={16} color="#fff" />
            </button>
          </div>
        )}
      </div>

      {showViewers && (
        <div style={rp.viewersOverlay} onClick={() => setShowViewers(false)}>
          <div style={rp.viewersBox} onClick={e => e.stopPropagation()}>
            <div style={rp.viewersHandle} />
            <div style={rp.viewersHeader}>{viewers.length} viewers</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {viewers.length === 0 ? (
                <p style={{ textAlign: "center", color: "#aaa", padding: "20px 0" }}>No viewers yet</p>
              ) : viewers.map((v, i) => (
                <div key={v._id ?? i} onClick={() => goToViewerProfile(v._id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer" }}>
                  <Avatar src={v.profilePic} username={v.username} size={40} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{v.username}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Videopost({ p = {}, hasNavbar = true, onBlock, onSheetOpen, onDeleted, myFollowingIds: myFollowingIdsProp, onFollowChange: onFollowChangeProp }) {
  const navigate    = useNavigate();
  const currentUser = safeParseUser();
  const MY_ID       = (currentUser?._id || currentUser?.id)?.toString();

  const authorId  = p?.author?._id || p?.author;
  const isPrivate = p?.author?.isPrivate ?? false;
  const isOwner   = MY_ID === p?.author?._id?.toString() || MY_ID === p?.author?.toString();

  // ── per-post visibility/interaction flags set at creation time
  // (CreateVideoPost's "Advanced settings"). Owner always sees/can do
  // everything regardless of these; other viewers get the restricted view.
  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableDownload  = !!p?.disableDownload;
  const disableComments  = !!p?.disableComments;
  const canDownload      = !disableDownload || isOwner;
  const canComment       = !disableComments || isOwner;

  // ── ALL STATES AT TOP ──────────────────────────────────────────────────────
  const [liked,        setLiked]        = useState(false);
  const [likesCount,   setLikesCount]   = useState(p?.likes?.length || 0);
  const [likedByUsers, setLikedByUsers] = useState([]);
 const [saved,        setSaved]        = useState(() => isPostSaved(p?._id));
  const [paused,       setPaused]       = useState(false);
  const [muted,        setMuted]        = useState(false);
  const [isVisible,    setIsVisible]    = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [flashPause,   setFlashPause]   = useState(false);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const [isBlocked,    setIsBlocked]    = useState(false);
  const [isHidden,     setIsHidden]     = useState(p?.isHiddenFromNonFollowers || false);
  const [showLikers,   setShowLikers]   = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare,    setShowShare]    = useState(false);
  const [comments, setComments] = useState(p?.comments ?? []);
  const [isNotInterested, setIsNotInterested] = useState(p?.isNotInterested || false);
  const [removedFromView, setRemovedFromView] = useState(false);

  const [commentText,  setCommentText]  = useState("");
  const [likerSearch,  setLikerSearch]  = useState("");

  // ← tags/collaborators — NEW to this file
  const [tags, setTags] = useState(p?.tags ?? []);
  const [collaborators, setCollaborators] = useState(p?.collaborators ?? []);

  const [downloadCount, setDownloadCount] = useState(p?.downloadsCount || p?.downloads?.length || 0);
const [sharesCount,   setSharesCount]   = useState(shareCount(p?.shares) ?? p?.sharesCount ?? 0);

  const [viewsCount,    setViewsCount]    = useState(p?.views?.length || 0);
  const [viewedByUsers, setViewedByUsers] = useState([]);
  const [showViews,     setShowViews]     = useState(false);
  const [viewerSearch,  setViewerSearch]  = useState("");
  const hasRecordedView = useRef(false);

  // ── CHANGED — myFollowingIds / onFollowChange can now be supplied by a
  // parent that already fetched them once (see VideoPage.jsx, which
  // hoists this the same way ExploreReels.jsx hoists it for its list of
  // ExploreReelCard items — avoids one /auth/profile fetch PER visible
  // card). If no parent supplies them (e.g. Videopost used standalone
  // somewhere else), it falls back to fetching for itself, same as
  // before.
  const followStore = useFollowStore();
  const myFollowingIds = myFollowingIdsProp ?? followStore.followingIds;

  useEffect(() => {
    if (myFollowingIdsProp) return; // parent already supplies fresh data
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
    fetchProfileAndFollowing();
  }, [myFollowingIdsProp]);

  const handleFollowChange = onFollowChangeProp ?? ((targetAuthorId, followed) => {
    if (followed) addFollowing(targetAuthorId);
    else removeFollowing(targetAuthorId);
  });

  // ← story state for the avatar under the ⋮ menu — only rendered when
  // hasStory is true, matching UserProfileVideoPost.jsx/ExploreReels.jsx.
  const [story, setStory] = useState(null);
  const [showStoryPreview, setShowStoryPreview] = useState(false);
  const hasStory  = !!story && story.slides.length > 0;

  const videoRef     = useRef(null);
  const containerRef = useRef(null);
  const menuRef      = useRef(null);
  const flashTimer   = useRef(null);
  const tapTimeoutRef = useRef(null);
  const lastTapRef    = useRef(0);
  const sheetRef     = useRef(null);
  const likersRef    = useRef(null);
  const viewersRef   = useRef(null);
  const startY       = useRef(0);

  const username   = p?.author?.username || "user";
  useEffect(() => {
    if (!p?._id) return;

    socket.emit("joinPost", p._id);

    return () => {
      socket.emit("leavePost", p._id);
    };
  }, [p?._id]);
  const profilePic = p?.author?.profilePic;
  const caption    = p?.caption || p?.desc || "";

  const acceptedCollaborators = (collaborators || []).filter(c => c.status === "accepted");
  const myCollabEntry = acceptedCollaborators.find(
    c => (c.user?._id ?? c.user)?.toString() === MY_ID
  );

  // ── fetch likers ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!p?._id) return;

    const fetchLikers = async () => {
      try {
        const res  = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setLikedByUsers(dedupeUsers(data.likedBy ?? []));
          setLikesCount(data.totalLikes ?? 0);
          setLiked((data.likedBy ?? []).some(u => u._id === MY_ID));
        }
      } catch {}
    };
    fetchLikers();

    const fetchComments = async () => {
      try {
        const res  = await fetch(`${API}/auth/get-comment/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setComments(data.comments);
      } catch {}
    };
    fetchComments();

    const fetchViews = async () => {
      try {
        const res  = await fetch(`${API}/auth/views/posts/${p._id}/views`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok) {
          setViewedByUsers(dedupeUsers(data.views ?? []));
          setViewsCount((data.views ?? []).length);
        }
      } catch {}
    };
    fetchViews();


// ← NEW: refresh collaborators on every mount, so an acceptance/removal
// that happened while this card was unmounted shows up immediately.
const fetchCollaborators = async () => {
  try {
    const res  = await fetch(`${API}/auth/get-post/${p._id}`, { headers: authHeaders() });
    const data = await res.json();
    if (data.success) setCollaborators(data.post.collaborators ?? []);
  } catch {}
};
fetchCollaborators();
    const onLikes        = ({ totalLikes, likedBy }) => { setLikesCount(totalLikes); if (likedBy) { setLikedByUsers(dedupeUsers(likedBy)); setLiked(likedBy.some(u => u._id === MY_ID)); } };
    const onNewComment   = ({ comment }) => setComments(prev => prev.some(c => c._id === comment._id) ? prev : [...prev, comment]);
    const onDelComment   = ({ commentId }) => setComments(prev => prev.filter(c => c._id !== commentId));
    const onViews        = ({ totalViews }) => setViewsCount(totalViews);
    const onPostDeletedForMe = ({ postId }) => {
      if (postId === p._id) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      }
    };

    // ← NEW: keep collaborators in sync live, same as ExploreReels.jsx
    const onCollabResponded = ({ postId }) => {
      if (postId !== p._id) return;
      fetch(`${API}/auth/get-posts/${authorId}`, { headers: authHeaders() })
        .then(res => res.json())
        .then(data => {
          if (!data.success) return;
          const updated = data.posts.find(post => post._id === p._id);
          if (updated) setCollaborators(updated.collaborators ?? []);
        })
        .catch(() => {});
    };
    const onCollabRemoved = ({ postId, userId }) => {
      if (postId !== p._id) return;
      setCollaborators(prev => prev.filter(c => (c.user?._id ?? c.user)?.toString() !== userId));
    };
const onShareCount    = ({ postId, totalShares }) => { if (postId === p._id && totalShares != null) setSharesCount(totalShares); };
    socket.on(`post:${p._id}:likes`,          onLikes);
    socket.on(`post:${p._id}:newComment`,     onNewComment);
    socket.on(`post:${p._id}:commentDeleted`, onDelComment);
    socket.on("commentDeleted",               onDelComment);
    socket.on(`post:${p._id}:views`,          onViews);
    socket.on("postDeleted",                  onPostDeletedForMe);
    socket.on("collabResponded",              onCollabResponded);
    socket.on("collabRemoved",                onCollabRemoved);
    socket.on("postShared",                   onShareCount);
    return () => {
      socket.off(`post:${p._id}:likes`,          onLikes);
      socket.off(`post:${p._id}:newComment`,     onNewComment);
      socket.off(`post:${p._id}:commentDeleted`, onDelComment);
      socket.off("commentDeleted",               onDelComment);
      socket.off(`post:${p._id}:views`,          onViews);
      socket.off("postDeleted",                  onPostDeletedForMe);
      socket.off("collabResponded",              onCollabResponded);
      socket.off("collabRemoved",                onCollabRemoved);
      socket.off("postShared",                   onShareCount);
    };
  }, [p?._id, authorId, MY_ID]);

  const fetchStory = useCallback(async () => {
    if (!authorId) { setStory(null); return; }
    try {
      const res  = await fetch(`${API}/stories/get-user-stories/${authorId}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success || !data.stories?.length) { setStory(null); return; }
      setStory({
        id: authorId.toString(),
        username,
        userProfile: profilePic || "",
        isOwn: authorId.toString() === MY_ID,
slides: data.stories.map((s) => ({
  id: s._id,
  image: s.media?.url || "",
  type: s.media?.type || s.storyType,
  likes: s.likesCount || 0,
  isLive: s.storyType === "live",
  liveRoomId: s.liveRoomId || null,
  authorId: authorId.toString(),
  isHiddenFromNonFollowers: s.isHiddenFromNonFollowers || false,
  viewedByMe: !!s.viewedByMe,
  textOverlays: s.textOverlays || [],
  mentions: s.mentions || [],
  repostAttribution: s.repostAttribution || null,
})),
      });
    } catch {
      setStory(null);
    }
  }, [authorId, username, profilePic, MY_ID]);

  useEffect(() => { fetchStory(); }, [fetchStory]);

  useEffect(() => {
    if (!authorId) return;
    const aidStr = authorId.toString();
    const handler = (payload) => {
      const aid = payload?.authorId;
      if (!aid || aid === aidStr) fetchStory();
    };
    socket.on("storyAdded",             handler);
    socket.on("storyDeleted",           handler);
    socket.on("storyVisibilityChanged", handler);
    socket.on("liveStoryEnded",         handler);
    socket.on("someoneLive",            handler);
    return () => {
      socket.off("storyAdded",             handler);
      socket.off("storyDeleted",           handler);
      socket.off("storyVisibilityChanged", handler);
      socket.off("liveStoryEnded",         handler);
      socket.off("someoneLive",            handler);
    };
  }, [authorId, fetchStory]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => setIsVisible(e.isIntersecting),
      { threshold: 0.6 }
    );
    if (containerRef.current) obs.observe(containerRef.current);
    return () => { if (containerRef.current) obs.unobserve(containerRef.current); };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!isVisible) { v.pause(); v.currentTime = 0; setPaused(false); return; }
    paused ? v.pause() : v.play().catch(() => {});
  }, [paused, muted, isVisible]);

  useEffect(() => {
    if (!isVisible || !p?._id || hasRecordedView.current) return;
    hasRecordedView.current = true;
    (async () => {
      try {
        await fetch(`${API}/auth/views/posts/${p._id}/views`, {
          method: "POST", headers: authHeaders(),
        });
      } catch {}
    })();
  }, [isVisible, p?._id]);

  useEffect(() => {
    const anySheetOpen = showLikers || showComments || showShare || showViews || showStoryPreview;
    document.body.style.overflow = anySheetOpen ? "hidden" : "auto";
    onSheetOpen?.(anySheetOpen);
    return () => { document.body.style.overflow = "auto"; };
  }, [showLikers, showComments, showShare, showViews, showStoryPreview]);

  useEffect(() => {
    if (showComments) {
      document.body.classList.add("comments-open");
    } else {
      document.body.classList.remove("comments-open");
    }
    return () => document.body.classList.remove("comments-open");
  }, [showComments]);

useEffect(() => {
    const unsub = subscribeSavedPosts((postId, savedState) => {
      if (postId === p?._id) setSaved(savedState);
    });
    return unsub;
  }, [p?._id]);

  const toggleSave = () => {
    toggleSavedPost(p);
  };

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e, ref) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0 && ref.current) ref.current.style.transform = `translateY(${diff}px)`;
  };
  const handleTouchEnd = (e, type, ref) => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 120) {
      if (type === "likers")  { setShowLikers(false); setLikerSearch(""); }
      if (type === "viewers") { setShowViews(false); setViewerSearch(""); }
      if (type === "comments") setShowComments(false);
    } else {
      if (ref.current) ref.current.style.transform = "translateY(0)";
    }
  };

  // ── core like toggle, split so double-tap can call it directly ──────────
  const performToggleLike = async () => {
    try {
      const res  = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikesCount(data.totalLikes);
        if (data.likedBy) setLikedByUsers(dedupeUsers(data.likedBy));
      }
    } catch (err) { console.log(err); }
  };

  const handleToggleLike = (e) => {
    e.stopPropagation();
    performToggleLike();
  };

  const triggerLikeBurst = () => {
    if (!liked) performToggleLike(); // double-tap only LIKES, never unlikes
    setShowLikeBurst(true);
    setTimeout(() => setShowLikeBurst(false), 700);
  };

  // ── Single tap = play/pause. Double tap = like, with a heart/thumb
  // burst — same gesture used everywhere else in the app.
  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      clearTimeout(tapTimeoutRef.current);
      lastTapRef.current = 0;
      triggerLikeBurst();
      return;
    }
    lastTapRef.current = now;
    tapTimeoutRef.current = setTimeout(() => {
      setPaused(prev => !prev);
      setFlashPause(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashPause(false), 500);
    }, 280);
  };

  const goToProfile = (id, e) => { e?.stopPropagation(); if (id) navigate(`/profile/${id}`); };

  const handleAvatarClick = (e) => {
    e?.stopPropagation();
    if (hasStory) setShowStoryPreview(true);
    else goToProfile(authorId, e);
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    if (!canDownload) return;
    try {
      const videoUrl = p?.media?.[0]?.url;
      if (!videoUrl) return;
      const randomName = Math.floor(Math.random() * 9000000000 + 1000000000);
      const link = document.createElement("a");
      link.href = videoUrl.replace("/upload/", `/upload/fl_attachment:${randomName}/`);
      // No target="_blank" — same fix as everywhere else: a new tab is
      // what gets popup-blocked, a plain same-tab click still downloads.
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadCount(c => c + 1);
    } catch (err) { console.log(err); }
  };

  const handleBlock = async () => {
    if (isBlocked) return;
    if (!window.confirm(`Block ${username}?`)) return;
    try {
      const res  = await fetch(`${API}/auth/block/${authorId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setIsBlocked(true); setMenuOpen(false);
        onBlock?.(authorId?.toString());
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this video?")) return;
    try {
      const res  = await fetch(`${API}/auth/delete-post/${p._id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      } else {
        alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleHideFromNonFollowers = async () => {
    try {
      const res  = await fetch(`${API}/auth/hide-from-non-followers/${p._id}`, {
        method: "PATCH", headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setIsHidden(data.isHidden);
        alert(data.message);
      } else {
        alert(data.message || "Something went wrong");
      }
    } catch (err) { console.log(err); }
  };

  const addComment = async () => {
    if (!commentText.trim() || !canComment) return;
    try {
      const res = await fetch(`${API}/auth/comment/${p._id}`, {
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
      }
    } catch (err) { console.log(err); }
  };

  // ← NEW: remove a collaborator (owner removing anyone, or a
  // collaborator removing themself), same as ExploreReels.jsx.
  const handleRemoveCollab = async (collabUser) => {
    const isLeavingSelf = collabUser?._id?.toString() === MY_ID;
    const confirmMsg = isLeavingSelf
      ? "Remove yourself as a collaborator on this post? It will no longer show on your profile."
      : `Remove ${collabUser?.username} as a collaborator? The post will no longer show on their profile.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res  = await fetch(`${API}/auth/remove-collaborator/${p._id}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ userId: collabUser._id }),
      });
      const data = await res.json();
      if (data.success) {
        setCollaborators(data.collaborators ?? []);
        setMenuOpen(false);
        if (isLeavingSelf && !isOwner) {
          setRemovedFromView(true);
          onDeleted?.(p._id);
        }
      }
    } catch {}
  };

  const notInterested = async () => {
    try {
      const res = await fetch(`${API}/auth/not-interested/${p._id}`, {
        method: "PATCH", headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setIsNotInterested(prev => !prev);
        alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  // ← upgraded from a flat string array to an object array (key/label/
  // danger/action), same shape as ExploreReels.jsx/UserProfileVideoPost.jsx
  // — needed so per-collaborator "remove" entries can be inserted for the
  // owner, and a "leave collab" entry for a collaborator who isn't the
  // owner.
  const menuOptions = (() => {
    const opts = [];
    if (isOwner) {
      opts.push({ key: "delete", label: "Delete", danger: true, action: handleDelete });
      opts.push({
        key: "hide",
        label: isHidden ? "Show to everyone" : "Hide from non-followers",
        action: handleHideFromNonFollowers,
      });
      acceptedCollaborators.forEach((c) => {
        opts.push({
          key: `remove-${c.user?._id}`,
          label: `Remove collab: ${c.user?.username}`,
          danger: true,
          action: () => handleRemoveCollab(c.user),
        });
      });
    } else if (isBlocked) {
      opts.push({ key: "blocked", label: "Blocked", disabled: true, action: () => {} });
    } else {
      opts.push({
        key: "interest",
        label: isNotInterested ? "Interested" : "Not Interested",
        action: notInterested,
      });
      opts.push({ key: "block", label: "Block", danger: true, action: handleBlock });
      if (myCollabEntry) {
        opts.push({
          key: "leave-collab",
          label: "Remove myself as collaborator",
          danger: true,
          action: () => handleRemoveCollab(myCollabEntry.user),
        });
      }
    }
    return opts;
  })();

  const handleMenuAction = (opt) => {
    if (opt.disabled) return;
    setMenuOpen(false);
    opt.action();
  };

  const filteredLikers = likedByUsers.filter(u =>
    u.username?.toLowerCase().includes(likerSearch.toLowerCase())
  );
  const filteredViewers = viewedByUsers.filter(u =>
    u.username?.toLowerCase().includes(viewerSearch.toLowerCase())
  );

  const commentCount = comments.length;

  if (removedFromView) return null;

  return (
    <>
      <div ref={containerRef} style={S.wrapper}>

        {/* VIDEO */}
        <div style={S.videoBox} onClick={handleVideoTap}>
          <video
            ref={videoRef}
            src={p?.media?.[0]?.url || ""}
            loop playsInline muted={muted} style={S.video}
          />
          <div style={S.overlay} />
          {flashPause && (
            <div style={S.flashWrap}>
              {paused ? <FaPlay size={60} color="#fff" /> : <FaPause size={60} color="#fff" />}
            </div>
          )}
          {showLikeBurst && (
            <FaThumbsUp
              size={90}
              color="#fff"
              style={{
                position: "absolute", top: "50%", left: "50%",
                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
                animation: "likeBurstPop 0.7s ease",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* TOP BAR */}
        <div style={S.topBar}>
          <div style={S.topTabs}>
            <span style={S.activeTab}>Shorts</span>
          </div>
        </div>

        {/* RIGHT ACTIONS */}
        <div style={{ ...S.rightActions, bottom: hasNavbar ? 110 : 30 }}>

          {/* Like */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <button style={S.actionBtn} onClick={handleToggleLike}>
              {liked
                ? <FaThumbsUp size={30} color="#ff3040" />
                : <FaRegThumbsUp size={30} color="#fff" />}
            </button>
            {(!hideLikeCount || isOwner) && (
              <span
                style={{ ...S.actionLabel, cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); setShowLikers(true); }}
              >
                {formatCount(likesCount)}
              </span>
            )}
          </div>

          {/* Comment */}
          {canComment && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <button style={S.actionBtn} onClick={(e) => { e.stopPropagation(); setShowComments(true); }}>
                <FaRegComment size={28} color="#fff" />
              </button>
              {(!hideCommentCount || isOwner) && (
                <span style={S.actionLabel}>{formatCount(commentCount)}</span>
              )}
            </div>
          )}

          {/* Share */}
{/* Share */}
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
  <button style={S.actionBtn} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setShowShare(true); }}>
    <IoPaperPlane size={28} color="#fff" />
  </button>
  {sharesCount > 0 && (
    <span style={S.actionLabel}>{formatCount(sharesCount)}</span>
  )}
</div>

          {/* Download */}
          {canDownload && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <button style={S.actionBtn} onClick={handleDownload}>
                <FaDownload size={24} color="#fff" />
              </button>
              {downloadCount > 0 && (
                <span style={S.actionLabel}>{formatCount(downloadCount)}</span>
              )}
            </div>
          )}

          {/* Views */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <button style={S.actionBtn} onClick={(e) => { e.stopPropagation(); setShowViews(true); }}>
              <FaEye size={26} color="#fff" />
            </button>
            <span style={{ ...S.actionLabel, cursor: "pointer" }}>
              {formatCount(viewsCount)}
            </span>
          </div>

          {/* Mute */}
          <ActionBtn
            icon={muted
              ? <FaVolumeMute size={24} color="#fff" />
              : <FaVolumeUp size={24} color="#fff" />}
            onClick={(e) => { e.stopPropagation(); setMuted(prev => !prev); }}
          />

          {/* Save */}
          <ActionBtn
            icon={saved
              ? <FaBookmark size={24} color="#fff" />
              : <FaRegBookmark size={24} color="#fff" />}
            onClick={(e) => { e.stopPropagation(); toggleSave(); }}
          />

          {/* Menu ··· */}
          <div ref={menuRef} style={S.menuWrap}>
            <ActionBtn
              icon={<FaEllipsisV size={22} color="#fff" />}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(prev => !prev); }}
            />
            {menuOpen && (
              <div style={S.menu}>
                {menuOptions.map((opt, i) => (
                  <div
                    key={opt.key}
                    onClick={() => handleMenuAction(opt)}
                    style={{
                      ...S.menuItem,
                      color: opt.disabled ? "#888" : opt.danger ? "#ff5555" : "#fff",
                      cursor: opt.disabled ? "default" : "pointer",
                      borderBottom: i < menuOptions.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ← Author's profile pic under the ⋮ menu — ONLY shown when
              they currently have an active story, wrapped in a solid
              rgb(234,182,118) ring with a "See story" label underneath.
              No story = no avatar here at all. */}
          {hasStory && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div onClick={handleAvatarClick} style={discRingWrap}>
                <div style={discRingInner}>
                  <Avatar src={profilePic} username={username} size={38} />
                </div>
              </div>
              <span style={S.seeStoryLabel}>See story</span>
            </div>
          )}
        </div>

        {/* BOTTOM CONTENT */}
        <div style={{ ...S.bottomBar, bottom: hasNavbar ? 50 : 5 }}>
          <div style={S.userRow}>
            <CoAuthorHeader
              author={p?.author}
              acceptedCollaborators={acceptedCollaborators}
              onNavigate={goToProfile}
            />
            <FollowButton
              authorId={authorId}
              isPrivate={isPrivate}
              isOwner={isOwner}
              isBlocked={isBlocked}
              username={username}
              myFollowingIds={myFollowingIds}
              onFollowChange={handleFollowChange}
              variant="outline"
              style={S.followBtn}
            />
          </div>
          <LikesSummary
            likedByUsers={likedByUsers}
            likesCount={likesCount}
            hideLikeCount={hideLikeCount}
            isOwner={isOwner}
            onOpen={() => setShowLikers(true)}
          />
          <CaptionText text={caption} />

          <TagsRow tags={tags} postId={p._id} isOwner={isOwner} onTagsUpdate={setTags} />
          <CollabRow collaborators={collaborators} postId={p._id} isOwner={isOwner} onCollabUpdate={setCollaborators} />
        </div>
      </div>

      {/* ══ LIKERS SHEET ══ */}
      {showLikers && (
        <div style={sheet.overlay} onClick={() => { setShowLikers(false); setLikerSearch(""); }}>
          <div ref={likersRef} style={sheet.box} onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={e => handleTouchMove(e, likersRef)}
            onTouchEnd={e => handleTouchEnd(e, "likers", likersRef)}
          >
            <div style={sheet.handle} />
            <div style={sheet.header}>
              <b>Liked by</b>
              <FiX size={18} style={sheet.closeX} onClick={() => { setShowLikers(false); setLikerSearch(""); }} />
            </div>
            {likedByUsers.length > 0 && (
              <div style={{ padding: "0 12px 8px" }}>
                <div style={sheet.searchWrap}>
                  <FiSearch size={14} color="#999" />
                  <input value={likerSearch} onChange={e => setLikerSearch(e.target.value)}
                    placeholder="Search" style={sheet.searchInput} />
                  {likerSearch && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setLikerSearch("")} />}
                </div>
              </div>
            )}
            <div style={sheet.list}>
              {filteredLikers.length > 0 ? filteredLikers.map((u, i) => (
                <div key={u._id ?? i} style={{ ...sheet.row, cursor: "pointer" }}
                  onClick={() => { setShowLikers(false); setLikerSearch(""); navigate(`/profile/${u._id}`); }}>
                  <Avatar src={u.profilePic} username={u.username} size={40} />
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{u.username}</div>
                    {u.bio && <div style={{ fontSize: "12px", color: "#999" }}>{u.bio}</div>}
                  </div>
                </div>
              )) : (
                <p style={sheet.empty}>{likerSearch ? "No results found" : "No likes yet"}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ VIEWERS SHEET ══ */}
      {showViews && (
        <div style={sheet.overlay} onClick={() => { setShowViews(false); setViewerSearch(""); }}>
          <div ref={viewersRef} style={sheet.box} onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={e => handleTouchMove(e, viewersRef)}
            onTouchEnd={e => handleTouchEnd(e, "viewers", viewersRef)}
          >
            <div style={sheet.handle} />
            <div style={sheet.header}>
              <b>Viewed by</b>
              <FiX size={18} style={sheet.closeX} onClick={() => { setShowViews(false); setViewerSearch(""); }} />
            </div>
            {viewedByUsers.length > 0 && (
              <div style={{ padding: "0 12px 8px" }}>
                <div style={sheet.searchWrap}>
                  <FiSearch size={14} color="#999" />
                  <input value={viewerSearch} onChange={e => setViewerSearch(e.target.value)}
                    placeholder="Search" style={sheet.searchInput} />
                  {viewerSearch && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setViewerSearch("")} />}
                </div>
              </div>
            )}
            <div style={sheet.list}>
              {filteredViewers.length > 0 ? filteredViewers.map((u, i) => (
                <div key={u._id ?? i} style={{ ...sheet.row, cursor: "pointer" }}
                  onClick={() => { setShowViews(false); setViewerSearch(""); navigate(`/profile/${u._id}`); }}>
                  <Avatar src={u.profilePic} username={u.username} size={40} />
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{u.username}</div>
                    {u.bio && <div style={{ fontSize: "12px", color: "#999" }}>{u.bio}</div>}
                  </div>
                </div>
              )) : (
                <p style={sheet.empty}>{viewerSearch ? "No results found" : "No views yet"}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ COMMENTS SHEET ══ */}
      {showComments && canComment && (
        <div style={sheet.overlay} onClick={() => setShowComments(false)}>
          <div ref={sheetRef} style={sheet.box} onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={e => handleTouchMove(e, sheetRef)}
            onTouchEnd={e => handleTouchEnd(e, "comments", sheetRef)}
          >
            <div style={sheet.handle} />
            <div style={sheet.header}>
              <b>Comments ({formatCount(commentCount)})</b>
              <FiX size={18} style={sheet.closeX} onClick={() => setShowComments(false)} />
            </div>
            <div style={sheet.list}>
              <CommentSection
                comments={comments}
                setComments={setComments}
                currentUser={currentUser}
                postId={p._id}
              />
            </div>
            <div style={sheet.inputBar}>
              <Avatar src={currentUser?.profilePic} username={username} size={32} />
              <input value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addComment()}
                placeholder="Add a comment..." style={sheet.input} />
              <button onClick={addComment} style={sheet.postBtn} disabled={!commentText.trim()}>
                Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SHARE SHEET ══ */}
      {showShare && (
        <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />
      )}

      {/* ══ STORY PREVIEW ══ */}
      {showStoryPreview && hasStory && (
        <ReelStoryPreview story={story} onClose={() => setShowStoryPreview(false)} navigate={navigate} />
      )}
    </>
  );
}

export default Videopost;

// ─── styles ───────────────────────────────────────────────────────────────────
const S = {
  wrapper:     { width: "100%", maxWidth: "480px", height: "100vh", position: "relative", overflow: "hidden", background: "#000", margin: "0 auto" },
  videoBox:    { position: "absolute", inset: 0 },
  video:       { width: "100%", height: "100%", objectFit: "contain" },
  overlay:     { position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.45), transparent 20%, transparent 70%, rgba(0,0,0,0.55))", pointerEvents: "none" },
  flashWrap:   { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)", zIndex: 5 },
  topBar:      { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "16px" },
  topTabs:     { display: "flex", justifyContent: "center", alignItems: "center", gap: 30 },
  activeTab:   { color: "#fff", fontSize: 30, fontWeight: "700" },
  rightActions:{ position: "absolute", right: 12, bottom: 160, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, zIndex: 25 },
  actionBtn:   { background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: 0 },
  actionLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },
  menuWrap:    { position: "relative", zIndex: 50 },
  menu:        { position: "absolute", right: 40, bottom: 0, background: "#1c1c1c", borderRadius: 14, overflow: "hidden", minWidth: 200, zIndex: 50, boxShadow: "0 8px 28px rgba(0,0,0,0.55)" },
  menuItem:    { color: "#fff", padding: "13px 18px", fontSize: 14, cursor: "pointer", background: "#1c1c1c" },
  bottomBar:   { position: "absolute", left: 0, right: 70, padding: "16px", zIndex: 20 },
  userRow:     { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  username:    { color: "#fff", fontWeight: "700", fontSize: 17 },
  followBtn:   { border: "1px solid #fff", color: "#fff", background: "transparent", padding: "7px 18px", borderRadius: 10, fontSize: 14, fontWeight: "600", cursor: "pointer" },
  caption:     { color: "#fff", fontSize: 15, lineHeight: "1.4", margin: 0 },
  likesSummary: { color: "#fff", fontSize: 13, margin: "0 0 4px", cursor: "pointer" },
  moreBtn:     { color: "rgba(255,255,255,0.75)", fontWeight: "600", cursor: "pointer" },
  tagChip:     { display: "flex", alignItems: "center", background: "rgba(245,166,35,0.25)", color: "#ffd28a", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
  addTagBtn:   { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#fff" },
  seeStoryLabel: { color: "rgb(234,182,118)", fontSize: 10, fontWeight: "700" },
};

const sheet = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300 },
  box:         { position: "absolute", bottom: 0, width: "100%", maxHeight: "80%", background: "#fff", borderTopLeftRadius: "20px", borderTopRightRadius: "20px", display: "flex", flexDirection: "column", transition: "transform 0.2s ease" },
  handle:      { width: "40px", height: "4px", background: "#ddd", borderRadius: "10px", margin: "10px auto 6px" },
  header:      { textAlign: "center", padding: "10px 16px 14px", borderBottom: "1px solid #f0f0f0", fontSize: "15px", position: "relative" },
  closeX:      { position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", cursor: "pointer" },
  list:        { flex: 1, overflowY: "auto", padding: "10px 12px" },
  row:         { display: "flex", gap: "10px", marginBottom: "16px", alignItems: "flex-start" },
  empty:       { textAlign: "center", color: "#aaa", padding: "20px 0", fontSize: "14px" },
  inputBar:    { display: "flex", alignItems: "center", borderTop: "1px solid #f0f0f0", padding: "10px 12px", gap: "8px" },
  input:       { flex: 1, border: "none", outline: "none", fontSize: "14px" },
  postBtn:     { border: "none", background: "none", color: "#1877f2", fontWeight: "700", cursor: "pointer", fontSize: "14px" },
  searchWrap:  { display: "flex", alignItems: "center", gap: "6px", background: "#f0f0f0", borderRadius: "10px", padding: "0 10px" },
  searchInput: { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: "14px", outline: "none" },
};

// ── Story ring around the small profile-pic avatar (under the ⋮ menu) —
// solid app accent color, not a hardcoded gradient. Same treatment as
// ExploreReels.jsx/UserProfileVideoPost.jsx.
const discRingWrap = {
  width: 48, height: 48, borderRadius: "50%",
  background: "rgb(234,182,118)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, padding: 2,
};
const discRingInner = {
  width: "100%", height: "100%", borderRadius: "50%", background: "#000",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 2,
};

const rp = {
  overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  card:         { width: "100%", maxWidth: 340, height: "70vh", maxHeight: 600, background: "#000", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", position: "relative" },
  header:       { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", flexShrink: 0, position: "relative", zIndex: 2 },
  username:     { color: "#fff", fontWeight: 700, fontSize: 14, flex: 1 },
  closeBtn:     { background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  media:        { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", overflow: "hidden", position: "relative" },
  mediaEl:      { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  progressWrap: { display: "flex", gap: 3, padding: "8px 10px 0", flexShrink: 0, position: "relative", zIndex: 2 },
  progressBg:   { flex: 1, height: 2, background: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", background: "#fff", borderRadius: 2 },
  navLeft:      { position: "absolute", left: 0, top: 0, width: "40%", height: "100%", cursor: "pointer" },
  navRight:     { position: "absolute", right: 0, top: 0, width: "60%", height: "100%", cursor: "pointer" },
  ownBar:       { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,0,0,0.9)", flexShrink: 0 },
  viewerBar:    { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,0,0,0.9)", flexShrink: 0 },
  statPill:     { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "6px 12px", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" },
  iconBtn:      { background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  input:        { flex: 1, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 20, padding: "9px 14px", color: "#fff", outline: "none", fontSize: 13 },
  menu:         { position: "absolute", background: "#fff", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 20, minWidth: 210, overflow: "hidden", border: "0.5px solid #eee" },
  menuItem:     { display: "block", width: "100%", padding: "12px 16px", border: "none", background: "#fff", textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#222", borderBottom: "0.5px solid #f0f0f0" },
  commentsFeed: { position: "absolute", bottom: 8, left: 8, right: 46, zIndex: 5, display: "flex", flexDirection: "column", gap: 5, maxHeight: "45%", overflowY: "auto", pointerEvents: "none" },
  commentBubble:{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", borderRadius: 14, padding: "4px 10px", display: "flex", gap: 5, alignItems: "baseline", maxWidth: "90%", alignSelf: "flex-start" },
  commentUser:  { color: "rgb(234,182,118)", fontSize: 10, fontWeight: 700, flexShrink: 0 },
  commentText:  { color: "#fff", fontSize: 12, wordBreak: "break-word" },
  viewersOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  viewersBox:   { background: "#fff", width: "100%", maxWidth: 480, maxHeight: "60vh", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" },
  viewersHandle:{ width: 40, height: 4, background: "#ddd", borderRadius: 10, margin: "12px auto 4px" },
  viewersHeader:{ textAlign: "center", padding: "8px 16px 12px", borderBottom: "1px solid #f0f0f0", fontWeight: 700, fontSize: 15 },
};