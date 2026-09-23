import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiX, FiSearch, FiTag, FiUsers, FiEyeOff, FiDownloadCloud } from "react-icons/fi";

const API = import.meta.env.VITE_API_URL;

// ← Client-side size guard: this flow uploads through our own backend's
// /auth/upload-media route (which uploads to Cloudinary server-side), so
// this check is purely for UX — real enforcement happens server-side in
// uploadPostMedia (media.controllers.js).
const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // 20MB

const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

// ── Small reusable toggle switch — same component as CreateImagePost's,
// duplicated here since the two files don't currently share a components
// module. If you later add a shared `components/` folder, this (and its
// matching styles below) can be pulled out into one place.
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

function CreateVideoPost() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [captionText, setCaptionText] = useState("");
  const [loading, setLoading] = useState(false);

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

  // ── NEW: visibility / interaction settings — same four flags as
  // CreateImagePost, stored on the Post document by AddMediaPost (this
  // flow already posts through that same endpoint via `url`+postType,
  // see handlePost below, so no backend changes were needed for video).
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [hideCommentCount, setHideCommentCount] = useState(false);
  const [disableDownload, setDisableDownload] = useState(false);
  const [disableComments, setDisableComments] = useState(false);

  // if no video selected
  if (!state?.file) {
    return (
      <div style={styles.errorContainer}>
        <h3>No video selected</h3>

        <button
          style={styles.backBtn}
          onClick={() => navigate("/profile")}
        >
          Go Back
        </button>
      </div>
    );
  }

  const video = state.file;

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
        const res = await fetch(`${API}/auth/search?q=${val}`, { headers: authHeaders() });
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

  // upload video through our own backend (which uploads to Cloudinary
  // server-side), same pattern as the working CreateImagePost flow.
  const uploadToBackend = async () => {
    const formData = new FormData();
    formData.append("file", video);

    const tok = token();
    const response = await fetch(`${API}/auth/upload-media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}` },
      body: formData,
    });
    if (!response.ok) throw new Error("Upload failed");
    const data = await response.json();
    return data.url || data.secure_url;
  };

  // create post
  const handlePost = async () => {
    try {

      // ← Check the size BEFORE doing anything else — uploading a 19MB
      // file to Cloudinary just to have the backend reject it afterward
      // wastes the user's bandwidth and time for no reason.
      if (video.size > MAX_VIDEO_BYTES) {
        alert("Video must be under 20MB. Please choose a smaller file.");
        return;
      }

      setLoading(true);

      const tok = token();

      // upload video
      const videoUrl =
        await uploadToBackend();

      console.log(
        "VIDEO URL:",
        videoUrl
      );

      // save post
      const response = await fetch(
        `${API}/auth/add-media-post`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${tok}`,
          },

          body: JSON.stringify({
            url: videoUrl,

            postType: "video",

            caption: captionText,

            tags,

            collaborators: collaborators.map(c => c._id),

            // ← NEW visibility settings, read by AddMediaPost
            // (media.controllers.js) and stored on the Post document.
            hideLikeCount,
            hideCommentCount,
            disableDownload,
            disableComments,
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        "POST RESPONSE:",
        data
      );

      if (data.success) {
        navigate(
          "/profile",
          { replace: true }
        );
      }

    } catch (error) {

      console.log(
        "POST ERROR:",
        error
      );

    } finally {

      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>

        {/* VIDEO PREVIEW */}
        <video
          src={URL.createObjectURL(video)}
          controls
          style={styles.preview}
        />

        {/* CAPTION */}
        <textarea
          placeholder="Write a caption..."
          value={captionText}
          onChange={(e) =>
            setCaptionText(e.target.value)
          }
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

          {/* selected collaborators — these are INVITES, not immediate
              additions. The post shows on your own profile right away
              regardless; it only shows on THEIR profile once they
              accept the invite via the Activity page. */}
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
            hint="Other people won't be able to download this video."
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
        <button
          onClick={handlePost}
          style={styles.postBtn}
          disabled={loading}
        >
          {loading
            ? "Uploading..."
            : "Share"}
        </button>

      </div>
    </div>
  );
}
export default CreateVideoPost;

const styles = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    background: "#f4f4f4",
    padding: "15px",
  },

  card: {
    width: "100%",
    maxWidth: "380px",
    background: "#fff",
    borderRadius: "16px",
    padding: "15px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  },

  preview: {
    width: "100%",
    height: "350px",
    objectFit: "cover",
    borderRadius: "12px",
  },

  textarea: {
    width: "100%",
    minHeight: "100px",
    marginTop: "15px",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    resize: "none",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },

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

  postBtn: {
    marginTop: "15px",
    width: "100%",
    padding: "12px",
    background: "rgb(234,182,118)",
    color: "#000",
    border: "none",
    borderRadius: "10px",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "15px",
  },

  errorContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "15px",
  },

  backBtn: {
    padding: "10px 20px",
    border: "none",
    borderRadius: "8px",
    background: "#000",
    color: "#fff",
    cursor: "pointer",
  },

  // ── toggle-switch styles (same shape as CreateImagePost's) ──
  toggleRow:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid #f0f0f0" },
  toggleLabel: { fontSize: 13, fontWeight: 600, color: "#333" },
  toggleHint:  { fontSize: 11, color: "#999", marginTop: 2, maxWidth: 220 },
  switchTrack: { width: 38, height: 22, borderRadius: 999, position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" },
  switchThumb: { width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "transform 0.15s" },
};