import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../../sockets/sockets";
import { SharedPostBubble, ForwardModal,getShareCaption } from "./SharedPostBubble";
import { ChatBubbleSkeleton } from "../../components/Skeleton/Skeleton.jsx";
const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
const shareCaptionStyle = (fromMe) => ({
  fontSize: 12,
  fontStyle: "italic",
  fontWeight: 600,
  margin: "0 0 6px",
  color: fromMe ? "rgba(255,255,255,0.75)" : "#8e8e8e",
});
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

// ── Is this a locally-created optimistic message not yet saved server-side?
const isTempMsgId = (id) => typeof id === "string" && id.startsWith("temp-");

/* ─── Icons ─── */
const BackArrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
const SendIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const CrownIcon = () => <svg viewBox="0 0 24 24" fill={GOLDEN} width="13" height="13"><path d="M2 20h20l-2-9-5 4-3-7-3 7-5-4z"/></svg>;
const PlusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ImageIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const VideoFileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const AudioIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const StopIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const DownloadIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const EditIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const TrashIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const HeartIcon = ({ filled }) => <svg viewBox="0 0 24 24" fill={filled?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const ReplyIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>;
const ForwardIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>;
const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const UserPlusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>;
const GroupIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

const COLORS = ["#e74c3c","#e67e22","#2ecc71","#3498db","#9b59b6","#1abc9c","#e91e63","#ff5722"];
const getColor = (str) => COLORS[(str?.charCodeAt(0)||0) % COLORS.length];
const getInitials = (name) => name?.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)||"?";
function Avatar({ user, size=42 }) {
  const pic = user?.profilePic;
  return pic
    ? <img src={pic} alt="" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
    : <div style={{width:size,height:size,borderRadius:"50%",background:getColor(user?.username),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:size*0.38,flexShrink:0}}>{getInitials(user?.username)}</div>;
}

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function GroupAvatarStack({ members, size = 42 }) {
  const list = (members || []).map(m => m.user || m).filter(Boolean);
  const count = list.length;

  const tile = (user, style, key) => {
    const pic = user?.profilePic;
    return (
      <div key={key} style={{ position: "absolute", overflow: "hidden", background: getColor(user?.username), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, boxSizing: "border-box", ...style }}>
        {pic
          ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <span style={{ fontSize: (parseFloat(style.width) / 100) * size * 0.34 || size * 0.24 }}>{getInitials(user?.username)}</span>}
      </div>
    );
  };

  const wrap = { position: "relative", width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "#ececec", flexShrink: 0 };

  if (count === 0) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa" }} />;
  if (count === 1) return <div style={wrap}>{tile(list[0], { top: 0, left: 0, width: "100%", height: "100%" }, 0)}</div>;
  if (count === 2) {
    return (
      <div style={wrap}>
        {tile(list[0], { top: 0, left: 0, width: "50%", height: "100%", borderRight: "1.5px solid #fff" }, 0)}
        {tile(list[1], { top: 0, left: "50%", width: "50%", height: "100%" }, 1)}
      </div>
    );
  }
  const [top, bl, br] = list;
  return (
    <div style={wrap}>
      {tile(top, { top: 0, left: "25%", width: "50%", height: "52%", borderBottom: "1.5px solid #fff" }, 0)}
      {tile(bl,  { bottom: 0, left: 0, width: "50%", height: "48%", borderRight: "0.75px solid #fff", borderTop: "1.5px solid #fff" }, 1)}
      {tile(br,  { bottom: 0, left: "50%", width: "50%", height: "48%", borderLeft: "0.75px solid #fff", borderTop: "1.5px solid #fff" }, 2)}
    </div>
  );
}

function SystemMessage({ msg }) {
  const fmt = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ textAlign: "center", margin: "10px 0" }}>
      <span style={{ fontSize: 12, color: "#888", background: "#ececec", borderRadius: 20, padding: "4px 14px", display: "inline-block" }}>{msg.text}</span>
      <p style={{ fontSize: 10, color: "#bbb", margin: "3px 0 0" }}>{fmt(msg.createdAt)}</p>
    </div>
  );
}

function MediaPreview({ media, fromMe }) {
  if (!media?.url) return null;

  if (media.mediaType === "image") return (
    <div style={{ marginBottom: 6, borderRadius: 12, overflow: "hidden" }}>
      <img src={media.url} alt="media" style={{ maxWidth: 220, maxHeight: 260, width: "100%", display: "block", objectFit: "cover", borderRadius: 12 }} />
    </div>
  );

  if (media.mediaType === "video") return (
    <div style={{ marginBottom: 6, borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <video src={media.url} controls style={{ maxWidth: 220, width: "100%", borderRadius: 12, display: "block", maxHeight: 200 }} />
    </div>
  );

  if (media.mediaType === "audio") return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, background: fromMe ? "rgba(255,255,255,0.15)" : "#f0f2f5", borderRadius: 12, padding: "8px 12px", maxWidth: 220 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: fromMe ? "rgba(255,255,255,0.25)" : GOLDEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <AudioIcon />
      </div>
      <audio src={media.url} controls style={{ flex: 1, height: 32, minWidth: 0 }} />
    </div>
  );

  const fileName = media.fileName || media.url?.split("/").pop()?.split("?")[0] || "Document";
  const ext = fileName.includes(".") ? fileName.split(".").pop().toUpperCase() : "FILE";
  const sizeLabel = formatFileSize(media.fileSize);
  const iconBg = fromMe ? "rgba(255,255,255,0.9)" : "#e5322d";
  const iconColor = fromMe ? "#e5322d" : "#fff";
  return (
    <a href={media.url} target="_blank" rel="noreferrer" download={fileName} style={{ textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, background: fromMe ? "rgba(255,255,255,0.12)" : "#fff", borderRadius: 10, padding: "10px 10px", maxWidth: 240, border: fromMe ? "1px solid rgba(255,255,255,0.2)" : "1px solid #ececec" }}>
        <div style={{ position: "relative", width: 42, height: 48, flexShrink: 0 }}>
          <svg viewBox="0 0 42 48" width="42" height="48">
            <path d="M4 2h24l10 10v32a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={iconBg} />
            <path d="M28 2l10 10H30a2 2 0 0 1-2-2V2z" fill={fromMe ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)"} />
          </svg>
          <span style={{ position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)", fontSize: 8.5, fontWeight: 800, letterSpacing: "0.02em", color: iconColor, maxWidth: 34, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ext}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: fromMe ? "#fff" : "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }} title={fileName}>{fileName}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: fromMe ? "rgba(255,255,255,0.7)" : "#8b98a3" }}>{ext}{sizeLabel ? ` · ${sizeLabel}` : " Document"}</p>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: fromMe ? "rgba(255,255,255,0.22)" : "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "center", color: fromMe ? "#fff" : "#54656f" }}>
          <DownloadIcon />
        </div>
      </div>
    </a>
  );
}

/* ─── Delete Message Sheet ─── */
function DeleteMessageSheet({ canDeleteForEveryone, onDeleteForMe, onDeleteForEveryone, onClose }) {
  return (
    <div style={s.actionSheetOverlay} onClick={onClose}>
      <div style={s.actionSheet} onClick={e=>e.stopPropagation()}>
        {canDeleteForEveryone && (
          <button style={{...s.actionSheetBtn,color:"#e53935"}} onClick={onDeleteForEveryone}>
            <TrashIcon/> Delete for everyone
          </button>
        )}
        <button style={s.actionSheetBtn} onClick={onDeleteForMe}><TrashIcon/> Delete for me</button>
        <button style={{...s.actionSheetBtn,color:"#888"}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── Attach Menu (photo / video / file / voice note) ───
   NOTE: now fires an optimistic bubble instantly (before upload starts),
   then swaps it for the real saved message — or marks it failed. */
function AttachMenu({ onClose, onMediaSent, onOptimisticAdd, onUploadFailed, chatId, currentUserId }) {
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecRef = useRef(null);
  const recTimerRef = useRef(null);
  const chunksRef = useRef([]);
  const imgRef = useRef(null);
  const vidRef = useRef(null);
  const fileRef = useRef(null);

  const uploadAndSend = async (file, mediaType) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localUrl = URL.createObjectURL(file);

    // 1) show it instantly, in "sending" state
    onOptimisticAdd({
      _id: tempId,
      chatId,
      user: { _id: currentUserId },
      text: "",
      media: { url: localUrl, mediaType, fileName: file.name, fileSize: file.size },
      createdAt: new Date().toISOString(),
      sending: true,
    });
    onClose();

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mediaType", mediaType);
      formData.append("fileName", file.name);
      const res = await fetch(`${API}/messages/upload`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const uploadData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(uploadData?.message || "Upload failed");

      const url = uploadData.url || uploadData.secure_url;
      const msgData = await apiFetch(`${API}/groups/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          text: "",
          media: {
            url,
            mediaType,
            fileName: uploadData.fileName || file.name,
            fileSize: uploadData.fileSize || file.size,
          },
        }),
      });
      // 2) swap the temp bubble for the real, saved message
      onMediaSent(msgData, tempId);
    } catch (err) {
      console.error("Upload failed", err);
      // 3) mark it failed instead of removing it
      onUploadFailed(tempId);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
        await uploadAndSend(file, "audio");
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch { alert("Microphone access denied"); }
  };

  const stopRecording = () => { clearInterval(recTimerRef.current); mediaRecRef.current?.stop(); setRecording(false); setRecSeconds(0); };
  const fmt = sec => `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;

  if (recording) {
    return (
      <div style={{...s.attachMenu,alignItems:"center",padding:"14px 16px",gap:12}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:"#e53935"}}/>
        <span style={{fontSize:13,color:"#e53935",fontWeight:600}}>🎙 {fmt(recSeconds)}</span>
        <button onClick={stopRecording} style={{background:"#e53935",border:"none",borderRadius:20,padding:"6px 14px",color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
          <StopIcon/> Send
        </button>
      </div>
    );
  }

  return (
    <div style={s.attachMenu}>
      <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])uploadAndSend(e.target.files[0],"image");}}/>
      <input ref={vidRef} type="file" accept="video/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0])uploadAndSend(e.target.files[0],"video");}}/>
      <input ref={fileRef} type="file" style={{display:"none"}} onChange={e=>{if(e.target.files[0])uploadAndSend(e.target.files[0],"file");}}/>
      <button style={{...s.attachOption,color:"#3498db"}} onClick={()=>imgRef.current?.click()}><div style={{...s.attachOptionIcon,background:"#3498db18"}}><ImageIcon/></div><span style={s.attachOptionLabel}>Photo</span></button>
      <button style={{...s.attachOption,color:"#e74c3c"}} onClick={()=>vidRef.current?.click()}><div style={{...s.attachOptionIcon,background:"#e74c3c18"}}><VideoFileIcon/></div><span style={s.attachOptionLabel}>Video</span></button>
      <button style={{...s.attachOption,color:"#9b59b6"}} onClick={()=>fileRef.current?.click()}><div style={{...s.attachOptionIcon,background:"#9b59b618"}}><FileIcon/></div><span style={s.attachOptionLabel}>File</span></button>
      <button style={{...s.attachOption,color:"#2ecc71"}} onClick={startRecording}><div style={{...s.attachOptionIcon,background:"#2ecc7118"}}><AudioIcon/></div><span style={s.attachOptionLabel}>Record</span></button>
    </div>
  );
}

/* ─── Group message bubble — reply / like / edit / forward / delete ───── */
function GroupMessageBubble({ msg, fromMe, currentUser, onDelete, onEdit, onReply, onForward }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || "");
  const [liked, setLiked] = useState(msg.likes?.some(id => id?.toString() === currentUser._id?.toString()) || false);
  const [likeCount, setLikeCount] = useState(msg.likes?.length || 0);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const fmt = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isTemp = isTempMsgId(msg._id);

  useEffect(() => {
    setLiked(msg.likes?.some(id => id?.toString() === currentUser._id?.toString()) || false);
    setLikeCount(msg.likes?.length || 0);
  }, [msg.likes, currentUser._id]);

  const handleDeleteForMe = async () => {
    setShowDeleteSheet(false);
    if (isTemp) { onDelete(msg._id); return; }
    try {
      await fetch(`${API}/groups/messages/${msg._id}`, {
        method: "DELETE", credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: msg.chatId, forEveryone: false })
      });
      onDelete(msg._id);
    } catch (err) { console.error("Delete failed", err); }
  };

  const handleDeleteForEveryone = async () => {
    setShowDeleteSheet(false);
    if (isTemp) { onDelete(msg._id); return; }
    try {
      await fetch(`${API}/groups/messages/${msg._id}`, {
        method: "DELETE", credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: msg.chatId, forEveryone: true })
      });
      onDelete(msg._id);
    } catch (err) { console.error("Delete for everyone failed", err); }
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    try {
      await apiFetch(`${API}/groups/messages/${msg._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText, chatId: msg.chatId })
      });
      onEdit(msg._id, editText); setEditing(false);
    } catch (err) { console.error("Edit failed", err); }
  };

  const handleLike = async () => {
    const was = liked; setLiked(!was); setLikeCount(c => was ? c - 1 : c + 1);
    try { await apiFetch(`${API}/groups/messages/like/${msg._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: msg.chatId }) }); }
    catch { setLiked(was); setLikeCount(c => was ? c + 1 : c - 1); }
  };

  const isEditable = !msg.media?.url && !msg.sharedPost?.postId && !msg.sharedPost?.storyId && !msg.sending;

  if (msg.deletedForEveryone) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: fromMe ? "flex-end" : "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: fromMe ? "row-reverse" : "row" }}>
          {!fromMe && <Avatar user={msg.user} size={28} />}
          <div style={{ padding: "8px 14px", borderRadius: 18, background: "#f0f0f0", fontSize: 13, color: "#999", fontStyle: "italic", display: "flex", alignItems: "center", gap: 6 }}>
            <TrashIcon /> {fromMe ? "You deleted this message" : "This message was deleted"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showDeleteSheet && (
        <DeleteMessageSheet
          canDeleteForEveryone={fromMe && !isTemp}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
          onClose={() => setShowDeleteSheet(false)}
        />
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .upload-spinner {
          width: 26px; height: 26px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.4);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }
        .gmsg-wrap { display:flex; flex-direction:column; margin-bottom:14px; }
        .gmsg-actions { display:flex; gap:5px; margin-top:6px; flex-wrap:wrap; }
        .gmsg-wrap:hover .gmsg-actions { opacity:1; }
        .gmsg-action-btn { width:26px; height:26px; border-radius:50%; border:none; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.10); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#555; flex-shrink:0; }
        .gmsg-action-btn:hover { background:#f0f0f0; }
        .gmsg-action-btn.liked { color:#e53935; background:#fff0f0; }
        .gmsg-action-btn.del { color:#e53935; }
        .gmsg-like-badge { position:absolute; bottom:-14px; background:#fff; border-radius:20px; padding:1px 7px; font-size:11px; box-shadow:0 1px 5px rgba(0,0,0,0.13); white-space:nowrap; }
        .gmsg-bubble.failed { border: 1.5px solid #e53935; }
      `}</style>

      <div className="gmsg-wrap" style={{ alignItems: fromMe ? "flex-end" : "flex-start" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: fromMe ? "row-reverse" : "row", maxWidth: "78%" }}>
          {!fromMe && <Avatar user={msg.user} size={28} />}
          <div>
            {!fromMe && <p style={{ margin: "0 0 2px 4px", fontSize: 11.5, fontWeight: 700, color: GOLDEN }}>{msg.user?.username}</p>}

            {editing ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={editText} onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditing(false); }}
                  style={{ ...s.chatInput, padding: "7px 12px", fontSize: 13, minWidth: 160, flex: 1 }} autoFocus />
                <button onClick={handleEdit} style={s.sendCircleBtn}><SendIcon /></button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div className={`gmsg-bubble ${msg.failed ? "failed" : ""}`} style={{
                  padding: "10px 14px", borderRadius: 18, fontSize: 14, lineHeight: 1.5, wordBreak: "break-word",
                  background: fromMe ? "rgba(234,182,118,0.92)" : "#fff", color: fromMe ? "#fff" : "#111",
                  borderBottomRightRadius: fromMe ? 4 : 18, borderBottomLeftRadius: fromMe ? 18 : 4,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)", opacity: msg.sending ? 0.75 : 1,
                }}>
                  {msg.replyTo && (
                    <div style={{ borderLeft: `3px solid ${fromMe ? "rgba(255,255,255,0.6)" : GOLDEN}`, borderRadius: 6, padding: "4px 8px", marginBottom: 6, background: fromMe ? "rgba(0,0,0,0.1)" : "#fff8ee" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: fromMe ? "rgba(255,255,255,0.9)" : GOLDEN }}>{msg.replyTo?.user?.username}</p>
                      <p style={{ fontSize: 12, margin: "1px 0 0", opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{msg.replyTo?.text}</p>
                    </div>
                  )}
                  {msg.isForwarded && (
                    <p style={{ fontSize: 10, opacity: 0.6, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 3 }}>
                      <ForwardIcon /> Forwarded
                    </p>
                  )}
                  {(msg.sharedPost?.postId || msg.sharedPost?.storyId) && (
                    <>
                      <p style={shareCaptionStyle(fromMe)}>
                        {getShareCaption(msg, fromMe, null)}
                      </p>
                      <SharedPostBubble sharedPost={msg.sharedPost} fromMe={fromMe} />
                    </>
                  )}

                  {msg.media?.url && (
                    <div style={{ position: "relative" }}>
                      <MediaPreview media={msg.media} fromMe={fromMe} />
                      {msg.sending && (
                        <div style={{
                          position: "absolute", inset: 0, bottom: 6, borderRadius: 12,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "rgba(0,0,0,0.25)"
                        }}>
                          <div className="upload-spinner" />
                        </div>
                      )}
                    </div>
                  )}
                  {!msg.media?.url && msg.mediaExpired && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "10px 12px", borderRadius: 12, background: fromMe ? "rgba(255,255,255,0.15)" : "#f0f2f5", fontSize: 12, fontStyle: "italic", color: fromMe ? "rgba(255,255,255,0.8)" : "#888" }}>
                      ⏱️ Media expired after 3 days
                    </div>
                  )}
                  {msg.text && !msg.sharedPost?.postId && !msg.sharedPost?.storyId && (
                    <span>{msg.text}</span>
                  )}
                  {msg.isEdited && <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>· edited</span>}
                </div>
                {likeCount > 0 && <div className="gmsg-like-badge" style={{ [fromMe ? "left" : "right"]: 8 }}>❤️ {likeCount}</div>}
              </div>
            )}

            {!editing && !msg.sending && (
              <div className="gmsg-actions" style={{ justifyContent: fromMe ? "flex-end" : "flex-start" }}>
                <button className={`gmsg-action-btn ${liked ? "liked" : ""}`} onClick={handleLike} title="Like"><HeartIcon filled={liked} /></button>
                <button className="gmsg-action-btn" onClick={() => onReply(msg)} title="Reply"><ReplyIcon /></button>
                <button className="gmsg-action-btn" onClick={() => onForward(msg)} title="Forward"><ForwardIcon /></button>
                {fromMe && isEditable && (
                  <button className="gmsg-action-btn" onClick={() => { setEditing(true); setEditText(msg.text || ""); }} title="Edit"><EditIcon /></button>
                )}
                <button className="gmsg-action-btn del" onClick={() => setShowDeleteSheet(true)} title="Delete"><TrashIcon /></button>
              </div>
            )}
          </div>
        </div>
        <span style={{ fontSize: 10, color: msg.failed ? "#e53935" : "#aaa", fontWeight: msg.failed ? 600 : 400, marginTop: likeCount > 0 ? 18 : 3, marginRight: fromMe ? 4 : 0, marginLeft: fromMe ? 0 : 36 }}>
          {msg.sending ? "Sending…" : msg.failed ? "Failed to send" : fmt(msg.createdAt)}
        </span>
      </div>
    </>
  );
}

/* ─── Add Member sheet — any accepted member can search + invite ──────── */
function AddMemberSheet({ chatId, existingMemberIds, onClose, onAdded }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(new Map());
  const [adding, setAdding] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`${API}/messages/search-users?q=${encodeURIComponent(search)}`);
        const users = (data.users || data.following || []).filter(u => !existingMemberIds.includes(u._id));
        setResults(users);
      } catch (err) { console.error(err); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [search, existingMemberIds]);

  const toggle = (user) => {
    setSelected(prev => {
      const next = new Map(prev);
      next.has(user._id) ? next.delete(user._id) : next.set(user._id, user);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0 || adding) return;
    setAdding(true);
    try {
      await apiFetch(`${API}/groups/${chatId}/add-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: Array.from(selected.keys()) }),
      });
      onAdded();
      onClose();
    } catch (err) {
      console.error("Add members failed", err);
      alert("Couldn't add members. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.infoSheet} onClick={e => e.stopPropagation()}>
        <div style={s.infoHeader}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111" }}>Add members</p>
          <button style={s.iconBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        {selected.size > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 16px 0" }}>
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
          <input style={s.searchInput} placeholder="Search people to add…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0 16px" }}>
          {searching && <p style={{ textAlign: "center", color: "#bbb", padding: "24px 0" }}>Searching…</p>}
          {!searching && results.length === 0 && <p style={{ textAlign: "center", color: "#bbb", padding: "24px 0" }}>{search ? "No users found." : "Start typing to find people."}</p>}
          {!searching && results.map((u) => (
            <div key={u._id} style={s.memberRow} onClick={() => toggle(u)}>
              <Avatar user={u} size={40} />
              <p style={{ flex: 1, margin: "0 0 0 12px", fontSize: 14, fontWeight: 600, color: "#111" }}>{u.username}</p>
              <div style={{ ...s.checkbox, ...(selected.has(u._id) ? s.checkboxChecked : {}) }}>
                {selected.has(u._id) && "✓"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 16px 20px" }}>
          <button style={{ ...s.smallBtn, width: "100%", padding: "12px 0", opacity: selected.size > 0 && !adding ? 1 : 0.5 }} disabled={selected.size === 0 || adding} onClick={handleAdd}>
            {adding ? "Adding…" : `Add ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Group info / member management sheet ──────────────────────────────
   Any accepted member can Add members and Remove other members.
   Usernames navigate to the member's profile. */
function GroupInfoSheet({ group, currentUser, onClose, onExit, onRemoveMember, onRename, onAddMember }) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(group.name);
  const navigate = useNavigate();
  const myEntry = group.members.find(m => (m.user?._id || m.user) === currentUser._id);
  const isAdmin = myEntry?.role === "admin";
  const accepted = group.members.filter(m => m.status === "accepted");

  const goToProfile = (userId) => {
    if (userId === currentUser._id) { navigate("/profile"); return; }
    navigate(`/profile/${userId}`);
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.infoSheet} onClick={e => e.stopPropagation()}>
        <div style={s.infoHeader}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111" }}>Group Info</p>
          <button style={s.iconBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 16px" }}>
          <GroupAvatarStack members={accepted} size={72} />
          {renaming ? (
            <div style={{ display: "flex", gap: 6, marginTop: 14, width: "100%" }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} style={s.renameInput} autoFocus />
              <button style={s.smallBtn} onClick={() => { onRename(newName); setRenaming(false); }}>Save</button>
            </div>
          ) : (
            <p style={{ fontSize: 17, fontWeight: 700, margin: "14px 0 0", color: "#111" }}>
              {group.name}{isAdmin && <button style={s.linkBtn} onClick={() => setRenaming(true)}>Edit</button>}
            </p>
          )}
          <p style={{ fontSize: 12, color: "#999", margin: "4px 0 0" }}>{accepted.length} members</p>

          <button style={s.addMemberBtn} onClick={onAddMember}>
            <UserPlusIcon /> Add members
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px" }}>
          {accepted.map((m) => {
            const memberId = m.user._id;
            return (
              <div key={memberId} style={s.memberRow}>
                <div onClick={() => goToProfile(memberId)} style={{ cursor: "pointer" }}>
                  <Avatar user={m.user} size={40} />
                </div>
                <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                  <p
                    onClick={() => goToProfile(memberId)}
                    style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", width: "fit-content" }}
                  >
                    <span style={{ textDecoration: "underline", textDecorationColor: "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.textDecorationColor = "#111"}
                          onMouseLeave={e => e.currentTarget.style.textDecorationColor = "transparent"}>
                      {m.user.username}
                    </span>
                    {m.role === "admin" && <CrownIcon />}
                    {memberId === currentUser._id && <span style={{ fontSize: 11, color: "#999" }}>(you)</span>}
                  </p>
                </div>
                {memberId !== currentUser._id && (
                  <button style={s.removeBtn} onClick={() => onRemoveMember(memberId)}>Remove</button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "10px 16px 20px" }}>
          <button style={s.exitBtn} onClick={onExit}>🚪 Exit Group</button>
        </div>
      </div>
    </div>
  );
}

export default function GroupChatWindow({ group: initialGroup, currentUser, onClose, onRequestHandled }) {
  const [group, setGroup] = useState(initialGroup);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const menuRef = useRef(null);
  const attachRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const chatId = group.chatId;
  const accepted = group.members?.filter(m => m.status === "accepted") || [];
  const existingMemberIds = (group.members || []).filter(m => m.status !== "declined").map(m => (m.user?._id || m.user));

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
      if (attachRef.current && !attachRef.current.contains(e.target)) setShowAttach(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`${API}/groups/${chatId}`),
      apiFetch(`${API}/groups/${chatId}/messages`),
    ]).then(([groupData, msgs]) => {
      if (groupData.success) setGroup(groupData.group);
      setMessages(Array.isArray(msgs) ? msgs : []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [chatId]);

  useEffect(() => {
    const onReceive = ({ chatId: cId, message }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.some(m => m._id === message._id) ? prev : [...prev, message]);
    };
    const onJoined = ({ chatId: cId, message }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.some(m => m._id === message._id) ? prev : [...prev, message]);
      apiFetch(`${API}/groups/${chatId}`).then(d => d.success && setGroup(d.group)).catch(() => {});
    };
    const onLeft = ({ chatId: cId, message }) => {
      if (cId !== chatId) return;
      if (message) setMessages(prev => prev.some(m => m._id === message._id) ? prev : [...prev, message]);
      apiFetch(`${API}/groups/${chatId}`).then(d => d.success && setGroup(d.group)).catch(() => {});
    };
    const onRenamed = ({ chatId: cId, name, message }) => {
      if (cId !== chatId) return;
      setGroup(prev => ({ ...prev, name }));
      if (message) setMessages(prev => prev.some(m => m._id === message._id) ? prev : [...prev, message]);
    };
    const onRemoved = ({ chatId: cId, groupName }) => {
      if (cId !== chatId) return;
      alert(`You were removed from "${groupName}"`);
      onClose();
    };
    const onEdited = ({ chatId: cId, messageId, text }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, text, isEdited: true } : m));
    };
    const onDeletedForEveryone = ({ chatId: cId, messageId }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, deletedForEveryone: true, text: "", media: undefined, sharedPost: undefined } : m));
    };
    const onLiked = ({ chatId: cId, messageId, likes }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, likes } : m));
    };
    const onMediaExpired = ({ chatId: cId, messageId }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, media: undefined, mediaExpired: true } : m));
    };
    const onPurged = ({ chatId: cId, messageId }) => {
      if (cId !== chatId) return;
      setMessages(prev => prev.filter(m => m._id !== messageId));
    };

    socket.on("receiveGroupMessage", onReceive);
    socket.on("groupMemberJoined", onJoined);
    socket.on("groupMemberLeft", onLeft);
    socket.on("groupRenamed", onRenamed);
    socket.on("removedFromGroup", onRemoved);
    socket.on("groupMessageEdited", onEdited);
    socket.on("groupMessageDeletedForEveryone", onDeletedForEveryone);
    socket.on("groupMessageLiked", onLiked);
    socket.on("groupMediaExpired", onMediaExpired);
    socket.on("groupMessagePurged", onPurged);
    return () => {
      socket.off("receiveGroupMessage", onReceive);
      socket.off("groupMemberJoined", onJoined);
      socket.off("groupMemberLeft", onLeft);
      socket.off("groupRenamed", onRenamed);
      socket.off("removedFromGroup", onRemoved);
      socket.off("groupMessageEdited", onEdited);
      socket.off("groupMessageDeletedForEveryone", onDeletedForEveryone);
      socket.off("groupMessageLiked", onLiked);
      socket.off("groupMediaExpired", onMediaExpired);
      socket.off("groupMessagePurged", onPurged);
    };
  }, [chatId, onClose]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const currentReply = replyTo;
    setReplyTo(null);
    try {
      const data = await apiFetch(`${API}/groups/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, text, replyTo: currentReply?._id || null }),
      });
      setMessages(prev => prev.some(m => m._id === data._id) ? prev : [...prev, data]);
    } catch (err) { console.error("Send failed", err); }
  };

  // ── Shows a media bubble instantly (sending=true) using a local blob URL.
  const handleOptimisticAdd = (msg) => {
    setMessages(prev => [...prev, msg]);
  };

  // ── Swaps the temp bubble for the real, server-saved message.
  const handleMediaSent = (msg, tempId) => {
    setMessages(prev => prev.map(m => {
      if (m._id === tempId) {
        if (m.media?.url?.startsWith("blob:")) URL.revokeObjectURL(m.media.url);
        return msg;
      }
      return m;
    }));
  };

  // ── Leaves the bubble visible but flips it to "Failed to send".
  const handleUploadFailed = (tempId) => {
    setMessages(prev => prev.map(m => m._id === tempId ? { ...m, sending: false, failed: true } : m));
  };

  const handleDelete = (msgId) => setMessages(prev => prev.filter(m => m._id !== msgId));
  const handleEdit = (msgId, text) => setMessages(prev => prev.map(m => m._id === msgId ? { ...m, text, isEdited: true } : m));

  const handleExit = async () => {
    if (!window.confirm(`Leave "${group.name}"?`)) return;
    try {
      await apiFetch(`${API}/groups/${chatId}/exit`, { method: "POST" });
      setShowInfo(false);
      onRequestHandled?.(chatId);
      onClose();
    } catch (err) { console.error(err); }
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await apiFetch(`${API}/groups/${chatId}/remove-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const d = await apiFetch(`${API}/groups/${chatId}`);
      if (d.success) setGroup(d.group);
    } catch (err) {
      console.error(err);
      alert("Couldn't remove member.");
    }
  };

  const handleRename = async (name) => {
    try {
      await apiFetch(`${API}/groups/${chatId}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch (err) { console.error(err); }
  };

  const refreshGroup = () => {
    apiFetch(`${API}/groups/${chatId}`).then(d => d.success && setGroup(d.group)).catch(() => {});
  };

  return (
    <div style={s.chatOverlay}>
      {showInfo && (
        <GroupInfoSheet
          group={group}
          currentUser={currentUser}
          onClose={() => setShowInfo(false)}
          onExit={handleExit}
          onRemoveMember={handleRemoveMember}
          onRename={handleRename}
          onAddMember={() => { setShowInfo(false); setShowAddMember(true); }}
        />
      )}
      {showAddMember && (
        <AddMemberSheet
          chatId={chatId}
          existingMemberIds={existingMemberIds}
          onClose={() => setShowAddMember(false)}
          onAdded={refreshGroup}
        />
      )}
      {forwardMsg && (
        <ForwardModal msg={forwardMsg} currentUser={currentUser} onClose={() => setForwardMsg(null)} />
      )}

      <div style={s.topbar}>
        <button style={s.iconBtn} onClick={onClose}><BackArrow /></button>
        <div onClick={() => setShowInfo(true)} style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <GroupAvatarStack members={accepted} size={38} />
          <div style={{ marginLeft: 10 }}>
            <p style={s.name}>{group.name}</p>
            <p style={s.status}>{accepted.length} members</p>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }} ref={menuRef}>
          <button style={s.iconBtn} onClick={() => setShowMenu(v => !v)}><DotsIcon /></button>
          {showMenu && (
            <div style={s.dropMenu}>
              <button style={s.dropItem} onClick={() => { setShowInfo(true); setShowMenu(false); }}>ℹ️ Group Info</button>
              <button style={s.dropItem} onClick={() => { setShowAddMember(true); setShowMenu(false); }}><UserPlusIcon style={{ marginRight: 4 }} /> Add Members</button>
              <button style={{ ...s.dropItem, color: "#e53935" }} onClick={handleExit}>🚪 Exit Group</button>
            </div>
          )}
        </div>
      </div>

      <div style={s.messages}>
        {loading && [false, true, false, true, false].map((me, i) => <ChatBubbleSkeleton key={i} me={me} />)}
        {!loading && messages.map((msg, i) => {
          if (msg.isSystem) return <SystemMessage key={msg._id || i} msg={msg} />;
          const fromMe = (msg.user?._id || msg.user) === currentUser._id;
          return (
            <GroupMessageBubble
              key={msg._id || i}
              msg={{ ...msg, chatId }}
              fromMe={fromMe}
              currentUser={currentUser}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
              onForward={(m) => setForwardMsg(m)}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {replyTo && (
        <div style={s.replyBar}>
          <div style={s.replyBarAccent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={s.replyBarName}>Replying to {replyTo.user?.username}</p>
            <p style={s.replyBarText}>{replyTo.text}</p>
          </div>
          <button style={{ ...s.iconBtn, color: "#aaa" }} onClick={() => setReplyTo(null)}><CloseIcon /></button>
        </div>
      )}

      <div style={s.inputBar}>
        <div style={{ position: "relative" }} ref={attachRef}>
          <button style={s.attachCircleBtn} onClick={() => setShowAttach(v => !v)}><PlusIcon /></button>
          {showAttach && (
            <AttachMenu
              onClose={() => setShowAttach(false)}
              onMediaSent={handleMediaSent}
              onOptimisticAdd={handleOptimisticAdd}
              onUploadFailed={handleUploadFailed}
              chatId={chatId}
              currentUserId={currentUser._id}
            />
          )}
        </div>
        <input
          ref={inputRef}
          style={s.chatInput}
          type="text"
          placeholder={replyTo ? `Reply to ${replyTo.user?.username}…` : "Message…"}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
        />
        <button style={{ ...s.sendBtn, opacity: input.trim() ? 1 : 0.45 }} onClick={send} disabled={!input.trim()}>
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

const s = {
  chatOverlay: { position: "fixed", inset: 0, background: "#fff", display: "flex", flexDirection: "column", zIndex: 100, maxWidth: 480, margin: "0 auto" },
  topbar: { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid #efefef", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  name: { fontSize: 15, fontWeight: 700, margin: 0, color: "#111" },
  status: { fontSize: 12, color: "#999", margin: "1px 0 0" },
  iconBtn: { background: "none", border: "none", color: "#333", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
  dropMenu: { position: "absolute", top: "110%", right: 0, background: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.14)", zIndex: 50, minWidth: 190, overflow: "hidden" },
  dropItem: { display: "flex", alignItems: "center", gap: 6, width: "100%", background: "none", border: "none", padding: "12px 16px", fontSize: 14, color: "#111", cursor: "pointer", textAlign: "left" },
  messages: { flex: 1, overflowY: "auto", padding: "16px 14px 24px", display: "flex", flexDirection: "column", background: "#f0f2f5" },
  inputBar: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: "1px solid #efefef", background: "#fff" },
  chatInput: { flex: 1, background: "#f2f2f2", border: "none", borderRadius: 22, padding: "10px 16px", color: "#111", fontSize: 14, outline: "none" },
  attachCircleBtn: { width: 40, height: 40, borderRadius: "50%", border: "2px solid #e0e0e0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", flexShrink: 0 },
  sendBtn: { width: 40, height: 40, borderRadius: "50%", border: "none", background: "#3897f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 },
  sendCircleBtn: { width: 40, height: 40, borderRadius: "50%", border: "none", background: "#3897f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  infoSheet: { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  infoHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", borderBottom: "1px solid #f0f0f0" },
  memberRow: { display: "flex", alignItems: "center", padding: "9px 16px", cursor: "pointer" },
  removeBtn: { border: "none", background: "#fdeaea", color: "#e53935", fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer" },
  exitBtn: { width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid #f0c4c4", background: "#fff5f5", color: "#e53935", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  renameInput: { flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid #ececec", fontSize: 14, outline: "none" },
  smallBtn: { border: "none", background: GOLDEN, color: "#fff", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 10, cursor: "pointer" },
  sentBtn: { border: "none", background: "#e0e0e0", color: "#888", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 10, cursor: "default" },
  linkBtn: { border: "none", background: "none", color: "#3897f0", fontSize: 12, fontWeight: 600, cursor: "pointer", marginLeft: 6 },
  addMemberBtn: { display: "flex", alignItems: "center", gap: 6, marginTop: 14, border: "1px solid #ececec", background: "#fff", color: GOLDEN, fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 20, cursor: "pointer" },
  chip: { display: "flex", alignItems: "center", gap: 6, background: "#f2f2f2", borderRadius: 20, padding: "4px 10px 4px 4px", fontSize: 12, fontWeight: 600, color: "#333", cursor: "pointer" },
  searchWrap: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f0f0f0", color: "#bbb" },
  searchInput: { flex: 1, border: "none", outline: "none", fontSize: 14, color: "#111", background: "transparent" },
  checkbox: { width: 22, height: 22, borderRadius: "50%", border: "2px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0 },
  checkboxChecked: { background: GOLDEN, border: "none" },
  tabBtn: { flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: "#f2f2f2", color: "#888", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  tabBtnActive: { background: "#111", color: "#fff" },
  attachMenu: { position: "absolute", bottom: "110%", left: 0, background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.14)", padding: "10px 8px", display: "flex", gap: 4, zIndex: 50 },
  attachOption: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "6px 10px", borderRadius: 12 },
  attachOptionIcon: { width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" },
  attachOptionLabel: { fontSize: 11, color: "#555", fontWeight: 500 },
  replyBar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f7f7f7", borderTop: "1px solid #ececec" },
  replyBarAccent: { width: 3, minHeight: 36, borderRadius: 4, background: GOLDEN, flexShrink: 0 },
  replyBarName: { fontSize: 12, fontWeight: 700, color: GOLDEN, margin: 0 },
  replyBarText: { fontSize: 12, color: "#666", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  actionSheetOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  actionSheet: { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "8px 0 24px", display: "flex", flexDirection: "column" },
  actionSheetBtn: { display: "flex", alignItems: "center", gap: 14, background: "none", border: "none", padding: "14px 24px", fontSize: 15, color: "#111", cursor: "pointer", textAlign: "left", width: "100%" },
};