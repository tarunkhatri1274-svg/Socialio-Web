import React, { useState, useEffect } from "react";
import { FaHeart, FaReply, FaEdit, FaTrash } from "react-icons/fa";
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

const CommentSection = ({ comments, setComments, currentUser, postId, highlightCommentId = null, highlightReplyId = null }) => {
  const [editingCommentId,   setEditingCommentId]   = useState(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [replyingToId,       setReplyingToId]       = useState(null);
  const [replyingToReplyId,  setReplyingToReplyId]  = useState(null);
  const [replyText,          setReplyText]          = useState("");
  const [editingReply,       setEditingReply]       = useState({ commentId: null, replyId: null, text: "" });
  const [activeHighlight,    setActiveHighlight]    = useState(highlightReplyId || highlightCommentId || null);
  const itemRefs = React.useRef({});

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
    socket.on(`post:${postId}:commentEdited`,   onCommentEdited);
    socket.on(`post:${postId}:commentDeleted`,  onCommentDeleted);
    socket.on(`post:${postId}:commentLiked`,    onCommentLiked);
    socket.on(`post:${postId}:newReply`,        onNewReply);
    socket.on(`post:${postId}:replyEdited`,     onReplyEdited);
    socket.on(`post:${postId}:replyDeleted`,    onReplyDeleted);
    socket.on(`post:${postId}:replyLiked`,      onReplyLiked);

    return () => {
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

  const myId = currentUser?._id?.toString();

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
      `}</style>

      <div className="cw">
        {comments?.length === 0 && <p className="no-c">No comments yet. Be the first!</p>}

        {comments?.map((comment) => {
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
                      <div className="c-text">{comment.text}</div>
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

                      {isMyComment && (
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