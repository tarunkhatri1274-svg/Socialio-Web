import React, { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";
import MemoryCommentSection from "./MemoryCommentSection";

const API = import.meta.env.VITE_API_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function safeParseUser() {
  try { return JSON.parse(localStorage.getItem("user")) || {}; } catch { return {}; }
}

// ── Comments sheet for a memory item — same overlay/box chrome as the
// Followers modal, hosting the full MemoryCommentSection (like/edit/
// delete/reply, identical to post comments) inside it.
function MemoryCommentsSheet({ itemId, disableComments, onClose, highlightCommentId = null, highlightReplyId = null }) {
  const currentUser = safeParseUser();
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch(`${API}/memories/items/${itemId}/comments`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setComments(data.comments);
      } catch { /* non-fatal */ }
      finally { setLoading(false); }
    };
    load();
  }, [itemId]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>Comments</h4>
          <FiX size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ borderTop: "1px solid #eee", marginBottom: 10 }} />

        {loading ? (
          <p style={{ textAlign: "center", color: "#aaa", fontSize: 14, padding: "20px 0" }}>Loading...</p>
        ) : (
          <MemoryCommentSection
            comments={comments}
            setComments={setComments}
            currentUser={currentUser}
            itemId={itemId}
            disableComments={disableComments}
            highlightCommentId={highlightCommentId}
            highlightReplyId={highlightReplyId}
          />
        )}
      </div>
    </div>
  );
}

export default MemoryCommentsSheet;

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1100 };
const boxStyle      = { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420, maxHeight: "82vh", overflowY: "auto", padding: 16, boxSizing: "border-box" };