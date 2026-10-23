import React, { useEffect, useState, useRef } from "react";
import {useFollowStore,getIsFollowing} from "../Profile/usefollowState.jsx";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar/navbar";
import StoriesBar from "../../components/StoryBar/storiesbar";
import StoryViewer from "../../components/StoryBar/storyviewer";
import { withDownload } from "../../utils/downloadUrl";
// consumeStoryViewers()/consumeOpenStoryId() are no longer read here — the
// notification handoff for "which story item" is now resolved into
// pendingStoryJumpId below, and "pop the Viewers sheet" is consumed
// directly inside StoryViewer's own effect (see storyviewer.jsx).
import socket from "../../sockets/sockets";
import FeedStoryPreview from "../../components/StoryBar/FeedStoryPreview.jsx";
import usePostOptions from "../../components/PostCard/usePostOptions.jsx";
import {
  FaThumbsUp, FaComment, FaPaperPlane,
  FaBookmark, FaRegBookmark, FaEllipsisV,
  FaDownload, FaHeart, FaRegHeart,
  FaRetweet, FaRegPaperPlane, FaEllipsisH,
  FaCheckCircle, FaEye, FaVolumeMute, FaVolumeUp,
} from "react-icons/fa";
import ShareSheet from "../../components/PostCard/ShareSheet";
import { FiX, FiSearch } from "react-icons/fi";
import CommentSection from "../../components/PostCard/CommentSection";
import { addFollowing, removeFollowing, getFollowingIds,initFollowStore} from "../Profile/usefollowState.jsx";
import { isPostSaved, toggleSavedPost, subscribeSavedPosts } from "../../components/state/savedPostsStore.js";
import { loadMutedMap, getMutedMap, subscribeMuted } from "../../components/state/MuteStore.js";
import { FeedCardSkeleton } from "../../components/Skeleton/Skeleton.jsx";
const API = import.meta.env.VITE_API_URL;
const globalCSS = `
  .img-strip::-webkit-scrollbar { display: none; }
  .img-strip { -ms-overflow-style: none; scrollbar-width: none; }
  .feed-menu-item:hover { background: #f5f5f5 !important; }
  body.comments-open .navbar-root { z-index: -1 !important; }
  @keyframes heartPop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.4); }
    70%  { transform: scale(0.9); }
    100% { transform: scale(1); }
  }
  .heart-pop { animation: heartPop 0.28s cubic-bezier(0.36,0.07,0.19,0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
  @keyframes slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
  @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-120px); opacity: 0; } }
  @keyframes heartBurst {
    0%   { transform: scale(0.3); opacity: 0; }
    25%  { transform: scale(1.15); opacity: 1; }
    45%  { transform: scale(0.95); opacity: 1; }
    65%  { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(1); opacity: 0; }
  }
  .overlay-bg   { animation: fadeIn  0.2s ease forwards; }
  .bottom-sheet { animation: slideUp 0.25s ease forwards; }
`;
if (!document.getElementById("home-feed-style")) {
  const s = document.createElement("style");
  s.id = "home-feed-style";
  s.innerHTML = globalCSS;
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

function shareCount(shares) {
  if (Array.isArray(shares)) return shares.length;
  if (typeof shares === "number") return shares;
  return 0;
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

const INTERACTED_KEY = "interactedPostIds";
function markPostInteracted(postId) {
  try {
    const stored = JSON.parse(localStorage.getItem(INTERACTED_KEY) || "[]");
    if (!stored.includes(postId)) {
      stored.push(postId);
      localStorage.setItem(INTERACTED_KEY, JSON.stringify(stored));
    }
  } catch {}
}

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
      <FaThumbsUp size={84} color="rgb(234,182,118)" style={heartBurstIcon} />
    </div>
  );
}

function useAutoplayVideo(threshold = 0.6) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) {
          setInView(true);
          video.play().catch(() => {});
        } else {
          setInView(false);
          video.pause();
          video.muted = true;
          setIsMuted(true);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleMute = (e) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  return { containerRef, videoRef, isMuted, inView, toggleMute };
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

function LikersSheet({ postId, onClose, onNavigate }) {
  const [likers,  setLikers]  = useState([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLikers = async () => {
      try {
        const res  = await fetch(`${API}/auth/likers/${postId}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setLikers(data.likedBy ?? []);
      } catch {}
      finally { setLoading(false); }
    };
    fetchLikers();

    const onPostLikes = ({ likedBy }) => {
      if (likedBy) setLikers(likedBy);
    };

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

function CommentsSheet({ postId, postAuthorId, comments, setComments, onClose, onInteract }) {
  const currentUser   = safeParseUser();
  const username      = currentUser?.username || "Me";
  const [commentText, setCommentText] = useState("");

  const addComment = async () => {
    if (!commentText.trim()) return;
    try {
      const res  = await fetch(`${API}/auth/comment/${postId}`, {
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
      <CommentSection
        comments={comments}
        setComments={setComments}
        currentUser={currentUser}
        postId={postId}
        postAuthorId={postAuthorId}
      />
    </BottomSheet>
  );
}

function AllCaughtUpDivider() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", borderTop: "1px solid #efefef", borderBottom: "1px solid #efefef", background: "#fafafa", margin: "8px 0" }}>
      <FaCheckCircle size={36} color="rgb(234,182,118)" style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 700, fontSize: 16, color: "#111", marginBottom: 4 }}>You're all caught up</div>
      <div style={{ fontSize: 13, color: "#999", textAlign: "center" }}>
        You've seen all posts from people you follow.
        <br />Here are some posts you might like.
      </div>
    </div>
  );
}

function useFollowState(authorId, authorPrivate, onFollowChange, myFollowingIds) {
  const { follow, unfollow } = useFollowStore();
  const [followState, setFollowState] = useState("none");

  useEffect(() => {
    setFollowState(
      myFollowingIds?.includes(authorId.toString()) ? "following" : "none"
    );
  }, [authorId, myFollowingIds]);

 const handleFollowBtn = async () => {
    const currentUser = safeParseUser();
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

  return { followState, setFollowState, handleFollowBtn, followLabel, followBtnBg, followBtnColor };
}

function FollowButton({ authorId, isPrivate, isOwner, isBlocked, username, onFollowChange, myFollowingIds }) {
  const [authorPrivate, setAuthorPrivate] = useState(isPrivate);

  useEffect(() => {
    setAuthorPrivate(isPrivate);
  }, [isPrivate]);

  const { followState, handleFollowBtn, followLabel, followBtnBg, followBtnColor } =
    useFollowState(authorId, authorPrivate, onFollowChange, myFollowingIds);

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
    <div style={{ padding: "4px 12px 6px", display: "flex", flexWrap: "wrap", gap: 5 }}>
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
            : <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>{c.user?.username?.[0]?.toUpperCase()}</div>
          }
          <span style={{ fontSize: 11, fontWeight: 600 }}>{c.user?.username}</span>
        </div>
      ))}
    </div>
  );
}
function getSlideCaption(p, index) {
  const m = p?.media?.[index];
  if (m && typeof m.caption === "string") return m.caption;
  return p?.caption || p?.text || "";
}
function FeedCarousel({ media, onOpen, onIndexChange }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => { onIndexChange?.(current); }, [current]);
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
              style={{ position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>‹</button>
          )}
          {current < total - 1 && (
            <button onClick={e => { e.stopPropagation(); setCurrent(i => i + 1); }}
              style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>›</button>
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

function ImageFeedCard({ p, navigate, allPosts, onBlock, onNotInterested, onHide, onDeleted, onFollowChange, myFollowingIds, storyAuthorIds, seenStoryIds, onInteract, onOpenStory }) {
  const currentUser   = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const isOwner       = currentUserId === p?.author?._id?.toString() || currentUserId === p?.author?.toString();
  const authorId      = p?.author?._id || p?.author;
  const username      = p?.author?.username || p?.username || "Unknown";
  const isPrivate     = p?.author?.isPrivate ?? false;
  const authorHasStory = storyAuthorIds?.has(authorId?.toString());
  const authorStoryState = authorHasStory ? (seenStoryIds?.has(authorId?.toString()) ? "seen" : "unseen") : null;

  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableDownload  = !!p?.disableDownload;
  const disableComments  = !!p?.disableComments;
  const canDownload      = !disableDownload || isOwner;
  const canComment       = !disableComments || isOwner;

  const [liked,           setLiked]           = useState(false);
  const [likesCount,      setLikesCount]       = useState(p?.likes?.length || 0);
  const [likedByUsers,    setLikedByUsers]     = useState([]);
  const [saved,           setSaved]            = useState(() => isPostSaved(p?._id));
  const [menuOpen,        setMenuOpen]         = useState(false);
  const [showLikers,      setShowLikers]       = useState(false);
  const [showComments,    setShowComments]     = useState(false);
  const [showShare,       setShowShare]        = useState(false);
  const [comments,        setComments]         = useState(p?.comments ?? []);
  const [downloadCount,   setDownloadCount]    = useState(p?.downloadsCount || p?.downloads?.length || 0);
  // ── all ⋯-menu actions live in usePostOptions.jsx ──
  const {
    options: menuOptions,
    isHidden,
    isNotInterested,
    isBlocked,
    removedFromView,
    setRemovedFromView,
  } = usePostOptions({
    post: p,
    isOwner,
    authorId,
    username,
    noun: "post",
    menu: { close: () => setMenuOpen(false) },
    currentUserId: currentUserId,
    onBlock,
    onDeleted,
    onNotInterested,
    onHide,
  });
  const [showHeartBurst,  setShowHeartBurst]   = useState(false);
  // ← NEW: live share count, kept in sync via the "postShared" socket
  // event instead of only ever reading the value the page loaded with.
  const [sharesCount, setSharesCount] = useState(shareCount(p?.shares) ?? p?.sharesCount ?? 0);
  // ← NEW: collaborators kept as live state instead of reading the raw
  // `p.collaborators` prop directly — refetched on mount and updated via
  // socket, so an accept/decline/removal that happened elsewhere shows
  // up here without a full page reload.
  const [collaborators, setCollaborators] = useState(p?.collaborators ?? []);

    const [slideIndex, setSlideIndex] = useState(0);
  const slideCaption = getSlideCaption(p, slideIndex);
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
        const res  = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
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
        const res  = await fetch(`${API}/auth/get-comment/${p._id}`, { headers: authHeaders() });
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

  useEffect(() => {
    document.body.style.overflow = showLikers || showComments || showShare ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showLikers, showComments, showShare]);

const toggleSave = () => {
  toggleSavedPost(p);
};

  const download = () => {
    if (!canDownload) return;
    try {
      const mediaList = p?.media || [];
      if (!mediaList.length) return;
      mediaList.forEach((m, i) => {
        setTimeout(() => {
          const randomName = Math.floor(Math.random() * 9000000000 + 1000000000);
          const link       = document.createElement("a");
         link.href = withDownload(m.url, randomName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, i * 400);
      });
      setDownloadCount(c => c + mediaList.length);
    } catch (err) { console.log(err); }
  };

  const handleLike = async () => {
    try {
      const res  = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikesCount(data.totalLikes);
        if (data.liked) onInteract?.(p._id);
      }
    } catch (err) { console.log(err); }
  };

  const triggerDoubleTapLike = () => {
    if (!liked) handleLike();
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };
  const handleMediaTap = useDoubleTap(triggerDoubleTapLike);





  const goToProfile = (id) => { if (id) navigate(`/profile/${id}`); };


const handleAvatarClick = () => {
  if (authorHasStory) onOpenStory?.(authorId);
  else goToProfile(authorId);
};

const openPost = () => {}

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
                  <button key={i} className="feed-menu-item" onClick={opt.action}
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
               <FeedCarousel media={p.media} onOpen={openPost} onIndexChange={setSlideIndex} />
        <HeartBurst show={showHeartBurst} />
      </div>

      <LikesSummary
        likedByUsers={likedByUsers}
        likesCount={likesCount}
        hideLikeCount={hideLikeCount}
        isOwner={isOwner}
        onOpen={() => setShowLikers(true)}
      />

      {!!slideCaption && (
        <p style={captionStyle}>
          <span style={{ fontWeight: 600, marginRight: 6, cursor: "pointer" }} onClick={() => goToProfile(authorId)}>
            {username}
          </span>
          <CaptionText key={slideIndex} text={slideCaption} />
        </p>
      )}

      <FeedTagsRow tags={p?.tags} navigate={navigate} />

      <FeedCollabRow collaborators={collaborators} navigate={navigate} />

      <div style={imgActions}>
        <button onClick={handleLike} style={imgActionBtn}>
          <FaThumbsUp color={liked ? "rgb(234,182,118)" : "#555"} size={17} />
          {(!hideLikeCount || isOwner) && (
            <span
              onClick={e => { e.stopPropagation(); setShowLikers(true); }}
              style={{ fontSize: 13, fontWeight: 600, color: liked ? "rgb(234,182,118)" : "#555", cursor: "pointer" }}
            >
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
          {sharesCount > 0 && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{formatCount(sharesCount)}</span>
          )}
        </button>
        {canDownload && (
          <button onClick={download} style={imgActionBtn}>
            <FaDownload color="#555" size={16} />
            {downloadCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{formatCount(downloadCount)}</span>
            )}
          </button>
        )}
      </div>
    </div>

    {showLikers   && <LikersSheet postId={p._id} onClose={() => setShowLikers(false)} onNavigate={goToProfile} />}
    {showComments && canComment && (
      <CommentsSheet
        postId={p._id}
        postAuthorId={p.author?._id || p.author}
        comments={comments}
        setComments={setComments}
        onClose={() => setShowComments(false)}
        onInteract={onInteract}
      />
    )}
    {showShare    && <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />}
  </>
);
}

function VideoFeedCard({ p, navigate, onBlock, onNotInterested, onHide, onDeleted, onFollowChange, myFollowingIds, storyAuthorIds, seenStoryIds, onInteract, onOpenStory }) {
  const currentUser   = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const isOwner       = currentUserId === p?.author?._id?.toString() || currentUserId === p?.author?.toString();
  const authorId      = p?.author?._id || p?.author;
  const username      = p?.author?.username || p?.username || "Unknown";
  const isPrivate     = p?.author?.isPrivate ?? false;
  const authorHasStory = storyAuthorIds?.has(authorId?.toString());
  const authorStoryState = authorHasStory ? (seenStoryIds?.has(authorId?.toString()) ? "seen" : "unseen") : null;

  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableDownload  = !!p?.disableDownload;
  const disableComments  = !!p?.disableComments;
  const canDownload      = !disableDownload || isOwner;
  const canComment       = !disableComments || isOwner;

  const [liked,           setLiked]           = useState(false);
  const [likesCount,      setLikesCount]      = useState(p?.likes?.length || 0);
  const [likedByUsers,    setLikedByUsers]    = useState([]);
  const [saved,           setSaved]            = useState(() => isPostSaved(p?._id));
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [showLikers,      setShowLikers]      = useState(false);
  const [showComments,    setShowComments]    = useState(false);
  const [showShare,       setShowShare]       = useState(false);
  const [comments,        setComments]        = useState(p?.comments ?? []);
  const [downloadCount,   setDownloadCount]   = useState(p?.downloadsCount || p?.downloads?.length || 0);
  // ── all ⋯-menu actions live in usePostOptions.jsx ──
  const {
    options: menuOptions,
    isHidden,
    isNotInterested,
    isBlocked,
    removedFromView,
    setRemovedFromView,
  } = usePostOptions({
    post: p,
    isOwner,
    authorId,
    username,
    noun: "video",
    menu: { close: () => setMenuOpen(false) },
    currentUserId: currentUserId,
    onBlock,
    onDeleted,
    onNotInterested,
    onHide,
  });
  const [showHeartBurst,  setShowHeartBurst]  = useState(false);
  // ← NEW: same share-count + collaborator live-state fix as ImageFeedCard.
  const [sharesCount, setSharesCount] = useState(shareCount(p?.shares) ?? p?.sharesCount ?? 0);
  const [collaborators, setCollaborators] = useState(p?.collaborators ?? []);
  const menuRef = useRef(null);

  const { containerRef, videoRef, isMuted, inView, toggleMute } = useAutoplayVideo();
const hasRecordedView = useRef(false);

useEffect(() => {
  if (!inView || !p?._id || hasRecordedView.current) return;
  hasRecordedView.current = true;
  fetch(`${API}/auth/views/posts/${p._id}/views`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
}, [inView, p?._id]);

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
        const res  = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
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
        const res  = await fetch(`${API}/auth/get-comment/${p._id}`, { headers: authHeaders() });
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

  useEffect(() => {
    document.body.style.overflow = showLikers || showComments || showShare ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showLikers, showComments, showShare]);

  const toggleSave = () => {
    toggleSavedPost(p);
  };

  const download = (e) => {
    e?.stopPropagation?.();
    if (!canDownload) return;
    try {
      const videoUrl = p?.media?.[0]?.url;
      if (!videoUrl) return;
      const randomName = Math.floor(Math.random() * 9000000000 + 1000000000);
      const link = document.createElement("a");
      link.href = withDownload(videoUrl, randomName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadCount(c => c + 1);
    } catch (err) { console.log(err); }
  };

  const handleLike = async () => {
    try {
      const res  = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikesCount(data.totalLikes);
        if (data.liked) onInteract?.(p._id);
      }
    } catch (err) { console.log(err); }
  };

  const triggerDoubleTapLike = () => {
    if (!liked) handleLike();
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };
  const handleMediaTap = useDoubleTap(triggerDoubleTapLike);





  const goToProfile = (id) => { if (id) navigate(`/profile/${id}`); };

  const handleAvatarClick = () => {
    if (authorHasStory) onOpenStory?.(authorId);
    else goToProfile(authorId);
  };


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
                    <button key={i} className="feed-menu-item" onClick={opt.action}
                      style={{ display: "block", padding: "12px 16px", border: "none", background: "#fff", width: "100%", textAlign: "left", cursor: opt.label === "Blocked" ? "default" : "pointer", fontSize: 14, fontWeight: 500, color: opt.color, borderBottom: i < menuOptions.length - 1 ? "0.5px solid #f0f0f0" : "none" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          ref={containerRef}
          style={{ position: "relative", background: "#000" }}
          onClick={handleMediaTap}
        >
          <video
            ref={videoRef}
            src={p?.media?.[0]?.url}
            muted
            loop
            playsInline
            style={{ width: "100%", display: "block", maxHeight: 500, background: "#000" }}
          />
          <HeartBurst show={showHeartBurst} />
          <button
            onClick={toggleMute}
            style={videoMuteBtn}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <FaVolumeMute size={14} color="#fff" /> : <FaVolumeUp size={14} color="#fff" />}
          </button>
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
            <FaThumbsUp color={liked ? "rgb(234,182,118)" : "#555"} size={17} />
            {(!hideLikeCount || isOwner) && (
              <span
                onClick={e => { e.stopPropagation(); setShowLikers(true); }}
                style={{ fontSize: 13, fontWeight: 600, color: liked ? "rgb(234,182,118)" : "#555", cursor: "pointer" }}
              >
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
            {sharesCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{formatCount(sharesCount)}</span>
            )}
          </button>
          {canDownload && (
            <button onClick={download} style={imgActionBtn}>
              <FaDownload color="#555" size={16} />
              {downloadCount > 0 && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{formatCount(downloadCount)}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {showLikers   && <LikersSheet postId={p._id} onClose={() => setShowLikers(false)} onNavigate={goToProfile} />}
      {showComments && canComment && (
        <CommentsSheet
          postId={p._id}
          postAuthorId={p.author?._id || p.author}
          comments={comments}
          setComments={setComments}
          onClose={() => setShowComments(false)}
          onInteract={onInteract}
        />
      )}
      {showShare    && <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />}
    </>
  );
}

function TextFeedCard({ p, navigate, allPosts, onBlock, onNotInterested, onHide, onDeleted, onFollowChange, myFollowingIds, storyAuthorIds, seenStoryIds, onInteract, onOpenStory }) {
  const currentUser   = safeParseUser();
  const currentUserId = (currentUser?._id || currentUser?.id)?.toString();
  const isOwner       = currentUserId === p?.author?._id?.toString() || currentUserId === p?.author?.toString();
  const authorId      = p?.author?._id || p?.author;
  const username      = p?.author?.username || "Unknown";
  const isPrivate     = p?.author?.isPrivate ?? false;
  const authorHasStory = storyAuthorIds?.has(authorId?.toString());
  const authorStoryState = authorHasStory ? (seenStoryIds?.has(authorId?.toString()) ? "seen" : "unseen") : null;

  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableComments  = !!p?.disableComments;
  const canComment       = !disableComments || isOwner;

  const [liked,           setLiked]           = useState(false);
  const [likeCount,       setLikeCount]       = useState(p?.likes?.length || 0);
  const [likedByUsers,    setLikedByUsers]    = useState([]);
  const [saved,           setSaved]            = useState(() => isPostSaved(p?._id));
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [heartAnim,       setHeartAnim]       = useState(false);
  const [showLikers,      setShowLikers]      = useState(false);
  const [showComments,    setShowComments]    = useState(false);
  const [showShare,       setShowShare]       = useState(false);
  const [comments,        setComments]        = useState(p?.comments ?? []);
  // ── all ⋯-menu actions live in usePostOptions.jsx ──
  const {
    options: menuOptions,
    isHidden,
    isNotInterested,
    isBlocked,
    removedFromView,
    setRemovedFromView,
  } = usePostOptions({
    post: p,
    isOwner,
    authorId,
    username,
    noun: "post",
    menu: { close: () => setMenuOpen(false) },
    currentUserId: currentUserId,
    onBlock,
    onDeleted,
    onNotInterested,
    onHide,
  });
  const [showHeartBurst,  setShowHeartBurst]  = useState(false);
  // ← NEW: same share-count + collaborator live-state fix as the other cards.
  const [sharesCount, setSharesCount] = useState(shareCount(p?.shares) ?? p?.sharesCount ?? 0);
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
        const res  = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
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
        const res  = await fetch(`${API}/auth/get-comment/${p._id}`, { headers: authHeaders() });
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

  useEffect(() => {
    document.body.style.overflow = showLikers || showComments || showShare ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showLikers, showComments, showShare]);

const toggleSave = () => {
  toggleSavedPost(p);
};



  const handleLike = async () => {
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 300);
    try {
      const res  = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikeCount(data.totalLikes);
        if (data.liked) onInteract?.(p._id);
      }
    } catch (err) { console.log(err); }
  };

  const triggerDoubleTapLike = () => {
    if (!liked) handleLike();
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };
  const handleMediaTap = useDoubleTap(triggerDoubleTapLike);



  const goToProfile = (id) => { if (id) navigate(`/profile/${id}`); };


const handleAvatarClick = () => {
  if (authorHasStory) onOpenStory?.(authorId);
  else goToProfile(authorId);
};

   const openPost =()=>{}

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
                  <button key={i} className="feed-menu-item" onClick={opt.action}
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
            <p onClick={openPost} style={{ fontSize: 15, lineHeight: 1.55, color: "#111", whiteSpace: "pre-wrap", wordBreak: "break-word", cursor: "pointer", marginBottom: 0, marginLeft: 0 }}>
              <CaptionText text={p?.text || p?.caption} limit={220} />
            </p>
          )}

          {p?.media?.length > 0 && (
            <div style={{ position: "relative" }} onClick={handleMediaTap}>
             <div
  className="img-strip"
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
              <FaThumbsUp size={17} color={liked ? "rgb(234,182,118)" : "#555"} className={heartAnim ? "heart-pop" : ""} />
              {(!hideLikeCount || isOwner) && (
                <span onClick={e => { e.stopPropagation(); setShowLikers(true); }}
                  style={{ fontSize: 13, fontWeight: 600, color: liked ? "rgb(234,182,118)" : "#555", cursor: "pointer" }}>
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
              {sharesCount > 0 && <span style={textCount}>{formatCount(sharesCount)}</span>}
            </button>
            <button onClick={toggleSave} style={{ ...textActionBtn, marginLeft: "auto", background: saved ? "#fff8e1" : "#efefef" }}>
              {saved ? <FaBookmark size={15} color="#f5a623" /> : <FaRegBookmark size={15} color="#555" />}
            </button>
          </div>
        </div>
      </div>

      {showLikers   && <LikersSheet postId={p._id} onClose={() => setShowLikers(false)} onNavigate={goToProfile} />}
      {showComments && canComment && (
        <CommentsSheet
          postId={p._id}
          postAuthorId={p.author?._id || p.author}
          comments={comments}
          setComments={setComments}
          onClose={() => setShowComments(false)}
          onInteract={onInteract}
        />
      )}
      {showShare    && <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />}
    </>
  );
}

function Homepage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [currentUser,      setCurrentUser]      = useState(null);
  const [stories,          setStories]          = useState([]);
  const [activeIndex,      setActiveIndex]      = useState(null);
  const [previewAuthorId,  setPreviewAuthorId]   = useState(null);
  // ← NEW — set when a story_view/story_like notification handoff asks
  // the upcoming preview to open with its Viewers sheet already up.
  const [previewShowViewers, setPreviewShowViewers] = useState(false);
  // ← NEW — which specific story item (within the author's reel) to jump
  // to on open, from the same notification handoff. Without this the
  // preview always defaulted to slide 0 regardless of which story a
  // story_like/story_view notification was actually about.
  const [previewStoryId, setPreviewStoryId] = useState(null);
  // ← NEW — a story_view/story_like/story_live notification now opens the
  // full StoryViewer (same one the stories bar uses) instead of the
  // lighter FeedStoryPreview, so it needs the same "which exact story
  // item to land on" info, just handed to StoryViewer's initialStoryId
  // prop instead. Cleared whenever the viewer is opened any other way
  // (bar click) or closed, so a stale value never leaks into a manual open.
  const [pendingStoryJumpId, setPendingStoryJumpId] = useState(null);
  const [seenStoryIds,     setSeenStoryIds]      = useState(() => new Set());
  const [posts,            setPosts]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [blockedIds,       setBlockedIds]       = useState([]);
  const [notInterestedIds, setNotInterestedIds] = useState([]);
  const [hiddenPostIds,    setHiddenPostIds]    = useState([]);
  const [deletedPostIds,   setDeletedPostIds]   = useState([]);
  const [mutedMap, setMutedMap] = useState(() => getMutedMap());
  const [viewedPostIds, setViewedPostIds] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(INTERACTED_KEY) || "[]");
      return new Set(stored);
    } catch { return new Set(); }
  });
 const { followingIds: myFollowingIds,
   follow: addFollowingStore, 
   unfollow: removeFollowingStore } = useFollowStore()

  useEffect(() => {
    const user   = safeParseUser();
    const userId = user?._id || user?.id;
    if (userId) socket.emit("register", userId);
  }, []);

useEffect(() => {
  loadMutedMap();
  return subscribeMuted(setMutedMap);
}, []);
const fetchStories = async () => {
  try {
    const userRes  = await fetch(`${API}/auth/profile`, { headers: authHeaders() });
    const userData = await userRes.json();
    setCurrentUser(userData.user);
    localStorage.setItem("user", JSON.stringify(userData.user));

    const followingIds = (userData.user?.following || []).map(f => (f?._id ?? f).toString());
    initFollowStore(followingIds);

    const myId = (userData.user?._id || userData.user?.id)?.toString();

    const storiesRes  = await fetch(`${API}/stories/get-stories`, { headers: authHeaders() });
    const storiesData = await storiesRes.json();
    if (!storiesData.success) return;

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
groupedArr.sort((a, b) => (a.isOwn ? -1 : b.isOwn ? 1 : 0));

const persistedSeenIds = new Set(
  groupedArr
    .filter(s => !s.isOwn && s.slides.length > 0 && s.slides.every(sl => sl.viewedByMe))
    .map(s => s.id)
);

setStories(groupedArr);
setSeenStoryIds(persistedSeenIds);
  } catch (err) { console.log(err); }
};

const fetchPosts = async () => {
  try {
    setLoading(true);
    const res  = await fetch(`${API}/auth/feed`, { headers: authHeaders() });
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.posts || [];
    setPosts(list.filter(p => ["image", "text", "carousel", "video"].includes(p?.postType)));
  } catch (err) { console.log(err); }
  finally { setLoading(false); }
};

  const handleBlock         = (id) => setBlockedIds(prev => [...prev, id.toString()]);
  const handleNotInterested = (id) => setNotInterestedIds(prev => [...prev, id]);
  const handleHide          = (id) => setHiddenPostIds(prev => [...prev, id]);
  const handleDeleted       = (id) => setDeletedPostIds(prev => [...prev, id]);
const handleFollowChange = (authorId, followed) => {
  if (followed) addFollowing(authorId);
  else removeFollowing(authorId);
};

  const handlePostLiked = React.useCallback((postId) => {
    markPostInteracted(postId);
  }, []);

const openStoryForAuthor = React.useCallback((authorId, { showViewers = false, storyId = null } = {}) => {
  setPreviewAuthorId(authorId);
  setPreviewShowViewers(showViewers);
  setPreviewStoryId(storyId);
  setSeenStoryIds(prev => {
    const key = authorId?.toString();
    if (!key || prev.has(key)) return prev;
    const next = new Set(prev);
    next.add(key);
    return next;
  });
}, []);

// FIXED — was reopening the preview right after the user manually closed
// it. Root cause: this effect re-runs whenever `stories` gets a new array
// reference (e.g. a socket-triggered refetch after viewing/liking), and
// while sessionStorage.getItem should normally read null on a second
// pass (already removed on the first), a stray re-render landing between
// the read and the remove — or a second `stories` update arriving before
// that first pass finishes — could let it slip through twice. Tracking
// exactly which pending request was already applied (by value, not just
// presence/absence of the sessionStorage key) makes this fire at most
// once no matter how many times the effect itself re-runs afterward.
const appliedStoryOpenRef = useRef(null);

useEffect(() => {
  const pendingUserId = sessionStorage.getItem("openStoryUserId");
  if (!pendingUserId || stories.length === 0) return;

  // ← NEW — read together with the userId; carries which specific story
  // item to land on (see stashOpenStoryId() in notificationHandoff.js).
  const pendingStoryId = sessionStorage.getItem("openStoryId");
  const appliedKey = `${pendingUserId}:${pendingStoryId || ""}`;
  if (appliedStoryOpenRef.current === appliedKey) {
    // Already handled this exact request — just make sure nothing
    // stale lingers in sessionStorage and stop here.
    sessionStorage.removeItem("openStoryUserId");
    sessionStorage.removeItem("openStoryId");
    return;
  }
  appliedStoryOpenRef.current = appliedKey;

  sessionStorage.removeItem("openStoryUserId");
  sessionStorage.removeItem("openStoryId");

  // ← CHANGED — a notification tap now opens the same full StoryViewer
  // used from the stories bar, instead of the lighter FeedStoryPreview.
  // StoryViewer already pops its own Viewers sheet open via its
  // consumeStoryViewers() effect, so that flag is left untouched here —
  // reading it in both places would consume it before StoryViewer gets
  // a chance to. We just need the author's position in the same
  // following-reel array StoryViewer renders (mirrors the
  // followingStories filter below) and hand off which slide to open.
  const reel = stories.filter(s => {
    if (!(s.isOwn || myFollowingIds.includes(s.id?.toString()))) return false;
    if (s.isOwn) return true;
    return !mutedMap[s.id]?.muteStory;
  });
  const idx = reel.findIndex(s => s.id?.toString() === pendingUserId.toString());

  if (idx >= 0) {
    setPendingStoryJumpId(pendingStoryId || null);
    setActiveIndex(idx);
  } else {
    alert("This story is no longer available.");
  }
}, [stories, myFollowingIds, mutedMap]);

  useEffect(() => { fetchStories(); fetchPosts(); }, [location.pathname]);

useEffect(() => {
  const refreshStories = () => fetchStories();
  socket.on("storyAdded",     refreshStories);
  socket.on("storyDeleted",   refreshStories);
  socket.on("liveStoryEnded", refreshStories);
  socket.on("someoneLive",    refreshStories);
  socket.on("storyVisibilityChanged", refreshStories);
  return () => {
    socket.off("storyAdded",     refreshStories);
    socket.off("storyDeleted",   refreshStories);
    socket.off("liveStoryEnded", refreshStories);
    socket.off("someoneLive",    refreshStories);
    socket.off("storyVisibilityChanged", refreshStories);
  };
}, []);
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
  const handler = ({ userId, isPrivate }) => {
    setPosts(prev =>
      prev.map(post => {
        const authorId = post.author?._id
          ? post.author._id.toString()
          : post.author?.toString();

        if (authorId === userId.toString()) {
          return {
            ...post,
            author: {
              ...(post.author?._id ? post.author : { _id: post.author }),
              isPrivate,
            },
          };
        }
        return post;
      })
    );
  };

  socket.on("privacyChanged", handler);
  return () => socket.off("privacyChanged", handler);
}, []);

 const visiblePosts = posts.filter((p) => {
  const authorId =
    (p?.author?._id || p?.author)?.toString();

  const myId =
    (currentUser?._id || currentUser?.id)?.toString();

  if (blockedIds.includes(authorId)) return false;
  if (authorId !== myId && mutedMap[authorId]?.mutePost) return false;
  if (notInterestedIds.includes(p._id)) return false;
  if (hiddenPostIds.includes(p._id)) return false;
  if (deletedPostIds.includes(p._id)) return false;

  if (authorId === myId) return true;

  if (
    p?.author?.isPrivate &&
    !myFollowingIds.includes(authorId)
  ) {
    return false;
  }

  return true;
});

  const storyAuthorIds = React.useMemo(
    () => new Set(stories.map(s => s.id?.toString())),
    [stories]
  );

const followingStories = React.useMemo(() => {
  return stories.filter(s => {
    if (!(s.isOwn || myFollowingIds.includes(s.id?.toString()))) return false;
    if (s.isOwn) return true;
    return !mutedMap[s.id]?.muteStory;
  });
}, [stories, myFollowingIds, mutedMap]);

  const previewStory = previewAuthorId
    ? stories.find(s => s.id?.toString() === previewAuthorId?.toString()) || null
    : null;

const followingPosts = visiblePosts
  .filter(p => {
    const authorId = (p?.author?._id || p?.author)?.toString();
    const myId     = (currentUser?._id || currentUser?.id)?.toString();
    return authorId === myId || myFollowingIds.includes(authorId);
  })
  .filter(p => !viewedPostIds.has(p._id))
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const discoverPosts = visiblePosts
  .filter(p => {
    const authorId = (p?.author?._id || p?.author)?.toString();
    const myId     = (currentUser?._id || currentUser?.id)?.toString();
    if (p?.author?.isPrivate && !myFollowingIds.includes(authorId)) return false;
    return authorId !== myId && !myFollowingIds.includes(authorId);
  })
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
const renderCard = (p) => {
  const props = {
    p,
    navigate,
    allPosts: visiblePosts,
    onBlock: handleBlock,
    onNotInterested: handleNotInterested,
    onHide: handleHide,
    onDeleted: handleDeleted,
    onFollowChange: handleFollowChange,
    myFollowingIds,
    storyAuthorIds,
    seenStoryIds,
    onInteract: handlePostLiked,
    onOpenStory: openStoryForAuthor,
  };

  if (p?.postType === "image" || p?.postType === "carousel")
    return <ImageFeedCard key={p._id} {...props} />;

  if (p?.postType === "video")
    return <VideoFeedCard key={p._id} {...props} />;

  if (p?.postType === "text")
    return <TextFeedCard key={p._id} {...props} />;

  return null;
};

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#fff" }}>
      {activeIndex === null && (
        <>
          <div style={topBar}>
            <h1 style={logo}>Socialio</h1>
          </div>
<StoriesBar
  stories={followingStories}
  openStory={i => { setPendingStoryJumpId(null); setActiveIndex(i); }}
  userProfile={currentUser?.profilePic || 'm'}
  currentUserId={(currentUser?._id || currentUser?.id)?.toString()}
/>
          <div style={{ borderBottom: "1px solid #efefef" }} />
          <div style={{ flex: 1, paddingBottom: 72 }}>
           {loading ? (
  <>{Array.from({ length: 4 }).map((_, i) => <FeedCardSkeleton key={i} />)}</>
) : visiblePosts.length === 0 ? (
              <div style={centered}><p style={{ color: "#aaa", fontSize: 14 }}>No posts yet. Follow people to see their posts!</p></div>
            ) : (
              <>
                {followingPosts.map(p => renderCard(p))}

                {followingPosts.length > 0 && discoverPosts.length > 0 && <AllCaughtUpDivider />}

                {discoverPosts.map(p => renderCard(p))}
              </>
            )}
          </div>
          <Navbar />
        </>
      )}
      {activeIndex !== null && followingStories.length > 0 && (
        <StoryViewer
          stories={followingStories}
          index={activeIndex}
          initialStoryId={pendingStoryJumpId}
          close={() => { setActiveIndex(null); setPendingStoryJumpId(null); }}
        />
      )}
      {previewStory && (
        <FeedStoryPreview
          story={previewStory}
          initialShowViewers={previewShowViewers}
          initialStoryId={previewStoryId}
          onClose={() => { setPreviewAuthorId(null); setPreviewShowViewers(false); setPreviewStoryId(null); }}
          navigate={navigate}
        />
      )}
    </div>
  );
}

export default Homepage;

const topBar       = { display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 16px", borderBottom: "1px solid #efefef", position: "sticky", top: 0, background: "#fff", zIndex: 30 };
const logo         = { color: "rgb(234,182,118)", margin: 0, fontSize: 24 };
const uname        = { fontWeight: 700, fontSize: 14, color: "#111" };
const dropdownStyle = { position: "absolute", right: 0, top: 34, background: "#fff", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 100, minWidth: 200, overflow: "hidden", border: "0.5px solid #eee" };
const imgCard       = { borderBottom: "1px solid #efefef", background: "#fff" };
const imgHeader     = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" };
const headerIconBtn = { border: "none", cursor: "pointer", width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" };
const postImg       = { width: "100%", display: "block", cursor: "pointer", maxHeight: 500, objectFit: "cover" };
const captionStyle  = { padding: "8px 12px 4px", fontSize: 14, lineHeight: 1.5, margin: 0 };
const moreBtnStyle  = { color: "#8e8e8e", fontWeight: 700, cursor: "pointer" };
const likesSummaryStyle = { padding: "2px 12px 0", margin: 0, fontSize: 13, color: "#333", cursor: "pointer" };
const imgActions    = { display: "flex", alignItems: "center", padding: "8px 10px 12px", gap: 8 };
const imgActionBtn  = { border: "none", flex: 1, height: 40, borderRadius: 10, background: "#efefef", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
const textCard      = { background: "#fff", borderBottom: "1px solid #efefef", padding: "14px 0px 0" };
const textActionBtn = { border: "none", background: "#efefef", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 38, flex: 1, borderRadius: 10, padding: "0 8px" };
const textCount     = { fontSize: 13, color: "#555", fontWeight: 600 };
const centered      = { display: "flex", justifyContent: "center", alignItems: "center", padding: 60 };
const spinnerStyle  = { width: 28, height: 28, border: "3px solid #eee", borderTop: "3px solid #f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite" };
const emptyStyle    = { textAlign: "center", color: "#aaa", padding: "32px 0", fontSize: 15, margin: 0 };
const searchWrapStyle  = { display: "flex", alignItems: "center", gap: 6, background: "#f0f0f0", borderRadius: 10, padding: "0 10px" };
const searchInputStyle = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: 14, outline: "none" };

const heartBurstOverlay = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  pointerEvents: "none", zIndex: 3,
};
const heartBurstIcon = {
  filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.35))",
  animation: "heartBurst 0.8s ease",
};

const videoMuteBtn = {
  position: "absolute", bottom: 10, right: 10, zIndex: 4,
  background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%",
  width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer",
};





const feedPreviewSpinner        = { width: 30, height: 30, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" };