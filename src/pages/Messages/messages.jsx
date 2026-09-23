import React, { useState, useRef, useEffect, useCallback } from "react";
import Navbar from "../../components/Navbar/navbar";
import socket from "../../sockets/sockets";
import { useParams, useNavigate } from "react-router-dom";
import { SharedPostBubble, ForwardModal,getShareCaption } from "./SharedPostBubble";
import { useCall } from "../../components/context/CallContext.jsx";
import NewGroupSheet from "./NewGroupSheet.jsx";
import GroupChatWindow from "./GroupChatWindow.jsx";
import { DmRowSkeleton, ChatBubbleSkeleton } from "../../components/Skeleton/Skeleton.jsx";
// ── Plays the OS's default notification sound via a silent Web Notification.
// Most OSes (Windows, macOS, Android, Chrome OS) play their native chime
// when a Notification is shown — no audio file needed.
const playNotificationSound = () => {
  console.log("[sound-debug] playNotificationSound() CALLED");
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const note = new Notification(" ", { silent: false, tag: "dm-ping" });
    setTimeout(() => note.close(), 1200);
  } catch (e) {
    console.log("Notification sound error:", e.message);
  }
};
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

// ── Local device cache of original file names for chat attachments ────────
const FILE_NAME_CACHE_KEY = "dm_file_name_cache";
const getFileNameCache = () => {
  try { return JSON.parse(localStorage.getItem(FILE_NAME_CACHE_KEY)) || {}; }
  catch { return {}; }
};
const cacheFileName = (url, name) => {
  if (!url || !name) return;
  try {
    const cache = getFileNameCache();
    cache[url] = name;
    localStorage.setItem(FILE_NAME_CACHE_KEY, JSON.stringify(cache));
  } catch {}
};
const getCachedFileName = (url) => {
  if (!url) return null;
  try { return getFileNameCache()[url] || null; } catch { return null; }
};

// ── Helper: is this a locally-created optimistic message that hasn't
// been saved on the server yet? (used to skip API calls when deleting
// a still-sending / failed bubble)
const isTempMsgId = (id) => typeof id === "string" && id.startsWith("temp-");

/* ─── Icons ─── */
const BackArrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
const PenIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
const CallIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
const VideoIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
const SendIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const SearchIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const EditIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const TrashIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const HeartIcon = ({ filled }) => <svg viewBox="0 0 24 24" fill={filled?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const ReplyIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>;
const ForwardIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>;
const DotsIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const PlusIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ImageIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const VideoFileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const AudioIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const StopIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const DownloadIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const ChevronDownIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polyline points="6 9 12 15 18 9"/></svg>;
const GroupIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

/* ─── Avatar ─── */
const COLORS = ["#e74c3c","#e67e22","#2ecc71","#3498db","#9b59b6","#1abc9c","#e91e63","#ff5722"];
const getColor = (str) => COLORS[(str?.charCodeAt(0)||0) % COLORS.length];
const getInitials = (name) => name?.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)||"?";

function Avatar({ user, size=42, extraStyle={} }) {
  const bg = getColor(user?.username||user?.name||"");
  const initials = getInitials(user?.username||user?.name||"");
  const pic = user?.profilePic || user?.avatar;
  return pic
    ? <img src={pic} alt={user?.username} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,...extraStyle}}/>
    : <div style={{width:size,height:size,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:size*0.38,flexShrink:0,...extraStyle}}>{initials}</div>;
}

function GroupAvatarStack({ members, size = 46 }) {
  const list = (members || []).map(m => m.user || m).filter(Boolean);
  const count = list.length;

  const tile = (user, style, key) => {
    const pic = user?.profilePic;
    return (
      <div
        key={key}
        style={{
          position: "absolute",
          overflow: "hidden",
          background: getColor(user?.username),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 700,
          boxSizing: "border-box",
          ...style,
        }}
      >
        {pic
          ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <span style={{ fontSize: (parseFloat(style.width) / 100) * size * 0.34 || size * 0.24 }}>{getInitials(user?.username)}</span>}
      </div>
    );
  };

  const wrap = { position: "relative", width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "#ececec", flexShrink: 0 };

  if (count === 0) {
    return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}><GroupIcon/></div>;
  }

  if (count === 1) {
    return <div style={wrap}>{tile(list[0], { top: 0, left: 0, width: "100%", height: "100%" }, 0)}</div>;
  }

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

function MsgStatus({ status }) {
  if (status==="sending") return <span style={{fontSize:10,color:"#bbb",fontStyle:"italic"}}>Sending…</span>;
  if (status==="failed") return <span style={{fontSize:10,color:"#e53935",fontWeight:600}}>Failed to send</span>;
  if (status==="seen") return <span style={{fontSize:10,color:GOLDEN,fontWeight:600}}>Seen</span>;
  if (status==="received") return <span style={{fontSize:10,color:"#aaa"}}>Received</span>;
  return <span style={{fontSize:10,color:"#bbb"}}>Sent</span>;
}

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateLabel = (dateStr) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
};

function DateDivider({ date }) {
  return (
    <div style={{ textAlign: "center", margin: "14px 0" }}>
      <span style={{ fontSize: 12, color: "#888", background: "#e9ebee", borderRadius: 20, padding: "4px 14px" }}>
        {formatDateLabel(date)}
      </span>
    </div>
  );
}

function MediaPreview({ media, fromMe }) {
  if (!media?.url) return null;

  if (media.mediaType === "image") return (
    <div style={{ marginBottom: 6, borderRadius: 12, overflow: "hidden" }}>
      <img src={media.url} alt="media"
        style={{ maxWidth: 220, maxHeight: 260, width: "100%", display: "block", objectFit: "cover", borderRadius: 12 }} />
    </div>
  );

  if (media.mediaType === "video") return (
    <div style={{ marginBottom: 6, borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <video src={media.url} controls
        style={{ maxWidth: 220, width: "100%", borderRadius: 12, display: "block", maxHeight: 200 }} />
    </div>
  );

  if (media.mediaType === "audio") return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
      background: fromMe ? "rgba(255,255,255,0.15)" : "#f0f2f5",
      borderRadius: 12, padding: "8px 12px", maxWidth: 220
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: fromMe ? "rgba(255,255,255,0.25)" : GOLDEN,
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff"
      }}>
        <AudioIcon />
      </div>
      <audio src={media.url} controls style={{ flex: 1, height: 32, minWidth: 0 }} />
    </div>
  );

  const fileName = media.fileName || getCachedFileName(media.url) || media.url?.split("/").pop()?.split("?")[0] || "Document";
  const ext = fileName.includes(".") ? fileName.split(".").pop().toUpperCase() : "FILE";
  const sizeLabel = formatFileSize(media.fileSize);
  const iconBg = fromMe ? "rgba(255,255,255,0.9)" : "#e5322d";
  const iconColor = fromMe ? "#e5322d" : "#fff";
  return (
    <a href={media.url} target="_blank" rel="noreferrer" download={fileName} style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
        background: fromMe ? "rgba(255,255,255,0.12)" : "#fff",
        borderRadius: 10, padding: "10px 10px", maxWidth: 240,
        border: fromMe ? "1px solid rgba(255,255,255,0.2)" : "1px solid #ececec"
      }}>
        <div style={{ position: "relative", width: 42, height: 48, flexShrink: 0 }}>
          <svg viewBox="0 0 42 48" width="42" height="48">
            <path d="M4 2h24l10 10v32a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={iconBg} />
            <path d="M28 2l10 10H30a2 2 0 0 1-2-2V2z" fill={fromMe ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.35)"} />
          </svg>
          <span style={{
            position: "absolute", left: "50%", bottom: 8, transform: "translateX(-50%)",
            fontSize: 8.5, fontWeight: 800, letterSpacing: "0.02em", color: iconColor,
            maxWidth: 34, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>{ext}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 600,
            color: fromMe ? "#fff" : "#111",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: 140
          }} title={fileName}>{fileName}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: fromMe ? "rgba(255,255,255,0.7)" : "#8b98a3" }}>
            {ext}{sizeLabel ? ` · ${sizeLabel}` : " Document"}
          </p>
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
          background: fromMe ? "rgba(255,255,255,0.22)" : "#f0f2f5",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: fromMe ? "#fff" : "#54656f"
        }}>
          <DownloadIcon />
        </div>
      </div>
    </a>
  );
}

/* ─── Attach Menu ───
   NOTE: now fires an "optimistic" bubble the instant a file is picked
   (before upload starts), then swaps it for the saved message once the
   upload + message POST resolve — or marks it failed if either fails. */
function AttachMenu({ onClose, onMediaSent, onOptimisticAdd, onUploadFailed, chatId, otherUserId, currentUserId }) {
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
    onClose(); // close the attach menu right away, like WhatsApp

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
      if (!res.ok) {
        throw new Error(uploadData?.message || "Upload failed");
      }
      const url = uploadData.url || uploadData.secure_url;
      const originalFileName = uploadData.fileName || file.name;
      cacheFileName(url, originalFileName);
      const msgData = await apiFetch(`${API}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          text: "",
          to: otherUserId,
          media: {
            url,
            mediaType,
            fileName: originalFileName,
            fileSize: uploadData.fileSize || file.size,
          },
        }),
      });
      // 2) swap the temp/optimistic bubble for the real, saved message
      onMediaSent(msgData, tempId);
    } catch (err) {
      console.error("Upload failed", err);
      // 3) leave the bubble in place but mark it failed
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

/* ─── Delete Message Sheet (for me / for everyone) ─── */
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

/* ─── Message Bubble ─── */
function MessageBubble({ msg, fromMe, otherUser, currentUser, onDelete, onEdit, onReply, onForward, isLast, otherUserOnline }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || "");
  const [liked, setLiked] = useState(msg.likes?.some(id => id?.toString() === currentUser._id?.toString()) || false);
  const [likeCount, setLikeCount] = useState(msg.likes?.length || 0);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const isTemp = isTempMsgId(msg._id);

  useEffect(() => {
    setLiked(msg.likes?.some(id => id?.toString() === currentUser._id?.toString()) || false);
    setLikeCount(msg.likes?.length || 0);
  }, [msg.likes, currentUser._id]);

  const handleDeleteForMe = async () => {
    setShowDeleteSheet(false);
    // Optimistic/failed messages never reached the server — just drop locally.
    if (isTemp) { onDelete(msg._id); return; }
    try {
      await fetch(`${API}/messages/${msg._id}`, {
        method: "DELETE", credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: otherUser?._id, forEveryone: false })
      });
      onDelete(msg._id);
    } catch (err) { console.error("Delete failed", err); }
  };

  const handleDeleteForEveryone = async () => {
    setShowDeleteSheet(false);
    if (isTemp) { onDelete(msg._id); return; }
    try {
      await fetch(`${API}/messages/${msg._id}`, {
        method: "DELETE", credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: otherUser?._id, forEveryone: true })
      });
      onDelete(msg._id);
    } catch (err) { console.error("Delete for everyone failed", err); }
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    try {
      await apiFetch(`${API}/messages/${msg._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText, to: otherUser?._id })
      });
      onEdit(msg._id, editText); setEditing(false);
    } catch (err) { console.error("Edit failed", err); }
  };

  const handleLike = async () => {
    const was = liked; setLiked(!was); setLikeCount(c => was ? c - 1 : c + 1);
    try { await apiFetch(`${API}/messages/like/${msg._id}`, { method: "PATCH" }); }
    catch { setLiked(was); setLikeCount(c => was ? c + 1 : c - 1); }
  };

const isEditable = !msg.media?.url && !msg.sharedPost?.postId && !msg.sharedPost?.storyId && !msg.sending;

  const fmt = d => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const msgStatus = fromMe
    ? (msg.sending ? "sending" : msg.failed ? "failed" : msg.seenBy?.length > 0 ? "seen" : otherUserOnline ? "received" : "sent")
    : null;

  if (msg.deletedForEveryone) {
    return (
      <div className="msg-wrap" style={{ alignItems: fromMe ? "flex-end" : "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexDirection: fromMe ? "row-reverse" : "row" }}>
          {!fromMe && <Avatar user={otherUser} size={30} />}
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
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .upload-spinner {
          width: 26px; height: 26px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.4);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }
        .msg-wrap { display:flex; flex-direction:column; margin-bottom:14px; }
        .msg-row { display:flex; align-items:flex-end; gap:8px; }
        .msg-row.me { flex-direction:row-reverse; }
        .msg-card { max-width:72%; }
        .msg-card.me { align-items:flex-end; display:flex; flex-direction:column; }
        .msg-card.other { align-items:flex-start; display:flex; flex-direction:column; }
        .bubble-box { 
          padding:10px 14px; border-radius:18px; font-size:14px; 
          line-height:1.5; word-break:break-word; position:relative;
          box-shadow:0 1px 4px rgba(0,0,0,0.08);
        }
        .bubble-box.me { background:rgba(234,182,118,0.92); color:#fff; border-bottom-right-radius:4px; }
        .bubble-box.other { background:#fff; color:#111; border-bottom-left-radius:4px; }
        .bubble-box.failed { border:1.5px solid #e53935; }
        .msg-actions { display:flex; gap:5px; margin-top:6px; flex-wrap:wrap; }
        .msg-wrap:hover .msg-actions { opacity:1; }
        .msg-actions.me { justify-content:flex-end; }
        .action-btn {
          width:26px; height:26px; border-radius:50%; border:none;
          background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.10);
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:#555; transition:background 0.15s; flex-shrink:0;
        }
        .action-btn:hover { background:#f0f0f0; }
        .action-btn.liked { color:#e53935; background:#fff0f0; }
        .action-btn.del { color:#e53935; }
        .reply-quote { border-left:3px solid; border-radius:6px; padding:4px 8px; margin-bottom:6px; font-size:12px; }
        .like-badge { position:absolute; bottom:-14px; background:#fff; border-radius:20px; padding:1px 7px; font-size:11px; box-shadow:0 1px 5px rgba(0,0,0,0.13); white-space:nowrap; }
      `}</style>

      <div className="msg-wrap" style={{ alignItems: fromMe ? "flex-end" : "flex-start" }}>
        <div className={`msg-row ${fromMe ? "me" : ""}`}>
          {!fromMe && <Avatar user={otherUser} size={30} extraStyle={{ marginBottom: 2, flexShrink: 0 }} />}

          <div className={`msg-card ${fromMe ? "me" : "other"}`} style={{ maxWidth: "72%" }}>
            {editing ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
                <input value={editText} onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleEdit(); if (e.key === "Escape") setEditing(false); }}
                  style={{ ...s.chatInput, padding: "7px 12px", fontSize: 13, minWidth: 160, flex: 1 }} autoFocus />
                <button onClick={handleEdit} style={s.sendCircleBtn}><SendIcon /></button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div className={`bubble-box ${fromMe ? "me" : "other"} ${msg.failed ? "failed" : ""}`} style={{ opacity: msg.sending ? 0.75 : 1 }}>
                  {msg.replyTo && (
                    <div className="reply-quote" style={{
                      borderLeftColor: fromMe ? "rgba(255,255,255,0.6)" : GOLDEN,
                      background: fromMe ? "rgba(0,0,0,0.1)" : "#fff8ee"
                    }}>
                      <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: fromMe ? "rgba(255,255,255,0.9)" : GOLDEN }}>
                        {msg.replyTo?.user?.username}
                      </p>
                      <p style={{ fontSize: 12, margin: "1px 0 0", opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
                        {msg.replyTo?.text}
                      </p>
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
      {getShareCaption(msg, fromMe, otherUser?.username)}
    </p>
    <SharedPostBubble sharedPost={msg.sharedPost} fromMe={fromMe} isMentionMessage={msg.isMentionMessage} />
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
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                      padding: "10px 12px", borderRadius: 12,
                      background: fromMe ? "rgba(255,255,255,0.15)" : "#f0f2f5",
                      fontSize: 12, fontStyle: "italic",
                      color: fromMe ? "rgba(255,255,255,0.8)" : "#888",
                    }}>
                      ⏱️ Media expired after 3 days
                    </div>
                  )}

                 {msg.text && !msg.sharedPost?.postId && !msg.sharedPost?.storyId && (
                    <span style={{ wordBreak: "break-word" }}>{msg.text}</span>
                  )}
                  {msg.isEdited && <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>· edited</span>}
                </div>

                {likeCount > 0 && (
                  <div className="like-badge" style={{ [fromMe ? "left" : "right"]: 8 }}>❤️ {likeCount}</div>
                )}
              </div>
            )}

            {!editing && !msg.sending && (
              <div className={`msg-actions ${fromMe ? "me" : ""}`}>
                <button className={`action-btn ${liked ? "liked" : ""}`} onClick={handleLike} title="Like"><HeartIcon filled={liked} /></button>
                <button className="action-btn" onClick={() => onReply(msg)} title="Reply"><ReplyIcon /></button>
                <button className="action-btn" onClick={() => onForward(msg)} title="Forward"><ForwardIcon /></button>
                {fromMe && isEditable && (
                  <button className="action-btn" onClick={() => { setEditing(true); setEditText(msg.text || ""); }} title="Edit"><EditIcon /></button>
                )}
                <button className="action-btn del" onClick={() => setShowDeleteSheet(true)} title="Delete"><TrashIcon /></button>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: likeCount > 0 ? 18 : 4 }}>
              <span style={{ fontSize: 10, color: "#aaa" }}>{fmt(msg.createdAt)}</span>
              {fromMe && (isLast || msg.sending || msg.failed) && <MsgStatus status={msgStatus} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SystemMessage({ msg }) {
  const fmt = d => new Date(d).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  return (
    <div style={{textAlign:"center",margin:"10px 0"}}>
      <span style={{fontSize:12,color:"#888",background:"#ececec",borderRadius:20,padding:"4px 14px",display:"inline-block"}}>{msg.text}</span>
      <p style={{fontSize:10,color:"#bbb",margin:"3px 0 0"}}>{fmt(msg.createdAt)}</p>
    </div>
  );
}

/* ─── Request Banner (shown inside chat window if this is a pending request) ── */
function RequestBanner({ otherUser, onAccept, onDecline }) {
  return (
    <div style={s.requestBanner}>
      <Avatar user={otherUser} size={56} />
      <p style={s.requestBannerName}>{otherUser?.username}</p>
      <p style={s.requestBannerText}>
        {otherUser?.username} isn't in your followers. They won't know you've seen this until you accept.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 14, width: "100%" }}>
        <button style={s.declineBtn} onClick={onDecline}>Delete</button>
        <button style={s.acceptReqBtn} onClick={onAccept}>Accept</button>
      </div>
    </div>
  );
}

/* ─── ChatWindow (1:1) ─── */
function ChatWindow({ conversation, currentUser, onClose, onlineUsers, onRequestHandled }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const { startCall } = useCall();
  const [muted, setMuted] = useState(false); // mutes chat notifications, unrelated to call audio
  const [showMenu, setShowMenu] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const [isPendingRequest, setIsPendingRequest] = useState(!!conversation.isRequest);
  const [pendingIsIncoming, setPendingIsIncoming] = useState(
    !!conversation.isRequest && currentUser._id !== conversation.initiator?._id?.toString()
  );

  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const sentMsgIds = useRef(new Set());
  const menuRef = useRef(null);
  const attachRef = useRef(null);
  const inputRef = useRef(null);

  const otherUser = conversation.members?.find(m=>m._id!==currentUser._id)||conversation.otherUser||conversation;
  const chatId = conversation._id || conversation.chatId;
  const otherUserOnline = onlineUsers.includes(otherUser?._id?.toString());

  const { userId } = useParams();

  useEffect(()=>{
    const handler=e=>{ if(menuRef.current&&!menuRef.current.contains(e.target)) setShowMenu(false); if(attachRef.current&&!attachRef.current.contains(e.target)) setShowAttach(false); };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  useEffect(()=>{
    setLoading(true);
    apiFetch(`${API}/messages/chat/${chatId}`).then(data=>{
      const list = Array.isArray(data) ? data : [];
      setMessages(list);
      const latestReal = [...list].reverse().find(m => !m.isSystem);
      if (latestReal && latestReal.requestStatus === "pending") {
        const senderId = (latestReal.user?._id || latestReal.user)?.toString();
        const iAmSender = senderId === currentUser._id?.toString();
        setIsPendingRequest(true);
        setPendingIsIncoming(!iAmSender);
      } else if (latestReal) {
        setIsPendingRequest(false);
        setPendingIsIncoming(false);
      }
    }).catch(console.error).finally(()=>setLoading(false));
  },[chatId,currentUser._id]);

  useEffect(()=>{
    const onReceive = data => {
      if (data.conversationId !== chatId) return;
      const incomingId = data.message?._id;
      const senderId = data.message?.user?._id || data.from;
      if (senderId?.toString() === currentUser._id?.toString()) return;
      if (sentMsgIds.current.has(incomingId)) return;
      if (typeof data.isRequest === "boolean") {
        setIsPendingRequest(data.isRequest);
        setPendingIsIncoming(data.isRequest);
      }
      setMessages(prev => {
        if (prev.some(m => m._id === incomingId)) return prev;
        return [...prev, data.message || { _id: Date.now(), chatId, user: { _id: data.from }, text: data.text, createdAt: data.createdAt }];
      });
    };
    const onEdited=({chatId:cId,messageId,text})=>{ if(cId!==chatId) return; setMessages(prev=>prev.map(m=>m._id===messageId?{...m,text,isEdited:true}:m)); };
    const onDeleted=({chatId:cId,messageId})=>{ if(cId!==chatId) return; setMessages(prev=>prev.filter(m=>m._id!==messageId)); };
    const onDeletedForEveryone=({chatId:cId,messageId})=>{ if(cId!==chatId) return; setMessages(prev=>prev.map(m=>m._id===messageId?{...m,deletedForEveryone:true,text:"",media:undefined,sharedPost:undefined}:m)); };
    const onMediaExpired=({chatId:cId,messageId})=>{ if(cId!==chatId) return; setMessages(prev=>prev.map(m=>m._id===messageId?{...m,media:undefined,mediaExpired:true}:m)); };
    const onPurged=({chatId:cId,messageId})=>{ if(cId!==chatId) return; setMessages(prev=>prev.filter(m=>m._id!==messageId)); };
    const onTyping=({from})=>{ if(from===otherUser?._id) setIsTyping(true); };
    const onStop=({from})=>{ if(from===otherUser?._id) setIsTyping(false); };
    const onLikes=({chatId:cId,messageId,likes})=>{ if(cId!==chatId) return; setMessages(prev=>prev.map(m=>m._id===messageId?{...m,likes}:m)); };
    const onChatCleared=({chatId:cId})=>{ if(cId!==chatId) return; setMessages([]); };
    const onCallSystemMessage = (e) => {
      const { chatId: cId, message } = e.detail || {};
      if (cId !== chatId || !message) return;
      setMessages(prev => {
        if (prev.some(m => m._id === message._id)) return prev;
        return [...prev, { ...message, isSystem: true }];
      });
    };
    socket.on("receiveMessage",onReceive); socket.on("newMessageRequest", onReceive);
    socket.on("messageEdited",onEdited); socket.on("messageDeleted",onDeleted);
    socket.on("messageDeletedForEveryone",onDeletedForEveryone);
    socket.on("mediaExpired",onMediaExpired);
    socket.on("messagePurged",onPurged);
    socket.on("typing",onTyping); socket.on("stopTyping",onStop); socket.on("messageLiked",onLikes);
    socket.on("chatCleared",onChatCleared);
    window.addEventListener("call-system-message", onCallSystemMessage);
    return ()=>{
      socket.off("receiveMessage",onReceive); socket.off("newMessageRequest", onReceive);
      socket.off("messageEdited",onEdited); socket.off("messageDeleted",onDeleted);
      socket.off("messageDeletedForEveryone",onDeletedForEveryone);
      socket.off("mediaExpired",onMediaExpired);
      socket.off("messagePurged",onPurged);
      socket.off("typing",onTyping); socket.off("stopTyping",onStop); socket.off("messageLiked",onLikes);
      socket.off("chatCleared",onChatCleared);
      window.removeEventListener("call-system-message", onCallSystemMessage);
    };
  },[chatId,otherUser,currentUser._id]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages.length,isTyping]);

  const handleTyping=e=>{ setInput(e.target.value); socket.emit("typing",{to:otherUser?._id,from:currentUser._id}); clearTimeout(typingTimer.current); typingTimer.current=setTimeout(()=>socket.emit("stopTyping",{to:otherUser?._id,from:currentUser._id}),1500); };

  const send = async () => {
    const text=input.trim(); if(!text) return;
    setInput(""); const currentReply=replyTo; setReplyTo(null);
    socket.emit("stopTyping",{to:otherUser?._id,from:currentUser._id});
    try {
      const data=await apiFetch(`${API}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chatId,text,to:otherUser?._id,replyTo:currentReply?._id||null})});
      sentMsgIds.current.add(data._id);
      setMessages(prev => { if (prev.some(m => m._id === data._id)) return prev; return [...prev, data]; });
      if (data.requestStatus) {
        setIsPendingRequest(data.requestStatus === "pending");
        setPendingIsIncoming(false);
      }
    } catch(err){console.error("Send failed",err);}
  };

  // ── Shows a media bubble instantly (sending=true) using a local blob URL.
  const handleOptimisticAdd = (msg) => {
    setMessages(prev => [...prev, msg]);
  };

  // ── Swaps the temp bubble for the real, server-saved message.
  const handleMediaSent = (msg, tempId) => {
    sentMsgIds.current.add(msg._id);
    setMessages(prev => prev.map(m => {
      if (m._id === tempId) {
        if (m.media?.url?.startsWith("blob:")) URL.revokeObjectURL(m.media.url);
        return msg;
      }
      return m;
    }));
    if (msg.requestStatus) {
      setIsPendingRequest(msg.requestStatus === "pending");
      setPendingIsIncoming(false);
    }
  };

  // ── Leaves the bubble visible but flips it to a "Failed to send" state.
  const handleUploadFailed = (tempId) => {
    setMessages(prev => prev.map(m => m._id === tempId ? { ...m, sending: false, failed: true } : m));
  };

  const handleDelete=msgId=>setMessages(prev=>prev.filter(m=>m._id!==msgId));
  const handleEdit=(msgId,text)=>setMessages(prev=>prev.map(m=>m._id===msgId?{...m,text,isEdited:true}:m));

  const handleAcceptRequest = async () => {
    try {
      await apiFetch(`${API}/messages/requests/${chatId}/accept`, { method: "POST" });
      setIsPendingRequest(false);
      setPendingIsIncoming(false);
      onRequestHandled?.(chatId, 'accepted');
    } catch (err) { console.error(err); }
  };

  const handleDeclineRequest = async () => {
    try {
      await apiFetch(`${API}/messages/requests/${chatId}/decline`, { method: "POST" });
      onRequestHandled?.(chatId, 'declined');
      onClose();
    } catch (err) { console.error(err); }
  };

  return (
    <div style={s.chatOverlay}>
      {forwardMsg&&<ForwardModal msg={forwardMsg} currentUser={currentUser} onClose={()=>setForwardMsg(null)}/>}
      <div style={s.chatTopbar}>
        <button style={s.iconBtn} onClick={onClose}><BackArrow/></button>
        <div style={{position:"relative"}}>
          <Avatar user={otherUser} size={38}/>
          {otherUserOnline&&<div style={{position:"absolute",bottom:1,right:1,width:11,height:11,borderRadius:"50%",background:GOLDEN,border:"2px solid #fff"}}/>}
        </div>
        <div style={{flex:1,marginLeft:10}}>
          <p style={s.topbarName}>{otherUser?.username||otherUser?.name}</p>
          <p style={s.topbarStatus}>{isTyping?<span style={{color:"#4caf50"}}>typing…</span>:otherUserOnline?<span style={{color:GOLDEN}}>Active now</span>:<span style={{color:"#bbb"}}>Offline</span>}</p>
        </div>
        {!isPendingRequest && (
          <div style={s.topbarActions}>
            <button style={s.iconBtn} onClick={()=>startCall(otherUser,"audio")}><CallIcon/></button>
            <button style={s.iconBtn} onClick={()=>startCall(otherUser,"video")}><VideoIcon/></button>
            <div style={{position:"relative"}} ref={menuRef}>
              <button style={s.iconBtn} onClick={()=>setShowMenu(v=>!v)}><DotsIcon/></button>
              {showMenu&&(
                <div style={s.dropMenu}>
                  <button style={s.dropItem} onClick={async()=>{
                    if(!window.confirm("Clear chat for yourself only?")) return;
                    try{
                      await fetch(`${API}/messages/chat/${chatId}/clear`,{
                        method:"DELETE",credentials:"include",
                        headers:{Authorization:`Bearer ${getToken()}`,"Content-Type":"application/json"},
                        body:JSON.stringify({to:otherUser._id, onlyForMe:true})
                      });
                      setMessages([]);
                    }catch(err){console.error(err);}
                    setShowMenu(false);
                  }}>🗑️ Clear Chat</button>
                  <button style={s.dropItem} onClick={()=>{setMuted(m=>!m);setShowMenu(false);}}>{muted?"🔔 Unmute":"🔕 Mute"}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={s.chatMessages}>
        {loading && [false, true, false, true, false].map((me, i) => <ChatBubbleSkeleton key={i} me={me} />)}
        {!loading&&messages.length===0&&!isPendingRequest&&(
          <div style={s.emptyChat}><Avatar user={otherUser} size={72}/><p style={s.emptyChatName}>{otherUser?.username}</p><p style={s.emptyChatHint}>No messages yet. Say hello 👋</p></div>
        )}
        {isPendingRequest && pendingIsIncoming && (
          <RequestBanner otherUser={otherUser} onAccept={handleAcceptRequest} onDecline={handleDeclineRequest} />
        )}
        {messages.map((msg,i)=>{
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showDivider = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

          if(msg.isSystem) return (
            <React.Fragment key={msg._id||i}>
              {showDivider && <DateDivider date={msg.createdAt} />}
              <SystemMessage msg={msg}/>
            </React.Fragment>
          );
          const fromMe=msg.user?._id===currentUser._id||msg.user===currentUser._id;
          const isLast=i===messages.length-1;
          return (
            <React.Fragment key={msg._id||i}>
              {showDivider && <DateDivider date={msg.createdAt} />}
              <MessageBubble msg={msg} fromMe={fromMe} otherUser={otherUser} currentUser={currentUser} onDelete={handleDelete} onEdit={handleEdit} onReply={m=>{setReplyTo(m);inputRef.current?.focus();}} onForward={m=>setForwardMsg(m)} isLast={isLast} otherUserOnline={otherUserOnline}/>
            </React.Fragment>
          );
        })}
        {isTyping&&(
          <div style={{display:"flex",alignItems:"flex-end",gap:8,marginTop:4}}>
            <Avatar user={otherUser} size={28}/>
            <div style={{...s.bubble,...s.bubbleOther,display:"flex",gap:4,padding:"12px 16px"}}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{...s.dot,animationDelay:`${d}s`}}/>)}</div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {replyTo&&(
        <div style={s.replyBar}>
          <div style={s.replyBarAccent}/>
          <div style={{flex:1,minWidth:0}}><p style={s.replyBarName}>Replying to {replyTo.user?.username}</p><p style={s.replyBarText}>{replyTo.text}</p></div>
          <button style={{...s.iconBtn,color:"#aaa"}} onClick={()=>setReplyTo(null)}><CloseIcon/></button>
        </div>
      )}

      <div style={s.chatInputBar}>
        <div style={{position:"relative"}} ref={attachRef}>
          <button style={s.attachCircleBtn} onClick={()=>setShowAttach(v=>!v)}><PlusIcon/></button>
          {showAttach&&(
            <AttachMenu
              onClose={()=>setShowAttach(false)}
              onMediaSent={handleMediaSent}
              onOptimisticAdd={handleOptimisticAdd}
              onUploadFailed={handleUploadFailed}
              chatId={chatId}
              otherUserId={otherUser?._id}
              currentUserId={currentUser._id}
            />
          )}
        </div>
        <input ref={inputRef} style={s.chatInput} type="text" placeholder={replyTo?`Reply to ${replyTo.user?.username}…`:isPendingRequest?"Send a message request…":"Message…"} value={input} onChange={handleTyping} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/>
        <button style={{...s.sendCircleBtn,opacity:input.trim()?1:0.45}} onClick={send} disabled={!input.trim()}><SendIcon/></button>
      </div>
    </div>
  );
}

/* ─── New Chat Search Sheet (1:1 — following only, unchanged) ─── */
function NewChatSheet({ onClose, onSelectUser }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
       const data = await apiFetch(`${API}/messages/search-users?q=${encodeURIComponent(search)}`);
        setResults(data.success ? data.users : []);
      } catch (err) { console.error(err); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [search]);

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.forwardModal} onClick={e=>e.stopPropagation()}>
        <div style={s.forwardModalHeader}>
          <p style={s.forwardModalTitle}>New Message</p>
          <button style={s.iconBtn} onClick={onClose}><CloseIcon/></button>
        </div>
        <div style={s.forwardSearchWrap}>
          <SearchIcon/>
          <input style={s.forwardSearchInput} placeholder="Search people you follow…" value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>
        </div>
        <div style={s.forwardUserList}>
          {searching && <p style={{textAlign:"center",color:"#bbb",fontSize:14,padding:"24px 0"}}>Searching…</p>}
          {!searching && search.trim() && results.length===0 && <p style={{textAlign:"center",color:"#bbb",fontSize:14,padding:"24px 0"}}>No one you follow matches "{search}"</p>}
          {!searching && results.map(user=>(
            <div key={user._id} style={{...s.forwardUserItem,cursor:"pointer"}} onClick={()=>onSelectUser(user)}>
              <Avatar user={user} size={44}/>
              <div style={{flex:1,minWidth:0,marginLeft:12}}>
                <p style={{margin:0,fontWeight:600,fontSize:14,color:"#111"}}>{user.username}</p>
                <p style={{margin:"2px 0 0",fontSize:12,color:"#999"}}>
                  {user.isPrivate ? "🔒 Private" : (user.bio || "")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Pencil dropdown: New Message / New Group ─── */
function ComposeMenu({ onNewMessage, onNewGroup, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div style={s.composeMenu} ref={ref}>
      <button style={s.composeItem} onClick={onNewMessage}><PenIcon /> New Message</button>
      <button style={s.composeItem} onClick={onNewGroup}><GroupIcon /> New Group</button>
    </div>
  );
}

function Messages() {
  const [currentUser] = useState(()=>{ try{return JSON.parse(localStorage.getItem("user"));}catch{return null;} });
  const [activeTab, setActiveTab] = useState("inbox"); // "inbox" | "requests"
  const [conversations, setConversations] = useState([]);   // 1:1 only
  const [groups, setGroups] = useState([]);                 // group memberships (accepted)
  const [requests, setRequests] = useState([]);              // DM requests
  const [groupRequests, setGroupRequests] = useState([]);    // group invites
  const [search, setSearch] = useState("");
  const [openConv, setOpenConv] = useState(()=>{ try{const s=sessionStorage.getItem("openConv");return s?JSON.parse(s):null;}catch{return null;} });
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showComposeMenu, setShowComposeMenu] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [groupRequestCount, setGroupRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const [notifSettings, setNotifSettings] = useState(null);

  useEffect(() => {
    if (!currentUser?._id) return;
    apiFetch(`${API}/auth/notifications/settings/`)
      .then(data => {
        if (data?.success) {
          setNotifSettings(data.settings);
          localStorage.setItem("notifSettings", JSON.stringify(data.settings));
        }
      })
      .catch(err => console.error("Failed to load notification settings", err));
  }, [currentUser?._id]);

  const loadInbox = useCallback(async () => {
    try {
      const data = await apiFetch(`${API}/messages/inbox`);
      if (data.success) setConversations(data.conversations);
    } catch (err) { console.error(err); }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const data = await apiFetch(`${API}/messages/requests`);
      if (data.success) { setRequests(data.requests); setRequestCount(data.requests.length); }
    } catch (err) { console.error(err); }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await apiFetch(`${API}/groups/mine`);
      if (data.success) setGroups(data.groups);
    } catch (err) { console.error(err); }
  }, []);

  const loadGroupRequests = useCallback(async () => {
    try {
      const data = await apiFetch(`${API}/groups/requests`);
      if (data.success) { setGroupRequests(data.requests); setGroupRequestCount(data.requests.length); }
    } catch (err) { console.error(err); }
  }, []);

  useEffect(()=>{
    if(!currentUser?._id) return;
    socket.emit("register",currentUser._id);
    socket.on("onlineUsers",setOnlineUsers);

    const onInboxCounts = ({ requestCount: rc }) => {
      setRequestCount(rc || 0);
      loadInbox();
    };
    const onGroupInboxCounts = ({ groupRequestCount: grc }) => {
      setGroupRequestCount(grc || 0);
    };
    const onNewMessage = (data) => {
      const currentlyOpenChatId = openConv?._id;
      if (data?.conversationId !== currentlyOpenChatId && notifSettings && notifSettings.message !== false) {
        playNotificationSound();
      }
      loadInbox();
    };
    const onNewRequest = (data) => {
      if (notifSettings && notifSettings.message !== false) {
        playNotificationSound();
      }
      loadRequests();
    };
    const onRequestAccepted = () => loadInbox();

    const onGroupInvite = () => {
      if (notifSettings && notifSettings.message !== false) playNotificationSound();
      loadGroupRequests();
    };
    const onGroupMessage = (data) => {
      const currentlyOpenChatId = openConv?._id;
      if (data?.chatId !== currentlyOpenChatId && notifSettings && notifSettings.message !== false) {
        playNotificationSound();
      }
      loadGroups();
    };
    const onGroupMemberJoined = () => loadGroups();
    const onGroupMemberLeft = () => loadGroups();
    const onRemovedFromGroup = () => loadGroups();

    socket.on("inboxCounts", onInboxCounts);
    socket.on("groupInboxCounts", onGroupInboxCounts);
    socket.on("receiveMessage", onNewMessage);
    socket.on("newMessageRequest", onNewRequest);
    socket.on("messageRequestAccepted", onRequestAccepted);
    socket.on("groupInviteReceived", onGroupInvite);
    socket.on("receiveGroupMessage", onGroupMessage);
    socket.on("groupMemberJoined", onGroupMemberJoined);
    socket.on("groupMemberLeft", onGroupMemberLeft);
    socket.on("removedFromGroup", onRemovedFromGroup);

    return ()=>{
      socket.off("onlineUsers");
      socket.off("inboxCounts", onInboxCounts);
      socket.off("groupInboxCounts", onGroupInboxCounts);
      socket.off("receiveMessage", onNewMessage);
      socket.off("newMessageRequest", onNewRequest);
      socket.off("messageRequestAccepted", onRequestAccepted);
      socket.off("groupInviteReceived", onGroupInvite);
      socket.off("receiveGroupMessage", onGroupMessage);
      socket.off("groupMemberJoined", onGroupMemberJoined);
      socket.off("groupMemberLeft", onGroupMemberLeft);
      socket.off("removedFromGroup", onRemovedFromGroup);
    };
  },[currentUser?._id,openConv,notifSettings,loadInbox,loadRequests,loadGroups,loadGroupRequests]);

  useEffect(() => {
    if (!currentUser?._id) return;
    setLoading(true);
    Promise.all([loadInbox(), loadRequests(), loadGroups(), loadGroupRequests()]).finally(() => setLoading(false));
  }, [currentUser?._id, loadInbox, loadRequests, loadGroups, loadGroupRequests]);

  const isOnline = userId => onlineUsers.includes(userId?.toString());

  const mergedInbox = [
    ...conversations.map(c => ({ ...c, isGroup: false })),
    ...groups.map(g => ({ ...g, isGroup: true })),
  ].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  const filteredConvos = mergedInbox.filter(c => {
    const name = c.isGroup ? c.name : c.otherUser?.username;
    return (name || "").toLowerCase().includes(search.toLowerCase());
  });

  const totalRequestBadge = requestCount + groupRequestCount;

  const openChat = async (user) => {
    try {
      const data = await apiFetch(`${API}/messages/chat/${currentUser._id}/${user._id}`);
      const conv = { _id: data.chatId, chatId: data.chatId, members: [currentUser, user], otherUser: user, isGroup: false };
      sessionStorage.setItem("openConv", JSON.stringify(conv));
      setOpenConv(conv);
      setShowNewChat(false);
    } catch (err) { console.error("Open chat failed", err); }
  };

  const openConversation = (convo) => {
    if (convo.isGroup) {
      const conv = { _id: convo.chatId, chatId: convo.chatId, isGroup: true, ...convo };
      sessionStorage.setItem("openConv", JSON.stringify(conv));
      setOpenConv(conv);
      return;
    }
    const otherUser = convo.otherUser;
    const conv = { _id: convo.chatId, chatId: convo.chatId, members: [currentUser, otherUser], otherUser, isRequest: convo.status === 'pending', initiator: convo.initiator, isGroup: false };
    sessionStorage.setItem("openConv", JSON.stringify(conv));
    setOpenConv(conv);
  };

  const openRequest = (req) => {
    const otherUser = req.initiator;
    const conv = { _id: req.chatId, chatId: req.chatId, members: [currentUser, otherUser], otherUser, isRequest: true, initiator: req.initiator, isGroup: false };
    sessionStorage.setItem("openConv", JSON.stringify(conv));
    setOpenConv(conv);
  };

  const handleRequestHandled = (chatId, status) => {
    setRequests(prev => prev.filter(r => r.chatId !== chatId));
    setRequestCount(prev => Math.max(0, prev - 1));
    if (status === 'accepted') loadInbox();
  };

  const handleGroupCreated = (group) => {
    setShowNewGroup(false);
    loadGroups();
    const conv = { _id: group.chatId, chatId: group.chatId, isGroup: true, name: group.name, members: group.members };
    sessionStorage.setItem("openConv", JSON.stringify(conv));
    setOpenConv(conv);
  };

  const handleAcceptGroupInvite = async (chatId) => {
    try {
      await apiFetch(`${API}/groups/${chatId}/accept`, { method: "POST" });
      setGroupRequests(prev => prev.filter(r => r.chatId !== chatId));
      setGroupRequestCount(prev => Math.max(0, prev - 1));
      loadGroups();
    } catch (err) { console.error(err); }
  };

  const handleDeclineGroupInvite = async (chatId) => {
    try {
      await apiFetch(`${API}/groups/${chatId}/decline`, { method: "POST" });
      setGroupRequests(prev => prev.filter(r => r.chatId !== chatId));
      setGroupRequestCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error(err); }
  };

  const handleGroupExited = () => {
    loadGroups();
  };

  const handleEnableNotifications = () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Notification.requestPermission().then((result) => {
      setNotifPermission(result);
    });
  };

  return (
    <div style={s.page}>
      {notifPermission === "default" && (
        <button
          onClick={handleEnableNotifications}
          style={{ margin: 10, padding: "8px 14px", background: GOLDEN, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          🔔 Enable notification sounds
        </button>
      )}

      {showNewChat && <NewChatSheet onClose={()=>setShowNewChat(false)} onSelectUser={openChat} />}
      {showNewGroup && <NewGroupSheet onClose={() => setShowNewGroup(false)} onCreated={handleGroupCreated} />}

      <div style={s.dmListWrap}>
        <div style={s.dmHeader}>
          <div><p style={s.dmTitle}>Messages</p><p style={s.dmUsername}>{currentUser?.username} ▾</p></div>
          <div style={{ position: "relative" }}>
            <button style={s.iconBtn} onClick={() => setShowComposeMenu(v => !v)}><PenIcon/></button>
            {showComposeMenu && (
              <ComposeMenu
                onNewMessage={() => { setShowComposeMenu(false); setShowNewChat(true); }}
                onNewGroup={() => { setShowComposeMenu(false); setShowNewGroup(true); }}
                onClose={() => setShowComposeMenu(false)}
              />
            )}
          </div>
        </div>

        <div style={s.searchWrap}>
          <div style={s.searchIcon}><SearchIcon/></div>
          <input style={s.searchInput} placeholder="Search messages…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {/* Tabs */}
        <div style={s.tabsRow}>
          <button style={{...s.tabBtn,...(activeTab==="inbox"?s.tabBtnActive:{})}} onClick={()=>setActiveTab("inbox")}>
            Primary
          </button>
          <button style={{...s.tabBtn,...(activeTab==="requests"?s.tabBtnActive:{})}} onClick={()=>setActiveTab("requests")}>
            Requests {totalRequestBadge > 0 && <span style={s.tabBadge}>{totalRequestBadge}</span>}
          </button>
        </div>

        {loading && Array.from({ length: 6 }).map((_, i) => <DmRowSkeleton key={i} />)}

        {!loading && activeTab === "inbox" && (
          <>
            {filteredConvos.length===0 && <p style={s.noConvText}>{search?"No results.":"No conversations yet."}</p>}
            {filteredConvos.map(convo=>{
              if (convo.isGroup) {
                const accepted = (convo.members || []).filter(m => m.status === "accepted");
                const unread = convo.unreadCounts?.[currentUser._id] || 0;
                return (
                  <div key={convo.chatId} style={s.dmItem} onClick={()=>openConversation(convo)} onMouseEnter={e=>e.currentTarget.style.background="#f5f5f5"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <GroupAvatarStack members={accepted} size={46} />
                    <div style={s.dmInfo}>
                      <p style={s.dmName}>{convo.name} <span style={{fontSize:10,color:"#bbb",fontWeight:500}}>· Group</span></p>
                      <p style={{...s.dmLast, color: unread > 0 ? "#111" : "#999", fontWeight: unread > 0 ? 700 : 400}}>
                        {convo.lastMessageText || "No messages yet"}
                      </p>
                    </div>
                    {unread>0&&<span style={s.unreadBadge}>{unread}</span>}
                  </div>
                );
              }
              const user = convo.otherUser;
              const unread = convo.unreadCounts?.[currentUser._id] || 0;
              return (
                <div key={convo.chatId} style={s.dmItem} onClick={()=>openConversation(convo)} onMouseEnter={e=>e.currentTarget.style.background="#f5f5f5"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={s.dmAvatarWrap}>
                    <Avatar user={user} size={46}/>
                    {isOnline(user?._id)&&<div style={s.onlineDot}/>}
                  </div>
                  <div style={s.dmInfo}>
                    <p style={s.dmName}>{user?.username}</p>
                    <p style={{...s.dmLast, color: unread > 0 ? "#111" : "#999", fontWeight: unread > 0 ? 700 : 400}}>
                      {convo.lastMessageText || "Tap to message"}
                    </p>
                  </div>
                  {unread>0 && (
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <span style={s.unreadBadge}>{unread}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {!loading && activeTab === "requests" && (
          <>
            {requests.length===0 && groupRequests.length===0 && <p style={s.noConvText}>No message requests.</p>}

            {groupRequests.length > 0 && <p style={s.sectionLabel}>Group Invites</p>}
            {groupRequests.map(req=>(
              <div key={req.chatId} style={s.dmItem}>
                <div style={{width:46,height:46,borderRadius:"50%",background:"#e5e5e5",display:"flex",alignItems:"center",justifyContent:"center",color:"#999",flexShrink:0}}><GroupIcon/></div>
                <div style={s.dmInfo}>
                  <p style={s.dmName}>{req.name}</p>
                  <p style={s.dmLast}>{req.invitedBy?.username ? `Invited by ${req.invitedBy.username}` : "Group invite"} · {req.memberCount} members</p>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button style={s.smallDeclineBtn} onClick={()=>handleDeclineGroupInvite(req.chatId)}>Decline</button>
                  <button style={s.smallAcceptBtn} onClick={()=>handleAcceptGroupInvite(req.chatId)}>Join</button>
                </div>
              </div>
            ))}

            {requests.length > 0 && <p style={s.sectionLabel}>Messages</p>}
            {requests.map(req=>{
              const user = req.initiator;
              return (
                <div key={req.chatId} style={s.dmItem} onClick={()=>openRequest(req)} onMouseEnter={e=>e.currentTarget.style.background="#f5f5f5"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={s.dmAvatarWrap}>
                    <Avatar user={user} size={46}/>
                  </div>
                  <div style={s.dmInfo}>
                    <p style={s.dmName}>{user?.username} {user?.isPrivate && "🔒"}</p>
                    <p style={s.dmLast}>{req.lastMessageText || "Sent you a message"}</p>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {!openConv&&<Navbar/>}
      {openConv&&openConv.isGroup&&(
        <GroupChatWindow
          group={openConv}
          currentUser={currentUser}
          onRequestHandled={handleGroupExited}
          onClose={()=>{sessionStorage.removeItem("openConv");setOpenConv(null);loadGroups();}}
        />
      )}
      {openConv&&!openConv.isGroup&&(
        <ChatWindow
          conversation={openConv}
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          onRequestHandled={handleRequestHandled}
          onClose={()=>{sessionStorage.removeItem("openConv");setOpenConv(null);loadInbox();loadRequests();}}
        />
      )}
    </div>
  );
}

export default Messages;

/* ─── Styles ─── */
const s = {
  unreadBadge:{background:GOLDEN,color:"#fff",borderRadius:"50%",minWidth:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,padding:"0 5px"},
  page:{position:"relative",height:"100dvh",background:"#fff",color:"#111",fontFamily:"'Segoe UI', sans-serif",overflow:"hidden",maxWidth:480,margin:"0 auto"},
  dmListWrap:{height:"100%",overflowY:"auto",paddingBottom:80},
  dmHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 16px 12px",borderBottom:"1px solid #efefef",background:"#fff"},
  dmTitle:{fontSize:22,fontWeight:700,margin:0,color:"#111"},
  dmUsername:{fontSize:13,color:"#888",margin:"2px 0 0",cursor:"pointer"},
  searchWrap:{position:"relative",margin:"12px 16px 4px"},
  searchIcon:{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#aaa",display:"flex"},
  searchInput:{width:"100%",padding:"10px 16px 10px 40px",background:"#f2f2f2",border:"none",borderRadius:12,fontSize:14,color:"#111",outline:"none",boxSizing:"border-box"},
  tabsRow:{display:"flex",gap:8,padding:"10px 16px 4px"},
  tabBtn:{flex:1,padding:"8px 0",borderRadius:10,border:"none",background:"#f2f2f2",color:"#888",fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6},
  tabBtnActive:{background:"#111",color:"#fff"},
  tabBadge:{background:"#e53935",color:"#fff",borderRadius:"50%",minWidth:18,height:18,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"},
  sectionLabel:{fontSize:12,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.08em",padding:"14px 16px 4px",margin:0},
  dmItem:{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",cursor:"pointer",borderRadius:12,margin:"0 6px",transition:"background 0.15s"},
  dmAvatarWrap:{position:"relative",flexShrink:0},
  onlineDot:{position:"absolute",bottom:1,right:1,width:13,height:13,borderRadius:"50%",background:GOLDEN,border:"2px solid #fff"},
  dmInfo:{flex:1,minWidth:0},
  dmName:{fontSize:15,fontWeight:600,margin:0,color:"#111",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  dmLast:{fontSize:13,color:GOLDEN,margin:"2px 0 0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  onlinePill:{fontSize:11,fontWeight:600,color:"white",background:GOLDEN,borderRadius:20,padding:"2px 8px"},
  noConvText:{textAlign:"center",color:"#bbb",marginTop:40,fontSize:14},
  iconBtn:{background:"none",border:"none",color:"#333",cursor:"pointer",padding:8,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"},
  composeMenu:{position:"absolute",top:"110%",right:0,background:"#fff",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.14)",zIndex:60,minWidth:180,overflow:"hidden"},
  composeItem:{display:"flex",alignItems:"center",gap:10,width:"100%",background:"none",border:"none",padding:"12px 16px",fontSize:14,fontWeight:600,color:"#111",cursor:"pointer",textAlign:"left"},
  smallAcceptBtn:{border:"none",background:GOLDEN,color:"#fff",fontWeight:700,fontSize:12,padding:"7px 12px",borderRadius:8,cursor:"pointer"},
  smallDeclineBtn:{border:"1px solid #ddd",background:"#fff",color:"#666",fontWeight:600,fontSize:12,padding:"7px 12px",borderRadius:8,cursor:"pointer"},
  chatOverlay:{position:"fixed",inset:0,background:"#fff",display:"flex",flexDirection:"column",zIndex:100,maxWidth:480,margin:"0 auto"},
  chatTopbar:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid #efefef",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"},
  topbarName:{fontSize:15,fontWeight:700,margin:0,color:"#111"},
  topbarStatus:{fontSize:12,color:"#999",margin:"1px 0 0"},
  topbarActions:{display:"flex",gap:2},
  chatMessages:{flex:1,overflowY:"auto",padding:"16px 14px 24px",display:"flex",flexDirection:"column",gap:0,background:"#f0f2f5"},
  loadingText:{textAlign:"center",color:"#bbb",margin:"auto",fontSize:14},
  emptyChat:{margin:"auto",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  emptyChatName:{fontSize:17,fontWeight:700,margin:0,color:"#111"},
  emptyChatHint:{fontSize:13,color:"#aaa",marginTop:4},
  bubble:{padding:"10px 15px",borderRadius:22,fontSize:14,lineHeight:1.5,wordBreak:"break-word",display:"inline-block",maxWidth:"100%",position:"relative"},
  bubbleMe:{background:"rgba(234,182,118,0.9)",color:"#fff",borderBottomRightRadius:5},
  bubbleOther:{background:"#fff",color:"#111",borderBottomLeftRadius:5,boxShadow:"0 1px 3px rgba(0,0,0,0.08)"},
  editedTag:{fontSize:10,opacity:0.6},
  dot:{display:"inline-block",width:7,height:7,borderRadius:"50%",background:"#aaa",animation:"bounce 1s infinite"},
  likeBadge:{position:"absolute",bottom:-16,background:"#fff",borderRadius:20,padding:"1px 7px",fontSize:11,boxShadow:"0 1px 5px rgba(0,0,0,0.13)",whiteSpace:"nowrap"},
  replyPreviewInBubble:{borderLeft:"3px solid #3897f0",borderRadius:6,padding:"4px 8px",marginBottom:6},
  replyBar:{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#f7f7f7",borderTop:"1px solid #ececec"},
  replyBarAccent:{width:3,minHeight:36,borderRadius:4,background:"#3897f0",flexShrink:0},
  replyBarName:{fontSize:12,fontWeight:700,color:"#3897f0",margin:0},
  replyBarText:{fontSize:12,color:"#666",margin:"2px 0 0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  chatInputBar:{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderTop:"1px solid #efefef",background:"#fff",boxShadow:"0 -1px 4px rgba(0,0,0,0.04)"},
  attachCircleBtn:{width:40,height:40,borderRadius:"50%",border:"2px solid #e0e0e0",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",flexShrink:0},
  chatInput:{flex:1,background:"#f2f2f2",border:"none",borderRadius:22,padding:"10px 16px",color:"#111",fontSize:14,outline:"none"},
  sendCircleBtn:{width:40,height:40,borderRadius:"50%",border:"none",background:"#3897f0",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0,transition:"opacity 0.15s"},
  attachMenu:{position:"absolute",bottom:"110%",left:0,background:"#fff",borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,0.14)",padding:"10px 8px",display:"flex",gap:4,zIndex:50},
  attachOption:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"6px 10px",borderRadius:12},
  attachOptionIcon:{width:44,height:44,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"},
  attachOptionLabel:{fontSize:11,color:"#555",fontWeight:500},
  dropMenu:{position:"absolute",top:"110%",right:0,background:"#fff",borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,0.14)",zIndex:50,minWidth:160,overflow:"hidden"},
  dropItem:{display:"block",width:"100%",background:"none",border:"none",padding:"12px 16px",fontSize:14,color:"#111",cursor:"pointer",textAlign:"left"},
  modalOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9000,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  forwardModal:{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"75vh",display:"flex",flexDirection:"column",overflow:"hidden"},
  forwardModalHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 8px",borderBottom:"1px solid #f0f0f0"},
  forwardModalTitle:{fontSize:16,fontWeight:700,margin:0,color:"#111"},
  forwardSearchWrap:{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:"1px solid #f0f0f0",color:"#bbb"},
  forwardSearchInput:{flex:1,border:"none",outline:"none",fontSize:14,color:"#111",background:"transparent"},
  forwardUserList:{flex:1,overflowY:"auto",padding:"6px 0 16px"},
  forwardUserItem:{display:"flex",alignItems:"center",padding:"10px 16px"},
  actionSheetOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  actionSheet:{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,padding:"8px 0 24px",display:"flex",flexDirection:"column"},
  actionSheetBtn:{display:"flex",alignItems:"center",gap:14,background:"none",border:"none",padding:"14px 24px",fontSize:15,color:"#111",cursor:"pointer",textAlign:"left",width:"100%"},
  requestBanner:{display:"flex",flexDirection:"column",alignItems:"center",padding:"32px 24px",margin:"auto"},
  requestBannerName:{fontSize:17,fontWeight:700,margin:"12px 0 0",color:"#111"},
  requestBannerText:{fontSize:13,color:"#888",textAlign:"center",margin:"8px 0 0",lineHeight:1.5,maxWidth:280},
  declineBtn:{flex:1,padding:"10px 0",borderRadius:10,border:"1px solid #ddd",background:"#fff",color:"#111",fontWeight:600,fontSize:14,cursor:"pointer"},
  acceptReqBtn:{flex:1,padding:"10px 0",borderRadius:10,border:"none",background:"#3897f0",color:"#fff",fontWeight:600,fontSize:14,cursor:"pointer"},
};