import React, { useState, useEffect } from "react";
import { FaHeart, FaReply, FaEdit, FaTrash, FaThumbtack, FaPoll, FaCheck } from "react-icons/fa";
import socket from "../../sockets/sockets";

const API = import.meta.env.VITE_API_URL;
const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

const AvatarCircle = ({ user, size }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", border: "2px solid #ddd", flexShrink: 0 }}>
    {user?.profilePic
      ? <img src={user.profilePic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : <div style={{ width: "100%", height: "100%", background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.38 }}>
          {user?.username?.[0]?.toUpperCase() || "?"}
        </div>
    }
  </div>
);

// ← NEW — comment/reply id to scroll-to + briefly highlight on mount,
// passed down from the notification-open handoff (see
// consumePostSheet()/PostCard). Purely cosmetic: it doesn't change any
// like/edit/delete behavior below.
const HIGHLIGHT_MS = 2200;

/* ─── Comment polls ─── */
const POLL_ACCENT = "#1877f2";
const pollVoterId = (v) => String(v?._id || v);
const countPollVoters = (options) =>
  new Set((options || []).flatMap((o) => (o.votes || []).map(pollVoterId))).size;

// Pinned comments first (most recently pinned on top); others keep order.
const sortPinned = (list) => {
  const arr = Array.isArray(list) ? list : [];
  const pinned = arr
    .filter((c) => c.isPinned)
    .sort((a, b) => new Date(b.pinnedAt || 0) - new Date(a.pinnedAt || 0));
  return [...pinned, ...arr.filter((c) => !c.isPinned)];
};

const sheetOverlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9500, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const sheetBox = { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" };
const sheetHead = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", borderBottom: "1px solid #f0f0f0" };
const closeBtn = { background: "none", border: "none", fontSize: 22, lineHeight: 1, color: "#333", cursor: "pointer", padding: "0 8px" };

function CommentPollBody({ poll, myId, onVote, onViewVotes }) {
  const options = poll.options || [];
  const total = countPollVoters(options);
  const myChoices = options
    .filter((o) => (o.votes || []).some((v) => pollVoterId(v) === myId))
    .map((o) => String(o._id));

  const toggle = (optId) => {
    const id = String(optId);
    let next;
    if (poll.allowMultiple) next = myChoices.includes(id) ? myChoices.filter((x) => x !== id) : [...myChoices, id];
    else next = myChoices.includes(id) ? [] : [id];
    onVote(next);
  };

  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#111", lineHeight: "20px" }}>{poll.question}</div>
      <div style={{ fontSize: 12, color: "#888", margin: "2px 0 10px" }}>{poll.allowMultiple ? "Select one or more" : "Select one"}</div>

      {options.map((o) => {
        const id = String(o._id);
        const count = o.votes?.length || 0;
        const mine = myChoices.includes(id);
        const pct = total ? (count / total) * 100 : 0;
        return (
          <div key={id} onClick={() => toggle(id)} style={{ marginBottom: 10, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", boxSizing: "border-box", border: `1.5px solid ${mine ? POLL_ACCENT : "#aaa"}`, background: mine ? POLL_ACCENT : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 10, flexShrink: 0, color: "#fff", fontSize: 9 }}>
                {mine && <FaCheck />}
              </div>
              <span style={{ flex: 1, fontSize: 14, color: "#222", wordBreak: "break-word" }}>{o.text}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#222", marginLeft: 8 }}>{count}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: "#ececec", margin: "5px 0 0 30px", overflow: "hidden" }}>
              <div style={{ height: 5, borderRadius: 3, background: POLL_ACCENT, width: `${pct}%`, transition: "width .25s ease" }} />
            </div>
          </div>
        );
      })}

      <button
        onClick={() => total && onViewVotes()}
        disabled={total === 0}
        style={{ width: "100%", border: "none", borderTop: "1px solid #f0f0f0", background: "none", marginTop: 2, padding: "7px 0 2px", fontSize: 13, fontWeight: 700, color: POLL_ACCENT, cursor: total ? "pointer" : "default", opacity: total ? 1 : 0.5 }}
      >
        {total ? `View votes (${total})` : "No votes yet"}
      </button>
    </div>
  );
}

function CommentPollVotersSheet({ poll, myId, onClose }) {
  const options = poll.options || [];
  const total = countPollVoters(options);
  return (
    <div style={sheetOverlay} onClick={onClose}>
      <div style={sheetBox} onClick={(e) => e.stopPropagation()}>
        <div style={sheetHead}>
          <div style={{ minWidth: 0, paddingRight: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111" }}>{poll.question}</p>
            <p style={{ fontSize: 12, color: "#999", margin: "2px 0 0" }}>{total} {total === 1 ? "vote" : "votes"}</p>
          </div>
          <button style={closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
          {options.map((o) => {
            const voters = o.votes || [];
            return (
              <div key={String(o._id)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#f7f7f7" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{o.text}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#888", marginLeft: 8, flexShrink: 0 }}>{voters.length} {voters.length === 1 ? "vote" : "votes"}</span>
                </div>
                {voters.length === 0 ? (
                  <p style={{ margin: 0, padding: "10px 16px", fontSize: 13, color: "#aaa", fontStyle: "italic" }}>No votes</p>
                ) : voters.map((u) => {
                  const user = typeof u === "object" && u ? u : { _id: String(u), username: "Someone" };
                  return (
                    <div key={String(user._id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px" }}>
                      <AvatarCircle user={user} size={34} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>
                        {user.username}{String(user._id) === myId ? " (You)" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreateCommentPollSheet({ onClose, onCreate }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const canSend = question.trim().length > 0 && new Set(cleaned).size >= 2 && !submitting;
  const setOpt = (i, v) => setOptions((p) => p.map((o, idx) => (idx === i ? v : o)));
  const addOpt = () => setOptions((p) => (p.length >= 12 ? p : [...p, ""]));
  const removeOpt = (i) => setOptions((p) => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      await onCreate({ question: question.trim(), options: cleaned, allowMultiple });
    } catch (err) {
      alert(err?.message || "Couldn't create poll. Please try again.");
      setSubmitting(false);
    }
  };

  const label = { fontSize: 12, fontWeight: 700, color: "#aaa", textTransform: "uppercase", margin: "16px 0 8px" };
  const input = { width: "100%", boxSizing: "border-box", background: "#f2f2f2", border: "none", borderRadius: 12, padding: "10px 14px", fontSize: 14, color: "#111", outline: "none", fontFamily: "inherit" };

  return (
    <div style={sheetOverlay} onClick={onClose}>
      <div style={sheetBox} onClick={(e) => e.stopPropagation()}>
        <div style={sheetHead}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111" }}>Create poll</p>
          <button style={closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
          <p style={label}>Question</p>
          <textarea style={{ ...input, resize: "none", height: 64 }} placeholder="Ask a question" value={question} maxLength={250} onChange={(e) => setQuestion(e.target.value)} autoFocus />

          <p style={label}>Options</p>
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input style={{ ...input, flex: 1, width: "auto" }} placeholder={`Option ${i + 1}`} value={o} maxLength={100} onChange={(e) => setOpt(i, e.target.value)} />
              {options.length > 2 && <button style={{ ...closeBtn, color: "#e53935", fontSize: 20 }} onClick={() => removeOpt(i)}>×</button>}
            </div>
          ))}
          {options.length < 12 && (
            <button onClick={addOpt} style={{ border: "none", background: "none", color: POLL_ACCENT, fontWeight: 700, fontSize: 14, padding: "10px 0", cursor: "pointer" }}>+ Add option</button>
          )}

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, cursor: "pointer" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Allow multiple answers</span>
            <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} style={{ width: 20, height: 20, accentColor: POLL_ACCENT }} />
          </label>
        </div>
        <div style={{ padding: "8px 16px 20px" }}>
          <button onClick={submit} disabled={!canSend} style={{ width: "100%", border: "none", background: POLL_ACCENT, color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 0", borderRadius: 24, cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.45 }}>
            {submitting ? "Posting…" : "Post poll"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CommentSection = ({ comments, setComments, currentUser, postId, highlightCommentId = null, highlightReplyId = null, postAuthorId = null }) => {
  const [editingCommentId,   setEditingCommentId]   = useState(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [replyingToId,       setReplyingToId]       = useState(null);
  const [replyingToReplyId,  setReplyingToReplyId]  = useState(null);
  const [replyText,          setReplyText]          = useState("");
  const [editingReply,       setEditingReply]       = useState({ commentId: null, replyId: null, text: "" });
  const [activeHighlight,    setActiveHighlight]    = useState(highlightReplyId || highlightCommentId || null);
  const itemRefs = React.useRef({});
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [votersFor, setVotersFor] = useState(null); // commentId whose voter list is open

  // Scroll to + flash whichever comment/reply the notification pointed at,
  // once the list we're looking for has actually loaded.
  useEffect(() => {
    const targetId = highlightReplyId || highlightCommentId;
    if (!targetId) return;
    const node = itemRefs.current[targetId];
    if (!node) return; // not rendered yet (comments still loading) — retry on next render
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setActiveHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [comments, highlightCommentId, highlightReplyId]);

  const highlightStyle = (id) =>
    activeHighlight === id
      ? { background: "#fff6d9", borderRadius: 10, transition: "background 0.4s ease" }
      : undefined;

  // ✅ scoped socket listeners
  useEffect(() => {
    if (!postId) return;

    const onCommentEdited = ({ commentId, text, isEdited }) => {
      setComments(prev => prev.map(c => c._id === commentId ? { ...c, text, isEdited } : c));
    };

    const onCommentDeleted = ({ commentId }) => {
      setComments(prev => prev.filter(c => c._id !== commentId));
    };

    const onCommentLiked = ({ commentId, totalLikes, userId }) => {
      if (userId?.toString() === currentUser?._id?.toString()) return;
      setComments(prev => prev.map(c =>
        c._id === commentId ? { ...c, likes: Array(totalLikes).fill(null) } : c
      ));
    };

    const onNewReply = ({ commentId, reply }) => {
      setComments(prev => prev.map(c => {
        if (c._id !== commentId) return c;
        if (c.replies?.some(r => r._id === reply._id)) return c;
        return { ...c, replies: [...(c.replies || []), reply] };
      }));
    };

    const onReplyEdited = ({ commentId, replyId, text, isEdited }) => {
      setComments(prev => prev.map(c => {
        if (c._id !== commentId) return c;
        return { ...c, replies: c.replies.map(r => r._id === replyId ? { ...r, text, isEdited } : r) };
      }));
    };

    const onReplyDeleted = ({ commentId, replyId }) => {
      setComments(prev => prev.map(c => {
        if (c._id !== commentId) return c;
        return { ...c, replies: c.replies.filter(r => r._id !== replyId) };
      }));
    };

    const onReplyLiked = ({ commentId, replyId, totalLikes, userId }) => {
      if (userId?.toString() === currentUser?._id?.toString()) return;
      setComments(prev => prev.map(c => {
        if (c._id !== commentId) return c;
        return { ...c, replies: c.replies.map(r => r._id === replyId ? { ...r, likes: Array(totalLikes).fill(null) } : r) };
      }));
    };

    // ✅ all scoped to this postId
    const onCommentPollUpdated = ({ commentId, options }) => {
      setComments(prev => prev.map(c => (c._id === commentId && c.poll ? { ...c, poll: { ...c.poll, options } } : c)));
    };

    const onCommentPinned = ({ commentId, isPinned, pinnedAt }) => {
      setComments(prev => prev.map(c => (c._id === commentId ? { ...c, isPinned, pinnedAt } : c)));
    };

    socket.on(`post:${postId}:commentPollUpdated`, onCommentPollUpdated);
    socket.on(`post:${postId}:commentPinned`,      onCommentPinned);
    socket.on(`post:${postId}:commentEdited`,   onCommentEdited);
    socket.on(`post:${postId}:commentDeleted`,  onCommentDeleted);
    socket.on(`post:${postId}:commentLiked`,    onCommentLiked);
    socket.on(`post:${postId}:newReply`,        onNewReply);
    socket.on(`post:${postId}:replyEdited`,     onReplyEdited);
    socket.on(`post:${postId}:replyDeleted`,    onReplyDeleted);
    socket.on(`post:${postId}:replyLiked`,      onReplyLiked);

    return () => {
      socket.off(`post:${postId}:commentPollUpdated`, onCommentPollUpdated);
      socket.off(`post:${postId}:commentPinned`,      onCommentPinned);
      socket.off(`post:${postId}:commentEdited`,  onCommentEdited);
      socket.off(`post:${postId}:commentDeleted`, onCommentDeleted);
      socket.off(`post:${postId}:commentLiked`,   onCommentLiked);
      socket.off(`post:${postId}:newReply`,       onNewReply);
      socket.off(`post:${postId}:replyEdited`,    onReplyEdited);
      socket.off(`post:${postId}:replyDeleted`,   onReplyDeleted);
      socket.off(`post:${postId}:replyLiked`,     onReplyLiked);
    };
  }, [postId, currentUser?._id]);

  const handleLike = async (commentId) => {
    const myId = currentUser?._id?.toString();
    setComments(prev => prev.map(c => {
      if (c._id !== commentId) return c;
      const alreadyLiked = (c.likes || []).some(id => id?.toString() === myId);
      return {
        ...c,
        likes: alreadyLiked
          ? (c.likes || []).filter(id => id?.toString() !== myId)
          : [...(c.likes || []), currentUser._id],
      };
    }));
    try {
      await fetch(`${API}/auth/comment-like/${postId}/${commentId}`, { method: "POST", headers: authHeaders() });
    } catch (err) { console.log(err); }
  };

  const handleReplySubmit = async (commentId) => {
    if (!replyText.trim()) return;
    try {
      // ← NEW — parentReplyId tells the backend which reply you tapped
      // "reply" on (if any), so it can notify THAT person specifically
      // instead of always notifying the top-level comment's author.
      const res  = await fetch(`${API}/auth/reply/${postId}/${commentId}`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ text: replyText, parentReplyId: replyingToReplyId || null }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.map(c => {
          if (c._id !== commentId) return c;
          if (c.replies?.some(r => r._id === data.reply._id)) return c;
          return { ...c, replies: [...(c.replies || []), data.reply] };
        }));
        setReplyingToId(null);
        setReplyingToReplyId(null);
        setReplyText("");
      }
    } catch (err) { console.log(err); }
  };

  const handleEditSubmit = async (commentId) => {
    if (!editingCommentText.trim()) return;
    try {
      const res  = await fetch(`${API}/auth/comment/${postId}/${commentId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ text: editingCommentText }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.map(c => c._id === commentId ? { ...c, text: editingCommentText, isEdited: true } : c));
        setEditingCommentId(null);
        setEditingCommentText("");
      }
    } catch (err) { console.log(err); }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      const res  = await fetch(`${API}/auth/comment/${postId}/${commentId}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (data.success) setComments(prev => prev.filter(c => c._id !== commentId));
    } catch (err) { console.log(err); }
  };

  const handleReplyLike = async (commentId, replyId) => {
    const myId = currentUser?._id?.toString();
    setComments(prev => prev.map(c => {
      if (c._id !== commentId) return c;
      return {
        ...c,
        replies: c.replies.map(r => {
          if (r._id !== replyId) return r;
          const alreadyLiked = (r.likes || []).some(id => id?.toString() === myId);
          return {
            ...r,
            likes: alreadyLiked
              ? (r.likes || []).filter(id => id?.toString() !== myId)
              : [...(r.likes || []), currentUser._id],
          };
        }),
      };
    }));
    try {
      await fetch(`${API}/auth/reply-like/${postId}/${commentId}/${replyId}`, { method: "POST", headers: authHeaders() });
    } catch (err) { console.log(err); }
  };

  const handleReplyEditSubmit = async (commentId, replyId) => {
    if (!editingReply.text.trim()) return;
    try {
      const res  = await fetch(`${API}/auth/reply/${postId}/${commentId}/${replyId}`, {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ text: editingReply.text }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.map(c => {
          if (c._id !== commentId) return c;
          return { ...c, replies: c.replies.map(r => r._id === replyId ? { ...r, text: editingReply.text, isEdited: true } : r) };
        }));
        setEditingReply({ commentId: null, replyId: null, text: "" });
      }
    } catch (err) { console.log(err); }
  };

  const handleReplyDelete = async (commentId, replyId) => {
    if (!window.confirm("Delete this reply?")) return;
    try {
      const res  = await fetch(`${API}/auth/reply/${postId}/${commentId}/${replyId}`, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setComments(prev => prev.map(c => {
          if (c._id !== commentId) return c;
          return { ...c, replies: c.replies.filter(r => r._id !== replyId) };
        }));
      }
    } catch (err) { console.log(err); }
  };

  const handleCreatePoll = async ({ question, options, allowMultiple }) => {
    const res = await fetch(`${API}/auth/comment-poll/${postId}`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ question, options, allowMultiple }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Couldn't create poll");
    setComments(prev => (prev.some(c => c._id === data.comment._id) ? prev : [...prev, data.comment]));
    setShowPollSheet(false);
  };

  // optionIds = this user's FULL selection after the click ([] = remove vote)
  const handleVote = async (comment, optionIds) => {
    const me = String(currentUser?._id);
    const mine = { _id: currentUser?._id, username: currentUser?.username, profilePic: currentUser?.profilePic };
    const prevOptions = comment.poll.options;
    const apply = (opts) =>
      setComments(prev => prev.map(c => (c._id === comment._id ? { ...c, poll: { ...c.poll, options: opts } } : c)));

    apply(prevOptions.map(o => {
      const without = (o.votes || []).filter(v => pollVoterId(v) !== me);
      return { ...o, votes: optionIds.includes(String(o._id)) ? [...without, mine] : without };
    }));

    try {
      const res = await fetch(`${API}/auth/comment-poll-vote/${postId}/${comment._id}`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ optionIds }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      apply(data.options);
    } catch (err) {
      console.log(err);
      apply(prevOptions); // roll back
    }
  };

  const handlePin = async (comment) => {
    try {
      const res = await fetch(`${API}/auth/comment-pin/${postId}/${comment._id}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (!data.success) { alert(data.message || "Couldn't pin comment."); return; }
      setComments(prev => prev.map(c => (c._id === comment._id ? { ...c, isPinned: data.isPinned, pinnedAt: data.pinnedAt } : c)));
    } catch (err) { console.log(err); }
  };

  const myId = currentUser?._id?.toString();
  // Post owner id: explicit prop if the parent passes it, otherwise the
  // `postAuthor` field the server now attaches to every comment.
  const postOwnerId = String(postAuthorId || comments?.find(c => c.postAuthor)?.postAuthor || "");
  const isPostOwner = !!postOwnerId && postOwnerId === myId;
  const sortedComments = sortPinned(comments);
  const votersComment = votersFor ? comments?.find(c => c._id === votersFor) : null;

  return (
    <>
      <style>{`
        .cw { width:100%; display:flex; flex-direction:column; gap:16px; padding:10px 0; }
        .cc { display:flex; gap:10px; }
        .c-content { flex:1; min-width:0; }
        .c-box { background:#fff; padding:11px 14px; border-radius:16px; box-shadow:0 1px 5px rgba(0,0,0,0.07); }
        .c-header { display:flex; align-items:center; gap:8px; }
        .c-header h4 { margin:0; font-size:14px; font-weight:600; }
        .c-text { margin-top:5px; font-size:14px; color:#333; line-height:1.5; }
        .edited-tag { font-size:11px; color:#bbb; margin-left:4px; }
        .arow { display:flex; gap:6px; margin-top:8px; align-items:center; flex-wrap:wrap; }
        .cbtn { width:30px; height:30px; border-radius:50%; border:none; background:#f1f1f1; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; }
        .cbtn:hover { background:#e2e2e2; }
        .cbtn.liked { color:#e0245e; }
        .cbtn.del { color:#e53935; }
        .lc { font-size:12px; color:#888; }
        .rs { margin-left:18px; margin-top:10px; border-left:2px solid #f0f0f0; padding-left:10px; display:flex; flex-direction:column; gap:8px; }
        .rc { display:flex; gap:8px; }
        .rb { background:#f7f7f7; padding:9px 11px; border-radius:12px; flex:1; min-width:0; }
        .rb h5 { margin:0 0 3px; font-size:13px; font-weight:600; }
        .rb p { margin:0; font-size:13px; color:#333; }
        .ra { display:flex; gap:6px; margin-top:7px; align-items:center; }
        .ei { width:100%; border:1px solid #ddd; border-radius:10px; padding:7px 11px; font-size:13px; outline:none; margin-top:5px; box-sizing:border-box; }
        .ea { display:flex; gap:7px; margin-top:5px; }
        .sb { padding:4px 13px; border:none; border-radius:8px; background:#1877f2; color:#fff; font-size:12px; cursor:pointer; font-weight:600; }
        .cb { padding:4px 13px; border:none; border-radius:8px; background:#f0f0f0; color:#333; font-size:12px; cursor:pointer; }
        .ri { display:flex; gap:8px; margin-top:8px; padding-left:40px; align-items:center; }
        .ri input { flex:1; border:1px solid #ddd; border-radius:20px; padding:7px 13px; font-size:13px; outline:none; }
        .ri button { border:none; background:none; color:#1877f2; font-weight:700; font-size:13px; cursor:pointer; }
        .no-c { text-align:center; color:#bbb; font-size:14px; padding:28px 0; }
        .poll-bar { align-self:flex-start; display:flex; align-items:center; gap:6px; padding:7px 12px; border:none; border-radius:18px; background:#e7f0fe; color:#1877f2; font-weight:700; font-size:13px; cursor:pointer; }
        .pin-tag { display:inline-flex; align-items:center; gap:3px; background:#e7f0fe; color:#1877f2; font-size:10.5px; font-weight:700; padding:2px 6px; border-radius:8px; }
        .cbtn.pinned { background:#e7f0fe; color:#1877f2; }
      `}</style>

      <div className="cw">
        {!!currentUser?._id && (isPostOwner || !postOwnerId) && (
          <button className="poll-bar" onClick={() => setShowPollSheet(true)}><FaPoll /> Create poll</button>
        )}
        {showPollSheet && <CreateCommentPollSheet onClose={() => setShowPollSheet(false)} onCreate={handleCreatePoll} />}
        {votersComment?.poll && (
          <CommentPollVotersSheet poll={votersComment.poll} myId={myId} onClose={() => setVotersFor(null)} />
        )}
        {comments?.length === 0 && <p className="no-c">No comments yet. Be the first!</p>}

        {sortedComments.map((comment) => {
          const isMyComment = myId === comment.user?._id?.toString();
          const isEditing   = editingCommentId === comment._id;
          const isLiked     = Array.isArray(comment.likes) && comment.likes.some(id => id?.toString() === myId);
          const likesCount  = comment.likes?.length || 0;

          return (
            <div
              key={comment._id}
              ref={(el) => { itemRefs.current[comment._id] = el; }}
              style={highlightStyle(comment._id)}
            >
              <div className="cc">
                {/* ✅ shows commenter's profile pic */}
                <AvatarCircle user={comment.user} size={40} />
                <div className="c-content">
                  <div className="c-box">
                    <div className="c-header">
                      <h4>{comment.user?.username}</h4>
                      {comment.isEdited && <span className="edited-tag">edited</span>}
                      {comment.isPinned && <span className="pin-tag"><FaThumbtack size={9} /> Pinned</span>}
                    </div>

                    {isEditing ? (
                      <>
                        <input className="ei" value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleEditSubmit(comment._id)}
                          autoFocus />
                        <div className="ea">
                          <button className="sb" onClick={() => handleEditSubmit(comment._id)}>Save</button>
                          <button className="cb" onClick={() => setEditingCommentId(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      comment.poll ? (
                      <CommentPollBody
                        poll={comment.poll}
                        myId={myId}
                        onVote={(ids) => handleVote(comment, ids)}
                        onViewVotes={() => setVotersFor(comment._id)}
                      />
                    ) : (
                      <div className="c-text">{comment.text}</div>
                    )
                    )}

                    <div className="arow">
                      <button className={`cbtn ${isLiked ? "liked" : ""}`} onClick={() => handleLike(comment._id)}>
                        <FaHeart />
                      </button>
                      {likesCount > 0 && <span className="lc">{likesCount}</span>}

                      <button className="cbtn" onClick={() => {
                        setReplyingToId(replyingToId === comment._id && replyingToReplyId === null ? null : comment._id);
                        setReplyingToReplyId(null);
                        setReplyText("");
                      }}>
                        <FaReply />
                      </button>

                      {isPostOwner && (
                        <button className={`cbtn ${comment.isPinned ? "pinned" : ""}`} onClick={() => handlePin(comment)} title={comment.isPinned ? "Unpin" : "Pin"}>
                          <FaThumbtack />
                        </button>
                      )}
                      {isMyComment && !comment.poll && (
                        <button className="cbtn" onClick={() => { setEditingCommentId(comment._id); setEditingCommentText(comment.text); }}>
                          <FaEdit />
                        </button>
                      )}
                      {isMyComment && (
                        <button className="cbtn del" onClick={() => handleDelete(comment._id)}><FaTrash /></button>
                      )}
                    </div>
                  </div>

                  {/* ✅ reply input shows current user's pic */}
                  {replyingToId === comment._id && replyingToReplyId === null && (
                    <div className="ri">
                      <AvatarCircle user={currentUser} size={28} />
                      <input
                        placeholder={`Reply to ${comment.user?.username}...`}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleReplySubmit(comment._id)}
                        autoFocus
                      />
                      <button onClick={() => handleReplySubmit(comment._id)} disabled={!replyText.trim()}>Post</button>
                    </div>
                  )}

                  {comment.replies?.length > 0 && (
                    <div className="rs">
                      {comment.replies.map((reply) => {
                        const isMyReply        = myId === reply.user?._id?.toString();
                        const isReplyLiked     = Array.isArray(reply.likes) && reply.likes.some(id => id?.toString() === myId);
                        const replyLikesCount  = reply.likes?.length || 0;
                        const isEditingReply   = editingReply.commentId === comment._id && editingReply.replyId === reply._id;
                        const isReplyingToReply = replyingToId === comment._id && replyingToReplyId === reply._id;

                        return (
                          <div
                            key={reply._id}
                            ref={(el) => { itemRefs.current[reply._id] = el; }}
                            style={highlightStyle(reply._id)}
                          >
                            <div className="rc">
                              {/* ✅ shows replier's profile pic */}
                              <AvatarCircle user={reply.user} size={30} />
                              <div className="rb">
                                <h5>{reply.user?.username}{reply.isEdited && <span className="edited-tag"> · edited</span>}</h5>

                                {isEditingReply ? (
                                  <>
                                    <input className="ei" value={editingReply.text}
                                      onChange={e => setEditingReply(p => ({ ...p, text: e.target.value }))}
                                      onKeyDown={e => e.key === "Enter" && handleReplyEditSubmit(comment._id, reply._id)}
                                      autoFocus />
                                    <div className="ea">
                                      <button className="sb" onClick={() => handleReplyEditSubmit(comment._id, reply._id)}>Save</button>
                                      <button className="cb" onClick={() => setEditingReply({ commentId: null, replyId: null, text: "" })}>Cancel</button>
                                    </div>
                                  </>
                                ) : (
                                  <p>{reply.text}</p>
                                )}

                                <div className="ra">
                                  <button className={`cbtn ${isReplyLiked ? "liked" : ""}`} onClick={() => handleReplyLike(comment._id, reply._id)}>
                                    <FaHeart />
                                  </button>
                                  {replyLikesCount > 0 && <span className="lc">{replyLikesCount}</span>}

                                  <button className="cbtn" onClick={() => {
                                    setReplyingToId(comment._id);
                                    setReplyingToReplyId(isReplyingToReply ? null : reply._id);
                                    setReplyText(isReplyingToReply ? "" : `@${reply.user?.username} `);
                                  }}>
                                    <FaReply />
                                  </button>

                                  {isMyReply && (
                                    <button className="cbtn" onClick={() => setEditingReply({ commentId: comment._id, replyId: reply._id, text: reply.text })}>
                                      <FaEdit />
                                    </button>
                                  )}
                                  {isMyReply && (
                                    <button className="cbtn del" onClick={() => handleReplyDelete(comment._id, reply._id)}>
                                      <FaTrash />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* ✅ nested reply input also shows current user's pic */}
                            {isReplyingToReply && (
                              <div className="ri" style={{ paddingLeft: 38 }}>
                                <AvatarCircle user={currentUser} size={28} />
                                <input
                                  placeholder={`Reply to ${reply.user?.username}...`}
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  onKeyDown={e => e.key === "Enter" && handleReplySubmit(comment._id)}
                                  autoFocus
                                />
                                <button onClick={() => handleReplySubmit(comment._id)} disabled={!replyText.trim()}>Post</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default CommentSection;