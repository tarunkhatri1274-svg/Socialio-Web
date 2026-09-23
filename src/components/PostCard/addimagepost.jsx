import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import getEditedImage from "./cropimage";
import { FiX, FiSearch, FiTag, FiUsers, FiEyeOff, FiDownloadCloud } from "react-icons/fi";

const API = import.meta.env.VITE_API_URL;

// ← Client-side size guard: this flow uploads to Cloudinary via the
// backend's dedicated /auth/upload-media route, but the ORIGINAL File
// objects are available here before that happens — this is the only
// real enforcement point for this upload path.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

// ── Small reusable toggle switch used for the new visibility settings ──────
function ToggleRow({ icon, label, hint, checked, onChange }) {
  return (
    <div style={styles.toggleRow}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {icon}
        <div>
          <div style={styles.toggleLabel}>{label}</div>
          {hint && <div style={styles.toggleHint}>{hint}</div>}
        </div>
      </div>
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ ...styles.switchTrack, background: checked ? "rgb(234,182,118)" : "#ddd" }}
      >
        <div style={{ ...styles.switchThumb, transform: checked ? "translateX(18px)" : "translateX(0)" }} />
      </div>
    </div>
  );
}

function CreateImagePost() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [captionText, setCaptionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // ── tags ──────────────────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  // ── collaborators ─────────────────────────────────────────────────────
  const [collabSearch, setCollabSearch] = useState("");
  const [collabResults, setCollabResults] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [showCollabSearch, setShowCollabSearch] = useState(false);
  const [searchingCollab, setSearchingCollab] = useState(false);
  const searchTimer = useRef(null);

  // ── NEW: visibility / interaction settings ──────────────────────────────
  // hideLikeCount / hideCommentCount: numbers stay hidden from everyone
  // except the post owner (the owner always sees real counts — same as
  // Instagram's "hide like count" behavior).
  // disableDownload: hides the download button for everyone except owner.
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [hideCommentCount, setHideCommentCount] = useState(false);
  const [disableDownload, setDisableDownload] = useState(false);
  // ← NEW: fully turns commenting OFF for everyone but you — different
  // from hideCommentCount, which just hides the number while still
  // letting people comment.
  const [disableComments, setDisableComments] = useState(false);

  const images  = state?.images  || (state?.image  ? [state.image]  : []);
  const files   = state?.files   || (state?.file   ? [state.file]   : []);
  const crops   = state?.crops   || (state?.crop   ? [state.crop]   : []);
  const filters = state?.filters || (state?.filter ? [state.filter] : []);

  if (!images.length) { navigate("/profile"); return null; }

  const token = () => localStorage.getItem("token");

  // ── tag handlers ───────────────────────────────────────────────────────
  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (!t || tags.includes(t)) return;
    setTags(prev => [...prev, t]);
    setTagInput("");
  };
  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t));

  // ── collab search ──────────────────────────────────────────────────────
  const handleCollabSearch = (val) => {
    setCollabSearch(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { setCollabResults([]); return; }
    setSearchingCollab(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/auth/search?q=${val}`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        const data = await res.json();
        const results = Array.isArray(data) ? data : data.users || [];
        const me = JSON.parse(localStorage.getItem("user") || "{}");
        setCollabResults(results.filter(u => u._id !== me._id && !collaborators.some(c => c._id === u._id)));
      } catch {}
      setSearchingCollab(false);
    }, 400);
  };

  const addCollab = (user) => {
    setCollaborators(prev => [...prev, user]);
    setCollabResults([]);
    setCollabSearch("");
  };
  const removeCollab = (id) => setCollaborators(prev => prev.filter(u => u._id !== id));

  // ── upload ─────────────────────────────────────────────────────────────
  const uploadToBackend = async (blob, index) => {
    const formData = new FormData();
    formData.append("file", blob, `image_${index}.jpg`);
    const res = await fetch(`${API}/auth/upload-media`, {
      method: "POST", credentials: "include",
      headers: { Authorization: `Bearer ${token()}` },
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url || data.secure_url;
  };

  const handlePost = async () => {
    try {
      const oversized = files.filter((f) => f && f.size > MAX_IMAGE_BYTES);
      if (oversized.length > 0) {
        alert(
          `${oversized.length === 1 ? "One image" : `${oversized.length} images`} exceed the 10MB limit. Please choose smaller files.`
        );
        return;
      }

      setLoading(true);
      const uploadedUrls = [];
      for (let i = 0; i < images.length; i++) {
        // ← Prefer the actual File object (files[i]) over the preview
        // blob: URL (images[i]) — getEditedImage() now mints its own
        // fresh, short-lived object URL from a File/Blob, so it no
        // longer depends on the earlier preview URL still being alive.
        // Falls back to images[i] for cases with no File available
        // (e.g. editing a post that only has an already-hosted URL).
        const blob = await getEditedImage(files[i] || images[i], crops[i], filters[i]);
        const url  = await uploadToBackend(blob, i);
        uploadedUrls.push(url);
      }

      const mediaPayload = uploadedUrls.map(url => ({ url, type: "image" }));
      const res = await fetch(`${API}/auth/add-media-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          media: mediaPayload,
          caption: captionText,
          postType: uploadedUrls.length > 1 ? "carousel" : "image",
          tags,
          collaborators: collaborators.map(c => c._id),
          // ← NEW visibility settings, read by the backend's AddMediaPost
          // (see media.controllers.js) and stored on the Post document.
          hideLikeCount,
          hideCommentCount,
          disableDownload,
          disableComments,
        }),
      });
      const data = await res.json();
      if (data.success) navigate("/profile", { replace: true });
    } catch (error) {
      console.log("POST ERROR:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>

        {/* IMAGE PREVIEW CAROUSEL */}
        <div style={{ position: "relative" }}>
          <img
            src={images[previewIndex]}
            alt="preview"
            style={{ ...styles.preview, filter: filters[previewIndex] || "" }}
          />
          {images.length > 1 && (
            <>
              <div style={styles.dotsWrap}>
                {images.map((_, i) => (
                  <div key={i} onClick={() => setPreviewIndex(i)} style={{
                    ...styles.dot,
                    width: i === previewIndex ? 18 : 6,
                    background: i === previewIndex ? "#333" : "rgba(0,0,0,0.25)",
                  }} />
                ))}
              </div>
              {previewIndex > 0 && (
                <button style={{ ...styles.arrow, left: 8 }} onClick={() => setPreviewIndex(i => i - 1)}>‹</button>
              )}
              {previewIndex < images.length - 1 && (
                <button style={{ ...styles.arrow, right: 8 }} onClick={() => setPreviewIndex(i => i + 1)}>›</button>
              )}
              <div style={styles.counter}>{previewIndex + 1} / {images.length}</div>
            </>
          )}
        </div>

        {/* CAPTION */}
        <textarea
          placeholder="Write a caption..."
          value={captionText}
          onChange={(e) => setCaptionText(e.target.value)}
          style={styles.textarea}
        />

        {/* ── TAGS ── */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <FiTag size={15} color="#f5a623" />
            <span style={styles.sectionTitle}>Tags</span>
          </div>
          <div style={styles.tagInputRow}>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTag()}
              placeholder="Add a tag..."
              style={styles.smallInput}
            />
            <button onClick={addTag} style={styles.addBtn}>Add</button>
          </div>
          {tags.length > 0 && (
            <div style={styles.tagWrap}>
              {tags.map(t => (
                <div key={t} style={styles.tag}>
                  #{t}
                  <FiX size={12} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeTag(t)} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── COLLABORATORS ── */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <FiUsers size={15} color="#f5a623" />
            <span style={styles.sectionTitle}>Collaborators</span>
          </div>
          <div style={styles.tagInputRow}>
            <div style={styles.searchWrap}>
              <FiSearch size={13} color="#aaa" />
              <input
                value={collabSearch}
                onChange={e => handleCollabSearch(e.target.value)}
                placeholder="Search people..."
                style={styles.smallInputNoBorder}
              />
            </div>
          </div>

          {collabResults.length > 0 && (
            <div style={styles.searchResults}>
              {collabResults.map(u => (
                <div key={u._id} style={styles.searchResultItem} onClick={() => addCollab(u)}>
                  <div style={styles.miniAvatar}>{u.username?.[0]?.toUpperCase()}</div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</span>
                </div>
              ))}
            </div>
          )}
          {searchingCollab && <p style={{ fontSize: 12, color: "#aaa", margin: "6px 0" }}>Searching...</p>}

          {collaborators.length > 0 && (
            <div style={styles.collabWrap}>
              {collaborators.map(u => (
                <div key={u._id} style={styles.collabChip}>
                  <div style={styles.miniAvatar}>{u.username?.[0]?.toUpperCase()}</div>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{u.username}</span>
                  <FiX size={12} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeCollab(u._id)} />
                </div>
              ))}
            </div>
          )}
          {collaborators.length > 0 && (
            <p style={{ fontSize: 11, color: "#aaa", margin: "6px 0 0" }}>
              They'll need to accept before this shows on their profile.
            </p>
          )}
        </div>

        {/* ── ADVANCED SETTINGS: visibility toggles ── */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <FiEyeOff size={15} color="#f5a623" />
            <span style={styles.sectionTitle}>Advanced settings</span>
          </div>

          <ToggleRow
            icon={<FiEyeOff size={15} color="#888" style={{ marginTop: 2 }} />}
            label="Hide like count"
            hint="Only you will see the total number of likes."
            checked={hideLikeCount}
            onChange={setHideLikeCount}
          />
          <ToggleRow
            icon={<FiEyeOff size={15} color="#888" style={{ marginTop: 2 }} />}
            label="Hide comment count"
            hint="Only you will see the total number of comments."
            checked={hideCommentCount}
            onChange={setHideCommentCount}
          />
          <ToggleRow
            icon={<FiDownloadCloud size={15} color="#888" style={{ marginTop: 2 }} />}
            label="Disable download"
            hint="Other people won't be able to download this post's media."
            checked={disableDownload}
            onChange={setDisableDownload}
          />
          <ToggleRow
            icon={<FiEyeOff size={15} color="#888" style={{ marginTop: 2 }} />}
            label="Disable comments"
            hint="Turns commenting off completely — not just the count. Only you can comment."
            checked={disableComments}
            onChange={setDisableComments}
          />
        </div>

        {/* SHARE BUTTON */}
        <button onClick={handlePost} style={styles.postBtn} disabled={loading}>
          {loading ? `Uploading ${previewIndex + 1}/${images.length}...` : "Share"}
        </button>
      </div>
    </div>
  );
}

export default CreateImagePost;

const styles = {
  wrapper:       { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "flex-start", background: "#f4f4f4", padding: "15px" },
  card:          { width: "100%", maxWidth: "380px", background: "#fff", borderRadius: "16px", padding: "15px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" },
  preview:       { width: "100%", height: "350px", objectFit: "cover", borderRadius: "12px", display: "block" },
  textarea:      { width: "100%", minHeight: "80px", marginTop: "12px", padding: "12px", borderRadius: "10px", border: "1px solid #ddd", resize: "none", fontSize: "14px", outline: "none", boxSizing: "border-box" },
  section:       { marginTop: 14, padding: "12px", background: "#fafafa", borderRadius: 12, border: "1px solid #f0f0f0" },
  sectionHeader: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionTitle:  { fontSize: 13, fontWeight: 700, color: "#333" },
  tagInputRow:   { display: "flex", gap: 8, alignItems: "center" },
  smallInput:    { flex: 1, border: "1px solid #e0e0e0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" },
  smallInputNoBorder: { flex: 1, border: "none", background: "transparent", fontSize: 13, outline: "none", padding: "4px 6px" },
  searchWrap:    { flex: 1, display: "flex", alignItems: "center", gap: 6, border: "1px solid #e0e0e0", borderRadius: 8, padding: "6px 10px" },
  addBtn:        { background: "rgb(234,182,118)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  tagWrap:       { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag:           { display: "flex", alignItems: "center", background: "#fff3e0", color: "#f5a623", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 },
  collabWrap:    { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  collabChip:    { display: "flex", alignItems: "center", gap: 6, background: "#e8f5e9", borderRadius: 20, padding: "4px 10px" },
  searchResults: { background: "#fff", borderRadius: 10, border: "1px solid #eee", marginTop: 6, overflow: "hidden" },
  searchResultItem: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", borderBottom: "0.5px solid #f5f5f5" },
  miniAvatar:    { width: 28, height: 28, borderRadius: "50%", background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  postBtn:       { marginTop: "15px", width: "100%", padding: "12px", background: "rgb(234,182,118)", color: "#000", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" },
  dotsWrap:      { position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, alignItems: "center" },
  dot:           { height: 6, borderRadius: 3, cursor: "pointer", transition: "all 0.2s" },
  arrow:         { position: "absolute", top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.7)", border: "none", fontSize: "24px", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 },
  counter:       { position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.45)", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 },
  // ── new toggle-switch styles ──
  toggleRow:     { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid #f0f0f0" },
  toggleLabel:   { fontSize: 13, fontWeight: 600, color: "#333" },
  toggleHint:    { fontSize: 11, color: "#999", marginTop: 2, maxWidth: 220 },
  switchTrack:   { width: 38, height: 22, borderRadius: 999, position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" },
  switchThumb:   { width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "transform 0.15s" },
};