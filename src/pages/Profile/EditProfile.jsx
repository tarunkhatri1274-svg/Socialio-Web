import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL;

/* ────────────────────────────────────────────────────────────────────
   SHARED ICONS — small inline SVGs, matching the stroke style already
   used elsewhere in this file (currentColor / white, strokeWidth 2).
   ──────────────────────────────────────────────────────────────────── */
const Icon = {
  Back: (p) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  Edit: (p) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Close: (p) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  RotateLeft: (p) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-9.36L1 10" />
    </svg>
  ),
  RotateRight: (p) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-.49-9.36L23 10" />
    </svg>
  ),
  Flip: (p) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v18" /><path d="M16 7l4 5-4 5" /><path d="M8 7l-4 5 4 5" />
    </svg>
  ),
  Check: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

/* ────────────────────────────────────────────────────────────────────
   PHOTO EDITOR — crop (pan + zoom + rotate + flip), Adjust sliders,
   and filter presets. Renders the final result to an off-screen canvas
   using Canvas2D's `ctx.filter`, so what you see is what gets uploaded.
   ──────────────────────────────────────────────────────────────────── */
const FILTER_PRESETS = [
  { name: "Original", v: { exposure: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0 } },
  { name: "Vivid",   v: { exposure: 5,  contrast: 18, saturation: 32, warmth: 6,   fade: 0 } },
  { name: "Mono",    v: { exposure: 0,  contrast: 10, saturation: -100, warmth: 0, fade: 0 } },
  { name: "Warm",    v: { exposure: 6,  contrast: 4,  saturation: 14, warmth: 42,  fade: 4 } },
  { name: "Cool",    v: { exposure: 0,  contrast: 8,  saturation: 6,  warmth: -32, fade: 0 } },
  { name: "Fade",    v: { exposure: 6,  contrast: -18, saturation: -8, warmth: 6,  fade: 40 } },
];

function buildFilterCss(e) {
  const brightness = 1 + e.exposure / 200;
  const contrast = 1 + e.contrast / 150 - e.fade / 250;
  const saturate = Math.max(0, 1 + e.saturation / 100);
  const warmSepia = e.warmth > 0 ? Math.min(0.5, e.warmth / 160) : 0;
  const coolHue = e.warmth < 0 ? Math.min(40, (-e.warmth / 100) * 40) : 0;
  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    warmSepia ? `sepia(${warmSepia.toFixed(3)})` : "",
    coolHue ? `hue-rotate(${(180 + coolHue).toFixed(1)}deg)` : "",
  ].filter(Boolean).join(" ");
}

const defaultAdjust = () => ({ exposure: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0, filterName: "Original" });

// ── Zoom bounds shared between the slider and pinch gesture ──────────────
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

// ── Pinch helpers ──────────────────────────────────────────────────────
function pinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function pinchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function PhotoEditorModal({ src, shape, aspect, outputW, outputH, onCancel, onConfirm }) {
  const FRAME_W = 220;
  const FRAME_H = Math.round(FRAME_W / aspect);

  const [tab, setTab] = useState("crop");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [adjust, setAdjust] = useState(defaultAdjust());
  const [imgReady, setImgReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Natural pixel size of the loaded image. Needed so the on-screen
  // preview and the final canvas render use the EXACT same "cover"
  // math — the preview transform and the canvas draw both derive their
  // scale from this + baseScale, so what you see while dragging always
  // matches what gets saved.
  const [natSize, setNatSize] = useState({ w: 0, h: 0 });

  const imgRef = useRef(null);
  const dragRef = useRef(null);

  const setField = (k, v) => setAdjust((p) => ({ ...p, [k]: v }));

  // ── "Cover" scale — the image fills the entire frame at zoom = 1
  // (no letterboxing/empty space), exactly like Instagram/Facebook's
  // crop screen. Math.max scales the SMALLER image dimension up until
  // it fully covers the frame; the larger dimension then overflows and
  // gets clipped by the frame's overflow:hidden.
  //
  // At EXACT cover scale, whichever dimension is proportionally
  // tighter lands perfectly flush with the frame edge — zero slack on
  // that axis — so only the other axis can be dragged. PAN_BUFFER
  // scales slightly past strict cover so BOTH axes always overflow a
  // little and can be dragged immediately, without needing to zoom in
  // first. Increase it for more default pan room on the tight axis.
  const PAN_BUFFER = 1.15;
  const baseScale =
    natSize.w && natSize.h
      ? Math.max(FRAME_W / natSize.w, FRAME_H / natSize.h) * PAN_BUFFER
      : 1;

  // ── Keep pan within the image's actual bounds at the current zoom so
  // you can never drag the photo completely out of the frame. Since the
  // image now always covers the frame (cover scale), there's always at
  // least a little room to pan on both axes once zoomed at all, and
  // more room the further you zoom in.
  const clampOffset = (ox, oy, z) => {
    const scale = baseScale * z;
    const w = natSize.w * scale;
    const h = natSize.h * scale;
    const maxX = Math.max(0, (w - FRAME_W) / 2);
    const maxY = Math.max(0, (h - FRAME_H) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    };
  };

  const onMove = (e) => {
    if (!dragRef.current) return;

    if (e.touches && e.touches.length === 2 && dragRef.current.mode === "pinch") {
      if (e.cancelable) e.preventDefault();
      const dist = pinchDistance(e.touches);
      const scale = dist / dragRef.current.startDist;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, dragRef.current.startZoom * scale));
      setZoom(nextZoom);
      setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
      return;
    }

    if (dragRef.current.mode !== "pan") return;
    if (e.touches && e.cancelable) e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const nx = dragRef.current.ox + (p.clientX - dragRef.current.startX);
    const ny = dragRef.current.oy + (p.clientY - dragRef.current.startY);
    setOffset(clampOffset(nx, ny, zoom));
  };

  const onUp = (e) => {
    if (e?.touches && e.touches.length === 1) {
      const p = e.touches[0];
      dragRef.current = {
        mode: "pan",
        startX: p.clientX,
        startY: p.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      return;
    }
    dragRef.current = null;
    // Mouse drags are tracked on window (see onDown) — stop listening
    // once the button is released, wherever the cursor ended up.
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  const onDown = (e) => {
    if (e.touches && e.touches.length === 2) {
      dragRef.current = { mode: "pinch", startDist: pinchDistance(e.touches), startZoom: zoom };
      return;
    }
    const p = e.touches ? e.touches[0] : e;
    dragRef.current = { mode: "pan", startX: p.clientX, startY: p.clientY, ox: offset.x, oy: offset.y };

    // Mouse events are tracked on window (not just the small 220px frame
    // div) so the drag keeps working anywhere on the page — even if the
    // cursor moves off the frame briefly — until the mouse button is
    // released.
    if (!e.touches) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
  };

  useEffect(() => {
    // Re-clamp whenever zoom changes via the slider (not just pinch),
    // so slider-zooming out never leaves the pan out of bounds.
    setOffset((prev) => clampOffset(prev.x, prev.y, zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natSize.w, natSize.h, rotation]);

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setBusy(true);

    const natW = img.naturalWidth, natH = img.naturalHeight;
    const effScale = baseScale * zoom;
    const scaleToOutput = outputW / FRAME_W;
    const finalScale = effScale * scaleToOutput;

    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext("2d");

    ctx.filter = buildFilterCss(adjust);
    ctx.save();
    ctx.translate(outputW / 2 + offset.x * scaleToOutput, outputH / 2 + offset.y * scaleToOutput);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.drawImage(img, (-natW * finalScale) / 2, (-natH * finalScale) / 2, natW * finalScale, natH * finalScale);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        onConfirm(blob, previewUrl);
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <div style={editorStyles.overlay}>
      <div style={editorStyles.card}>
        <div style={editorStyles.topBar}>
          <button style={editorStyles.iconBtn} onClick={onCancel}><Icon.Close /></button>
          <span style={editorStyles.title}>{shape === "circle" ? "Edit profile photo" : "Edit cover photo"}</span>
          <button style={{ ...editorStyles.applyBtn, opacity: busy ? 0.6 : 1 }} onClick={handleConfirm} disabled={busy || !imgReady}>
            <Icon.Check /> {busy ? "..." : "Done"}
          </button>
        </div>

        <div style={editorStyles.canvasWrap}>
          <div
            style={{ ...editorStyles.frame, width: FRAME_W, height: FRAME_H }}
            onMouseDown={onDown}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} onTouchCancel={onUp}
          >
            <img
              ref={imgRef}
              src={src}
              crossOrigin="anonymous"
              alt=""
              draggable={false}
              onLoad={() => {
                setImgReady(true);
                setNatSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
              }}
              style={{
                position: "absolute", top: "50%", left: "50%",
                width: natSize.w || undefined,
                height: natSize.h || undefined,
                maxWidth: "none", maxHeight: "none",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${baseScale * zoom}) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
                filter: buildFilterCss(adjust),
                userSelect: "none", pointerEvents: "none",
              }}
            />
            {shape === "circle" && <div style={editorStyles.circleMask} />}
          </div>
        </div>

        <div style={editorStyles.controlsArea}>
          {tab === "crop" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button style={editorStyles.ghostBtn} onClick={() => setRotation((r) => (r - 90 + 360) % 360)}><Icon.RotateLeft /></button>
              <button style={editorStyles.ghostBtn} onClick={() => setRotation((r) => (r + 90) % 360)}><Icon.RotateRight /></button>
              <button style={editorStyles.ghostBtn} onClick={() => setFlip((f) => !f)}><Icon.Flip /></button>
              <input
                type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
          )}

          {tab === "adjust" && (
            <div>
              <AdjustRow label="Exposure" val={adjust.exposure} onChange={(v) => setField("exposure", v)} />
              <AdjustRow label="Contrast" val={adjust.contrast} onChange={(v) => setField("contrast", v)} />
              <AdjustRow label="Saturation" val={adjust.saturation} onChange={(v) => setField("saturation", v)} />
              <AdjustRow label="Warmth" val={adjust.warmth} onChange={(v) => setField("warmth", v)} />
              <AdjustRow label="Fade" val={adjust.fade} onChange={(v) => setField("fade", v)} min={0} max={100} />
            </div>
          )}

          {tab === "filters" && (
            <div style={editorStyles.filterRow}>
              {FILTER_PRESETS.map((p) => (
                <div
                  key={p.name}
                  style={{ textAlign: "center", cursor: "pointer", flexShrink: 0 }}
                  onClick={() => setAdjust({ ...p.v, filterName: p.name })}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 10, overflow: "hidden",
                    border: adjust.filterName === p.name ? `2px solid ${ACCENT}` : "2px solid transparent",
                  }}>
                    <img src={src} crossOrigin="anonymous" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: buildFilterCss(p.v) }} />
                  </div>
                  <p style={{ fontSize: 10, margin: "4px 0 0", color: adjust.filterName === p.name ? ACCENT_DARK : "#999", fontWeight: 600 }}>
                    {p.name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={editorStyles.tabs}>
          {["crop", "adjust", "filters"].map((t) => (
            <p key={t} onClick={() => setTab(t)} style={t === tab ? editorStyles.tabActive : editorStyles.tabInactive}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdjustRow({ label, val, onChange, min = -100, max = 100 }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
        <span style={{ color: "#555", fontWeight: 600 }}>{label}</span>
        <span style={{ color: ACCENT_DARK, fontWeight: 700 }}>{val > 0 ? "+" : ""}{val}</span>
      </div>
      <input type="range" min={min} max={max} value={val} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

export default function EditProfile() {
  const navigate = useNavigate();
  const profilePicRef = useRef(null);
  const bgImageRef = useRef(null);

  const [profilePic, setProfilePic] = useState(null);
  const [bgImage, setBgImage] = useState(null);
  const [user, setUser] = useState(null);
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [bgImageFile, setBgImageFile] = useState(null);
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // "avatar" | "cover" | null — which editor is currently open, and the
  // raw source (freshly picked file's object URL, or the existing saved
  // photo for a quick re-edit) it should load.
  const [editorTarget, setEditorTarget] = useState(null);
  const [editorSrc, setEditorSrc] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
          setUser(data.user);
          setUsername(data.user.username || "");
          setDescription(data.user.bio || "");
          setProfilePic(data.user.profilePic || "");
          setBgImage(data.user.coverPic || "");
        }
      } catch (error) {
        console.log(error);
      }
    };
    fetchProfile();
  }, []);

  // ── Open the editor with a freshly-picked file ──────────────────────
  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setEditorSrc(URL.createObjectURL(file));
    setEditorTarget("avatar");
    e.target.value = "";
  };
  const handleBgImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setEditorSrc(URL.createObjectURL(file));
    setEditorTarget("cover");
    e.target.value = "";
  };

  // ── Re-open the editor on the photo that's already set ──────────────
  const reEdit = (target) => {
    const src = target === "avatar" ? profilePic : bgImage;
    if (!src) return;
    setEditorSrc(src);
    setEditorTarget(target);
  };

  const closeEditor = () => { setEditorTarget(null); setEditorSrc(null); };

  const handleEditorConfirm = (blob, previewUrl) => {
    if (editorTarget === "avatar") {
      setProfilePic(previewUrl);
      setProfilePicFile(blob);
    } else if (editorTarget === "cover") {
      setBgImage(previewUrl);
      setBgImageFile(blob);
    }
    closeEditor();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("bio", description);

      // Only attach a file when it actually changed — this is what tells
      // the backend to swap it out (and delete the old Cloudinary asset).
      if (profilePicFile) formData.append("profilePic", profilePicFile, "profile.jpg");
      if (bgImageFile) formData.append("coverPic", bgImageFile, "cover.jpg");

      const token = localStorage.getItem("token");
      const response = await fetch(`${API}/auth/update-profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => navigate("/profile"), 1200);
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.log(error);
      alert("Profile update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.header}>
          <button style={s.backBtn} onClick={() => navigate("/profile")}>
            <Icon.Back />
          </button>
          <span style={s.title}>Edit Profile</span>
          <button
            onClick={handleSave}
            disabled={saved || saving}
            style={{ ...s.saveTopBtn, ...(saved ? s.saveTopBtnSaved : {}), opacity: saving ? 0.7 : 1 }}
          >
            {saved ? "✓" : saving ? "..." : "Save"}
          </button>
        </div>

        {/* Cover Photo */}
        <div style={s.coverWrapper}>
          <div
            style={{
              ...s.coverArea,
              backgroundImage: bgImage ? `url(${bgImage})` : "none",
              backgroundColor: bgImage ? "transparent" : "#f0f0f0",
            }}
          >
            {!bgImage && (
              <div style={s.coverPlaceholder}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={s.coverPlaceholderText}>Add Cover Photo</span>
              </div>
            )}

            <div style={s.coverBtnRow}>
              {bgImage && (
                <button style={s.coverAdjustBtn} onClick={() => reEdit("cover")}>Adjust</button>
              )}
              <button style={s.coverEditBtn} onClick={() => bgImageRef.current.click()}>
                <Icon.Edit /> {bgImage ? "Replace" : "Add"}
              </button>
            </div>
          </div>
          <input ref={bgImageRef} type="file" accept="image/*" hidden onChange={handleBgImageChange} />

          {/* Avatar overlapping cover */}
          <div style={s.avatarWrapper}>
            <div style={s.avatarRing}>
              {profilePic ? (
                <img src={profilePic} alt="profile" style={s.avatarImg} />
              ) : (
                <div style={s.avatarFallback}>{username.charAt(0).toUpperCase()}</div>
              )}
            </div>
            <button style={s.avatarEditBtn} onClick={() => profilePicRef.current.click()}>
              <Icon.Edit />
            </button>
            <input ref={profilePicRef} type="file" accept="image/*" hidden onChange={handleProfilePicChange} />
          </div>
        </div>

        {/* Change Photo / Adjust links */}
        <div style={{ textAlign: "center", marginTop: "10px", marginBottom: "28px", display: "flex", justifyContent: "center", gap: 16 }}>
          <span style={s.changePhotoLink} onClick={() => profilePicRef.current.click()}>Change profile photo</span>
          {profilePic && (
            <span style={{ ...s.changePhotoLink, color: "#999" }} onClick={() => reEdit("avatar")}>Adjust</span>
          )}
        </div>

        {/* Fields */}
        <div style={s.fields}>
          <div style={s.fieldGroup}>
            <label style={s.label}>Username</label>
            <div style={{ ...s.inputWrapper, ...(focusedField === "username" ? s.inputWrapperFocused : {}) }}>
              <span style={s.inputPrefix}>@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedField("username")}
                onBlur={() => setFocusedField(null)}
                style={s.input}
                placeholder="username"
              />
            </div>
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Bio</label>
            <div style={{ ...s.textareaWrapper, ...(focusedField === "bio" ? s.inputWrapperFocused : {}) }}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 150))}
                onFocus={() => setFocusedField("bio")}
                onBlur={() => setFocusedField(null)}
                style={s.textarea}
                placeholder="Tell people about yourself..."
                rows={4}
              />
              <span style={s.charCount}>{description.length}/150</span>
            </div>
          </div>
        </div>

        {/* Save Button (bottom) */}
        <button
          onClick={handleSave}
          disabled={saved || saving}
          style={{ ...s.saveBtn, ...(saved ? s.saveBtnSaved : {}), opacity: saving ? 0.75 : 1 }}
        >
          {saved ? "✓  Profile Saved!" : saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {editorTarget && (
        <PhotoEditorModal
          src={editorSrc}
          shape={editorTarget === "avatar" ? "circle" : "rect"}
          aspect={editorTarget === "avatar" ? 1 : 2.35}
          outputW={editorTarget === "avatar" ? 600 : 1600}
          outputH={editorTarget === "avatar" ? 600 : Math.round(1600 / 2.35)}
          onCancel={closeEditor}
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  );
}

const ACCENT = "rgb(234,182,118)";
const ACCENT_LIGHT = "rgba(234,182,118,0.15)";
const ACCENT_DARK = "rgb(196,140,72)";
const BORDER = "#ececec";
const TEXT_PRIMARY = "#111";
const TEXT_SECONDARY = "#666";

const s = {
  page: {
    minHeight: "100vh",
    background: `linear-gradient(to bottom, ${ACCENT_LIGHT}, #fff)`,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily: "'Segoe UI', sans-serif",
    paddingBottom: "40px",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    minHeight: "100vh",
    background: "#fff",
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  },
  header: {
    position: "sticky", top: 0, zIndex: 100,
    background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "15px 16px", borderBottom: `1px solid ${BORDER}`,
  },
  backBtn: {
    background: "#fff", border: `1px solid ${BORDER}`, width: "34px", height: "34px",
    borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", color: TEXT_PRIMARY,
  },
  title: { fontSize: "17px", fontWeight: "700", color: TEXT_PRIMARY, letterSpacing: "0.3px" },
  saveTopBtn: {
    background: ACCENT, border: "none", color: "#fff", padding: "8px 14px", borderRadius: "10px",
    fontWeight: "600", fontSize: "13px", cursor: "pointer", boxShadow: `0 4px 12px ${ACCENT_LIGHT}`,
  },
  saveTopBtnSaved: { background: "#2ecc71" },
  coverWrapper: { position: "relative", marginBottom: "60px" },
  coverArea: {
    width: "100%", height: "180px", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`,
    backgroundSize: "cover", backgroundPosition: "center", position: "relative", overflow: "hidden",
    borderBottomLeftRadius: "26px", borderBottomRightRadius: "26px",
  },
  coverPlaceholder: {
    width: "100%", height: "100%", display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center", gap: "10px", color: "rgba(255,255,255,0.85)",
  },
  coverPlaceholderText: { fontSize: "13px", fontWeight: "500" },
  coverBtnRow: { position: "absolute", right: "14px", bottom: "14px", display: "flex", gap: "8px" },
  coverAdjustBtn: {
    border: "none", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", color: "#fff",
    padding: "8px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "600", cursor: "pointer",
  },
  coverEditBtn: {
    border: "none", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", color: "#fff",
    padding: "8px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "600", display: "flex",
    alignItems: "center", gap: "6px", cursor: "pointer",
  },
  avatarWrapper: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "-52px" },
  avatarRing: {
    width: "105px", height: "105px", borderRadius: "50%", padding: "4px",
    background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`, boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
  },
  avatarImg: { width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", border: "4px solid white", background: "#eee" },
  avatarFallback: {
    width: "100%", height: "100%", borderRadius: "50%", background: "#f1f1f1", border: "4px solid white",
    display: "flex", justifyContent: "center", alignItems: "center", fontSize: "34px", fontWeight: "700", color: ACCENT_DARK,
  },
  avatarEditBtn: {
    position: "absolute", bottom: "6px", right: "4px", width: "30px", height: "30px", borderRadius: "50%",
    border: "3px solid white", background: ACCENT_DARK, color: "#fff", display: "flex", justifyContent: "center",
    alignItems: "center", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
  },
  changePhotoLink: { color: ACCENT_DARK, fontSize: "13px", fontWeight: "700", cursor: "pointer" },
  fields: { padding: "0 18px", display: "flex", flexDirection: "column", gap: "24px" },
  fieldGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  label: { fontSize: "12px", color: TEXT_SECONDARY, fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase", marginLeft: "4px" },
  inputWrapper: {
  display: "flex",
  alignItems: "center",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "16px",
  background: "#fafafa",
  transition: "0.25s",
  overflow: "hidden",
},
  inputWrapperFocused: { borderColor: ACCENT_DARK, background: "#fff", boxShadow: `0 0 0 4px ${ACCENT_LIGHT}` },
  inputPrefix: { paddingLeft: "14px", fontSize: "15px", color: ACCENT_DARK, fontWeight: "600" },
  input: { flex: 1, border: "none", outline: "none", background: "transparent", padding: "14px 12px", fontSize: "15px", color: TEXT_PRIMARY, fontFamily: "inherit" },
  textareaWrapper: {
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "16px",
  background: "#fafafa",
  overflow: "hidden",
  transition: "0.25s",
},
  textarea: { width: "100%", border: "none", outline: "none", resize: "none", padding: "14px", fontSize: "15px", background: "transparent", color: TEXT_PRIMARY, fontFamily: "inherit", boxSizing: "border-box" },
  charCount: { display: "block", textAlign: "right", padding: "0 14px 12px", fontSize: "11px", color: "#aaa" },
  saveBtn: {
    width: "calc(100% - 36px)", margin: "34px 18px 0", padding: "15px", border: "none", borderRadius: "18px",
    background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK})`, color: "#fff", fontSize: "15px", fontWeight: "700",
    cursor: "pointer", letterSpacing: "0.3px", boxShadow: `0 8px 18px ${ACCENT_LIGHT}`, transition: "0.2s",
  },
  saveBtnSaved: { background: "#2ecc71" },
};

const editorStyles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(10,10,11,0.92)", zIndex: 2000,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  },
  card: {
    width: "100%", maxWidth: 300, background: "#111214", borderRadius: 18, overflow: "hidden",
    color: "#F2F2F0", fontFamily: "'Segoe UI', sans-serif",
  },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  iconBtn: { background: "none", border: "none", color: "#F2F2F0", cursor: "pointer", display: "flex", padding: 4 },
  title: { fontSize: 12.5, fontWeight: 700 },
  applyBtn: {
    background: ACCENT, color: "#1a1200", border: "none", borderRadius: 14, padding: "6px 11px",
    fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
  },
  canvasWrap: { display: "flex", justifyContent: "center", padding: "14px 12px", background: "#0A0A0B" },
  // touchAction: "none" is the key mobile fix: it tells the browser not
  // to intercept touch gestures on this element for its own
  // scrolling/zooming, so our pan/pinch handlers get full control
  // instead of fighting the page underneath.
  frame: {
    position: "relative", overflow: "hidden", borderRadius: 4, background: "#1a1a1c",
    cursor: "grab", touchAction: "none", WebkitUserSelect: "none", userSelect: "none",
  },
  circleMask: {
    position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "50%",
    boxShadow: "0 0 0 2000px rgba(10,10,11,0.72)",
  },
  controlsArea: { padding: "10px 14px 4px", minHeight: 92 },
  ghostBtn: {
    background: "#1F2124", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
    padding: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#F2F2F0",
  },
  filterRow: { display: "flex", gap: 9, overflowX: "auto", paddingBottom: 4 },
  tabs: {
    display: "flex", justifyContent: "space-around", borderTop: "1px solid rgba(255,255,255,0.08)",
    padding: "8px 0 12px",
  },
  tabActive: { margin: 0, fontSize: 12, fontWeight: 700, color: ACCENT, cursor: "pointer" },
  tabInactive: { margin: 0, fontSize: 12, fontWeight: 600, color: "#8A8D93", cursor: "pointer" },
};