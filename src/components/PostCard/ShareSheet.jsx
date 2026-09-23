import { useState, useEffect, useRef, useCallback } from "react";
import { FiX, FiSearch, FiCheck } from "react-icons/fi";
import { FaLink } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL;   // e.g. http://localhost:5000/api
const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

const GroupIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

function Avatar({ src, username, size = 42 }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
  if (src) return <img src={src} alt={username} style={base} onError={e => { e.target.style.display = "none"; }} />;
  return (
    <div style={{ ...base, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.38 }}>
      {letter}
    </div>
  );
}

export default function ShareSheet({ postId, post, onClose }) {
  const [users, setUsers]       = useState([]);
  const [recent, setRecent]     = useState([]);   // ← NEW: recently-messaged users
  const [groups, setGroups]     = useState([]);   // ← NEW: your groups (share INTO a group)
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(new Set());        // user ids
  const [selectedGroups, setSelectedGroups] = useState(new Set()); // group chatIds
  const [search, setSearch]     = useState("");
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const sheetRef   = useRef(null);
  const startY     = useRef(0);
  const searchTimer = useRef(null);

  // ── Fetch following/recent/groups on mount ──────────────────────────────
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API}/auth/share/users`;
        const res  = await fetch(url, { headers: authHeaders() });
        const data = await res.json();

        if (data.success) {
          setUsers(data.users);
          setFiltered(data.users);
          setRecent(data.recent || []);
          setGroups(data.groups || []);
        } else {
          setError(data.message || "Failed to load users");
        }
      } catch (e) {
        console.error("[ShareSheet] fetch error:", e);
        setError("Network error — check console");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { setFiltered(users); return; }

    searchTimer.current = setTimeout(async () => {
      try {
        const url = `${API}/auth/share/users?q=${encodeURIComponent(search)}`;
        const res  = await fetch(url, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setFiltered(data.users);
      } catch {
        setFiltered(users.filter(u =>
          u.username.toLowerCase().includes(search.toLowerCase())
        ));
      }
    }, 350);

    return () => clearTimeout(searchTimer.current);
  }, [search, users]);

  const toggleSelect = useCallback((userId) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectGroup = useCallback((chatId) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(chatId) ? next.delete(chatId) : next.add(chatId);
      return next;
    });
  }, []);

  const totalSelected = selected.size + selectedGroups.size;

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (totalSelected === 0 || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/auth/share`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          postId,
          toUserIds: [...selected],
          toGroupChatIds: [...selectedGroups],
        }),
      });
      const data = await res.json();
      if (data.success) { setSent(true); setTimeout(onClose, 900); }
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const handleCopyLink = () => {
    const url = post?.media?.[0]?.url || window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
    alert("Link copied!");
  };

  // ── Swipe down ────────────────────────────────────────────────────────────
  const handleTouchStart = e => { startY.current = e.touches[0].clientY; };
  const handleTouchMove  = e => {
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0 && sheetRef.current) sheetRef.current.style.transform = `translateY(${diff}px)`;
  };
  const handleTouchEnd = e => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 120) onClose();
    else if (sheetRef.current) sheetRef.current.style.transform = "translateY(0)";
  };

  const thumb = post?.media?.[0];
  const showRecent = !search && recent.length > 0;
  const showGroups = !search && groups.length > 0;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        ref={sheetRef}
        style={styles.sheet}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={styles.handle} />

        {/* Header */}
        <div style={styles.header}>
          <b style={{ fontSize: 15 }}>Share</b>
          <FiX size={20} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }} onClick={onClose} />
        </div>

        {/* Post preview */}
        <div style={styles.previewStrip}>
          {thumb ? (
            thumb.type === "video"
              ? <video src={thumb.url} style={styles.previewThumb} muted />
              : <img src={thumb.url} alt="post" style={styles.previewThumb} onError={e => e.target.style.display = "none"} />
          ) : (
            <div style={{ ...styles.previewThumb, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📝</div>
          )}
          <div style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#111" }}>
              {post?.author?.username || "Post"}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {post?.caption || post?.text || "View post"}
            </p>
          </div>
        </div>

        {/* Copy link */}
        <button style={styles.copyLinkBtn} onClick={handleCopyLink}>
          <div style={styles.copyLinkIcon}><FaLink size={16} color="#555" /></div>
          <span style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>Copy link</span>
        </button>

        {/* Search */}
        <div style={styles.searchWrap}>
          <FiSearch size={14} color="#aaa" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search people..."
            style={styles.searchInput}
          />
          {search && <FiX size={14} color="#aaa" style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
        </div>

        <div style={styles.userList}>
          {loading && <p style={styles.emptyText}>Loading...</p>}
          {!loading && error && <p style={{ ...styles.emptyText, color: "#e53935" }}>{error}</p>}

          {/* ── Recent — most recently messaged people ──────────────── */}
          {!loading && !error && showRecent && (
            <>
              <p style={styles.sectionLabel}>Recent</p>
              {recent.map(u => (
                <UserRow key={`recent-${u._id}`} u={u} isSelected={selected.has(u._id)} onToggle={toggleSelect} />
              ))}
            </>
          )}

          {/* ── Groups — share straight into a group chat ───────────── */}
          {!loading && !error && showGroups && (
            <>
              <p style={styles.sectionLabel}>Your Groups</p>
              {groups.map(g => (
                <GroupRow key={g.chatId} g={g} isSelected={selectedGroups.has(g.chatId)} onToggle={toggleSelectGroup} />
              ))}
            </>
          )}

          {!loading && !error && !search && filtered.length > 0 && (
            <p style={styles.sectionLabel}>Following</p>
          )}
          {!loading && !error && search && (
            <p style={styles.sectionLabel}>
              {filtered.some(u => u.isFollowing) ? "Following · " : ""}
              {filtered.some(u => !u.isFollowing) ? "Other users" : ""}
            </p>
          )}

          {!loading && !error && filtered.length === 0 && !showRecent && !showGroups && (
            <p style={styles.emptyText}>
              {search ? "No users found" : "Follow someone to share posts with them"}
            </p>
          )}

          {!loading && !error && search && filtered.some(u => u.isFollowing) && filtered.some(u => !u.isFollowing) && (() => {
            const followingGroup = filtered.filter(u => u.isFollowing);
            const publicGroup    = filtered.filter(u => !u.isFollowing);
            return (
              <>
                <p style={styles.groupLabel}>Following</p>
                {followingGroup.map(u => <UserRow key={u._id} u={u} isSelected={selected.has(u._id)} onToggle={toggleSelect} />)}
                <p style={styles.groupLabel}>Other users</p>
                {publicGroup.map(u => <UserRow key={u._id} u={u} isSelected={selected.has(u._id)} onToggle={toggleSelect} />)}
              </>
            );
          })()}

          {!loading && !error && !(search && filtered.some(u => u.isFollowing) && filtered.some(u => !u.isFollowing)) &&
            filtered.map(u => (
              <UserRow key={u._id} u={u} isSelected={selected.has(u._id)} onToggle={toggleSelect} />
            ))
          }
        </div>

        {/* Send button */}
        {totalSelected > 0 && (
          <div style={styles.sendBar}>
            <button
              style={{ ...styles.sendBtn, opacity: sending ? 0.7 : 1, background: sent ? "#4caf50" : "#f5a623" }}
              onClick={handleSend}
              disabled={sending}
            >
              {sent ? "✓ Sent!" : sending ? "Sending..." : `Send (${totalSelected})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({ u, isSelected, onToggle }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", padding: "9px 10px", borderRadius: 12, cursor: "pointer", background: isSelected ? "#fff8ee" : "transparent", transition: "background 0.1s" }}
      onClick={() => onToggle(u._id)}
    >
      <div style={{ position: "relative" }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
          {u.profilePic
            ? <img src={u.profilePic} alt={u.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
            : <div style={{ width: "100%", height: "100%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 18 }}>{u.username?.[0]?.toUpperCase()}</div>
          }
        </div>
        {isSelected && (
          <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#f5a623", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiCheck size={10} color="#fff" strokeWidth={3} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#111" }}>{u.username}</p>
        {u.isPrivate && <p style={{ margin: "1px 0 0", fontSize: 11, color: "#aaa" }}>🔒 Private</p>}
        {!u.isFollowing && <p style={{ margin: "1px 0 0", fontSize: 11, color: "#3897f0" }}>Public account</p>}
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        border: isSelected ? "none" : "2px solid #ddd",
        background: isSelected ? "#f5a623" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, transition: "all 0.15s",
      }}>
        {isSelected && <FiCheck size={12} color="#fff" strokeWidth={3} />}
      </div>
    </div>
  );
}

function GroupRow({ g, isSelected, onToggle }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", padding: "9px 10px", borderRadius: 12, cursor: "pointer", background: isSelected ? "#fff8ee" : "transparent", transition: "background 0.1s" }}
      onClick={() => onToggle(g.chatId)}
    >
      <div style={{ position: "relative" }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#ececec", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
          {g.avatar ? <img src={g.avatar} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GroupIcon />}
        </div>
        {isSelected && (
          <div style={{ position: "absolute", bottom: 0, right: 0, width: 18, height: 18, borderRadius: "50%", background: "#f5a623", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FiCheck size={10} color="#fff" strokeWidth={3} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#111" }}>{g.name}</p>
        <p style={{ margin: "1px 0 0", fontSize: 11, color: "#aaa" }}>{g.memberCount} members</p>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        border: isSelected ? "none" : "2px solid #ddd",
        background: isSelected ? "#f5a623" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, transition: "all 0.15s",
      }}>
        {isSelected && <FiCheck size={12} color="#fff" strokeWidth={3} />}
      </div>
    </div>
  );
}

const styles = {
  overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 },
  sheet:        { position: "absolute", bottom: 0, width: "100%", maxHeight: "85%", background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, display: "flex", flexDirection: "column", transition: "transform 0.2s ease", overflow: "hidden" },
  handle:       { width: 40, height: 4, background: "#ddd", borderRadius: 10, margin: "10px auto 6px", flexShrink: 0 },
  header:       { textAlign: "center", padding: "10px 16px 12px", borderBottom: "1px solid #f0f0f0", position: "relative", flexShrink: 0 },
  previewStrip: { display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f5f5f5", flexShrink: 0 },
  previewThumb: { width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#f0f0f0" },
  copyLinkBtn:  { display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 0 8px", borderBottom: "1px solid #f5f5f5", background: "none", border: "none", cursor: "pointer", width: "100%", flexShrink: 0 },
  copyLinkIcon: { width: 46, height: 46, borderRadius: "50%", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" },
  searchWrap:   { display: "flex", alignItems: "center", gap: 8, margin: "10px 14px 4px", background: "#f2f2f2", borderRadius: 12, padding: "8px 12px", flexShrink: 0 },
  searchInput:  { flex: 1, border: "none", background: "transparent", fontSize: 14, outline: "none", color: "#111" },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 14px 2px", margin: 0, flexShrink: 0 },
  groupLabel:   { fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 14px 2px", margin: 0 },
  userList:     { flex: 1, overflowY: "auto", padding: "4px 8px 8px" },
  emptyText:    { textAlign: "center", color: "#aaa", padding: "24px 0", fontSize: 13, margin: 0 },
  sendBar:      { padding: "10px 16px 20px", borderTop: "1px solid #f0f0f0", flexShrink: 0 },
  sendBtn:      { width: "100%", padding: "13px 0", borderRadius: 14, border: "none", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "all 0.2s" },
};