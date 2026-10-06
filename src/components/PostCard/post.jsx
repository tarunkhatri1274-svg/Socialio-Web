import { useState, useRef, useEffect } from "react";
import {
  FaThumbsUp, FaComment, FaPaperPlane,
  FaBookmark, FaDownload, FaEllipsisV,
  FaChevronLeft, FaChevronRight,
} from "react-icons/fa";
import ShareSheet from "./ShareSheet.jsx";
import { FiX, FiSearch, FiTag, FiUsers } from "react-icons/fi";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import socket from "../../sockets/sockets";
import CommentSection from "./CommentSection";
import { useFollowStore, getIsFollowing } from "../../pages/Profile/usefollowState.jsx";
import { isPostSaved, toggleSavedPost, subscribeSavedPosts } from "../state/savedPostsStore.js";
import { consumePostSheet } from "../../utils/notificationHandoff.js";
const API = import.meta.env.VITE_API_URL;
const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

function safeParseUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "undefined" || raw === "null") return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function timeAgo(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Count formatter (1000 -> 1K, 1500000 -> 1.5M, etc.) ─────────────────────
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

// ── One-time global keyframes for the double-tap "like burst" animation
// (heart/thumb pops up, briefly scales past 100%, then fades). Guarded by
// id so re-renders / multiple PostCards on the page don't inject it twice,
// same idiom the app already uses for the notifications-page spinner.
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

// ── Render co-author names "Instagram style" as individually clickable
// spans: "a", "a and b", "a, b and c", "a, b, c and 2 others" for longer
// lists — joined with plain connector text, but each actual username is
// its own element with its own onClick, so clicking "tarun00" navigates
// to tarun00 and not whichever person happens to be first in the list.
// People past the 3rd are summarized as "N others" and aren't
// individually clickable, matching Instagram's own behavior for that case.
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

function Avatar({ src, username, size = 35, style: extraStyle = {}, onClick }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, cursor: onClick ? "pointer" : undefined };
  if (src) return <img src={src} alt={username} style={{ ...base, ...extraStyle }} onClick={onClick} />;
  return (
    <div style={{ ...base, ...extraStyle, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600", fontSize: size * 0.4 }} onClick={onClick}>
      {letter}
    </div>
  );
}

// ── Stacked co-author avatars + combined names. Renders the post
// author first, then every ACCEPTED collaborator, each overlapping the
// last — same visual idiom Instagram uses for "Posts you're tagged in
// together" headers. Each avatar AND each name navigates to that
// specific person.
function CoAuthorHeader({ author, acceptedCollaborators, onNavigate }) {
  const people = [author, ...acceptedCollaborators.map((c) => c.user)].filter(Boolean);

  if (people.length <= 1) {
    return (
      <div style={userInfoStyle}>
        <Avatar
          src={author?.profilePic}
          username={author?.username}
          size={38}
          onClick={() => onNavigate(author?._id)}
        />
        <div>
          <div
            style={{ ...usernameStyle, cursor: "pointer" }}
            onClick={() => onNavigate(author?._id)}
          >
            {author?.username}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={userInfoStyle}>
      <div style={{ display: "flex", flexShrink: 0 }}>
        {people.slice(0, 3).map((p, i) => (
          <Avatar
            key={p._id ?? i}
            src={p.profilePic}
            username={p.username}
            size={38}
            style={i === 0 ? {} : { marginLeft: "-14px", border: "2px solid #fff" }}
            onClick={() => onNavigate(p._id)}
          />
        ))}
      </div>
      <div>
        <div style={usernameStyle}>
          <CoAuthorNames people={people} onNavigate={onNavigate} />
        </div>
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

// ── Media Carousel ─────────────────────────────────────────────────────────
// NEW: double-tap (mobile) / double-click (desktop) on the media now
// triggers a like, with a brief heart/thumb "burst" animation over the
// image — the standard Instagram-style double-tap-to-like gesture.
// `onDoubleTapLike` is provided by PostCard; it only LIKES (never
// unlikes) on repeat taps, matching platform convention.
function MediaCarousel({ media, onDoubleTapLike }) {
  const [current, setCurrent] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const lastTapRef = useRef(0);
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const total = media?.length || 0;
  if (total === 0) return null;
  const item = media[current];

  const triggerBurst = () => {
    onDoubleTapLike?.();
    setShowBurst(true);
    setTimeout(() => setShowBurst(false), 700);
  };

  // Mobile browsers don't fire onDoubleClick for touch reliably, so we
  // detect two taps within 300ms manually; desktop still gets the native
  // onDoubleClick as a fallback (harmless if both fire once).
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) triggerBurst();
    lastTapRef.current = now;
  };

  // ── Horizontal swipe between images/videos in THIS post — no arrow
  // buttons needed on touch devices, though the buttons/dots stay for
  // mouse users. A swipe that's mostly VERTICAL (or too short) is left
  // alone here so it falls through to the tap handler above (for
  // double-tap-to-like) or to normal page scrolling — it's only treated
  // as "change slide" once it's clearly a horizontal drag.
  const SWIPE_THRESHOLD = 50;
  const handleTouchStart = (e) => {
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return; // not a horizontal swipe
    if (dx < 0) setCurrent((c) => Math.min(c + 1, total - 1)); // swiped left → next
    else        setCurrent((c) => Math.max(c - 1, 0));         // swiped right → previous
  };

  return (
    <div
      style={{ position: "relative", background: "#000" }}
      onClick={handleTap}
      onDoubleClick={triggerBurst}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {item?.type === "video" ? (
        <video src={item.url} controls style={{ width: "100%", maxHeight: "500px", display: "block", objectFit: "contain" }} />
      ) : (
        <img src={item?.url} alt={`media-${current}`} style={{ width: "100%", display: "block", objectFit: "cover" }}
          onError={(e) => { e.target.src = "https://via.placeholder.com/400x300?text=Not+Found"; }} />
      )}

      {showBurst && (
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

      {total > 1 && (
        <>
          {current > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setCurrent(i => i - 1); }} style={arrowStyle("left")}>
              <FaChevronLeft size={12} color="#fff" />
            </button>
          )}
          {current < total - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setCurrent(i => i + 1); }} style={arrowStyle("right")}>
              <FaChevronRight size={12} color="#fff" />
            </button>
          )}
          <div style={dotsWrap}>
            {media.map((_, i) => (
              <div key={i} onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                style={{ width: i === current ? 18 : 6, height: 6, borderRadius: 3, background: i === current ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.2s" }} />
            ))}
          </div>
          <div style={counterStyle}>{current + 1} / {total}</div>
        </>
      )}
    </div>
  );
}

const arrowStyle   = (side) => ({ position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 10, background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2 });
const dotsWrap     = { position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, alignItems: "center" };
const counterStyle = { position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 };

// ── Tags Row ───────────────────────────────────────────────────────────────
// FIX: tags are used in this app as username mentions (see CreateImagePost's
// "Tags" section — "#user11" etc), but tapping one previously did nothing at
// all; there was no click handler on the chip. Since we only store the tag
// STRING (not the tagged user's id), tapping a tag now resolves it against
// the same username-search endpoint the collaborator search uses, and
// navigates on an exact (case-insensitive) username match.
function TagsRow({ tags, postId, isOwner, onTagsUpdate }) {
  const [tagInput,   setTagInput]   = useState("");
  const [showInput,  setShowInput]  = useState(false);
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

  // ← resolve a tag string to a user and navigate to their profile.
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
    <div style={{ padding: "4px 12px 8px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {tags?.map(t => (
        <div key={t} style={tagChip}>
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
            <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTag()}
              placeholder="tag..." autoFocus style={{ border: "1px solid #ddd", borderRadius: 20, padding: "3px 10px", fontSize: 12, outline: "none", width: 80 }} />
            <button onClick={addTag} style={addTagBtn}>+</button>
            <FiX size={12} style={{ cursor: "pointer", color: "#aaa" }} onClick={() => setShowInput(false)} />
          </div>
        ) : <button onClick={() => setShowInput(true)} style={addTagBtn}>+ tag</button>
      )}
    </div>
  );
}

// ── Collaborators Row — owner-only "invite more collaborators" search.
// FIX: previously ANY existing collaborators entry (pending, accepted, OR
// declined) permanently hid that user from search results, so once
// someone declined an invite there was no way to even find them again to
// re-invite. Now only a live pending/accepted entry blocks re-appearing —
// a declined user shows back up and can be re-invited. The backend
// (addCollaborator) has a matching fix: it resets a declined entry back
// to "pending" instead of 400ing.
function CollabRow({ collaborators, postId, isOwner, onCollabUpdate }) {
  const [search,     setSearch]     = useState("");
  const [results,    setResults]    = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const timer    = useRef(null);
  const navigate = useNavigate();

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
      else if (data.message) {
        // surface backend rejection (e.g. genuinely still-pending invite)
        alert(data.message);
      }
    } catch {}
  };

  if (!isOwner) return null;

  return (
    <div style={{ padding: "4px 12px 10px" }}>
      {showSearch ? (
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", border: "1px solid #ddd", borderRadius: 10, padding: "6px 10px" }}>
            <FiSearch size={12} color="#aaa" />
            <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Invite a collaborator..." autoFocus
              style={{ border: "none", outline: "none", fontSize: 13, flex: 1 }} />
            <FiX size={12} style={{ cursor: "pointer", color: "#aaa" }} onClick={() => { setShowSearch(false); setSearch(""); setResults([]); }} />
          </div>
          {results.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, marginTop: 4, overflow: "hidden" }}>
              {results
                .filter(u => !collaborators.some(c => c.user?._id === u._id && c.status !== "declined"))
                .map(u => {
                  const declined = collaborators.some(c => c.user?._id === u._id && c.status === "declined");
                  return (
                    <div key={u._id} onClick={() => addCollab(u._id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderBottom: "0.5px solid #f5f5f5" }}>
                      <Avatar src={u.profilePic} username={u.username} size={28} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</span>
                      {declined && <span style={{ fontSize: 11, color: "#aaa", marginLeft: "auto" }}>declined — invite again</span>}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setShowSearch(true)} style={{ ...addTagBtn, display: "flex", alignItems: "center", gap: 4 }}>
          <FiUsers size={11} /> + invite collaborator
        </button>
      )}
      {collaborators.some(c => c.status === "pending") && (
        <p style={{ fontSize: 11, color: "#aaa", margin: "8px 0 0" }}>
          {collaborators.filter(c => c.status === "pending").map(c => c.user?.username).join(", ")} invited — waiting for them to accept.
        </p>
      )}
    </div>
  );
}

// ── Mutual/social-proof likes line — "Liked by X and N others", tappable
// to open the full likers sheet. Purely display-side social proof (like
// Instagram's summary line under the action row); if the backend later
// flags which liker(s) the viewer actually follows (e.g. a `youFollow`
// boolean on each entry from /auth/likers), pass a pre-sorted
// `likedByUsers` array with those first and this will automatically
// surface them since it just reads likedByUsers[0].
function LikesSummary({ likedByUsers, likesCount, hideLikeCount, isOwner, onOpen }) {
  if (hideLikeCount && !isOwner) return null;
  if (!likesCount) return null;
  const first = likedByUsers?.[0];
  const others = likesCount - (first ? 1 : 0);

  return (
    <p style={mutualLikesStyle} onClick={onOpen}>
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

// ── PostCard ───────────────────────────────────────────────────────────────
function PostCard({ p, onDeleted }) {
  const navigate      = useNavigate();
  const currentUser   = safeParseUser();
  const currentUserId = currentUser?._id || currentUser?.id;
  const authorId      = p?.author?._id || p?.author;
  const isOwner       = currentUserId?.toString() === p?.author?._id?.toString() ||
                        currentUserId?.toString() === p?.author?.toString();

  const [isPrivate, setIsPrivate] = useState(p?.author?.isPrivate ?? false);

  useEffect(() => {
    const onPrivacy = ({ userId, isPrivate: priv }) => {
      if (userId === authorId?.toString()) setIsPrivate(priv);
    };
    socket.on("privacyChanged", onPrivacy);
    return () => socket.off("privacyChanged", onPrivacy);
  }, [authorId]);

  const [liked,           setLiked]           = useState(false);
  const [likesCount,      setLikesCount]       = useState(p?.likes?.length || 0);
  const [likedByUsers,    setLikedByUsers]     = useState([]);
  const [saved,           setSaved]            = useState(() => isPostSaved(p?._id));
  const [menuOpen,        setMenuOpen]         = useState(false);
  const [showLikers,      setShowLikers]       = useState(false);
  const [showComments,    setShowComments]     = useState(false);
  const [showShare,       setShowShare]        = useState(false);
  const [commentText,     setCommentText]      = useState("");
  const [likerSearch,     setLikerSearch]      = useState("");
  const [isNotInterested, setIsNotInterested]  = useState(p?.isNotInterested || false);
  const [isHidden,        setIsHidden]         = useState(p?.isHiddenFromNonFollowers || false);
  const [isBlocked,       setIsBlocked]        = useState(false);
  const [comments,        setComments]         = useState(p?.comments ?? []);
  const [tags,            setTags]             = useState(p?.tags ?? []);
  const [collaborators,   setCollaborators]    = useState(p?.collaborators ?? []);
  const [sharesCount,     setSharesCount]      = useState(p?.shares?.length ?? p?.sharesCount ?? 0);
  const [downloadsCount,  setDownloadsCount]   = useState(p?.downloads?.length ?? p?.downloadsCount ?? 0);
  const [removedFromView, setRemovedFromView]  = useState(false);
  // ← NEW — which comment/reply (if any) to scroll to + highlight once
  // the Comments sheet opens, set from a notification handoff below.
  const [highlightCommentId, setHighlightCommentId] = useState(null);
  const [highlightReplyId,   setHighlightReplyId]   = useState(null);

  // ← NEW — a tap on a like/comment/reply notification (see
  // activitypage.jsx's handleOpen) leaves behind which sheet to open for
  // THIS post. Consume it once we actually know the post's real _id.
  //
  // FIXED — also re-fires on `location.key`, not just `p?._id`. If you're
  // already viewing this exact post (e.g. from an earlier comment
  // notification) and a NEW reply notification comes in for the same
  // post, navigate() goes to the same URL — p._id never changes, so a
  // dependency list of just [p?._id] would never re-run this and the
  // freshly-stashed sheet would sit unconsumed. React Router gives every
  // navigation a new location.key even for identical paths, so using it
  // here re-triggers the check every single time you're routed here.
  const location = useLocation();
  useEffect(() => {
    if (!p?._id) return;
    const pending = consumePostSheet(p._id);
    if (!pending) return;
    if (pending.sheet === "likes") setShowLikers(true);
    if (pending.sheet === "comments") {
      setShowComments(true);
      setHighlightCommentId(pending.commentId || null);
      setHighlightReplyId(pending.replyId || null);
    }
  }, [p?._id, location.key]);

  const sheetRef       = useRef(null);
  const shareSheetRef  = useRef(null);
  const likersSheetRef = useRef(null);
  const startY         = useRef(0);
  const menuRef        = useRef(null);
  const cardRef        = useRef(null);

  const username = p?.author?.username || p?.username || "Unknown";
  const caption  = p?.caption || "";

  // ← post-level visibility flags set at creation time (CreateImagePost).
  // Owner always sees everything regardless of these; other viewers get
  // the restricted view.
  const hideLikeCount    = !!p?.hideLikeCount;
  const hideCommentCount = !!p?.hideCommentCount;
  const disableDownload  = !!p?.disableDownload;
  // ← NEW: fully turns commenting off for everyone except the owner —
  // distinct from hideCommentCount, which only hides the NUMBER while
  // still letting people comment. When this is on, non-owners don't
  // even get the comment button (so there's no way to open the sheet
  // or submit one from the UI). Server-side, the comment-add endpoint
  // should also reject when this flag is set — see the note left in
  // media.controllers.patch notes; this file only controls the UI.
  const disableComments  = !!p?.disableComments;
  const canDownload      = !disableDownload || isOwner;
  const canComment       = !disableComments || isOwner;

  useEffect(() => {
    if (!p?._id) return;
    socket.emit("joinPost", p._id);
    return () => socket.emit("leavePost", p._id);
  }, [p?._id]);

  useEffect(() => {
    if (!p?._id) return;

    const fetchLikers = async () => {
      try {
        const res  = await fetch(`${API}/auth/likers/${p._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setLikedByUsers(data.likedBy ?? []);
          setLikesCount(data.totalLikes ?? 0);
          setLiked((data.likedBy ?? []).some(u => u._id === currentUserId));
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
const fetchCollaborators = async () => {
  try {
    const res  = await fetch(`${API}/auth/get-post/${p._id}`, { headers: authHeaders() });
    const data = await res.json();
    if (data.success) setCollaborators(data.post.collaborators ?? []);
  } catch {}
};
fetchCollaborators();
    const onLikes        = ({ totalLikes, likedBy }) => { setLikesCount(totalLikes); if (likedBy) { setLikedByUsers(likedBy); setLiked(likedBy.some(u => u._id === currentUserId)); } };
    const onNewComment   = ({ comment }) => setComments(prev => prev.some(c => c._id === comment._id) ? prev : [...prev, comment]);
    const onDelComment   = ({ commentId }) => setComments(prev => prev.filter(c => c._id !== commentId));

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

    const onPostDeletedForMe = ({ postId }) => {
      if (postId === p._id) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      }
    };

    const onCollabRemoved = ({ postId, userId }) => {
      if (postId !== p._id) return;
      setCollaborators(prev => prev.filter(c => (c.user?._id ?? c.user)?.toString() !== userId));
    };

    const onShareCount    = ({ postId, totalShares }) => { if (postId === p._id && totalShares != null) setSharesCount(totalShares); };
    const onDownloadCount = ({ postId, totalDownloads }) => { if (postId === p._id && totalDownloads != null) setDownloadsCount(totalDownloads); };

    socket.on(`post:${p._id}:likes`,          onLikes);
    socket.on(`post:${p._id}:newComment`,     onNewComment);
    socket.on(`post:${p._id}:commentDeleted`, onDelComment);
    socket.on("commentDeleted",               onDelComment);
    socket.on("collabResponded",              onCollabResponded);
    socket.on("postDeleted",                  onPostDeletedForMe);
    socket.on("collabRemoved",                onCollabRemoved);
    socket.on("postShared",                   onShareCount);
    socket.on("postDownloaded",               onDownloadCount);

    return () => {
      socket.off(`post:${p._id}:likes`,          onLikes);
      socket.off(`post:${p._id}:newComment`,     onNewComment);
      socket.off(`post:${p._id}:commentDeleted`, onDelComment);
      socket.off("commentDeleted",               onDelComment);
      socket.off("collabResponded",              onCollabResponded);
      socket.off("postDeleted",                  onPostDeletedForMe);
      socket.off("collabRemoved",                onCollabRemoved);
      socket.off("postShared",                   onShareCount);
      socket.off("postDownloaded",               onDownloadCount);
    };
  }, [p?._id, authorId, currentUserId]);

useEffect(() => {
    const unsub = subscribeSavedPosts((postId, savedState) => {
      if (postId === p?._id) setSaved(savedState);
    });
    return unsub;
  }, [p?._id]);

  const toggleSave = () => {
    toggleSavedPost(p);
  };

  const handleToggleLike = async () => {
    try {
      const res  = await fetch(`${API}/auth/like/${p._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setLiked(data.liked); setLikesCount(data.totalLikes); if (data.likedBy) setLikedByUsers(data.likedBy); }
    } catch {}
  };

  // ← double-tap/double-click gesture from MediaCarousel — only LIKES,
  // never unlikes, matching Instagram's convention (repeat double-taps
  // just replay the animation).
  const handleDoubleTapLike = () => {
    if (!liked) handleToggleLike();
  };

  const handleBlock = async () => {
    if (isBlocked) return;
    if (!window.confirm(`Block ${username}?`)) return;
    try {
      const res  = await fetch(`${API}/auth/block/${authorId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setIsBlocked(true); setMenuOpen(false); }
    } catch {}
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this post?")) return;
    try {
      const res  = await fetch(`${API}/auth/delete-post/${p._id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setRemovedFromView(true);
        onDeleted?.(p._id);
      } else {
        alert(data.message);
      }
    } catch {}
  };

  const HideFromNonFollowers = async () => {
    try {
      const res  = await fetch(`${API}/auth/hide-from-non-followers/${p._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { setIsHidden(data.isHidden); alert(data.message); }
    } catch {}
  };

  const notInterested = async () => {
    try {
      const res  = await fetch(`${API}/auth/not-interested/${p._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setIsNotInterested(prev => !prev); alert(data.message); }
    } catch {}
  };

  const handleRemoveCollab = async (collabUser) => {
    const isLeavingSelf = collabUser?._id?.toString() === currentUserId?.toString();
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

  const acceptedCollaborators = (collaborators || []).filter(c => c.status === "accepted");
  const myCollabEntry = acceptedCollaborators.find(
    c => (c.user?._id ?? c.user)?.toString() === currentUserId?.toString()
  );

  const buildMenuOptions = () => {
    const opts = [];
    if (isOwner) {
      opts.push({ key: "delete", label: "Delete", danger: true, action: handleDelete });
      opts.push({
        key: "hide",
        label: isHidden ? "Show to everyone" : "Hide from non-followers",
        action: HideFromNonFollowers,
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
  };

  const menuOptions = buildMenuOptions();

  const handleMenuAction = (opt) => {
    if (opt.disabled) return;
    setMenuOpen(false);
    opt.action();
  };

  // ── Download all media — FIXES:
  // 1) Dropped `target="_blank"` — opening N new tabs at once is exactly
  //    what triggers the browser's popup blocker, which was silently
  //    eating every image after the first in a carousel. A plain
  //    same-tab click with the Cloudinary `fl_attachment` flag still
  //    downloads (doesn't navigate away) and isn't treated as a popup.
  // 2) Small stagger between each click — firing many synchronous clicks
  //    in the same tick can still get coalesced/dropped by some browsers.
  // 3) Respects disableDownload for non-owners.
  const download = async () => {
    if (!canDownload) return;
    try {
      const items = p?.media || [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const randomName = Math.floor(Math.random() * 9000000000 + 1000000000);
        const link = document.createElement("a");
        link.href = item.url.replace("/upload/", `/upload/fl_attachment:${randomName}_${i}/`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (i < items.length - 1) await new Promise(r => setTimeout(r, 400));
      }
      setDownloadsCount(prev => prev + 1);
    } catch {}
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    try {
      const res  = await fetch(`${API}/auth/comment/${p._id}`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ text: commentText }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.some(c => c._id === data.comment._id) ? prev : [...prev, data.comment]);
        setCommentText("");
      }
    } catch {}
  };

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = showComments || showShare || showLikers ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [showComments, showShare, showLikers]);

  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e, ref) => { const diff = e.touches[0].clientY - startY.current; if (diff > 0 && ref.current) ref.current.style.transform = `translateY(${diff}px)`; };
  const handleTouchEnd   = (e, type, ref) => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 120) {
      if (type === "comments") setShowComments(false);
      if (type === "share")    setShowShare(false);
      if (type === "likers")   { setShowLikers(false); setLikerSearch(""); }
    } else if (ref.current) ref.current.style.transform = "translateY(0)";
  };

  const filteredLikers = likedByUsers.filter(u => u.username?.toLowerCase().includes(likerSearch.toLowerCase()));
  const goToProfile    = (userId) => userId && navigate(`/profile/${userId}`);

  if (removedFromView) return null;

  // ── JSX ───────────────────────────────────────────────────────────────
  return (
    <>
      <div ref={cardRef} data-post-id={p?._id} style={cardStyle}>
        <div style={headerStyle}>
          <CoAuthorHeader
            author={p?.author}
            acceptedCollaborators={acceptedCollaborators}
            onNavigate={goToProfile}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={headerActionsStyle} ref={menuRef}>
              <button onClick={toggleSave} style={{ ...iconBtnStyle, background: saved ? "#fff3e0" : "#f0f0f0" }}>
                <FaBookmark color={saved ? "#f5a623" : "#888"} size={15} />
              </button>
              <div style={{ position: "relative" }}>
                <button onClick={() => setMenuOpen(prev => !prev)} style={{ ...iconBtnStyle, background: menuOpen ? "#e8e8e8" : "#f0f0f0" }}>
                  <FaEllipsisV size={15} color="#555" />
                </button>
                {menuOpen && (
                  <div style={dropdownStyle}>
                    {menuOptions.map((opt, i) => (
                      <button
                        key={opt.key}
                        style={{
                          ...menuItemStyle,
                          color: opt.disabled ? "#888" : opt.danger ? "#e53935" : "#333",
                          cursor: opt.disabled ? "default" : "pointer",
                          borderBottom: i < menuOptions.length - 1 ? "0.5px solid #f0f0f0" : "none",
                        }}
                        onClick={() => handleMenuAction(opt)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <MediaCarousel media={p?.media} onDoubleTapLike={handleDoubleTapLike} />

        <div style={actionsStyle}>
          <button onClick={handleToggleLike} style={btnStyle}>
            <FaThumbsUp color={liked ? "#f5a623" : "#666"} size={16} />
            {(!hideLikeCount || isOwner) && (
              <span onClick={(e) => { e.stopPropagation(); setShowLikers(true); }} style={likesCountStyle}>{formatCount(likesCount)}</span>
            )}
          </button>
          {canComment && (
            <button onClick={() => setShowComments(true)} style={btnStyle}>
              <FaComment color="#666" size={16} />
              {(!hideCommentCount || isOwner) && comments.length > 0 && <span style={likesCountStyle}>{formatCount(comments.length)}</span>}
            </button>
          )}
          <button onClick={() => { setMenuOpen(false); setShowShare(true); }} style={btnStyle}>
            <FaPaperPlane color="#666" size={16} />
            {sharesCount > 0 && <span style={likesCountStyle}>{formatCount(sharesCount)}</span>}
          </button>
          {canDownload && (
            <button onClick={download} style={btnStyle}>
              <FaDownload color="#666" size={16} />
              {downloadsCount > 0 && <span style={likesCountStyle}>{formatCount(downloadsCount)}</span>}
            </button>
          )}
        </div>

        <LikesSummary
          likedByUsers={likedByUsers}
          likesCount={likesCount}
          hideLikeCount={hideLikeCount}
          isOwner={isOwner}
          onOpen={() => setShowLikers(true)}
        />

        {caption && (
          <p style={captionStyle}>
            <span style={{ fontWeight: "700", cursor: "pointer" }} onClick={() => goToProfile(authorId)}>{username}</span>{" "}
            <CaptionText text={caption} />
          </p>
        )}
        <TagsRow tags={tags} postId={p._id} isOwner={isOwner} onTagsUpdate={setTags} />
        <CollabRow collaborators={collaborators} postId={p._id} isOwner={isOwner} onCollabUpdate={setCollaborators} />
      </div>

      {showLikers && (
        <div style={overlayStyle} onClick={() => { setShowLikers(false); setLikerSearch(""); }}>
          <div ref={likersSheetRef} style={sheetStyle} onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart} onTouchMove={e => handleTouchMove(e, likersSheetRef)} onTouchEnd={e => handleTouchEnd(e, "likers", likersSheetRef)}>
            <div style={handle} />
            <div style={headerSheet}>
              <b>Liked by</b>
              <FiX size={18} style={{ position: "absolute", right: 16, top: 16, cursor: "pointer" }} onClick={() => { setShowLikers(false); setLikerSearch(""); }} />
            </div>
            {likedByUsers.length > 0 && (
              <div style={{ padding: "0 12px 8px" }}>
                <div style={searchWrapStyle}>
                  <FiSearch size={14} color="#999" />
                  <input value={likerSearch} onChange={e => setLikerSearch(e.target.value)} placeholder="Search" style={searchInputStyle} />
                  {likerSearch && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setLikerSearch("")} />}
                </div>
              </div>
            )}
            <div style={list}>
              {filteredLikers.length > 0 ? filteredLikers.map((u, i) => (
                <div key={u._id ?? i} style={{ ...commentRow, cursor: "pointer" }} onClick={() => { setShowLikers(false); setLikerSearch(""); goToProfile(u._id); }}>
                  <Avatar src={u.profilePic} username={u.username} size={40} />
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "14px" }}>{u.username}</div>
                    {u.bio && <div style={{ fontSize: "12px", color: "#999" }}>{u.bio}</div>}
                  </div>
                </div>
              )) : <p style={{ textAlign: "center", color: "#aaa", padding: "20px 0", fontSize: "14px" }}>{likerSearch ? "No results found" : "No likes yet"}</p>}
            </div>
          </div>
        </div>
      )}

      {showComments && (
        <div style={overlayStyle} onClick={() => { setShowComments(false); setHighlightCommentId(null); setHighlightReplyId(null); }}>
          <div ref={sheetRef} style={sheetStyle} onClick={e => e.stopPropagation()}
            onTouchStart={handleTouchStart} onTouchMove={e => handleTouchMove(e, sheetRef)} onTouchEnd={e => handleTouchEnd(e, "comments", sheetRef)}>
            <div style={handle} />
            <div style={{ ...headerSheet, position: "relative" }}>
              <b>Comments ({formatCount(comments.length)})</b>
              <FiX size={18} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }} onClick={() => { setShowComments(false); setHighlightCommentId(null); setHighlightReplyId(null); }} />
            </div>
            <div style={list}>
              <CommentSection
                comments={comments}
                setComments={setComments}
                currentUser={currentUser}
                postId={p._id}
                postAuthorId={p.author?._id || p.author}
                highlightCommentId={highlightCommentId}
                highlightReplyId={highlightReplyId}
              />
            </div>
            <div style={inputBar}>
              <Avatar src={currentUser?.profilePic} username={username} size={32} />
              <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === "Enter" && addComment()} placeholder="Add a comment..." style={input} />
              <button onClick={addComment} style={postBtn} disabled={!commentText.trim()}>Post</button>
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <ShareSheet postId={p._id} post={p} onClose={() => setShowShare(false)} />
      )}
    </>
  );
}

// ── Post (page) ─────────────────────────────────────────────────────────────
function Post() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { post: statePost, allPosts: initialPosts = [] } = location.state || {};

  const idOf = (v) => (v?._id ?? v ?? "").toString();

  const [fetchedPost, setFetchedPost] = useState(null);
  const [loading,     setLoading]     = useState(!statePost);
  const [notFound,    setNotFound]    = useState(false);

  const post = statePost || fetchedPost;

  const [postsList, setPostsList] = useState(initialPosts);
  const hadPostsRef = useRef(initialPosts.length > 0);

  const targetRef = useRef(null);

  useEffect(() => {
    if (statePost || !id) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    fetch(`${API}/auth/get-post/${id}`, { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success && data.post) {
          setFetchedPost(data.post);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id, statePost]);

  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [post?._id]);

  const handlePostDeleted = (deletedId) => {
    setPostsList(prev => prev.filter(item => idOf(item) !== deletedId));
    if (!statePost && deletedId === idOf(post)) {
      const ownerId = post?.author?._id || post?.author;
      if (ownerId) navigate(`/profile/${ownerId}`);
      else navigate(-1);
    }
  };

  useEffect(() => {
    if (!hadPostsRef.current) return;
    if (postsList.length === 0) {
      const ownerId = post?.author?._id || post?.author;
      if (ownerId) navigate(`/profile/${ownerId}`);
      else navigate(-1);
    }
  }, [postsList.length]);

  if (loading) {
    return <h2 style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>Loading post...</h2>;
  }

  if (!post || notFound) {
    return <h2 style={{ textAlign: "center", color: "#aaa", marginTop: "40px" }}>No post found</h2>;
  }

  if (!statePost) {
    return (
      <div ref={targetRef}>
        <PostCard p={post} onDeleted={handlePostDeleted} />
      </div>
    );
  }

  const currentIndex = postsList.findIndex(item => idOf(item) === idOf(post));

  return (
    <div>
      {postsList.slice(0, currentIndex).map(p => (
        <PostCard key={p._id} p={p} onDeleted={handlePostDeleted} />
      ))}
      <div ref={targetRef}>
        <PostCard p={post} onDeleted={handlePostDeleted} />
      </div>
      {postsList.slice(currentIndex + 1).map(p => (
        <PostCard key={p._id} p={p} onDeleted={handlePostDeleted} />
      ))}
    </div>
  );
}

export default Post;
export { PostCard };

/* ─── STYLES ─── */
const tagChip            = { display: "flex", alignItems: "center", background: "#fff3e0", color: "#f5a623", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 };
const addTagBtn          = { background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 20, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#666" };
const cardStyle          = { maxWidth: "500px", margin: "0 auto", background: "#fff", borderRadius: "0", overflow: "hidden", borderBottom: "8px solid #f5f5f5" };
const headerStyle        = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" };
const userInfoStyle      = { display: "flex", gap: "10px", alignItems: "center" };
const usernameStyle      = { fontWeight: "700", fontSize: "14px", lineHeight: 1.2 };
const timestampStyle     = { fontSize: "11px", color: "#999", marginTop: "2px" };
const headerActionsStyle = { display: "flex", gap: "8px", alignItems: "center" };
const iconBtnStyle       = { border: "none", cursor: "pointer", width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" };
const dropdownStyle      = { position: "absolute", right: 0, top: "42px", background: "#fff", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50, minWidth: "220px", overflow: "hidden", border: "0.5px solid #eee" };
const menuItemStyle      = { display: "block", padding: "13px 16px", border: "none", background: "none", width: "100%", textAlign: "left", cursor: "pointer", fontSize: "14px", fontWeight: "500" };
const actionsStyle       = { display: "flex", gap: "8px", padding: "10px 12px 4px" };
const btnStyle           = { border: "none", flex: 1, height: "42px", borderRadius: "10px", background: "#ebebeb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" };
const likesCountStyle    = { fontSize: "13px", fontWeight: "600", color: "#444", cursor: "pointer" };
const mutualLikesStyle   = { padding: "2px 12px 0", margin: 0, fontSize: "13px", color: "#333", cursor: "pointer" };
const captionStyle       = { padding: "6px 12px 14px", margin: 0, fontSize: "14px", lineHeight: "1.5", color: "#222" };
const moreBtnStyle       = { color: "#8e8e8e", fontWeight: "700", cursor: "pointer" };
const overlayStyle       = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 };
const sheetStyle         = { position: "absolute", bottom: 0, width: "100%", maxHeight: "80%", background: "#fff", borderTopLeftRadius: "20px", borderTopRightRadius: "20px", display: "flex", flexDirection: "column", transition: "transform 0.2s ease" };
const handle             = { width: "40px", height: "4px", background: "#ddd", borderRadius: "10px", margin: "10px auto 6px" };
const headerSheet        = { textAlign: "center", padding: "10px 16px 14px", borderBottom: "1px solid #f0f0f0", fontSize: "15px", position: "relative" };
const list               = { flex: 1, overflowY: "auto", padding: "10px 12px" };
const commentRow         = { display: "flex", gap: "10px", marginBottom: "16px", alignItems: "flex-start" };
const inputBar           = { display: "flex", alignItems: "center", borderTop: "1px solid #f0f0f0", padding: "10px 12px", gap: "8px" };
const input              = { flex: 1, border: "none", outline: "none", fontSize: "14px" };
const postBtn            = { border: "none", background: "none", color: "#1877f2", fontWeight: "700", cursor: "pointer", fontSize: "14px" };
const searchWrapStyle    = { display: "flex", alignItems: "center", gap: "6px", background: "#f0f0f0", borderRadius: "10px", padding: "0 10px" };
const searchInputStyle   = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: "14px", outline: "none" };