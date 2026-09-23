import React, { useState, useRef } from "react";
import { FiX, FiImage, FiPlus } from "react-icons/fi";

const API = import.meta.env.VITE_API_URL;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

// ── Add-a-memory modal, used in two modes:
//  - mode="group" (default): the big "+ Add memory" button on the
//    profile. Creates a brand NEW highlight group + one item per file
//    picked. Asks for a name.
//  - mode="item": "Add another memory" from inside an existing group's
//    viewer (pass groupId + groupName). Adds one item per file picked
//    into THAT group — no name field, and the header explicitly names
//    the group you're adding to, so it's unambiguous that this does NOT
//    create a new highlight.
//
// You can pick MULTIPLE photos/videos at once in either mode — each
// becomes its own item, all inside the same (new or existing) group.
function CreateMemoryModal({ mode = "group", groupId, groupName, onClose, onGroupCreated, onItemsAdded }) {
  const fileRef = useRef();
  const [files, setFiles]       = useState([]); // [{ file, preview, isVideo }]
  const [name, setName]         = useState("");
  const [disableComments, setDisableComments] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const handlePick = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const mapped = picked.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
      isVideo: f.type.startsWith("video/"),
    }));
    setFiles((prev) => [...prev, ...mapped]);
    e.target.value = ""; // allow re-picking the same file again if removed
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) { setError("Choose at least one photo or video"); return; }
    if (mode === "group" && !name.trim()) { setError("Give your memory a name"); return; }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      files.forEach(({ file }) => form.append("media", file)); // same field name, multiple times
      form.append("disableComments", disableComments);
      if (mode === "group") form.append("name", name.trim());

      const url = mode === "group"
        ? `${API}/memories/groups`
        : `${API}/memories/groups/${groupId}/items`;

      const res  = await fetch(url, {
        method: "POST",
        headers: authHeader(), // no Content-Type — browser sets multipart boundary
        body: form,
      });
      const data = await res.json();
      if (data.success) {
        if (mode === "group") onGroupCreated?.(data.group);
        else onItemsAdded?.(data.items);
        onClose();
      } else {
        setError(data.message || "Couldn't save memory");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h4 style={{ margin: 0, fontSize: 16 }}>{mode === "group" ? "Add Memory" : "Add to Memory"}</h4>
          <FiX size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {/* Explicit confirmation of WHICH group this goes into, so it's
            never ambiguous that "item" mode adds here rather than
            creating something new. */}
        {mode === "item" && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666" }}>
            Adding to: <b style={{ color: "#111" }}>{groupName || "this memory"}</b>
          </p>
        )}
        {mode === "group" && <div style={{ marginBottom: 8 }} />}

        {/* Thumbnail strip of everything picked so far */}
        <div style={stripStyle}>
          {files.map((f, i) => (
            <div key={i} style={thumbWrapStyle}>
              {f.isVideo
                ? <video src={f.preview} style={thumbStyle} muted />
                : <img src={f.preview} alt="" style={thumbStyle} />
              }
              <button style={removeBtnStyle} onClick={() => removeFile(i)}><FiX size={12} /></button>
            </div>
          ))}
          <div style={addThumbStyle} onClick={() => fileRef.current.click()}>
            {files.length === 0 ? <FiImage size={22} color="#999" /> : <FiPlus size={22} color="#999" />}
          </div>
        </div>
        {files.length === 0 && (
          <p style={{ fontSize: 12.5, color: "#999", margin: "0 0 14px" }}>
            Tap the box to choose one or more photos/videos.
          </p>
        )}

        <input
          type="file" accept="image/*,video/*" multiple ref={fileRef} style={{ display: "none" }}
          onChange={handlePick}
        />

        {mode === "group" && (
          <input
            type="text"
            placeholder="Name this memory (e.g. Travel, Friends)"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            style={nameInputStyle}
          />
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#444", margin: "10px 0 4px", cursor: "pointer" }}>
          <input type="checkbox" checked={disableComments} onChange={(e) => setDisableComments(e.target.checked)} />
          Turn off commenting on {files.length > 1 ? "these memories" : "this memory"}
        </label>

        {error && <p style={{ color: "#e0245e", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}

        <button style={submitBtnStyle(saving)} disabled={saving} onClick={handleSubmit}>
          {saving
            ? "Saving..."
            : mode === "group"
              ? `Add Memory${files.length > 1 ? ` (${files.length})` : ""}`
              : `Add${files.length > 1 ? ` ${files.length}` : ""}`}
        </button>
      </div>
    </div>
  );
}

export default CreateMemoryModal;

const overlayStyle       = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16 };
const boxStyle            = { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 380, padding: 18, boxSizing: "border-box" };
const stripStyle          = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 };
const thumbWrapStyle      = { position: "relative", width: 74, height: 74, borderRadius: 10, overflow: "hidden", flexShrink: 0 };
const thumbStyle           = { width: "100%", height: "100%", objectFit: "cover" };
const removeBtnStyle      = { position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };
const addThumbStyle       = { width: 74, height: 74, borderRadius: 10, background: "#fafafa", border: "1.5px dashed #ddd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
const nameInputStyle      = { width: "100%", boxSizing: "border-box", border: "1px solid #e2e2e2", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", marginTop: 4 };
const submitBtnStyle      = (saving) => ({ width: "100%", marginTop: 14, padding: 12, borderRadius: 12, border: "none", background: saving ? "#8fc9fb" : "#0095f6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" });