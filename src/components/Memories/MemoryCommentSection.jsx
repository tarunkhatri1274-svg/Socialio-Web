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

// ── MemoryCommentSection — same behavior/markup as CommentSection.jsx
// (post comments): like, reply, edit, delete on both comments and
// replies, all live via scoped sockets. Only difference is the API base
// (`/memories/items/:itemId/...`) and the socket room
// (`memoryItem:{itemId}:...` instead of `post:{postId}:...`).
// ← NEW — same highlight-on-open behavior as CommentSection.jsx, for
// memory-item comment/reply notifications.
const HIGHLIGHT_MS = 2200;

const MemoryCommentSection = ({ comments, setComments, currentUser, itemId, disableComments, highlightCommentId = null, highlightReplyId = null }) => {
  const [editingCommentId,   setEditingCommentId]   = useState(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [replyingToId,       setReplyingToId]       = useState(null);
  const [replyingToReplyId,  setReplyingToReplyId]  = useState(null);
  const [replyText,          setReplyText]          = useState("");
  const [editingReply,       setEditingReply]       = useState({ commentId: null, replyId: null, text: "" });
  const [newComment,         setNewComment]         = useState("");
  const [activeHighlight,    setActiveHighlight]    = useState(highlightReplyId || highlightCommentId || null);
  const itemRefs = React.useRef({});

  useEffect(() => {
    const targetId = highlightReplyId || highlightCommentId;
    if (!targetId) return;
    const node = itemRefs.current[targetId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setActiveHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [comments, highlightCommentId, highlightReplyId]);

  const highlightStyle = (id) =>
    activeHighlight === id
      ? { background: "#fff6d9", borderRadius: 10, transition: "background 0.4s ease" }
      : undefined;

  // ── scoped socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!itemId) return;

    const onNewComment = ({ comment }) => {
      setComments(prev => (prev.some(c => c._id === comment._id) ? prev : [...prev, comment]));
    };

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

    socket.on(`memoryItem:${itemId}:newComment`,    onNewComment);
    socket.on(`memoryItem:${itemId}:commentEdited`, onCommentEdited);
    socket.on(`memoryItem:${itemId}:commentDeleted`,onCommentDeleted);
    socket.on(`memoryItem:${itemId}:commentLiked`,  onCommentLiked);
    socket.on(`memoryItem:${itemId}:newReply`,      onNewReply);
    socket.on(`memoryItem:${itemId}:replyEdited`,   onReplyEdited);
    socket.on(`memoryItem:${itemId}:replyDeleted`,  onReplyDeleted);
    socket.on(`memoryItem:${itemId}:replyLiked`,    onReplyLiked);

    return () => {
      socket.off(`memoryItem:${itemId}:newComment`,     onNewComment);
      socket.off(`memoryItem:${itemId}:commentEdited`,  onCommentEdited);
      socket.off(`memoryItem:${itemId}:commentDeleted`, onCommentDeleted);
      socket.off(`memoryItem:${itemId}:commentLiked`,   onCommentLiked);
      socket.off(`memoryItem:${itemId}:newReply`,       onNewReply);
      socket.off(`memoryItem:${itemId}:replyEdited`,    onReplyEdited);
      socket.off(`memoryItem:${itemId}:replyDeleted`,   onReplyDeleted);
      socket.off(`memoryItem:${itemId}:replyLiked`,     onReplyLiked);
    };
  }, [itemId, currentUser?._id]);

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    try {
      const res  = await fetch(`${API}/memories/items/${itemId}/comments`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ text: newComment }),
      });
      const data = await res.json();
      if (data.success) {
        setComments(prev => (prev.some(c => c._id === data.comment._id) ? prev : [...prev, data.comment]));
        setNewComment("");
      }
    } catch (err) { console.log(err); }
  };

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
      await fetch(`${API}/memories/items/${itemId}/comments/${commentId}/like`, { method: "PUT", headers: authHeaders() });
    } catch (err) { console.log(err); }
  };

  const handleReplySubmit = async (commentId) => {
    if (!replyText.trim()) return;
    try {
      // ← NEW — same fix as post comments' CommentSection.jsx: tells the
      // backend which reply (if any) you tapped "reply" on, so it can
      // notify that person instead of always the top-level commenter.
      const res  = await fetch(`${API}/memories/items/${itemId}/comments/${commentId}/replies`, {
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
      const res  = await fetch(`${API}/memories/items/${itemId}/comments/${commentId}`, {
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
      const res  = await fetch(`${API}/memories/items/${itemId}/comments/${commentId}`, { method: "DELETE", headers: authHeaders() });
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
      await fetch(`${API}/memories/items/${itemId}/comments/${commentId}/replies/${replyId}/like`, { method: "PUT", headers: authHeaders() });
    } catch (err) { console.log(err); }
  };

  const handleReplyEditSubmit = async (commentId, replyId) => {
    if (!editingReply.text.trim()) return;
    try {
      const res  = await fetch(`${API}/memories/items/${itemId}/comments/${commentId}/replies/${replyId}`, {
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
      const res  = await fetch(`${API}/memories/items/${itemId}/comments/${commentId}/replies/${replyId}`, { method: "DELETE", headers: authHeaders() });
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
        .mcw { width:100%; display:flex; flex-direction:column; gap:16px; }
        .mcc { display:flex; gap:10px; }
        .mc-content { flex:1; min-width:0; }
        .mc-box { background:#fff; padding:11px 14px; border-radius:16px; box-shadow:0 1px 5px rgba(0,0,0,0.07); }
        .mc-header { display:flex; align-items:center; gap:8px; }
        .mc-header h4 { margin:0; font-size:14px; font-weight:600; }
        .mc-text { margin-top:5px; font-size:14px; color:#333; line-height:1.5; }
        .m-edited-tag { font-size:11px; color:#bbb; margin-left:4px; }
        .marow { display:flex; gap:6px; margin-top:8px; align-items:center; flex-wrap:wrap; }
        .mcbtn { width:30px; height:30px; border-radius:50%; border:none; background:#f1f1f1; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; }
        .mcbtn:hover { background:#e2e2e2; }
        .mcbtn.liked { color:#e0245e; }
        .mcbtn.del { color:#e53935; }
        .mlc { font-size:12px; color:#888; }
        .mrs { margin-left:18px; margin-top:10px; border-left:2px solid #f0f0f0; padding-left:10px; display:flex; flex-direction:column; gap:8px; }
        .mrc { display:flex; gap:8px; }
        .mrb { background:#f7f7f7; padding:9px 11px; border-radius:12px; flex:1; min-width:0; }
        .mrb h5 { margin:0 0 3px; font-size:13px; font-weight:600; }
        .mrb p { margin:0; font-size:13px; color:#333; }
        .mra { display:flex; gap:6px; margin-top:7px; align-items:center; }
        .mei { width:100%; border:1px solid #ddd; border-radius:10px; padding:7px 11px; font-size:13px; outline:none; margin-top:5px; box-sizing:border-box; }
        .mea { display:flex; gap:7px; margin-top:5px; }
        .msb { padding:4px 13px; border:none; border-radius:8px; background:#1877f2; color:#fff; font-size:12px; cursor:pointer; font-weight:600; }
        .mcb { padding:4px 13px; border:none; border-radius:8px; background:#f0f0f0; color:#333; font-size:12px; cursor:pointer; }
        .mri { display:flex; gap:8px; margin-top:8px; padding-left:40px; align-items:center; }
        .mri input { flex:1; border:1px solid #ddd; border-radius:20px; padding:7px 13px; font-size:13px; outline:none; }
        .mri button { border:none; background:none; color:#1877f2; font-weight:700; font-size:13px; cursor:pointer; }
        .m-no-c { text-align:center; color:#bbb; font-size:14px; padding:28px 0; }
        .mnew { display:flex; gap:8px; align-items:center; padding-top:12px; border-top:1px solid #eee; }
        .mnew input { flex:1; border:1px solid #e2e2e2; background:#f7f7f7; border-radius:20px; padding:9px 14px; font-size:13.5px; outline:none; }
      `}</style>

      <div className="mcw">
        {comments?.length === 0 && (
          <p className="m-no-c">{disableComments ? "Comments are turned off" : "No comments yet. Be the first!"}</p>
        )}

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
              <div className="mcc">
                <AvatarCircle user={comment.user} size={40} />
                <div className="mc-content">
                  <div className="mc-box">
                    <div className="mc-header">
                      <h4>{comment.user?.username}</h4>
                      {comment.isEdited && <span className="m-edited-tag">edited</span>}
                    </div>

                    {isEditing ? (
                      <>
                        <input className="mei" value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleEditSubmit(comment._id)}
                          autoFocus />
                        <div className="mea">
                          <button className="msb" onClick={() => handleEditSubmit(comment._id)}>Save</button>
                          <button className="mcb" onClick={() => setEditingCommentId(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <div className="mc-text">{comment.text}</div>
                    )}

                    <div className="marow">
                      <button className={`mcbtn ${isLiked ? "liked" : ""}`} onClick={() => handleLike(comment._id)}>
                        <FaHeart />
                      </button>
                      {likesCount > 0 && <span className="mlc">{likesCount}</span>}

                      {!disableComments && (
                        <button className="mcbtn" onClick={() => {
                          setReplyingToId(replyingToId === comment._id && replyingToReplyId === null ? null : comment._id);
                          setReplyingToReplyId(null);
                          setReplyText("");
                        }}>
                          <FaReply />
                        </button>
                      )}

                      {isMyComment && (
                        <button className="mcbtn" onClick={() => { setEditingCommentId(comment._id); setEditingCommentText(comment.text); }}>
                          <FaEdit />
                        </button>
                      )}
                      {isMyComment && (
                        <button className="mcbtn del" onClick={() => handleDelete(comment._id)}><FaTrash /></button>
                      )}
                    </div>
                  </div>

                  {replyingToId === comment._id && replyingToReplyId === null && (
                    <div className="mri">
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
                    <div className="mrs">
                      {comment.replies.map((reply) => {
                        const isMyReply         = myId === reply.user?._id?.toString();
                        const isReplyLiked      = Array.isArray(reply.likes) && reply.likes.some(id => id?.toString() === myId);
                        const replyLikesCount   = reply.likes?.length || 0;
                        const isEditingReply    = editingReply.commentId === comment._id && editingReply.replyId === reply._id;
                        const isReplyingToReply = replyingToId === comment._id && replyingToReplyId === reply._id;

                        return (
                          <div
                            key={reply._id}
                            ref={(el) => { itemRefs.current[reply._id] = el; }}
                            style={highlightStyle(reply._id)}
                          >
                            <div className="mrc">
                              <AvatarCircle user={reply.user} size={30} />
                              <div className="mrb">
                                <h5>{reply.user?.username}{reply.isEdited && <span className="m-edited-tag"> · edited</span>}</h5>

                                {isEditingReply ? (
                                  <>
                                    <input className="mei" value={editingReply.text}
                                      onChange={e => setEditingReply(p => ({ ...p, text: e.target.value }))}
                                      onKeyDown={e => e.key === "Enter" && handleReplyEditSubmit(comment._id, reply._id)}
                                      autoFocus />
                                    <div className="mea">
                                      <button className="msb" onClick={() => handleReplyEditSubmit(comment._id, reply._id)}>Save</button>
                                      <button className="mcb" onClick={() => setEditingReply({ commentId: null, replyId: null, text: "" })}>Cancel</button>
                                    </div>
                                  </>
                                ) : (
                                  <p>{reply.text}</p>
                                )}

                                <div className="mra">
                                  <button className={`mcbtn ${isReplyLiked ? "liked" : ""}`} onClick={() => handleReplyLike(comment._id, reply._id)}>
                                    <FaHeart />
                                  </button>
                                  {replyLikesCount > 0 && <span className="mlc">{replyLikesCount}</span>}

                                  {!disableComments && (
                                    <button className="mcbtn" onClick={() => {
                                      setReplyingToId(comment._id);
                                      setReplyingToReplyId(isReplyingToReply ? null : reply._id);
                                      setReplyText(isReplyingToReply ? "" : `@${reply.user?.username} `);
                                    }}>
                                      <FaReply />
                                    </button>
                                  )}

                                  {isMyReply && (
                                    <button className="mcbtn" onClick={() => setEditingReply({ commentId: comment._id, replyId: reply._id, text: reply.text })}>
                                      <FaEdit />
                                    </button>
                                  )}
                                  {isMyReply && (
                                    <button className="mcbtn del" onClick={() => handleReplyDelete(comment._id, reply._id)}>
                                      <FaTrash />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {isReplyingToReply && (
                              <div className="mri" style={{ paddingLeft: 38 }}>
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

      {!disableComments && (
        <div className="mnew">
          <AvatarCircle user={currentUser} size={30} />
          <input
            placeholder="Add a comment..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePostComment()}
          />
          <button className="msb" disabled={!newComment.trim()} onClick={handlePostComment}>Post</button>
        </div>
      )}
    </>
  );
};

export default MemoryCommentSection;