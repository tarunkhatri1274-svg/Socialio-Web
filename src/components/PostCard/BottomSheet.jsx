import { useState, useRef, useEffect, useMemo } from "react";
import { FiX, FiSearch } from "react-icons/fi";
import { REACTIONS, REACTION_MAP } from "./Reactions.jsx";

/* ════════════════════════════════════════════════════════════════════════
   BottomSheet — ONE shared sheet used by every post card for the Likes,
   Comments, Viewers … sheets (the Share sheet keeps its own ShareSheet.jsx).

   Props
     title      header content (string or JSX)
     onClose    backdrop click / X / swipe-down
     children   sheet body (scrolls)
     inputBar   optional node pinned under the body (comment input)
     zIndex     overlay z-index (default 300)
   ════════════════════════════════════════════════════════════════════════ */
if (typeof document !== "undefined" && !document.getElementById("bottomsheet-keyframes")) {
  const tag = document.createElement("style");
  tag.id = "bottomsheet-keyframes";
  tag.innerHTML = `
    @keyframes bsFadeIn  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes bsSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
    .bs-tabs::-webkit-scrollbar { display: none; }
  `;
  document.head.appendChild(tag);
}

export function BottomSheet({ title, onClose, children, inputBar, zIndex = 300 }) {
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

  // Esc closes the sheet on desktop
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "bsFadeIn 0.2s ease forwards",
      }}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: "100%", maxWidth: 600, background: "#fff", color: "#111",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          maxHeight: "78vh", display: "flex", flexDirection: "column",
          transition: "transform 0.2s ease",
          animation: "bsSlideUp 0.25s ease forwards",
        }}
      >
        <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 10, margin: "12px auto 8px", flexShrink: 0 }} />
        <div style={{ textAlign: "center", padding: "4px 16px 14px", borderBottom: "1px solid #f0f0f0", fontSize: 15, fontWeight: 700, position: "relative", flexShrink: 0 }}>
          {title}
          <FiX
            size={18}
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}
            onClick={onClose}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>
        {inputBar}
      </div>
    </div>
  );
}

/* ── tiny avatar so this file doesn't depend on any card's own Avatar ── */
function SheetAvatar({ src, username, size = 40 }) {
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
  if (src) return <img src={src} alt={username} style={base} />;
  return (
    <div style={{ ...base, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size * 0.4 }}>
      {username?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   countReactions(users) → { all: 12, like: 5, love: 4, haha: 2, ... }
   A liker with no `reaction` (an old like) counts as "like".
   ════════════════════════════════════════════════════════════════════════ */
export function countReactions(users = []) {
  const counts = { all: users.length };
  users.forEach((u) => {
    const k = REACTION_MAP[u?.reaction] ? u.reaction : "like";
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

/* "👍 5  ❤️ 4  😆 2" — handy for showing a compact summary anywhere */
export function formatReactionCounts(counts) {
  return REACTIONS.filter((r) => counts?.[r.key] > 0)
    .map((r) => `${r.emoji} ${counts[r.key]}`)
    .join("  ");
}

/* ════════════════════════════════════════════════════════════════════════
   LikesSheet — the shared "Liked by" sheet.

   Tabs:  [ All 12 ] [ 👍 5 ] [ ❤️ 4 ] [ 😆 2 ] …   (only reactions that exist)
   Tapping a tab filters the list; every row shows the emoji that person picked.

   Props
     users       [{ _id, username, profilePic, bio, reaction }]
     onClose     close handler
     onNavigate  (userId) => void   — row click (sheet closes first)
     loading     optional boolean
   ════════════════════════════════════════════════════════════════════════ */
export function LikesSheet({ users = [], onClose, onNavigate, loading = false, zIndex }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const counts = useMemo(() => countReactions(users), [users]);

  // if the active tab empties out (someone changed their reaction live), fall back to All
  useEffect(() => {
    if (tab !== "all" && !counts[tab]) setTab("all");
  }, [counts, tab]);

  const filtered = users.filter((u) => {
    const k = REACTION_MAP[u?.reaction] ? u.reaction : "like";
    if (tab !== "all" && k !== tab) return false;
    return u.username?.toLowerCase().includes(search.toLowerCase());
  });

  const present = REACTIONS.filter((r) => counts[r.key] > 0);

  const tabStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
    padding: "6px 12px", borderRadius: 18, border: "none", cursor: "pointer",
    background: active ? "#e7f0fe" : "#f0f0f0",
    color: active ? "#1877f2" : "#555",
    fontSize: 13, fontWeight: 600,
  });

  return (
    <BottomSheet title="Liked by" onClose={onClose} zIndex={zIndex}>
      {users.length > 0 && (
        <div className="bs-tabs" style={{ display: "flex", gap: 8, padding: "10px 12px 8px", overflowX: "auto", scrollbarWidth: "none" }}>
          <button onClick={() => setTab("all")} style={tabStyle(tab === "all")}>All {counts.all}</button>
          {present.map((r) => (
            <button key={r.key} onClick={() => setTab(r.key)} style={tabStyle(tab === r.key)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{r.emoji}</span>
              {counts[r.key]}
            </button>
          ))}
        </div>
      )}

      {users.length > 0 && (
        <div style={{ padding: "4px 12px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#f0f0f0", borderRadius: 10, padding: "0 10px" }}>
            <FiSearch size={14} color="#999" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              style={{ flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: 14, outline: "none" }}
            />
            {search && <FiX size={14} color="#999" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
          </div>
        </div>
      )}

      <div style={{ padding: "6px 16px 20px" }}>
        {loading ? (
          <p style={emptyStyle}>Loading...</p>
        ) : filtered.length === 0 ? (
          <p style={emptyStyle}>{search || tab !== "all" ? "No results found" : "No likes yet"}</p>
        ) : (
          filtered.map((u, i) => {
            const r = REACTION_MAP[u?.reaction] || REACTION_MAP.like;
            return (
              <div
                key={u._id ?? i}
                onClick={() => { onClose(); onNavigate?.(u._id); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", borderBottom: i < filtered.length - 1 ? "0.5px solid #f5f5f5" : "none" }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <SheetAvatar src={u.profilePic} username={u.username} size={40} />
                  <span style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, lineHeight: 1 }}>
                    {r.emoji}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{u.username}</div>
                  {u.bio && <div style={{ fontSize: 12, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.bio}</div>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </BottomSheet>
  );
}

const emptyStyle = { textAlign: "center", color: "#aaa", padding: "28px 0", fontSize: 14, margin: 0 };

export default BottomSheet;