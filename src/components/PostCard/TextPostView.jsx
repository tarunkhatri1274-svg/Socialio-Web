import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FaHeart, FaRegHeart, FaRegComment,
  FaRegPaperPlane, FaBookmark, FaRegBookmark,
  FaEllipsisH, FaTrash, FaEyeSlash, FaBan, FaThumbsDown, FaThumbsUp,
} from "react-icons/fa";
import { FiArrowLeft, FiX, FiSearch, FiUsers } from "react-icons/fi";
import socket from "../../sockets/sockets";
import CommentSection from "./CommentSection";
import ShareSheet from "./ShareSheet";
import { isPostSaved, toggleSavedPost, subscribeSavedPosts } from "../state/savedPostsStore.js";
import { consumePostSheet } from "../../utils/notificationHandoff.js";
/* ─── GLOBAL CSS ─────────────────────────────────────────────────────────── */
const globalCSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @keyframes heartPop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.4); }
    70%  { transform: scale(0.9); }
    100% { transform: scale(1); }
  }
  .heart-pop { animation: heartPop 0.28s cubic-bezier(0.36,0.07,0.19,0.97); }
  .action-btn { transition: transform 0.12s ease; cursor: pointer; }
  .action-btn:active { transform: scale(0.85); }
  .img-strip::-webkit-scrollbar { display: none; }
  .img-strip { -ms-overflow-style: none; scrollbar-width: none; }
  .menu-item:hover { background: #f5f5f5 !important; }
  @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
  @keyframes slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
  .overlay-bg   { animation: fadeIn  0.2s ease forwards; }
  .bottom-sheet { animation: slideUp 0.25s ease forwards; }
  @keyframes likeBurstPopDark {
    0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
    30%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
    45%  { transform: translate(-50%, -50%) scale(0.95); opacity: 1; }
    65%  { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
  }
`;
if (!document.getElementById("textpost-style")) {
  const s = document.createElement("style");
  s.id = "textpost-style";
  s.innerHTML = globalCSS;
  document.head.appendChild(s);
}

/* ─── CONFIG ─────────────────────────────────────────────────────────────── */
const API = import.meta.env.VITE_API_URL;
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

/* ─── HELPERS ────────────────────────────────────────────────────────────── */
function safeParseUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "undefined" || raw === "null") return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function timeAgo(createdAt) {
  if (!createdAt) return "now";
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatCount(num) {
  const n = Number(num) || 0;
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (n < 1_000_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}b`;
}

/* ─── AVATAR ─────────────────────────────────────────────────────────────── */
function Avatar({ src, username, size = 44, style: extra = {}, onClick }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = {
    width: size, height: size, borderRadius: "50%",
    objectFit: "cover", flexShrink: 0, cursor: onClick ? "pointer" : undefined,
  };
  if (src) return <img src={src} alt={username} style={{ ...base, ...extra }} onClick={onClick} />;
  return (
    <div style={{
      ...base, ...extra,
      background: "#1877f2", color: "#fff",
      display: "flex", alignItems: "center",
      justifyContent: "center", fontWeight: "700",
      fontSize: size * 0.38,
    }} onClick={onClick}>
      {letter}
    </div>
  );
}

/* ─── CO-AUTHOR NAMES ────────────────────────────────────────────────────── */
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

/* ─── CO-AUTHOR HEADER ───────────────────────────────────────────────────── */
function CoAuthorHeader({ author, acceptedCollaborators, onNavigate }) {
  const people = [author, ...acceptedCollaborators.map((c) => c.user)].filter(Boolean);

  if (people.length <= 1) {
    return (
      <>
        <div style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => onNavigate(author?._id)}>
          <Avatar src={author?.profilePic} username={author?.username} size={44} />
        </div>
        <span style={{ ...usernameStyle, cursor: "pointer" }} onClick={() => onNavigate(author?._id)}>
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
            size={44}
            style={i === 0 ? {} : { marginLeft: "-16px", border: "2px solid #fff" }}
            onClick={() => onNavigate(p._id)}
          />
        ))}
      </div>
      <span style={usernameStyle}>
        <CoAuthorNames people={people} onNavigate={onNavigate} />
      </span>
    </>
  );
}

/* ─── EXPANDABLE TEXT ────────────────────────────────────────────────────── */
function ExpandableText({ text, limit = 240 }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const isLong = text.length > limit;

  if (!isLong || expanded) {
    return (
      <p style={textStyle}>
        {text}
        {isLong && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={moreBtnStyle}
          >
            {" "}less
          </span>
        )}
      </p>
    );
  }

  return (
    <p style={textStyle}>
      {text.slice(0, limit).trimEnd()}...
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        style={moreBtnStyle}
      >
        {" "}more
      </span>
    </p>
  );
}

/* ─── MUTUAL/SOCIAL-PROOF LIKES LINE ─────────────────────────────────────── */
// "Liked by X and N others", tappable to open the full likers sheet. Reads
// whatever order the backend's getPostLikers already returns likedByUsers
// in — that endpoint sorts people the viewer follows to the front, so
// likedByUsers[0] is already a mutual/followed liker whenever one exists.
function LikesSummary({ likedByUsers, likeCount, hideLikeCount, isOwner, onOpen }) {
  if (hideLikeCount && !isOwner) return null;
  if (!likeCount) return null;
  const first = likedByUsers?.[0];
  const others = likeCount - (first ? 1 : 0);

  return (
    <p style={likesSummaryStyle} onClick={onOpen}>
      {first ? (
        <>
          Liked by <b>{first.username}</b>
          {others > 0 && <> and {formatCount(others)} other{others > 1 ? "s" : ""}</>}
        </>
      ) : (
        <>{formatCount(likeCount)} like{likeCount > 1 ? "s" : ""}</>
      )}
    </p>
  );
}

/* ─── TAGS ROW ───────────────────────────────────────────────────────────── */
// FIX: tags previously had no click behavior at all. They're used as
// username mentions (same convention as the image-post card), so tapping
// one now resolves it against the username-search endpoint and navigates
// to that profile — regardless of whether you're the post owner (being
// the owner only adds the edit/remove control, it doesn't change what
// tapping the tag itself does).
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

/* ─── COLLAB ROW ─────────────────────────────────────────────────────────── */
// FIX: a previously-declined collaborator can now be found again in
// search and re-invited (the backend's addCollaborator resets a declined
// entry back to "pending" instead of rejecting the request).
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

/* ─── BOTTOM SHEET WRAPPER ───────────────────────────────────────────────── */
function BottomSheet({ onClose, title, children, inputBar }) {
  const sheetRef = useRef(null);
  const startY   = useRef(0);

  const handleTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = (e) => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0 && sheetRef.current) sheetRef.current.style.transform = `translateY(${diff}px)`;
  };
  const handleTouchEnd = (e) => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 120) onClose();
    else if (sheetRef.current) sheetRef.current.style.transform = "translateY(0)";
  };

  return (
    <div
      className="overlay-bg"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.38)", zIndex: 300,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        ref={sheetRef}
        className="bottom-sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: "100%", maxWidth: "600px", background: "#fff",
          borderTopLeftRadius: "20px", borderTopRightRadius: "20px",
          maxHeight: "78vh", display: "flex", flexDirection: "column",
          transition: "transform 0.2s ease",
        }}
      >
        <div style={{ width: "40px", height: "4px", background: "#ddd", borderRadius: "10px", margin: "12px auto 8px" }} />
        <div style={{ textAlign: "center", padding: "4px 16px 14px", borderBottom: "1px solid #f0f0f0", fontSize: "15px", fontWeight: "700", position: "relative" }}>
          {title}
          <FiX size={18} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
        {inputBar}
      </div>
    </div>
  );
}

/* ─── LIKERS SHEET ───────────────────────────────────────────────────────── */
// FIX: search bar now always shows whenever there's at least one liker,
// instead of only once there were 5+.
function LikersSheet({ likedByUsers, onClose, onNavigate }) {
  const [search, setSearch] = useState("");
  const filtered = likedByUsers.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <BottomSheet title="Liked by" onClose={onClose}>
      {likedByUsers.length > 0 && (
        <div style={{ padding: "10px 12px 4px" }}>
          <div style={searchWrapStyle}>
            <FiSearch size={14} color="#999" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              style={searchInputStyle}
            />
            {search && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
          </div>
        </div>
      )}
      <div style={{ padding: "8px 16px 20px" }}>
        {filtered.length > 0 ? (
          filtered.map((u, i) => (
            <div
              key={u._id ?? i}
              onClick={() => { onClose(); onNavigate(u._id); }}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 0", cursor: "pointer",
                borderBottom: i < filtered.length - 1 ? "0.5px solid #f5f5f5" : "none",
              }}
            >
              <Avatar src={u.profilePic} username={u.username} size={40} />
              <div>
                <div style={{ fontSize: "15px", fontWeight: "600" }}>{u.username}</div>
                {u.bio && <div style={{ fontSize: "12px", color: "#999" }}>{u.bio}</div>}
              </div>
            </div>
          ))
        ) : (
          <p style={{ textAlign: "center", color: "#aaa", padding: "32px 0", fontSize: "15px" }}>
            {search ? "No results found" : "No likes yet"}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

/* ─── COMMENTS SHEET ─────────────────────────────────────────────────────── */
function CommentsSheet({ postId, username, currentUser, comments, setComments, onClose, onNavigate, highlightCommentId = null, highlightReplyId = null }) {
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
      }
    } catch (err) { console.log(err); }
  };

  const inputBar = (
    <div style={{ display: "flex", alignItems: "center", borderTop: "1px solid #f0f0f0", padding: "10px 12px", gap: "8px" }}>
      <Avatar src={currentUser?.profilePic} username={username} size={32} />
      <input
        value={commentText}
        onChange={e => setCommentText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && addComment()}
        placeholder="Add a comment..."
        style={{ flex: 1, border: "none", outline: "none", fontSize: "14px" }}
      />
      <button
        onClick={addComment}
        disabled={!commentText.trim()}
        style={{ border: "none", background: "none", color: "#1877f2", fontWeight: "700", cursor: "pointer", fontSize: "14px" }}
      >
        Post
      </button>
    </div>
  );

  return (
    <BottomSheet title={`Comments (${comments.length})`} onClose={onClose} inputBar={inputBar}>
      <CommentSection
        comments={comments}
        setComments={setComments}
        currentUser={currentUser}
        postId={postId}
        highlightCommentId={highlightCommentId}
        highlightReplyId={highlightReplyId}
      />
    </BottomSheet>
  );
}

/* ─── POST CARD ──────────────────────────────────────────────────────────── */
function PostCard({ post, isFirst, onDeleted }) {
  const navigate    = useNavigate();
  const currentUser = safeParseUser();
  const MY_ID       = (currentUser?._id || currentUser?.id)?.toString();

  const isOwner = MY_ID === post?.author?._id?.toString() || MY_ID === post?.author?.toString();

  // ── per-post visibility/interaction flags set at creation time
  // (CreateTextPost's "Advanced settings"). Owner always sees/can do
  // everything regardless of these; other viewers get the restricted view.
  // NOTE: this card has no download button at all (text posts never had
  // one), so disableDownload has nothing to enforce here — it's read
  // only for consistency with the other post types' data shape.
  const hideLikeCount    = !!post?.hideLikeCount;
  const hideCommentCount = !!post?.hideCommentCount;
  const disableComments  = !!post?.disableComments;
  const canComment       = !disableComments || isOwner;

  const [liked,           setLiked]           = useState(false);
  const [likeCount,       setLikeCount]       = useState(post?.likes?.length || 0);
const [sharesCount,     setSharesCount]     = useState(post?.shares?.length ?? post?.sharesCount ?? 0);
  const [likedByUsers,    setLikedByUsers]    = useState([]);
const [saved,           setSaved]           = useState(() => isPostSaved(post?._id));
  const [showMenu,        setShowMenu]        = useState(false);
  const [heartAnim,       setHeartAnim]       = useState(false);
  const [showLikeBurst,   setShowLikeBurst]   = useState(false);
  const [showLikers,      setShowLikers]      = useState(false);
  const [showComments,    setShowComments]    = useState(false);
  const [showShare,       setShowShare]       = useState(false);
  const [isHidden,        setIsHidden]        = useState(post?.isHiddenFromNonFollowers || false);
  const [isNotInterested, setIsNotInterested] = useState(post?.isNotInterested || false);
  const [isBlocked,       setIsBlocked]       = useState(false);
  const [comments,        setComments]        = useState(post?.comments ?? []);
  const [tags,            setTags]            = useState(post?.tags ?? []);
  const [collaborators,   setCollaborators]   = useState(post?.collaborators ?? []);
  const [removedFromView, setRemovedFromView] = useState(false);
  // ← NEW — see post.jsx's PostCard for the same pattern.
  const [highlightCommentId, setHighlightCommentId] = useState(null);
  const [highlightReplyId,   setHighlightReplyId]   = useState(null);

  const menuRef  = useRef(null);
  const lastTapRef = useRef(0);
  const username = post?.author?.username || "Unknown";
  const authorId = post?.author?._id || post?.author;

  useEffect(() => {
    if (!post?._id) return;
    socket.emit("joinPost", post._id);
    return () => socket.emit("leavePost", post._id);
  }, [post?._id]);

  // ← NEW — open the sheet a like/comment/reply notification pointed at.
  //
  // FIXED — also keyed on `location.key`. If you're already viewing this
  // exact post and a NEW reply notification arrives for it, navigate()
  // goes to the same URL — post._id never changes — so a [post?._id]-only
  // dependency list would never re-run this. location.key is fresh on
  // every navigation even to an identical path, so this re-checks every
  // time you're routed here. See post.jsx's PostCard for the same fix.
  const location = useLocation();
  useEffect(() => {
    if (!post?._id) return;
    const pending = consumePostSheet(post._id);
    if (!pending) return;
    if (pending.sheet === "likes") setShowLikers(true);
    if (pending.sheet === "comments") {
      setShowComments(true);
      setHighlightCommentId(pending.commentId || null);
      setHighlightReplyId(pending.replyId || null);
    }
  }, [post?._id, location.key]);

  useEffect(() => {
    if (!post?._id) return;

    const fetchLikers = async () => {
      try {
        const res  = await fetch(`${API}/auth/likers/${post._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setLikedByUsers(data.likedBy ?? []);
          setLikeCount(data.totalLikes ?? 0);
          setLiked((data.likedBy ?? []).some(u => u._id?.toString() === MY_ID));
        }
      } catch (err) { console.log(err); }
    };
    fetchLikers();

    const fetchComments = async () => {
      try {
        const res  = await fetch(`${API}/auth/get-comment/${post._id}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setComments(data.comments);
      } catch (err) { console.log(err); }
    };
    fetchComments();


const fetchCollaborators = async () => {
  try {
    const res  = await fetch(`${API}/auth/get-post/${post._id}`, { headers: authHeaders() });
    const data = await res.json();
    if (data.success) setCollaborators(data.post.collaborators ?? []);
  } catch (err) { console.log(err); }
};
fetchCollaborators();
    const onPostLikes = ({ totalLikes, likedBy }) => {
      setLikeCount(totalLikes);
      if (likedBy) {
        setLikedByUsers(likedBy);
        setLiked(likedBy.some(u => u._id?.toString() === MY_ID));
      }
    };
    const onNewComment = ({ comment }) => {
      setComments(prev => {
        if (prev.some(c => c._id === comment._id)) return prev;
        return [...prev, comment];
      });
    };
    const onCommentDeleted = ({ commentId }) => {
      setComments(prev => prev.filter(c => c._id !== commentId));
    };
const onDelComment   = ({ commentId }) => setComments(prev => prev.filter(c => c._id !== commentId));
    const onCollabResponded = ({ postId }) => {
      if (postId !== post._id) return;
      fetch(`${API}/auth/get-posts/${authorId}`, { headers: authHeaders() })
        .then(res => res.json())
        .then(data => {
          if (!data.success) return;
          const updated = data.posts.find(p => p._id === post._id);
          if (updated) setCollaborators(updated.collaborators ?? []);
        })
        .catch(() => {});
    };

    const onPostDeletedForMe = ({ postId }) => {
      if (postId === post._id) {
        setRemovedFromView(true);
        onDeleted?.(post._id);
      }
    };

    const onCollabRemoved = ({ postId, userId }) => {
      if (postId !== post._id) return;
      setCollaborators(prev => prev.filter(c => (c.user?._id ?? c.user)?.toString() !== userId));
    };
const onShareCount    = ({ postId, totalShares }) => { if (postId === post._id && totalShares != null) setSharesCount(totalShares); };
    socket.on(`post:${post._id}:likes`, onPostLikes);
    socket.on(`post:${post._id}:newComment`, onNewComment);
    socket.on(`post:${post._id}:commentDeleted`, onDelComment);
    socket.on("commentDeleted", onCommentDeleted);
    socket.on("collabResponded", onCollabResponded);
    socket.on("postDeleted", onPostDeletedForMe);
    socket.on("collabRemoved", onCollabRemoved);
    socket.on("postShared", onShareCount);
    return () => {
      socket.off(`post:${post._id}:likes`, onPostLikes);
      socket.off(`post:${post._id}:newComment`, onNewComment);
      socket.off(`post:${post._id}:commentDeleted`, onDelComment);
      socket.off("commentDeleted", onCommentDeleted);
      socket.off("collabResponded", onCollabResponded);
      socket.off("postDeleted", onPostDeletedForMe);
      socket.off("collabRemoved", onCollabRemoved);
      socket.off("postShared", onShareCount)
    };
  }, [post?._id, authorId, MY_ID]);

  useEffect(() => {
    document.body.style.overflow = showLikers || showComments || showShare ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showLikers, showComments, showShare]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── core like toggle, split so double-tap can call it directly ──────────
  const performLike = async () => {
    try {
      const res  = await fetch(`${API}/auth/like/${post._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setLiked(data.liked);
        setLikeCount(data.totalLikes);
        if (data.likedBy) setLikedByUsers(data.likedBy);
      }
    } catch (err) { console.log(err); }
  };

  const handleLike = async () => {
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 300);
    performLike();
  };

  // ── double-tap to like on the post body (text + media) — only LIKES,
  // never unlikes, same convention as the image/video post cards. Uses
  // onClick's timing gap rather than a raw touch handler, so it works
  // identically for both mouse clicks and mobile taps (a tap also fires
  // a click event).
  const handleBodyTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!liked) performLike();
      setShowLikeBurst(true);
      setTimeout(() => setShowLikeBurst(false), 700);
    }
    lastTapRef.current = now;
  };
useEffect(() => {
    const unsub = subscribeSavedPosts((postId, savedState) => {
      if (postId === post?._id) setSaved(savedState);
    });
    return unsub;
  }, [post?._id]);
const toggleSave = () => {
    toggleSavedPost(post);
  };

  const handleDelete = async () => {
    setShowMenu(false);
    if (!window.confirm("Delete this post?")) return;
    try {
      const res  = await fetch(`${API}/auth/delete-post/${post._id}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setRemovedFromView(true);
        onDeleted?.(post._id);
      } else {
        alert(data.message);
      }
    } catch (err) { console.log(err); }
  };

  const handleHide = async () => {
    setShowMenu(false);
    try {
      const res  = await fetch(`${API}/auth/hide-from-non-followers/${post._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { setIsHidden(data.isHidden); alert(data.message); }
    } catch (err) { console.log(err); }
  };

  const handleNotInterested = async () => {
    setShowMenu(false);
    try {
      const res  = await fetch(`${API}/auth/not-interested/${post._id}`, { method: "PATCH", headers: authHeaders() });
      const data = await res.json();
      if (data.success) { setIsNotInterested(prev => !prev); alert(data.message); }
    } catch (err) { console.log(err); }
  };

  const handleBlock = async () => {
    setShowMenu(false);
    if (!window.confirm(`Block ${username}?`)) return;
    try {
      const res  = await fetch(`${API}/auth/block/${authorId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) setIsBlocked(true);
    } catch (err) { console.log(err); }
  };

  const handleRemoveCollab = async (collabUser) => {
    setShowMenu(false);
    const isLeavingSelf = collabUser?._id?.toString() === MY_ID;
    const confirmMsg = isLeavingSelf
      ? "Remove yourself as a collaborator on this post? It will no longer show on your profile."
      : `Remove ${collabUser?.username} as a collaborator? The post will no longer show on their profile.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res  = await fetch(`${API}/auth/remove-collaborator/${post._id}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ userId: collabUser._id }),
      });
      const data = await res.json();
      if (data.success) {
        setCollaborators(data.collaborators ?? []);
        if (isLeavingSelf && !isOwner) {
          setRemovedFromView(true);
          onDeleted?.(post._id);
        }
      }
    } catch {}
  };

  const goToProfile = (id) => { if (id) navigate(`/profile/${id}`); };

  const acceptedCollaborators = (collaborators || []).filter(c => c.status === "accepted");
  const myCollabEntry = acceptedCollaborators.find(
    c => (c.user?._id ?? c.user)?.toString() === MY_ID
  );

  const menuOptions = isOwner
    ? [
        { label: "Delete", icon: <FaTrash size={13} />, color: "#e53935", action: handleDelete },
        { label: isHidden ? "Show to everyone" : "Hide from non-followers", icon: <FaEyeSlash size={13} />, color: "#222", action: handleHide },
        ...acceptedCollaborators.map((c) => ({
          label: `Remove collab: ${c.user?.username}`,
          icon: <FaBan size={13} />,
          color: "#e53935",
          action: () => handleRemoveCollab(c.user),
        })),
      ]
    : isBlocked
      ? [{ label: "Blocked", icon: <FaBan size={13} />, color: "#888", action: () => {} }]
      : [
          { label: isNotInterested ? "Interested" : "Not Interested", icon: <FaThumbsDown size={13} />, color: "#222", action: handleNotInterested },
          { label: `Block ${username}`, icon: <FaBan size={13} />, color: "#e53935", action: handleBlock },
          ...(myCollabEntry
            ? [{
                label: "Remove myself as collaborator",
                icon: <FaBan size={13} />,
                color: "#e53935",
                action: () => handleRemoveCollab(myCollabEntry.user),
              }]
            : []),
        ];

  if (removedFromView) return null;

  return (
    <>
      <div style={{ padding: "16px 0px 0", borderTop: isFirst ? "none" : "1px solid #efefef" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <CoAuthorHeader
              author={post?.author}
              acceptedCollaborators={acceptedCollaborators}
              onNavigate={goToProfile}
            />
            <span style={timeStyle}>{timeAgo(post?.createdAt)}</span>
          </div>

          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              onClick={() => setShowMenu(v => !v)}
              style={{ border: "none", background: showMenu ? "#f0f0f0" : "none", cursor: "pointer", padding: "5px 8px", borderRadius: "8px", color: "#666", display: "flex", alignItems: "center" }}
            >
              <FaEllipsisH size={15} />
            </button>
            {showMenu && (
              <div style={dropdownStyle}>
                {menuOptions.map((opt, i) => (
                  <button
                    key={i} className="menu-item" onClick={opt.action}
                    style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 16px", border: "none", background: "#fff", textAlign: "left", cursor: opt.label === "Blocked" ? "default" : "pointer", fontSize: "14px", fontWeight: "500", color: opt.color, borderBottom: i < menuOptions.length - 1 ? "0.5px solid #f0f0f0" : "none" }}
                  >
                    {opt.icon}{opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ← wrapped in position:relative so the double-tap heart burst
            can be centered over the text/media body. onClick here
            handles the double-tap-to-like gesture; individual tag/link
            clicks inside stopPropagation so they aren't swallowed by it. */}
        <div style={{ width: "100%", marginTop: "10px", position: "relative" }} onClick={handleBodyTap}>
          {(post?.text || post?.caption) && (
            <ExpandableText text={post?.text || post?.caption} />
          )}

          {post?.media?.length > 0 && (
            <div className="img-strip" style={{ display: "flex", gap: "8px", overflowX: "auto", marginTop: "10px", paddingBottom: "2px", marginLeft: 0, paddingLeft: 0 }}>
              {post.media.map((m, i) => (
                <div key={i} style={{ flexShrink: 0, width: post.media.length === 1 ? "100%" : "240px", borderRadius: "14px", overflow: "hidden", background: "#f0f0f0" }}>
                  <img src={m.url} alt="" style={{ width: "100%", height: post.media.length === 1 ? "auto" : "240px", objectFit: "cover", display: "block", minHeight: "180px", maxHeight: "420px" }} />
                </div>
              ))}
            </div>
          )}

          {showLikeBurst && (
            <FaThumbsUp
              size={70}
              color="#f5a623"
              style={{
                position: "absolute", top: "50%", left: "50%",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
                animation: "likeBurstPopDark 0.7s ease",
                pointerEvents: "none",
              }}
            />
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <TagsRow tags={tags} postId={post._id} isOwner={isOwner} onTagsUpdate={setTags} />
            <CollabRow collaborators={collaborators} postId={post._id} isOwner={isOwner} onCollabUpdate={setCollaborators} />
          </div>

          <LikesSummary
            likedByUsers={likedByUsers}
            likeCount={likeCount}
            hideLikeCount={hideLikeCount}
            isOwner={isOwner}
            onOpen={(e) => { e?.stopPropagation?.(); setShowLikers(true); }}
          />

          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", paddingBottom: "14px" }}
          >
            <button className="action-btn" onClick={handleLike} style={actionBtnStyle}>
              {liked
                ? <FaHeart size={20} color="#e53935" className={heartAnim ? "heart-pop" : ""} />
                : <FaRegHeart size={20} color="#555" />}
              {(!hideLikeCount || isOwner) && (
                <span
                  onClick={(e) => { e.stopPropagation(); setShowLikers(true); }}
                  style={{ fontSize: "14px", color: liked ? "#e53935" : "#555", fontWeight: "600", cursor: "pointer", minWidth: "16px" }}
                >
                  {formatCount(likeCount)}
                </span>
              )}
            </button>

            {canComment && (
              <button className="action-btn" style={actionBtnStyle} onClick={() => setShowComments(true)}>
                <FaRegComment size={19} color="#555" />
                {(!hideCommentCount || isOwner) && comments.length > 0 && (
                  <span style={countStyle}>{formatCount(comments.length)}</span>
                )}
              </button>
            )}

<button className="action-btn" style={actionBtnStyle} onClick={() => { setShowMenu(false); setShowShare(true); }}>
  <FaRegPaperPlane size={18} color="#555" />
  <span style={countStyle}>{formatCount(sharesCount)}</span>
</button>

            <button className="action-btn" onClick={toggleSave} style={{ ...actionBtnStyle, flex: "0 0 48px", background: saved ? "#fff8e1" : "#efefef" }}>
              {saved ? <FaBookmark size={18} color="#f5a623" /> : <FaRegBookmark size={18} color="#555" />}
            </button>
          </div>
        </div>
      </div>

      {showLikers && (
        <LikersSheet likedByUsers={likedByUsers} onClose={() => setShowLikers(false)} onNavigate={goToProfile} />
      )}

      {showComments && canComment && (
        <CommentsSheet
          postId={post._id}
          username={username}
          currentUser={currentUser}
          comments={comments}
          setComments={setComments}
          onClose={() => { setShowComments(false); setHighlightCommentId(null); setHighlightReplyId(null); }}
          onNavigate={goToProfile}
          highlightCommentId={highlightCommentId}
          highlightReplyId={highlightReplyId}
        />
      )}

      {showShare && (
        <ShareSheet postId={post._id} post={post} onClose={() => setShowShare(false)} />
      )}
    </>
  );
}

/* ─── MAIN VIEW ──────────────────────────────────────────────────────────── */
function TextPostView() {
  const { id } = useParams();
  const location = useLocation();
const { state } = location;
  const navigate  = useNavigate();
  const stateInitialPosts = state?.allPosts || (state?.post ? [state.post] : []);

  const idOf = (v) => (v?._id ?? v ?? "").toString();

  const [postsList, setPostsList] = useState([]);
  const [loading,   setLoading]   = useState(!!id);
  const [notFound,  setNotFound]  = useState(false);
  const hadPostsRef = useRef(false);

useEffect(() => {
    if (!id) return;

    if (stateInitialPosts.length > 0) {
      // Keep the original order — don't move the clicked post to the top.
      setPostsList(stateInitialPosts);
      setNotFound(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setPostsList([]);

    fetch(`${API}/auth/get-post/${id}`, { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success && data.post) {
          setPostsList([data.post]);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ← NEW — scroll the actually-clicked post into view once the list has
  // rendered, instead of relying on it being first in the array.
  useEffect(() => {
    if (loading || postsList.length === 0) return;
    const clickedId = idOf(state?.post) || id;
    if (!clickedId) return;

    const t = setTimeout(() => {
      const el = document.getElementById(`post-${clickedId}`);
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    }, 0);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, postsList.length]);

  useEffect(() => {
    if (postsList.length > 0) hadPostsRef.current = true;
  }, [postsList]);

  const handlePostDeleted = (deletedId) => {
    setPostsList(prev => prev.filter(p => idOf(p) !== deletedId));
  };

  useEffect(() => {
    if (!hadPostsRef.current) return;
    if (postsList.length === 0) {
      const ownerId = postsList[0]?.author?._id || postsList[0]?.author
        || stateInitialPosts[0]?.author?._id || stateInitialPosts[0]?.author;
      if (ownerId) navigate(`/profile/${ownerId}`);
      else navigate(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsList.length]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", color: "#999" }}>
        Loading post...
      </div>
    );
  }

  if (postsList.length === 0 || notFound) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", color: "#999" }}>
        Post not found
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>
          <FiArrowLeft size={22} />
        </button>
        <span style={{ fontSize: "17px", fontWeight: "700" }}>TEXTPOSTS</span>
        <div style={{ width: 36 }} />
      </div>
<div>
  {postsList.map((post, index) => (
    <div key={post._id || index} id={`post-${post._id}`}>
      <PostCard
        post={post}
        isFirst={index === 0}
        onDeleted={handlePostDeleted}
        key={`${post._id}-${location.key}`}
      />
    </div>
  ))}
</div>
    </div>
  );
}
export default TextPostView;

/* ─── STYLES ─────────────────────────────────────────────────────────────── */
const page = {
  background: "#fff", minHeight: "100vh",
  maxWidth: "600px", margin: "0 auto",
  fontFamily: "system-ui, -apple-system, sans-serif",
};
const topBar = {
  height: "52px", display: "flex", alignItems: "center",
  justifyContent: "space-between", padding: "0 12px",
  borderBottom: "1px solid #efefef",
  position: "sticky", top: 0, background: "#fff", zIndex: 50,
};
const backBtnStyle = {
  border: "none", background: "none", cursor: "pointer",
  padding: "6px", display: "flex", alignItems: "center", color: "#222",
};
const usernameStyle = { fontWeight: "700", fontSize: "15px", color: "#111" };
const timeStyle     = { color: "#999", fontSize: "13px" };
const textStyle     = { fontSize: "15px", lineHeight: "1.55", color: "#111", whiteSpace: "pre-wrap", marginBottom: "2px", marginLeft: 0, paddingLeft: 0 };
const moreBtnStyle  = { color: "#8e8e8e", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" };
const likesSummaryStyle = { fontSize: "13px", color: "#333", margin: "6px 0 0", cursor: "pointer" };
const dropdownStyle = {
  position: "absolute", right: 0, top: "36px",
  background: "#fff", borderRadius: "14px",
  boxShadow: "0 6px 24px rgba(0,0,0,0.13)",
  zIndex: 100, minWidth: "205px", overflow: "hidden", border: "0.5px solid #eee",
};
const actionBtnStyle = {
  border: "none", background: "#c8c8c8",
  display: "flex", alignItems: "center", justifyContent: "center",
  gap: "6px", cursor: "pointer", padding: "0 10px",
  height: "40px", borderRadius: "10px", flex: 1,
};
const countStyle = { fontSize: "14px", color: "#555", fontWeight: "600", minWidth: "16px" };
const searchWrapStyle  = { display: "flex", alignItems: "center", gap: "6px", background: "#f0f0f0", borderRadius: "10px", padding: "0 10px" };
const searchInputStyle = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: "14px", outline: "none" };
const tagChip      = { display: "flex", alignItems: "center", background: "#fff3e0", color: "#f5a623", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 };
const addTagBtn    = { background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 20, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#666" };