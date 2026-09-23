import React, { useMemo, useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiX, FiSend, FiType, FiAtSign, FiSearch } from "react-icons/fi";

const GOLDEN = "rgb(234,182,118)";
const API = import.meta.env.VITE_API_URL;
const getToken = () => localStorage.getItem("token");
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

// ── Mention search sheet — reuses the same "search users" endpoint the
// DM composer uses (excludes self + blocked, returns username + profilePic)
function MentionSearchSheet({ onClose, onSelect }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const runSearch = useCallback((query) => {
    setLoading(true);
    fetch(`${API}/messages/search-users?q=${encodeURIComponent(query)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setUsers(data.success ? data.users : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  // seed with default listing (following list) on open, before typing
  React.useEffect(() => {
    setLoading(true);
    fetch(`${API}/messages/search-users?includeSuggested=true`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setUsers(data.success ? (data.users || data.following || []) : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) return;
    timer.current = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(timer.current);
  }, [q, runSearch]);

  return (
    <div style={mentionStyles.overlay} onClick={onClose}>
      <div style={mentionStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={mentionStyles.handle} />
        <div style={mentionStyles.searchRow}>
          <FiSearch size={16} color="#999" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search people to mention…"
            style={mentionStyles.searchInput}
          />
          <button onClick={onClose} style={mentionStyles.closeBtn}><FiX size={18} /></button>
        </div>
        <div style={mentionStyles.list}>
          {loading && <p style={mentionStyles.empty}>Loading…</p>}
          {!loading && users.length === 0 && <p style={mentionStyles.empty}>No users found</p>}
          {!loading && users.map(u => (
            <div key={u._id} style={mentionStyles.row} onClick={() => onSelect(u)}>
              {u.profilePic
                ? <img src={u.profilePic} alt={u.username} style={mentionStyles.avatar} />
                : <div style={mentionStyles.avatarFallback}>{u.username?.[0]?.toUpperCase() || "?"}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={mentionStyles.username}>{u.username}</p>
                {u.bio && <p style={mentionStyles.bio}>{u.bio}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── A draggable text overlay chip on the story canvas
function TextOverlayEl({ item, containerRef, onChange, onRemove }) {
  const dragging = useRef(false);

  const onPointerDown = (e) => {
    dragging.current = true;
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onChange(item.id, { x: Math.min(96, Math.max(4, x)), y: Math.min(96, Math.max(4, y)) });
  };
  const onPointerUp = () => { dragging.current = false; };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "absolute",
        left: `${item.x}%`,
        top: `${item.y}%`,
        transform: "translate(-50%, -50%)",
        color: item.color,
        fontSize: item.fontSize,
        fontWeight: 700,
        textAlign: item.align,
        textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
        padding: 4,
        maxWidth: "80%",
        wordBreak: "break-word",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{item.text}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
        style={{ background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 18, height: 18, color: "#fff", fontSize: 11, cursor: "pointer", flexShrink: 0 }}
      >×</button>
    </div>
  );
}

// ── A draggable mention chip ("@username") on the story canvas
function MentionChipEl({ item, containerRef, onChange, onRemove }) {
  const dragging = useRef(false);
  const onPointerDown = (e) => { dragging.current = true; e.target.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onChange(item.id, { x: Math.min(94, Math.max(6, x)), y: Math.min(94, Math.max(6, y)) });
  };
  const onPointerUp = () => { dragging.current = false; };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "absolute",
        left: `${item.x}%`,
        top: `${item.y}%`,
        transform: "translate(-50%, -50%)",
        background: "rgba(255,255,255,0.92)",
        color: "#111",
        borderRadius: 20,
        padding: "6px 12px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
        display: "flex",
        alignItems: "center",
        gap: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      @{item.username}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
        style={{ background: "rgba(0,0,0,0.15)", border: "none", borderRadius: "50%", width: 16, height: 16, color: "#111", fontSize: 10, cursor: "pointer", flexShrink: 0 }}
      >×</button>
    </div>
  );
}

function StoryPreview() {
  const navigate = useNavigate();
  const { state } = useLocation();
  // ← CHANGED — CreateStory can now hand off several files at once from a
  // multi-select gallery pick (state.files); a single camera capture
  // still hands off just state.file. Normalize both into one array so
  // the rest of this component only ever deals with "slides".
  const initialFiles = useMemo(
    () => (state?.files?.length ? state.files : state?.file ? [state.file] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const filter = state?.filter || "none";
  const [loading, setLoading] = useState(false);
  // ← NEW — while uploading more than one slide, shows "Posting 2 of 3…"
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total } | null

  // ── Each selected file gets its own independent draft: its own text
  // overlays and mentions, edited one at a time via activeIndex, then
  // all posted as separate stories when the user shares.
  const [slides, setSlides] = useState(() =>
    initialFiles.map((f, i) => ({ key: `s-${i}-${Date.now()}`, file: f, textOverlays: [], mentions: [] }))
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const [showTextInput, setShowTextInput] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [showMentionSheet, setShowMentionSheet] = useState(false);

  const containerRef = useRef(null);

  // ── Build every preview URL once up front (not per active-slide swap)
  // so switching between slides is instant and we only ever revoke each
  // blob URL exactly once, on unmount.
  //
  // ← FIX — this used to create the URLs in a useMemo and only revoke
  // them in a useEffect cleanup. In React 18 dev/StrictMode, React
  // mounts every effect, fires its cleanup once immediately, then
  // mounts it again (to surface exactly this kind of bug) — WITHOUT
  // re-running the useMemo, since the component never actually
  // unmounts. That revoked every blob URL a split second after
  // creating it, with nothing left to recreate them, which is why the
  // previews/thumbnails 404'd with net::ERR_FILE_NOT_FOUND. Creating
  // the URLs inside the effect itself (via setState) fixes it: the
  // premature cleanup revokes the first (throwaway) batch, and the
  // effect's second real run creates a fresh batch that only gets
  // revoked on the actual unmount. useLayoutEffect (not useEffect) so
  // this happens before the browser paints — no blank-frame flash.
  const [previewUrls, setPreviewUrls] = useState(() => new Map());
  useLayoutEffect(() => {
    const map = new Map();
    slides.forEach(s => map.set(s.key, URL.createObjectURL(s.file)));
    setPreviewUrls(map);
    return () => { map.forEach(url => URL.revokeObjectURL(url)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (slides.length === 0) {
    return (
      <div style={emptyContainer}>
        <div style={emptyIconWrap}><FiX size={26} color="rgba(255,255,255,0.4)" /></div>
        <h2 style={emptyTitle}>No file selected</h2>
        <p style={emptySubtitle}>Go back and capture or choose something to share.</p>
        <button style={button} onClick={() => navigate("/create-story")}>Go Back</button>
      </div>
    );
  }

  const current = slides[activeIndex];
  const file = current.file;
  const previewUrl = previewUrls.get(current.key);
  const textOverlays = current.textOverlays;
  const mentions = current.mentions;
  const storyType = file.type.startsWith("video") ? "video" : "image";

  // ── Every mutation below only ever touches the ACTIVE slide's draft,
  // by index, leaving every other slide's overlays/mentions untouched.
  const patchActiveSlide = (patch) => {
    setSlides(prev => prev.map((s, i) => i === activeIndex ? { ...s, ...patch(s) } : s));
  };

  const addTextOverlay = () => {
    if (!draftText.trim()) { setShowTextInput(false); return; }
    patchActiveSlide(s => ({
      textOverlays: [
        ...s.textOverlays,
        { id: `t-${Date.now()}`, text: draftText.trim(), x: 50, y: 40 + s.textOverlays.length * 8, color: "#ffffff", fontSize: 26, align: "center" },
      ],
    }));
    setDraftText("");
    setShowTextInput(false);
  };

  const updateTextOverlay = (id, patch) =>
    patchActiveSlide(s => ({ textOverlays: s.textOverlays.map(t => t.id === id ? { ...t, ...patch } : t) }));
  const removeTextOverlay = (id) =>
    patchActiveSlide(s => ({ textOverlays: s.textOverlays.filter(t => t.id !== id) }));

  const addMention = (user) => {
    if (current.mentions.some(m => m.user === user._id)) { setShowMentionSheet(false); return; }
    patchActiveSlide(s => ({
      mentions: [...s.mentions, { id: `m-${Date.now()}`, user: user._id, username: user.username, x: 50, y: 60 + s.mentions.length * 10 }],
    }));
    setShowMentionSheet(false);
  };
  const updateMention = (id, patch) =>
    patchActiveSlide(s => ({ mentions: s.mentions.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const removeMention = (id) =>
    patchActiveSlide(s => ({ mentions: s.mentions.filter(m => m.id !== id) }));

  // ── X button: with more than one slide selected, drop just the
  // current one (Instagram-style) instead of discarding the whole
  // multi-select and leaving the screen. Only navigates away once
  // there's nothing left to post.
  const removeActiveSlide = () => {
    if (slides.length <= 1) { navigate(-1); return; }
    setSlides(prev => prev.filter((_, i) => i !== activeIndex));
    setActiveIndex(i => Math.min(i, slides.length - 2));
  };

  const handleUpload = async () => {
    try {
      setLoading(true);
      const token = getToken();
      let lastStory = null;

      // ← CHANGED — one request per slide, in order. The backend endpoint
      // only ever takes a single file per call, so multi-select posts
      // each selected image/video as its own story, one after another.
      for (let i = 0; i < slides.length; i++) {
        setUploadProgress(slides.length > 1 ? { done: i, total: slides.length } : null);
        const s = slides[i];
        const type = s.file.type.startsWith("video") ? "video" : "image";

        const formData = new FormData();
        formData.append("story", s.file);
        formData.append("storyType", type);
        formData.append("filter", filter);
        formData.append(
          "textOverlays",
          JSON.stringify(s.textOverlays.map(({ text, x, y, color, fontSize, align }) => ({ text, x, y, color, fontSize, align })))
        );
        formData.append("mentions", JSON.stringify(s.mentions.map(({ user, x, y }) => ({ user, x, y }))));

        const response = await fetch(`${API}/stories/add-story`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Upload failed (${i + 1} of ${slides.length})`);
        lastStory = data.story;
      }

      setUploadProgress(slides.length > 1 ? { done: slides.length, total: slides.length } : null);
      navigate("/home", { state: { newStory: lastStory } });
    } catch (error) {
      console.log(error);
      alert(error.message);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div style={container} ref={containerRef}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={previewContainer}>
        {storyType === "image" ? (
          <img key={current.key} src={previewUrl} alt="story preview" style={media} />
        ) : (
          <video key={current.key} src={previewUrl} controls autoPlay style={media} />
        )}

        {/* ── overlays live on top of the media, positioned by % ── */}
        {textOverlays.map(t => (
          <TextOverlayEl key={t.id} item={t} containerRef={containerRef} onChange={updateTextOverlay} onRemove={removeTextOverlay} />
        ))}
        {mentions.map(m => (
          <MentionChipEl key={m.id} item={m} containerRef={containerRef} onChange={updateMention} onRemove={removeMention} />
        ))}
      </div>

      <div style={topGradient} />
      <div style={bottomGradient} />

      <div style={topBar}>
        <button style={cancelBtn} onClick={removeActiveSlide}><FiX size={18} /></button>
        <span style={titleText}>
          {slides.length > 1 ? `Story Preview · ${activeIndex + 1}/${slides.length}` : "Story Preview"}
        </span>
        {/* ── NEW: text + mention tool buttons ── */}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={toolBtn} onClick={() => setShowTextInput(true)}><FiType size={17} /></button>
          <button style={toolBtn} onClick={() => setShowMentionSheet(true)}><FiAtSign size={17} /></button>
        </div>
      </div>

      {/* ── Inline text composer ── */}
      {showTextInput && (
        <div style={textComposerOverlay} onClick={() => setShowTextInput(false)}>
          <div style={textComposerBox} onClick={e => e.stopPropagation()}>
            <textarea
              autoFocus
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              placeholder="Type something…"
              maxLength={200}
              style={textComposerInput}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button style={{ ...button, background: "rgba(255,255,255,0.15)" }} onClick={() => { setShowTextInput(false); setDraftText(""); }}>Cancel</button>
              <button style={button} onClick={addTextOverlay}>Add</button>
            </div>
          </div>
        </div>
      )}

      {showMentionSheet && (
        <MentionSearchSheet onClose={() => setShowMentionSheet(false)} onSelect={addMention} />
      )}

      {/* ── NEW: thumbnail strip — only shown once more than one file was
          selected, so the single-file flow looks exactly as before. Tap
          a thumbnail to edit that slide's overlays/mentions before
          sharing; the small × drops it from the batch. */}
      {slides.length > 1 && (
        <div style={thumbStrip} className="no-scrollbar">
          {slides.map((s, i) => (
            <div
              key={s.key}
              style={{ ...thumb, ...(i === activeIndex ? thumbActive : {}) }}
              onClick={() => setActiveIndex(i)}
            >
              {s.file.type.startsWith("video") ? (
                <video src={previewUrls.get(s.key)} style={thumbMedia} muted />
              ) : (
                <img src={previewUrls.get(s.key)} alt="" style={thumbMedia} />
              )}
              <button
                style={thumbRemove}
                onClick={(e) => {
                  e.stopPropagation();
                  setSlides(prev => prev.filter((_, j) => j !== i));
                  setActiveIndex(prevIdx => Math.min(prevIdx, slides.length - 2 < 0 ? 0 : slides.length - 2));
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div style={bottomBar}>
        <span style={typeBadge}>
          {uploadProgress ? `Posting ${uploadProgress.done + 1} of ${uploadProgress.total}…` : storyType === "image" ? "Photo" : "Video"}
        </span>
        <button style={{ ...shareButton, opacity: loading ? 0.7 : 1 }} onClick={handleUpload} disabled={loading}>
          {loading ? <span style={spinner} /> : (
            <>
              <span>{slides.length > 1 ? `Share ${slides.length} to Story` : "Share to Story"}</span>
              <FiSend size={15} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default StoryPreview;

/* ================= STYLES ================= */
const container = { width: "100%", height: "100dvh", background: "#000", position: "relative", overflow: "hidden", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif" };
const topGradient = { position: "absolute", top: 0, left: 0, right: 0, height: 140, background: "linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)", zIndex: 2, pointerEvents: "none" };
const bottomGradient = { position: "absolute", bottom: 0, left: 0, right: 0, height: 160, background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)", zIndex: 2, pointerEvents: "none" };
const topBar = { position: "absolute", top: 0, left: 0, right: 0, zIndex: 6, height: "70px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", color: "#fff" };
const cancelBtn = { width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const toolBtn = { width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const titleText = { fontSize: 15, fontWeight: 700, letterSpacing: 0.2 };
const bottomBar = { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px 30px" };

// ── NEW: multi-select thumbnail strip styles
const thumbStrip = { position: "absolute", bottom: 92, left: 0, right: 0, zIndex: 5, display: "flex", gap: 8, padding: "0 16px", overflowX: "auto" };
const thumb = { position: "relative", flexShrink: 0, width: 52, height: 52, borderRadius: 10, overflow: "hidden", border: "2px solid rgba(255,255,255,0.25)", cursor: "pointer" };
const thumbActive = { border: `2px solid ${GOLDEN}` };
const thumbMedia = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const thumbRemove = { position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", fontSize: 10, lineHeight: "16px", padding: 0, cursor: "pointer" };
const typeBadge = { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 20, backdropFilter: "blur(6px)" };
const shareButton = { display: "flex", alignItems: "center", gap: 8, background: GOLDEN, border: "none", color: "#fff", padding: "12px 22px", borderRadius: 24, cursor: "pointer", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 14px rgba(234,182,118,0.4)" };
const spinner = { display: "inline-block", width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)", borderTop: "2.5px solid #fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" };
const previewContainer = { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", position: "relative" };
const media = { width: "100%", height: "100%", objectFit: "contain" };
const emptyContainer = { width: "100%", height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "#000", padding: "0 40px", textAlign: "center" };
const emptyIconWrap = { width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 };
const emptyTitle = { color: "#fff", fontSize: 17, fontWeight: 700, margin: 0 };
const emptySubtitle = { color: "rgba(255,255,255,0.5)", fontSize: 13.5, margin: "0 0 6px" };
const button = { padding: "12px 26px", border: "none", borderRadius: 24, background: GOLDEN, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 14px rgba(234,182,118,0.4)" };

// ── NEW: text composer + mention sheet styles
const textComposerOverlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const textComposerBox = { width: "100%", maxWidth: 400, background: "rgba(20,20,20,0.95)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.1)" };
const textComposerInput = { width: "100%", minHeight: 90, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: 12, color: "#fff", fontSize: 15, outline: "none", resize: "none", boxSizing: "border-box" };

const mentionStyles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { background: "#fff", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: "12px 16px 24px", maxHeight: "65vh", display: "flex", flexDirection: "column" },
  handle: { width: 36, height: 4, background: "#ddd", borderRadius: 4, margin: "0 auto 12px" },
  searchRow: { display: "flex", alignItems: "center", gap: 8, background: "#f2f2f2", borderRadius: 12, padding: "10px 14px", marginBottom: 8 },
  searchInput: { flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#111" },
  closeBtn: { background: "none", border: "none", color: "#999", cursor: "pointer", display: "flex" },
  list: { overflowY: "auto", flex: 1 },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer", borderBottom: "1px solid #f5f5f5" },
  avatar: { width: 42, height: 42, borderRadius: "50%", objectFit: "cover" },
  avatarFallback: { width: 42, height: 42, borderRadius: "50%", background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  username: { margin: 0, fontSize: 14, fontWeight: 600, color: "#111" },
  bio: { margin: "2px 0 0", fontSize: 12, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  empty: { textAlign: "center", color: "#aaa", padding: "20px 0", fontSize: 14 },
};