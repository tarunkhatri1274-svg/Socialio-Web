import React, { useEffect, useState } from "react";
import { FiX, FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import socket from "../../sockets/sockets";

const API = import.meta.env.VITE_API_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

// ── Views sheet for a memory item — owner-only (same convention as Story
// viewers), same visual language as MemoryLikesSheet: overlay + white
// rounded box + search bar. Stays live via the `memoryItem:{id}:views`
// socket room while open, same as the likes sheet does for likes.
function MemoryViewsSheet({ itemId, onClose }) {
  const navigate = useNavigate();
  const [search, setSearch]     = useState("");
  const [viewers, setViewers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [denied, setDenied]     = useState(false);

  const fetchViewers = async (q = "") => {
    try {
      const res  = await fetch(`${API}/memories/items/${itemId}/viewers?q=${encodeURIComponent(q)}`, {
        headers: authHeaders(),
      });
      if (res.status === 403) { setDenied(true); return; }
      const data = await res.json();
      if (data.success) setViewers(data.viewers);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchViewers(); }, [itemId]);

  useEffect(() => {
    const t = setTimeout(() => fetchViewers(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!itemId) return;
    const handler = () => fetchViewers(search);
    socket.on(`memoryItem:${itemId}:views`, handler);
    return () => socket.off(`memoryItem:${itemId}:views`, handler);
  }, [itemId, search]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>Views</h4>
          <FiX size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ borderTop: "1px solid #eee", marginBottom: 10 }} />

        {!denied && (
          <div style={searchWrapStyle}>
            <FiSearch size={15} color="#999" style={{ marginLeft: 10 }} />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInputStyle}
            />
            {search.length > 0 && (
              <FiX size={15} color="#999" style={{ marginRight: 10, cursor: "pointer" }} onClick={() => setSearch("")} />
            )}
          </div>
        )}

        {denied ? (
          <p style={{ textAlign: "center", color: "gray", fontSize: 14, padding: "20px 0" }}>
            Only the memory's owner can see who viewed it.
          </p>
        ) : loading ? (
          <p style={{ textAlign: "center", color: "#aaa", fontSize: 14, padding: "20px 0" }}>Loading...</p>
        ) : viewers.length === 0 ? (
          <p style={{ textAlign: "center", color: "gray", fontSize: 14, padding: "20px 0" }}>No views yet</p>
        ) : (
          viewers.map((u) => (
            <div key={u._id} style={rowStyle} onClick={() => { onClose(); navigate(`/profile/${u._id}`); }}>
              {u.profilePic
                ? <img src={u.profilePic} alt={u.username} style={avatarStyle} />
                : <div style={{ ...avatarStyle, background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#888" }}>
                    {u.username?.[0]?.toUpperCase()}
                  </div>
              }
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{u.username}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MemoryViewsSheet;

const overlayStyle    = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1100 };
const boxStyle         = { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420, maxHeight: "70vh", overflowY: "auto", padding: 16 };
const searchWrapStyle  = { display: "flex", alignItems: "center", background: "#f0f0f0", borderRadius: 10, marginBottom: 12, gap: 6 };
const searchInputStyle = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: 14, outline: "none" };
const rowStyle          = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0f0", cursor: "pointer" };
const avatarStyle       = { width: 42, height: 42, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };