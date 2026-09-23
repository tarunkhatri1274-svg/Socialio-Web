import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaThumbsUp, FaComment, FaShare, FaBookmark, FaTimes, FaImage, FaTag, FaUserFriends, FaChevronRight } from "react-icons/fa";
import { FiArrowLeft, FiSearch, FiX, FiEyeOff, FiDownloadCloud } from "react-icons/fi";
const API = import.meta.env.VITE_API_URL;
import ShareSheet from "./ShareSheet";
// ← Client-side size guard: this flow uploads through our own backend's
// /auth/upload-media route (see uploadtextpost below), so this check is
// purely for UX — real enforcement happens server-side in uploadPostMedia
// (media.controllers.js). Text posts only ever carry images (no video),
// so only the 10MB image limit applies here.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

function safeParseUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "undefined" || raw === "null") return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

// ── Small reusable toggle switch — same component/shape as
// CreateImagePost.jsx / CreateVideoPost.jsx's ToggleRow.
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

function CreateTextPost({ onPost }) {
  const navigate = useNavigate();
  const currentUser = safeParseUser();
  const displayUsername = currentUser?.username || "user";
  const profilePic = currentUser?.profilePic;
  const [text, setText] = useState("");
  const [images, setImages] = useState([]);
  const [description, setDescription] = useState("");

  // ── tags ──────────────────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  // ── collaborators ────────────────────────────────────────────────────
  const [collabSearch, setCollabSearch] = useState("");
  const [collabResults, setCollabResults] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [searchingCollab, setSearchingCollab] = useState(false);
  const searchTimer = useRef(null);

  // ── NEW: Advanced settings — hide like/comment counts, disable
  // download, disable comments entirely. Stored on the Post document by
  // AddTextPost (media.controllers.js already accepts these fields).
  const [hideLikeCount, setHideLikeCount] = useState(false);
  const [hideCommentCount, setHideCommentCount] = useState(false);
  const [disableDownload, setDisableDownload] = useState(false);
  const [disableComments, setDisableComments] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileRef = useRef();
  const [loading, setLoading] = useState(false);

  function handleImageUpload(e) {
    const files = Array.from(e.target.files);
    const imageData = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...imageData]);
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ── tag handlers ───────────────────────────────────────────────────────
  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  };
  const removeTag = (t) => setTags((prev) => prev.filter((x) => x !== t));

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
        setCollabResults(results.filter((u) => u._id !== me._id && !collaborators.some((c) => c._id === u._id)));
      } catch {}
      setSearchingCollab(false);
    }, 400);
  };

  const addCollab = (user) => {
    setCollaborators((prev) => [...prev, user]);
    setCollabResults([]);
    setCollabSearch("");
  };
  const removeCollab = (id) => setCollaborators((prev) => prev.filter((u) => u._id !== id));

  const uploadtextpost = async () => {
    try {
      const oversized = images.filter((img) => img.file && img.file.size > MAX_IMAGE_BYTES);
      if (oversized.length > 0) {
        alert(
          `${oversized.length === 1 ? "One image" : `${oversized.length} images`} exceed the 10MB limit. Please choose smaller files.`
        );
        return;
      }

      setLoading(true);

      const tok = token();

      const uploadedImages = await Promise.all(
        images.map(async (img) => {
          const formData = new FormData();
          formData.append("file", img.file);

          const response = await fetch(`${API}/auth/upload-media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tok}` },
            body: formData,
          });
          if (!response.ok) throw new Error("Upload failed");
          const data = await response.json();
          return { url: data.url || data.secure_url, type: "image" };
        })
      );

      console.log("All uploaded images:", uploadedImages);

      const response = await fetch(`${API}/auth/add-text-post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          postType: "text",
          text: text,
          media: uploadedImages,
          tags: tags,
          collaborators: collaborators.map((c) => c._id),
          // ← NEW visibility settings, read by AddTextPost
          // (media.controllers.js) and stored on the Post document.
          hideLikeCount,
          hideCommentCount,
          disableDownload,
          disableComments,
        }),
      });

      const data = await response.json();
      console.log("Post response:", data);

      if (data.success) { navigate("/profile"); }

    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <button style={styles.iconBtn} onClick={() => navigate(-1)}>
          <FiArrowLeft size={22} />
        </button>
        <span style={styles.topTitle}>New Post</span>
        <button
          style={{
            ...styles.postBtn,
            opacity: text.trim() || images.length > 0 ? 1 : 0.4,
          }}
          onClick={uploadtextpost}
          disabled={!text.trim() && images.length === 0}
        >
          Post
        </button>
      </div>

      {/* User Row */}
      <div style={styles.userRow}>
        <div style={styles.avatar}>
          {profilePic ? (
            <img src={profilePic} alt="" style={styles.avatarImg} />
          ) : (
            displayUsername[0]?.toUpperCase()
          )}
        </div>
        <div>
          <div style={styles.username}>{displayUsername}</div>
          <div style={styles.audience}>Everyone</div>
        </div>
      </div>

      {/* Text Input */}
      <textarea
        style={styles.textarea}
        placeholder="What's on your mind?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />

      {/* Image Previews */}
      {images.length > 0 && (
        <div style={styles.imageRow}>
          {images.map((img, i) => (
            <div key={i} style={styles.imageWrapper}>
              <img src={img.url} alt="" style={styles.previewImg} />
              <button style={styles.removeImg} onClick={() => removeImage(i)}>
                <FaTimes size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div style={styles.divider} />

      {/* Options */}
      <div style={styles.optionsList}>

        {/* Add Image */}
        <div style={styles.optionRow} onClick={() => fileRef.current.click()}>
          <div style={styles.optionLeft}>
            <div style={{ ...styles.optionIcon, background: "#e8f4fd" }}>
              <FaImage color="#1877f2" size={16} />
            </div>
            <span style={styles.optionLabel}>Add Image</span>
          </div>
          <FaChevronRight size={12} color="#bbb" />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleImageUpload}
        />

        {/* Tags */}
        <div style={styles.optionRow} onClick={() => setShowAdvanced(!showAdvanced)}>
          <div style={styles.optionLeft}>
            <div style={{ ...styles.optionIcon, background: "#fef3e8" }}>
              <FaTag color="#f5a623" size={16} />
            </div>
            <span style={styles.optionLabel}>Tags</span>
          </div>
          <div style={styles.optionRight}>
            {tags.length > 0 && <span style={styles.optionValue}>{tags.map(t => `#${t}`).join(", ")}</span>}
            <FaChevronRight size={12} color="#bbb" />
          </div>
        </div>

        {/* Collabs */}
        <div style={styles.optionRow} onClick={() => setShowAdvanced(!showAdvanced)}>
          <div style={styles.optionLeft}>
            <div style={{ ...styles.optionIcon, background: "#edf7ed" }}>
              <FaUserFriends color="#2ecc71" size={16} />
            </div>
            <span style={styles.optionLabel}>Collab</span>
          </div>
          <div style={styles.optionRight}>
            {collaborators.length > 0 && (
              <span style={styles.optionValue}>{collaborators.map(c => c.username).join(", ")}</span>
            )}
            <FaChevronRight size={12} color="#bbb" />
          </div>
        </div>

        {/* Advanced settings row — new */}
        <div style={styles.optionRow} onClick={() => setShowAdvanced(!showAdvanced)}>
          <div style={styles.optionLeft}>
            <div style={{ ...styles.optionIcon, background: "#f3eefc" }}>
              <FiEyeOff color="#8e44ad" size={16} />
            </div>
            <span style={styles.optionLabel}>Advanced settings</span>
          </div>
          <FaChevronRight size={12} color="#bbb" />
        </div>
      </div>

      {/* Advanced Panel */}
      {showAdvanced && (
        <div style={styles.advancedPanel}>
          <label style={styles.fieldLabel}>Tags</label>
          <div style={styles.tagInputRow}>
            <input
              style={{ ...styles.fieldInput, flex: 1 }}
              placeholder="Add a tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
            />
            <button onClick={addTag} style={styles.addBtn}>Add</button>
          </div>
          {tags.length > 0 && (
            <div style={styles.tagWrap}>
              {tags.map((t) => (
                <div key={t} style={styles.tagChip}>
                  #{t}
                  <FiX size={12} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeTag(t)} />
                </div>
              ))}
            </div>
          )}

          <label style={{ ...styles.fieldLabel, marginTop: 16 }}>Description</label>
          <input
            style={styles.fieldInput}
            placeholder="Add a description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label style={{ ...styles.fieldLabel, marginTop: 16 }}>Invite Collaborators</label>
          <div style={styles.searchWrap}>
            <FiSearch size={13} color="#aaa" />
            <input
              style={styles.smallInputNoBorder}
              placeholder="Search people..."
              value={collabSearch}
              onChange={(e) => handleCollabSearch(e.target.value)}
            />
          </div>
          {collabResults.length > 0 && (
            <div style={styles.searchResults}>
              {collabResults.map((u) => (
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
              {collaborators.map((u) => (
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

          {/* ── Advanced settings toggles — new ── */}
          <label style={{ ...styles.fieldLabel, marginTop: 16 }}>Post visibility</label>
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
            hint="Other people won't be able to download this post's images."
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
      )}

      {/* Preview Section */}
      {(text || images.length > 0) && (
        <>
          <div style={styles.divider} />
          <div style={styles.previewLabel}>Preview</div>
          <div style={styles.previewCard}>
            <div style={styles.previewHeader}>
              <div style={styles.previewAvatar}>
                {profilePic ? (
                  <img src={profilePic} alt="" style={styles.avatarImg} />
                ) : (
                  displayUsername[0]?.toUpperCase()
                )}
              </div>
              <span style={styles.previewUsername}>{displayUsername}</span>
            </div>
            {text && <div style={styles.previewText}>{text}</div>}
            {images.length > 0 && (
              <div style={styles.previewImgStrip}>
                {images.map((img, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.previewImgWrapper,
                      width: images.length === 1 ? "100%" : "240px",
                    }}
                  >
                    <img src={img.url} alt="" style={styles.previewGridImg} />
                  </div>
                ))}
              </div>
            )}
            <div style={styles.previewActions}>
              <button style={styles.previewBtn}><FaThumbsUp color="#aaa" /></button>
              <button style={styles.previewBtn}><FaComment color="#aaa" /></button>
              <button style={styles.previewBtn}><FaShare color="#aaa" /></button>
              <button style={{ ...styles.previewBtn, marginLeft: "auto" }}><FaBookmark color="#aaa" /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CreateTextPost;

const styles = {
 page: {
  width: "100%",
  maxWidth: "500px",
  margin: "0 auto",
  background: "#fff",
  fontFamily: "sans-serif",
  paddingBottom: "20px",
  height: "auto",
},
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 15px",
    borderBottom: "1px solid #eee",
    position: "sticky",
    top: 0,
    background: "#fff",
    zIndex: 10,
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
  },
  topTitle: {
    fontWeight: "700",
    fontSize: "16px",
  },
  postBtn: {
    background: "rgb(234,182,118)",
    color: "#fff",
    border: "none",
    borderRadius: "20px",
    padding: "7px 18px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 15px 6px",
  },
  avatar: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: "#1877f2",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "18px",
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "50%",
  },
  username: {
    fontWeight: "600",
    fontSize: "14px",
  },
  audience: {
    fontSize: "11px",
    color: "#888",
    marginTop: "2px",
  },
textarea: {
  width: "100%",
  minHeight: "80px",
  maxHeight: "250px",
  padding: "10px 15px",
},
  imageRow: {
    display: "flex",
    gap: "8px",
    padding: "0 15px 10px",
    flexWrap: "wrap",
  },
  imageWrapper: {
    position: "relative",
    width: "80px",
    height: "80px",
  },
  previewImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "8px",
  },
  removeImg: {
    position: "absolute",
    top: "4px",
    right: "4px",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    border: "none",
    borderRadius: "50%",
    width: "18px",
    height: "18px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: "1px",
    background: "#f0f0f0",
    margin: "6px 0",
  },
  optionsList: {
    padding: "4px 0",
  },
  optionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "13px 15px",
    cursor: "pointer",
    borderBottom: "1px solid #f5f5f5",
  },
  optionLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  optionIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontSize: "15px",
    fontWeight: "500",
  },
  optionRight: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  optionValue: {
    fontSize: "12px",
    color: "#888",
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  advancedPanel: {
    padding: "10px 15px",
    background: "#fafafa",
    borderTop: "1px solid #eee",
    borderBottom: "1px solid #eee",
  },
  fieldLabel: {
    fontSize: "12px",
    color: "#888",
    marginBottom: "4px",
    display: "block",
    marginTop: "10px",
  },
  fieldInput: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  tagInputRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  addBtn: {
    background: "rgb(234,182,118)",
    border: "none",
    borderRadius: "8px",
    padding: "9px 14px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tagWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  },
  tagChip: {
    display: "flex",
    alignItems: "center",
    background: "#fff3e0",
    color: "#f5a623",
    borderRadius: "20px",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: "600",
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    padding: "6px 10px",
    marginTop: "4px",
  },
  smallInputNoBorder: {
    flex: 1,
    border: "none",
    background: "transparent",
    fontSize: "13px",
    outline: "none",
    padding: "4px 6px",
  },
  searchResults: {
    background: "#fff",
    borderRadius: "10px",
    border: "1px solid #eee",
    marginTop: "6px",
    overflow: "hidden",
  },
  searchResultItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "0.5px solid #f5f5f5",
  },
  miniAvatar: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "#1877f2",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "700",
    flexShrink: 0,
  },
  collabWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "8px",
  },
  collabChip: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "#e8f5e9",
    borderRadius: "20px",
    padding: "4px 10px",
  },
  previewLabel: {
    fontSize: "12px",
    color: "#aaa",
    padding: "8px 15px 4px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
previewCard: {
  margin: "0 15px",
  border: "1px solid #eee",
  borderRadius: "12px",
  overflow: "hidden",
  height: "auto",
},
  previewHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
  },
  previewAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#1877f2",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "13px",
    overflow: "hidden",
  },
  previewUsername: {
    fontWeight: "600",
    fontSize: "13px",
  },
  previewText: {
    padding: "0 12px 10px",
    fontSize: "14px",
    lineHeight: "1.5",
    color: "#222",
  },
 previewImgStrip: {
  display: "flex",
  gap: "8px",
  overflowX: "auto",
  padding: "0 12px 10px",
},
previewImgWrapper: {
  flexShrink: 0,
  borderRadius: "14px",
  overflow: "hidden",
  background: "#f0f0f0",
},
previewGridImg: {
  width: "100%",
  height: "240px",
  objectFit: "cover",
  display: "block",
  minHeight: "180px",
  maxHeight: "420px",
},
  previewActions: {
    display: "flex",
    gap: "8px",
    padding: "8px 12px",
    borderTop: "1px solid #f0f0f0",
  },
  previewBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
  },
  // ── toggle-switch styles (same shape as CreateImagePost/CreateVideoPost) ──
  toggleRow:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid #eee" },
  toggleLabel: { fontSize: 13, fontWeight: 600, color: "#333" },
  toggleHint:  { fontSize: 11, color: "#999", marginTop: 2, maxWidth: 220 },
  switchTrack: { width: 38, height: 22, borderRadius: 999, position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" },
  switchThumb: { width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "transform 0.15s" },
};