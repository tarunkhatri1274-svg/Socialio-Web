import React, { useEffect, useState, useRef } from "react";
import { FaThumbsUp, FaEllipsisV, FaRegComment, FaEye } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import socket from "../../sockets/sockets";
import MemoryLikesSheet from "./MemoryLikesSheet.jsx";
import MemoryCommentsSheet from "./MemoryCommentSheet.jsx";
import MemoryViewsSheet from "./MemoryViewsSheet.jsx";

const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function safeParseUser() {
  try { return JSON.parse(localStorage.getItem("user")) || {}; } catch { return {}; }
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

function Avatar({ src, username, size = 36 }) {
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid white" };
  if (src) return <img src={src} alt={username} style={base} />;
  return (
    <div style={{ ...base, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>
      {username?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

// ── MemoryViewer — full-screen, story-viewer visual language, for ONE
// memory group ("Highlight"). Fetches the group's items itself (so it
// always reflects the latest add/delete), and moves between items in
// that same group with the progress bar at top. Bottom bar: a quick
// comment input (posts directly), a comment-thread icon (opens the full
// CRUD comments sheet), a like button + count (tap count for the Likes
// sheet), a views count (owner only — tap for the Views sheet), and —
// owner only — a ⋮ menu with Hide from non-followers / Add another
// memory (adds into THIS group) / Delete this memory.
//
// `initialItemId` (new) lets a caller land directly on a specific slide
// instead of just an index — used when opening the viewer from a
// notification (memory_like / memory_comment / memory_reply /
// memory_like_comment), since the item's position in the group can
// change over time but its id can't.
//
// `initialSheet` ("likes" | "comments" | null), `initialCommentId`, and
// `initialReplyId` come from the same notification handoff (see
// readMemoryHandoff() in utils/notificationHandoff.js) — once the target
// item is loaded, the matching sheet pops open automatically, and for
// comment/reply notifications the specific comment/reply is highlighted.
function MemoryViewer({ groupId, isOwner, initialIndex = 0, initialItemId = null, initialSheet = null, initialCommentId = null, initialReplyId = null, onClose, onGroupEmptied, onRequestAddItem, onItemDeleted }) {
  const navigate    = useNavigate();
  const currentUser = safeParseUser();
  const MY_ID       = (currentUser?._id || currentUser?.id)?.toString();

  // ── ALL hooks are declared unconditionally, up front — fixes the
  // "rendered fewer hooks than expected" crash that came from returning
  // null before hooks were called.
  const [loading, setLoading]         = useState(true);
  const [group, setGroup]             = useState(null);
  const [items, setItems]             = useState([]);
  const [current, setCurrent]         = useState(initialIndex);
  const [progress, setProgress]       = useState(0);
  const [paused, setPaused]           = useState(false);
  const [liked, setLiked]             = useState(false);
  const [likesCount, setLikesCount]   = useState(0);
  const [viewsCount, setViewsCount]   = useState(0);
  const [comment, setComment]         = useState("");
  const [showMenu, setShowMenu]       = useState(false);
  const [showLikes, setShowLikes]     = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showViews, setShowViews]     = useState(false);
  const [accessDenied, setAccessDenied] = useState(null);
  const [isHidden, setIsHidden]       = useState(false);
  // ← NEW — mirrors item.disableComments locally so the ⋮ menu label and
  // the comments sheet (which reads this as a prop) update instantly
  // after toggling, instead of waiting for a full re-fetch of the group.
  const [commentsOff, setCommentsOff] = useState(false);
  // ← NEW — which comment/reply (if any) to scroll to + highlight once
  // the comments sheet auto-opens from a notification.
  const [highlightCommentId, setHighlightCommentId] = useState(initialCommentId);
  const [highlightReplyId,   setHighlightReplyId]   = useState(initialReplyId);
  // Guards against re-opening the sheet again if the group refetches
  // (e.g. after a like/comment socket event) while it's still open.
  const sheetAppliedRef = useRef(false);

  const timerRef = useRef(null);
  const videoRef = useRef(null);

  const item    = items[current] || null;
  const isVideo = item?.media?.type === "video";
  const isOwn   = isOwner ?? (item?.author?.toString() === MY_ID);

  // ── Fetch the group's items on mount / whenever groupId changes ────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAccessDenied(null);
    (async () => {
      try {
        const res  = await fetch(`${API}/memories/groups/${groupId}/items`, { headers: authHeaders() });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setGroup(data.group);
          setItems(data.items);
          // ← Deep-link: if we were told a specific item to land on
          // (from a notification tap), find its current index. Falls
          // back to initialIndex/0 if that item no longer exists (e.g.
          // it was deleted since the notification fired).
          if (initialItemId) {
            const idx = data.items.findIndex((it) => it._id === initialItemId);
            setCurrent(idx >= 0 ? idx : Math.min(initialIndex ?? 0, Math.max(data.items.length - 1, 0)));
          } else {
            setCurrent((prev) => Math.min(initialIndex ?? prev, Math.max(data.items.length - 1, 0)));
          }
        } else if (res.status === 403) {
          setAccessDenied("not_following");
        }
      } catch { /* non-fatal */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  // ← NEW — once the deep-linked item is actually the current slide,
  // pop open whichever sheet the notification pointed at. Waits for
  // `item` (not just `loading`) so it fires after `current` has been
  // resolved to the right index above.
  useEffect(() => {
    if (sheetAppliedRef.current) return;
    if (!initialSheet || !item) return;
    if (initialItemId && item._id !== initialItemId) return;

    if (initialSheet === "likes") setShowLikes(true);
    if (initialSheet === "comments") setShowComments(true);
    sheetAppliedRef.current = true;
  }, [initialSheet, initialItemId, item]);

  // Auto-close if the group ends up with zero visible items (e.g. the
  // last one was just deleted, or none of them are visible to this
  // viewer). Calling the parent's setState (onClose/onGroupEmptied)
  // straight from this effect's body could land in the SAME commit that
  // React is still flushing for a sibling/parent component — that's
  // exactly what was producing the "Cannot update a component
  // (`UserProfileView`) while rendering a different component
  // (`MemoryViewer`)" warning in the console. Deferring the actual calls
  // with a zero-delay timeout pushes them into their own separate tick,
  // safely after the current commit finishes. The cleanup also means
  // React 18 Strict Mode's deliberate mount→cleanup→mount replay in dev
  // cancels the first (throwaway) timer instead of firing it twice.
  useEffect(() => {
    if (loading || items.length !== 0) return;
    const t = setTimeout(() => {
      onGroupEmptied?.(groupId);
      onClose();
    }, 0);
    return () => clearTimeout(t);
  }, [loading, items.length]);

  // ── Join/leave the current item's socket room for live likes/comments/views ──
  useEffect(() => {
    if (!item?._id) return;
    socket.emit("joinMemoryItem", item._id);
    return () => socket.emit("leaveMemoryItem", item._id);
  }, [item?._id]);

  // ── Seed like/view state from the item payload, then confirm from server ────
  useEffect(() => {
    if (!item?._id) return;
    setLiked(!!item.liked);
    setLikesCount(item.likesCount || 0);
    setViewsCount(item.viewsCount || 0);
    setIsHidden(!!item.isHiddenFromNonFollowers);
    setCommentsOff(!!item.disableComments);

    fetch(`${API}/memories/items/${item._id}/view`, { method: "PUT", headers: authHeaders() })
      .then((res) => res.json())
      .then((data) => { if (data?.success) setViewsCount(data.viewsCount); })
      .catch(() => {});

    const onLikes = ({ likesCount: count }) => setLikesCount(count);
    const onViews = ({ viewsCount: count }) => setViewsCount(count);
    socket.on(`memoryItem:${item._id}:likes`, onLikes);
    socket.on(`memoryItem:${item._id}:views`, onViews);
    return () => {
      socket.off(`memoryItem:${item._id}:likes`, onLikes);
      socket.off(`memoryItem:${item._id}:views`, onViews);
    };
  }, [item?._id]);

  // ── Progress timer (image auto-advance; video advances on end) ─────────
  useEffect(() => {
    setProgress(0);
    clearInterval(timerRef.current);
    if (paused || accessDenied || isVideo || !item) return;
timerRef.current = setInterval(() => {
  setProgress((p) => {
    if (p >= 100) {
      // Don't call handleNext() (which can call the parent's onClose)
      // synchronously from inside this updater — defer it to its own
      // tick, same pattern already used for the empty-group effect
      // below.
      setTimeout(handleNext, 0);
      return 0;
    }
    return p + 2;
  });
}, 100);
    return () => clearInterval(timerRef.current);
  }, [current, paused, accessDenied, isVideo, item]);

  useEffect(() => { setPaused(showMenu || showLikes || showComments || showViews); }, [showMenu, showLikes, showComments, showViews]);

  useEffect(() => {
    if (!videoRef.current) return;
    paused ? videoRef.current.pause() : videoRef.current.play().catch(() => {});
  }, [paused]);
// Drives the top progress bar for VIDEO items — images get their fill
// from the setInterval timer above, but videos should track their own
// actual playback position/length instead of a fake fixed-speed timer.
const handleVideoTimeUpdate = () => {
  const el = videoRef.current;
  if (!el || !el.duration || isNaN(el.duration)) return;
  setProgress((el.currentTime / el.duration) * 100);
};
  const handleNext = () => {
    if (current < items.length - 1) setCurrent((c) => c + 1);
    else onClose();
  };
  const handlePrev = () => {
    if (current > 0) setCurrent((c) => c - 1);
  };

  const handleLike = async () => {
    if (!item?._id) return;
    try {
      const res  = await fetch(`${API}/memories/items/${item._id}/like`, { method: "PUT", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikesCount(data.likesCount);
      } else if (res.status === 403) setAccessDenied("not_following");
    } catch { /* non-fatal */ }
  };

  const handleSendComment = async () => {
    if (!comment.trim() || !item?._id) return;
    if (commentsOff && !isOwn) return;
    const text = comment;
    setComment("");
    try {
      await fetch(`${API}/memories/items/${item._id}/comments`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ text }),
      });
      // The comments sheet (if open elsewhere) picks this up live via
      // the `memoryItem:{id}:newComment` socket broadcast.
    } catch { /* non-fatal */ }
  };

  const handleDelete = async () => {
    if (!item?._id) return;
    if (!window.confirm("Delete this memory?")) return;
    try {
      const res  = await fetch(`${API}/memories/items/${item._id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        onItemDeleted?.(item._id, groupId, data.groupDeleted);
        if (data.groupDeleted) {
          onGroupEmptied?.(groupId);
          onClose();
        } else {
          setItems((prev) => prev.filter((it) => it._id !== item._id));
          setCurrent((c) => Math.max(0, Math.min(c, items.length - 2)));
        }
      } else {
        alert(data.message);
      }
    } catch (e) { console.log(e); }
  };

  const handleToggleHide = async () => {
    if (!item?._id) return;
    try {
      const res  = await fetch(`${API}/memories/items/${item._id}/hide`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setIsHidden(data.isHiddenFromNonFollowers);
        setShowMenu(false);
      } else {
        alert(data.message || "Couldn't update visibility");
      }
    } catch (e) { console.log(e); }
  };

  // ← NEW — flips disableComments on THIS item. This is the fix for
  // memories that got stuck permanently comment-locked from before the
  // FormData boolean parsing was corrected — previously the only way
  // out was deleting and re-uploading the whole memory.
  const handleToggleComments = async () => {
    if (!item?._id) return;
    try {
      const res  = await fetch(`${API}/memories/items/${item._id}/toggle-comments`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setCommentsOff(data.disableComments);
        setShowMenu(false);
      } else {
        alert(data.message || "Couldn't update comment settings");
      }
    } catch (e) { console.log(e); }
  };

  const goToProfile = () => { if (group?.author?._id) navigate(`/profile/${group.author._id}`); };

  // ══════════════════════════════════════════════════════════════════════
  // Every hook above runs on every render regardless of state — only the
  // JSX below branches. This is the ONLY place we conditionally return.
  // ══════════════════════════════════════════════════════════════════════

  if (accessDenied) {
    return (
      <div style={S.container}>
        <div style={S.deniedWrap}>
          <Avatar src={group?.author?.profilePic} username={group?.author?.username} size={64} />
          <p style={S.deniedTitle}>Follow to view this memory</p>
          <p style={S.deniedText}>
            {group?.author?.username ? `Only ${group.author.username}'s followers can see this.` : "You need to follow this account first."}
          </p>
          <button style={S.deniedBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (loading || !item) {
    return (
      <div style={S.container}>
        <div style={{ margin: "auto", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={S.container}>

      {/* PROGRESS BARS — one per item in this group */}
      <div style={S.progressWrap}>
        {items.map((_, i) => (
          <div key={i} style={S.progressBg}>
            <div style={{ ...S.progressFill, width: i < current ? "100%" : i === current ? `${progress}%` : "0%" }} />
          </div>
        ))}
      </div>

      {/* MEDIA */}
      {isVideo ? (
      <video
  ref={videoRef}
  key={item.media.url}
  src={item.media.url}
  style={S.img}
  autoPlay
  playsInline
  onEnded={handleNext}
  onTimeUpdate={handleVideoTimeUpdate}
/>
      ) : (
        <img src={item.media.url} style={S.img} alt={group?.name} />
      )}

      <div style={S.topGradient} />
      <div style={S.bottomGradient} />

      {/* HEADER */}
      <div style={S.header}>
        <div style={{ cursor: isOwn ? "default" : "pointer" }} onClick={!isOwn ? goToProfile : undefined}>
          <Avatar src={group?.author?.profilePic} username={group?.author?.username} size={36} />
        </div>
        <div style={S.headerInfo} onClick={!isOwn ? goToProfile : undefined}>
          <span style={{ ...S.username, cursor: isOwn ? "default" : "pointer" }}>{group?.author?.username}</span>
          <span style={S.memoryName}>{group?.name}</span>
        </div>
        {isOwn && (
          <span style={S.viewsBadge} onClick={() => setShowViews(true)} title="Who viewed this">
            <FaEye size={13} /> {formatCount(viewsCount)}
          </span>
        )}
        <button onClick={onClose} style={S.closeBtn}><IoClose size={24} /></button>
      </div>

      {/* NAV ZONES */}
      <div style={S.navLeft}  onClick={handlePrev} />
      <div style={S.navRight} onClick={handleNext} />

      {/* BOTTOM BAR — comment box, comment-thread icon, like+count, ⋮ (owner) */}
      <div style={S.bottom}>
        <div style={S.bottomRow}>
          {/* ← Comments-off + viewer (not owner): the quick-comment input
              is simply not rendered at all — no greyed-out box, no
              placeholder explaining why, no way to trigger a 403. The
              owner still sees (and can use) it, since disableComments
              never applies to the owner's own comments. */}
          {(isOwn || !commentsOff) && (
            <input
              placeholder="Comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendComment()}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              style={S.input}
            />
          )}
          <button onClick={() => setShowComments(true)} style={S.iconBtn} title="View comments">
            <FaRegComment size={18} />
          </button>
          <button onClick={handleLike} style={S.iconBtn} title="Like">
            <FaThumbsUp size={17} color={liked ? GOLDEN : "#fff"} />
          </button>
          <span style={S.likeCount} onClick={() => setShowLikes(true)}>
            {formatCount(likesCount)}
          </span>
          {isOwn && (
            <div style={{ position: "relative" }}>
              <button style={S.iconBtn} onClick={() => setShowMenu((v) => !v)}><FaEllipsisV size={17} /></button>
              {showMenu && (
                <>
                  <div style={S.menuOverlay} onClick={() => setShowMenu(false)} />
                  <div style={S.feedStyleMenu}>
                    <button className="feed-menu-item" style={S.feedMenuItem} onClick={handleToggleHide}>
                      {isHidden ? "Show to everyone" : "Hide from non-followers"}
                    </button>
                    <button className="feed-menu-item" style={S.feedMenuItem} onClick={handleToggleComments}>
                      {commentsOff ? "Turn comments on" : "Turn comments off"}
                    </button>
                    <button
                      className="feed-menu-item"
                      style={S.feedMenuItem}
                      onClick={() => { setShowMenu(false); onRequestAddItem?.(groupId); }}
                    >
                      Add another memory
                    </button>
                    <button
                      className="feed-menu-item"
                      style={{ ...S.feedMenuItem, color: "#ff3b30", borderBottom: "none" }}
                      onClick={handleDelete}
                    >
                      Delete this memory
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showLikes && <MemoryLikesSheet itemId={item._id} onClose={() => setShowLikes(false)} />}
      {showComments && (
        <MemoryCommentsSheet
          itemId={item._id}
          disableComments={commentsOff}
          onClose={() => { setShowComments(false); setHighlightCommentId(null); setHighlightReplyId(null); }}
          highlightCommentId={highlightCommentId}
          highlightReplyId={highlightReplyId}
        />
      )}
      {showViews && <MemoryViewsSheet itemId={item._id} onClose={() => setShowViews(false)} />}
    </div>
  );
}

export default MemoryViewer;

const S = {
  container:      { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "#000", zIndex: 1000, display: "flex", flexDirection: "column", maxWidth: "480px", margin: "0 auto", right: 0 },
  progressWrap:   { display: "flex", gap: "3px", padding: "10px 10px 0", position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  progressBg:     { flex: 1, height: "2px", background: "rgba(255,255,255,0.35)", borderRadius: "2px", overflow: "hidden" },
  progressFill:   { height: "100%", background: "white", borderRadius: "2px", transition: "width 0.1s linear" },
  img:            { width: "100%", height: "100%", objectFit: "contain" },
  topGradient:    { position: "absolute", top: 0, left: 0, right: 0, height: "120px", background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)", zIndex: 3 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "180px", background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)", zIndex: 3 },
  header:         { position: "absolute", top: "20px", left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: "10px", padding: "0 12px" },
  headerInfo:     { display: "flex", flexDirection: "column", gap: "1px" },
  username:       { color: "white", fontSize: "14px", fontWeight: "600" },
  memoryName:     { color: "rgba(255,255,255,0.75)", fontSize: "11px" },
  viewsBadge:     { display: "flex", alignItems: "center", gap: 5, color: "white", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginLeft: "auto", background: "rgba(255,255,255,0.15)", padding: "5px 10px", borderRadius: 14 },
  closeBtn:       { background: "none", border: "none", color: "white", cursor: "pointer", marginLeft: "8px" },
  navLeft:        { position: "absolute", left: 0, top: 0, width: "40%", height: "100%", zIndex: 5, cursor: "pointer" },
  navRight:       { position: "absolute", right: 0, top: 0, width: "60%", height: "100%", zIndex: 5, cursor: "pointer" },
  bottom:         { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10, padding: "0 14px 32px" },
  bottomRow:      { display: "flex", alignItems: "center", gap: "10px" },
  input:          { flex: 1, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "24px", padding: "10px 16px", color: "white", outline: "none", fontSize: 14, minWidth: 0 },
  iconBtn:        { background: "none", border: "none", color: "white", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" },
  likeCount:      { color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, marginLeft: -4 },
  feedStyleMenu:  { position: "absolute", right: 0, bottom: "44px", background: "#fff", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 20, minWidth: 210, overflow: "hidden", border: "0.5px solid #eee" },
  feedMenuItem:   { display: "block", width: "100%", padding: "12px 16px", border: "none", background: "#fff", textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#222", borderBottom: "0.5px solid #f0f0f0" },
  menuOverlay:    { position: "fixed", inset: 0, zIndex: 19 },
  deniedWrap:     { margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 32px", textAlign: "center" },
  deniedTitle:    { color: "#fff", fontSize: 17, fontWeight: 700, margin: "10px 0 0" },
  deniedText:     { color: "rgba(255,255,255,0.6)", fontSize: 14, margin: 0, lineHeight: 1.5 },
  deniedBtn:      { marginTop: 16, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "10px 28px", borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: "pointer" },
};