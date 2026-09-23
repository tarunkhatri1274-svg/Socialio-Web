import React, { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
const getToken = () => localStorage.getItem("token");
const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

const COLORS = ["#e74c3c","#e67e22","#2ecc71","#3498db","#9b59b6","#1abc9c","#e91e63","#ff5722"];
const getColor = (str) => COLORS[(str?.charCodeAt(0)||0) % COLORS.length];
const getInitials = (name) => name?.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)||"?";
function Avatar({ user, size=42 }) {
  const pic = user?.profilePic;
  return pic
    ? <img src={pic} alt="" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
    : <div style={{width:size,height:size,borderRadius:"50%",background:getColor(user?.username),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:size*0.38,flexShrink:0}}>{getInitials(user?.username)}</div>;
}

// Step 1: pick members (any user — following is NOT required for groups).
// Step 2: name the group, then create it. Creating sends a pending invite
// to every selected member; they must accept before they see the group.
export default function NewGroupSheet({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(new Map()); // id -> user
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        // NOTE: search-users with no followingOnly flag returns anyone,
        // which is what groups need (unlike 1:1 "New Message").
        const data = await apiFetch(`${API}/messages/search-users?q=${encodeURIComponent(search)}`);
        setResults(data.success ? data.users : []);
      } catch (err) { console.error(err); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [search]);

  const toggle = (user) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.has(user._id) ? next.delete(user._id) : next.set(user._id, user);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selected.size === 0 || creating) return;
    setCreating(true);
    try {
      const data = await apiFetch(`${API}/groups/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName.trim(), memberIds: Array.from(selected.keys()) }),
      });
      if (data.success) onCreated(data.group);
    } catch (err) {
      console.error("Create group failed", err);
      alert("Couldn't create the group. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <p style={s.title}>{step === 1 ? "Add members" : "Name your group"}</p>
          <button style={s.iconBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        {step === 1 && (
          <>
            {selected.size > 0 && (
              <div style={s.chipsRow}>
                {Array.from(selected.values()).map((u) => (
                  <div key={u._id} style={s.chip} onClick={() => toggle(u)}>
                    <Avatar user={u} size={22} />
                    <span>{u.username}</span>
                    <CloseIcon />
                  </div>
                ))}
              </div>
            )}

            <div style={s.searchWrap}>
              <SearchIcon />
              <input
                style={s.searchInput}
                placeholder="Search people to add…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div style={s.list}>
              {searching && <p style={s.hint}>Searching…</p>}
              {!searching && results.length === 0 && <p style={s.hint}>{search ? "No users found." : "Start typing to find people."}</p>}
              {!searching && results.map((u) => (
                <div key={u._id} style={s.userRow} onClick={() => toggle(u)}>
                  <Avatar user={u} size={44} />
                  <div style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#111" }}>{u.username}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#999" }}>{u.isPrivate ? "🔒 Private" : (u.bio || "")}</p>
                  </div>
                  <div style={{ ...s.checkbox, ...(selected.has(u._id) ? s.checkboxChecked : {}) }}>
                    {selected.has(u._id) && "✓"}
                  </div>
                </div>
              ))}
            </div>

            <div style={s.footer}>
              <button
                style={{ ...s.primaryBtn, opacity: selected.size > 0 ? 1 : 0.5 }}
                disabled={selected.size === 0}
                onClick={() => setStep(2)}
              >
                Next {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ padding: "8px 16px 4px" }}>
              <input
                style={s.nameInput}
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={100}
                autoFocus
              />
              <p style={{ fontSize: 12, color: "#999", margin: "10px 2px 0" }}>
                {selected.size} member{selected.size !== 1 ? "s" : ""} will be invited. They'll need to accept before they can see the group.
              </p>
            </div>

            <div style={s.list}>
              {Array.from(selected.values()).map((u) => (
                <div key={u._id} style={s.userRow}>
                  <Avatar user={u} size={40} />
                  <span style={{ marginLeft: 12, fontSize: 14, fontWeight: 600, color: "#111" }}>{u.username}</span>
                </div>
              ))}
            </div>

            <div style={s.footer}>
              <button style={{ ...s.secondaryBtn }} onClick={() => setStep(1)}>Back</button>
              <button
                style={{ ...s.primaryBtn, opacity: groupName.trim() && !creating ? 1 : 0.5 }}
                disabled={!groupName.trim() || creating}
                onClick={handleCreate}
              >
                {creating ? "Creating…" : "Create Group"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", borderBottom: "1px solid #f0f0f0" },
  title: { fontSize: 16, fontWeight: 700, margin: 0, color: "#111" },
  iconBtn: { background: "none", border: "none", color: "#333", cursor: "pointer", padding: 6 },
  chipsRow: { display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 16px 0" },
  chip: { display: "flex", alignItems: "center", gap: 6, background: "#f2f2f2", borderRadius: 20, padding: "4px 10px 4px 4px", fontSize: 12, fontWeight: 600, color: "#333", cursor: "pointer" },
  searchWrap: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f0f0f0", color: "#bbb" },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 14, color: "#111", background: "transparent" },
  nameInput: { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #ececec", background: "#f7f7f7", fontSize: 15, color: "#111", outline: "none", boxSizing: "border-box" },
  list: { flex: 1, overflowY: "auto", padding: "6px 0 16px" },
  hint: { textAlign: "center", color: "#bbb", fontSize: 14, padding: "24px 0" },
  userRow: { display: "flex", alignItems: "center", padding: "10px 16px", cursor: "pointer" },
  checkbox: { width: 22, height: 22, borderRadius: "50%", border: "2px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0 },
  checkboxChecked: { background: GOLDEN, border: "none" },
  footer: { display: "flex", gap: 10, padding: "10px 16px 18px", borderTop: "1px solid #f0f0f0" },
  primaryBtn: { flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: GOLDEN, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn: { flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #ddd", background: "#fff", color: "#111", fontWeight: 700, fontSize: 14, cursor: "pointer" },
};