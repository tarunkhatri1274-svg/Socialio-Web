import React, { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   Shared chat-wallpaper module for the WEB app (messages.jsx and
   groupchatwindow.jsx). Mirrors the React Native version: same presets,
   same server contract (GET / PUT / DELETE .../:chatId/wallpaper).

   Usage inside a chat window:
     const { wallpaper, selectWallpaper, uploadWallpaperPhoto } = useChatWallpaper(chatId, isGroup);
     <div style={{ ...s.messages, ...wallpaperStyle(wallpaper) }}> ... </div>
     {showWallpaper && <WallpaperSheet current={wallpaper} onClose={...}
         onSelect={selectWallpaper} onPickFile={uploadWallpaperPhoto} />}
   ───────────────────────────────────────────────────────────────────────── */

const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
const getToken = () => localStorage.getItem("token");

const wallpaperEndpoint = (chatId, isGroup) =>
  isGroup ? `${API}/groups/${chatId}/wallpaper` : `${API}/messages/${chatId}/wallpaper`;

const authHeaders = (extra = {}) => ({ Authorization: `Bearer ${getToken()}`, ...extra });

// The server stores the preset id as `presetId`; the UI compares on `id`.
const normalize = (wp) => (wp ? { ...wp, id: wp.id ?? wp.presetId ?? null } : null);

/* ─── Presets (identical to the React Native app) ─── */
export const WALLPAPER_OPTIONS = [
  // Solid colors
  { id: "cream", label: "Cream", type: "color", value: "#f6ecdf" },
  { id: "sage",  label: "Sage",  type: "color", value: "#e3ecdf" },
  { id: "sky",   label: "Sky",   type: "color", value: "#e3edf5" },
  { id: "blush", label: "Blush", type: "color", value: "#f5e3ea" },
  { id: "mint",  label: "Mint",  type: "color", value: "#e2f5ec" },
  { id: "peach", label: "Peach", type: "color", value: "#fce7d8" },
  { id: "lilac", label: "Lilac", type: "color", value: "#ece3f5" },

  // WhatsApp-style doodle wallpapers
  {
    id: "wa-light", label: "WhatsApp", type: "doodle", value: "#e5ddd5",
    icons: ["chat", "heart", "music", "camera", "star"], iconColor: "#7a746b", iconOpacity: 0.16, iconSize: 20, gap: 46,
  },
  {
    id: "wa-dark", label: "WA Dark", type: "doodle", value: "#0b141a",
    icons: ["chat", "heart", "music", "camera", "star"], iconColor: "#ffffff", iconOpacity: 0.10, iconSize: 20, gap: 46,
  },

  // Playful emoji patterns
  { id: "leaves",   label: "Leaves",   type: "emoji", value: "#eef7ee", sticker: "🍃", stickerOpacity: 0.30, stickerSize: 18, stickerGap: 42 },
  { id: "bubbles",  label: "Bubbles",  type: "emoji", value: "#eaf6ff", sticker: "🫧", stickerOpacity: 0.30, stickerSize: 18, stickerGap: 42 },
  { id: "confetti", label: "Confetti", type: "emoji", value: "#fffaf0", sticker: "🎉", stickerOpacity: 0.28, stickerSize: 18, stickerGap: 46 },
  { id: "stars",    label: "Stars",    type: "emoji", value: "#12122a", sticker: "✨", stickerOpacity: 0.35, stickerSize: 16, stickerGap: 40 },

  // Instagram-style gradients
  { id: "ig-classic", label: "Instagram", type: "gradient", value: ["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"] },
  { id: "ig-sunset",  label: "Sunset",    type: "gradient", value: ["#ff9a8b", "#ff6a88", "#ff99ac"] },
  { id: "ig-dusk",    label: "Dusk",      type: "gradient", value: ["#4f5bd5", "#962fbf", "#d62976"] },
];

/* ─── Pattern tiles, drawn as tiny SVG images used as CSS backgrounds ─── */
const DOODLE_PATHS = {
  chat: `<path d="M4 4h16v12H8l-4 4V4z"/>`,
  heart: `<path d="M12 20s-7-4.35-9.3-8.4C.9 8.4 2.7 5.2 6 5.2c2 0 3.3 1 4 2 .7-1 2-2 4-2 3.3 0 5.1 3.2 3.3 6.4C19 15.65 12 20 12 20z"/>`,
  music: `<circle cx="6" cy="18" r="2.3"/><circle cx="16" cy="16" r="2.3"/><path d="M8.3 18V6l10-2v10"/>`,
  camera: `<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.3"/><path d="M8 7l1.4-2h5.2L16 7"/>`,
  star: `<polygon points="12,3 14.7,9.2 21.5,9.8 16.4,14.3 17.9,21 12,17.3 6.1,21 7.6,14.3 2.5,9.8 9.3,9.2"/>`,
};

const svgToUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

function buildDoodleTile({ icons = ["chat", "heart", "music", "camera", "star"], color = "#000", opacity = 0.12, size = 20, gap = 46 }) {
  const cols = icons.length;
  const w = cols * gap;
  const h = gap * 2;
  let body = "";
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const type = icons[(c + r * 2) % icons.length];
      const x = c * gap + (r === 1 ? gap / 2 : 0);
      const y = r * gap;
      body += `<g transform="translate(${x} ${y}) scale(${size / 24})">${DOODLE_PATHS[type] || ""}</g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${body}</g></svg>`;
  return { url: svgToUrl(svg), w, h };
}

function buildEmojiTile({ sticker, opacity = 0.3, size = 18, gap = 42 }) {
  const w = gap;
  const h = gap * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g opacity="${opacity}" font-size="${size}"><text x="0" y="${size}">${sticker}</text><text x="${gap / 2}" y="${gap + size}">${sticker}</text></g></svg>`;
  return { url: svgToUrl(svg), w, h };
}

/* ─── wallpaper object -> CSS `background` shorthand ───
   scale lets the picker render small previews with the same code. */
export function wallpaperBackground(wp, scale = 1) {
  if (!wp) return null;
  switch (wp.type) {
    case "color":
      return wp.value;
    case "gradient": {
      const colors = Array.isArray(wp.value) ? wp.value : [wp.value];
      return colors.length > 1 ? `linear-gradient(135deg, ${colors.join(", ")})` : colors[0];
    }
    case "image":
      return `url("${wp.value}") center / cover no-repeat`;
    case "emoji": {
      const t = buildEmojiTile({
        sticker: wp.sticker,
        opacity: wp.stickerOpacity,
        size: (wp.stickerSize || 18) * scale,
        gap: (wp.stickerGap || 42) * scale,
      });
      return `${t.url} 0 0 / ${t.w}px ${t.h}px repeat, ${wp.value}`;
    }
    case "doodle": {
      const t = buildDoodleTile({
        icons: wp.icons,
        color: wp.iconColor,
        opacity: wp.iconOpacity,
        size: (wp.iconSize || 20) * scale,
        gap: (wp.gap || 46) * scale,
      });
      return `${t.url} 0 0 / ${t.w}px ${t.h}px repeat, ${wp.value}`;
    }
    default:
      return null;
  }
}

// Spread this into the scrolling messages container's style. Returns {} for
// "no wallpaper" so the container keeps its default background. Because
// background-attachment defaults to `scroll`, the pattern stays put while
// the messages scroll over it.
export const wallpaperStyle = (wp, scale = 1) => {
  const bg = wallpaperBackground(wp, scale);
  return bg ? { background: bg } : {};
};

/* ─── Hook: load / save / clear / upload the wallpaper for one chat ─── */
export function useChatWallpaper(chatId, isGroup) {
  const [wallpaper, setWallpaper] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setWallpaper(null);
    (async () => {
      try {
        const res = await fetch(wallpaperEndpoint(chatId, isGroup), {
          credentials: "include",
          headers: authHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWallpaper(normalize(data.wallpaper));
      } catch (err) {
        console.log("[Wallpaper] load failed:", err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [chatId, isGroup]);

  // val = preset object, or null to go back to the default background
  const selectWallpaper = useCallback(async (val) => {
    setWallpaper(val);
    try {
      if (val) {
        await fetch(wallpaperEndpoint(chatId, isGroup), {
          method: "PUT",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(val),
        });
      } else {
        await fetch(wallpaperEndpoint(chatId, isGroup), {
          method: "DELETE",
          credentials: "include",
          headers: authHeaders(),
        });
      }
    } catch (err) {
      console.log("[Wallpaper] save failed:", err.message);
    }
  }, [chatId, isGroup]);

  const uploadWallpaperPhoto = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(wallpaperEndpoint(chatId, isGroup), {
        method: "PUT",
        credentials: "include",
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setWallpaper(normalize(data.wallpaper));
      else alert(data.message || "Couldn't set wallpaper. Please try again.");
    } catch (err) {
      console.log("[Wallpaper] upload failed:", err.message);
      alert("Couldn't set wallpaper. Please try again.");
    }
  }, [chatId, isGroup]);

  return { wallpaper, selectWallpaper, uploadWallpaperPhoto };
}

/* ─── Picker sheet ─── */
const ws = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, height: "60vh", maxHeight: "75vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", borderBottom: "1px solid #f0f0f0" },
  title: { fontSize: 16, fontWeight: 700, margin: 0, color: "#111" },
  closeBtn: { background: "none", border: "none", color: "#333", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
  body: { flex: 1, overflowY: "auto", padding: 16 },
  galleryBtn: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, background: "#f7f7f7", border: "1px solid #ececec", cursor: "pointer", fontWeight: 600, color: "#333", fontSize: 14, textAlign: "left" },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "#aaa", textTransform: "uppercase", margin: "18px 0 8px" },
  grid: { display: "flex", flexWrap: "wrap", gap: 14 },
  cell: { display: "flex", flexDirection: "column", alignItems: "center", width: 64, background: "none", border: "none", padding: 0, cursor: "pointer" },
  swatch: { width: 64, height: 64, borderRadius: 12, boxSizing: "border-box", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, color: "#999", marginTop: 4, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
};

const CloseSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const ImageSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

export function WallpaperSheet({ current, onClose, onSelect, onPickFile }) {
  const fileRef = useRef(null);

  const choose = (w) => {
    onSelect({
      id: w.id,
      type: w.type,
      value: w.value,
      sticker: w.sticker,
      stickerOpacity: w.stickerOpacity,
      stickerSize: w.stickerSize,
      stickerGap: w.stickerGap,
      icons: w.icons,
      iconColor: w.iconColor,
      iconOpacity: w.iconOpacity,
      iconSize: w.iconSize,
      gap: w.gap,
    });
    onClose();
  };

  return (
    <div style={ws.overlay} onClick={onClose}>
      <div style={ws.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={ws.header}>
          <p style={ws.title}>Chat Wallpaper</p>
          <button style={ws.closeBtn} onClick={onClose}><CloseSvg /></button>
        </div>

        <div style={ws.body}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) { onPickFile(file); onClose(); }
            }}
          />
          <button style={ws.galleryBtn} onClick={() => fileRef.current?.click()}>
            <ImageSvg /> Choose from gallery
          </button>

          <p style={ws.sectionLabel}>Wallpapers</p>
          <div style={ws.grid}>
            <button style={ws.cell} onClick={() => { onSelect(null); onClose(); }}>
              <div style={{ ...ws.swatch, background: "#fff", border: !current ? `3px solid ${GOLDEN}` : "1px solid #ddd", fontSize: 10, color: "#999" }}>
                Default
              </div>
            </button>

            {WALLPAPER_OPTIONS.map((w) => {
              const selected = current?.id === w.id;
              return (
                <button key={w.id} style={ws.cell} onClick={() => choose(w)}>
                  <div style={{ ...ws.swatch, ...wallpaperStyle(w, 0.55), border: selected ? `3px solid ${GOLDEN}` : "1px solid #ddd" }} />
                  <span style={ws.label}>{w.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}