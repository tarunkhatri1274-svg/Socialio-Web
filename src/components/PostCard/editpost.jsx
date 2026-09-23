import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft, Undo2, Redo2, Crop as CropIcon, SlidersHorizontal, Wand2,
  Sparkles, RotateCcw, RotateCw, FlipHorizontal, Eye, Sun, Contrast,
  Droplets, Thermometer, CloudFog, Focus, CircleDot, Wind,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

/* react-router hooks throw if there's no <Router> above this component
   (e.g. when previewed standalone). Guarding them means this file still
   works dropped straight into your routed app AND renders in isolation. */
function useSafeRouter() {
  let navigate = null;
  let location = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigate = useNavigate();
  } catch (e) {
    navigate = null;
  }
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    location = useLocation();
  } catch (e) {
    location = null;
  }
  return { navigate, location };
}

/* ────────────────────────────────────────────────────────────────────
   DEMO IMAGES — swap these for your own `images` / `files` from router
   state. The rest of the component is written to drop straight back
   into your project: same multi-image contract, same handleNext shape.
   ──────────────────────────────────────────────────────────────────── */
const DEMO_IMAGES = [
  "https://picsum.photos/id/1018/1400/1750",
  "https://picsum.photos/id/1015/1400/1750",
  "https://picsum.photos/id/1039/1400/1750",
];

const ASPECTS = [
  { key: "orig", label: "Original", ratio: null },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:5", label: "4:5", ratio: 4 / 5 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "9:16", label: "9:16", ratio: 9 / 16 },
];

const FILTER_PRESETS = [
  { name: "Original", v: { exposure: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0 } },
  { name: "Mono",   v: { exposure: 0, contrast: 8,  saturation: -100, warmth: 0,   fade: 0 } },
  { name: "Noir",   v: { exposure: -8, contrast: 32, saturation: -100, warmth: -8,  fade: 0 } },
  { name: "Vivid",  v: { exposure: 5,  contrast: 20, saturation: 38,  warmth: 6,   fade: 0 } },
  { name: "Cinema", v: { exposure: -5, contrast: 15, saturation: -15, warmth: 15,  fade: 10 } },
  { name: "Golden", v: { exposure: 8,  contrast: 5,  saturation: 18,  warmth: 45,  fade: 5 } },
  { name: "Cool",   v: { exposure: 0,  contrast: 10, saturation: 6,   warmth: -35, fade: 0 } },
  { name: "Fade",   v: { exposure: 6,  contrast: -20, saturation: -10, warmth: 6,  fade: 45 } },
];

const defaultEdit = () => ({
  offsetX: 0, offsetY: 0, zoom: 1, rotation: 0, flip: false, aspect: "orig",
  exposure: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0,
  vignette: 0, grain: 0, sharpen: 0,
  filterName: "Original",
});

function buildFilter(e) {
  const brightness = 1 + e.exposure / 200 + e.sharpen / 600;
  const contrast = 1 + e.contrast / 150 + e.sharpen / 300 - e.fade / 250;
  const saturate = Math.max(0, 1 + e.saturation / 100);
  const warmSepia = e.warmth > 0 ? Math.min(0.5, e.warmth / 160) : 0;
  const coolHue = e.warmth < 0 ? Math.min(40, (-e.warmth / 100) * 40) : 0;
  return [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
    warmSepia ? `sepia(${warmSepia.toFixed(3)})` : "",
    coolHue ? `hue-rotate(${(180 + coolHue).toFixed(1)}deg) saturate(${saturate.toFixed(3)})` : "",
  ].filter(Boolean).join(" ");
}

const NOISE_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
  );

export default function EditImagePage({ images: propImages, files: propFiles, onBack, onNext }) {
  const { navigate, location } = useSafeRouter();
  const state = location?.state;

  // Priority: explicit props > router state (single or multi image) > demo fallback.
  const stateImages = state?.images || (state?.image ? [state.image] : null);
  const images = (propImages && propImages.length ? propImages : stateImages) || DEMO_IMAGES;
  const files = (propFiles && propFiles.length ? propFiles : state?.files) ||
    (state?.file ? [state.file] : []);
  const usingRealImages = Boolean((propImages && propImages.length) || stateImages);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTool, setActiveTool] = useState("crop");
  const [edits, setEdits] = useState(images.map(() => defaultEdit()));
  const [history, setHistory] = useState([images.map(() => defaultEdit())]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [hud, setHud] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [naturalRatios, setNaturalRatios] = useState(images.map(() => 3 / 4));

  const editsRef = useRef(edits);
  editsRef.current = edits;
  const hudTimer = useRef(null);
  const dragState = useRef(null);

  // In production, uncomment to bounce back when there's really nothing to
  // edit (no prop images, no router state). Left off here so the file still
  // renders something when previewed on its own.
  // useEffect(() => {
  //   if (!usingRealImages && navigate) navigate("/profile");
  // }, []);

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigate) return navigate(-1);
    if (typeof window !== "undefined") window.history.back();
  };

  const handleNext = () => {
    const filterStrings = edits.map(buildFilter);
    const payload = { images, files, edits, filters: filterStrings };
    if (onNext) return onNext(payload);
    if (navigate) return navigate("/create-image", { state: payload });
  };

  const cur = edits[currentIndex];

  const setField = (field, value) => {
    setEdits((prev) => {
      const n = [...prev];
      n[currentIndex] = { ...n[currentIndex], [field]: value };
      return n;
    });
  };

  const showHud = (label, value, unit = "") => {
    setHud({ label, value, unit });
    clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(null), 900);
  };

  const commit = useCallback(() => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, editsRef.current];
    });
    setHistoryIndex((i) => i + 1);
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex === 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setEdits(history[idx]);
  };
  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setEdits(history[idx]);
  };

  const resetCurrent = () => {
    setField("_noop", undefined); // no-op to keep hooks order stable
    setEdits((prev) => {
      const n = [...prev];
      n[currentIndex] = defaultEdit();
      return n;
    });
    setTimeout(commit, 0);
  };

  const applyPreset = (preset) => {
    setEdits((prev) => {
      const n = [...prev];
      n[currentIndex] = { ...n[currentIndex], ...preset.v, filterName: preset.name };
      return n;
    });
    setTimeout(commit, 0);
  };

  const rotate = (dir) => {
    setField("rotation", (cur.rotation + (dir === "r" ? 90 : -90) + 360) % 360);
    setTimeout(commit, 0);
  };
  const flip = () => {
    setField("flip", !cur.flip);
    setTimeout(commit, 0);
  };

  // ── pan handling ──────────────────────────────────────────────────
  const onFrameDown = (e) => {
    if (activeTool !== "crop") return;
    const p = e.touches ? e.touches[0] : e;
    dragState.current = { startX: p.clientX, startY: p.clientY, offX: cur.offsetX, offY: cur.offsetY };
  };
  const onFrameMove = (e) => {
    if (!dragState.current) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - dragState.current.startX;
    const dy = p.clientY - dragState.current.startY;
    setField("offsetX", dragState.current.offX + dx);
    setField("offsetY", dragState.current.offY + dy);
  };
  const onFrameUp = () => {
    if (dragState.current) commit();
    dragState.current = null;
  };

  const editedFlags = edits.map(
    (e) => JSON.stringify(e) !== JSON.stringify(defaultEdit())
  );

  const frameRatio =
    ASPECTS.find((a) => a.key === cur.aspect)?.ratio || naturalRatios[currentIndex];

  const imgTransform = `translate(${cur.offsetX}px, ${cur.offsetY}px) scale(${cur.zoom}) rotate(${cur.rotation}deg) scaleX(${cur.flip ? -1 : 1})`;

  const TOOLS = [
    { key: "crop", label: "Crop", icon: CropIcon },
    { key: "adjust", label: "Adjust", icon: SlidersHorizontal },
    { key: "filters", label: "Filters", icon: Wand2 },
    { key: "effects", label: "Effects", icon: Sparkles },
  ];

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        input[type=range] {
          -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px;
          background: linear-gradient(to right, #2FD9C4 var(--pct,50%), #2A2C30 var(--pct,50%));
          outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: #F2F2F0; border: 2px solid #2FD9C4; cursor: pointer; margin-top: -6px;
        }
        .tool-btn { transition: color .15s ease, transform .15s ease; }
        .tool-btn:active { transform: scale(0.94); }
        .filmstrip-thumb { transition: border-color .15s ease, transform .15s ease; }
        .preset-thumb { transition: transform .15s ease; }
        .preset-thumb:active { transform: scale(0.95); }
        .drawer-enter { animation: slideUp .22s cubic-bezier(.2,.8,.2,1); }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .hud-pop { animation: hudPop .18s ease-out; }
        @keyframes hudPop { from { opacity: 0; transform: translate(-50%,-4px) scale(.96) } to { opacity: 1; transform: translate(-50%,0) scale(1) } }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* TOP BAR */}
      <div style={styles.topBar}>
        <button style={styles.iconBtn} className="tool-btn" onClick={handleBack}>
          <ArrowLeft size={19} color="#F2F2F0" />
        </button>

        <div style={styles.topCenter}>
          <span style={styles.topTitle}>Edit</span>
          {images.length > 1 && (
            <span className="mono" style={styles.pageCounter}>
              {String(currentIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            style={{ ...styles.iconBtn, opacity: historyIndex === 0 ? 0.35 : 1 }}
            className="tool-btn"
            onClick={undo}
            disabled={historyIndex === 0}
          >
            <Undo2 size={18} color="#F2F2F0" />
          </button>
          <button
            style={{ ...styles.iconBtn, opacity: historyIndex >= history.length - 1 ? 0.35 : 1 }}
            className="tool-btn"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
          >
            <Redo2 size={18} color="#F2F2F0" />
          </button>
          <button style={styles.nextBtn} className="tool-btn" onClick={handleNext}>
            Next
          </button>
        </div>
      </div>

      {/* CANVAS */}
      <div style={styles.canvas}>
        <div
          style={{
            ...styles.frame,
            aspectRatio: frameRatio ? frameRatio : naturalRatios[currentIndex],
          }}
          onMouseDown={onFrameDown}
          onMouseMove={onFrameMove}
          onMouseUp={onFrameUp}
          onMouseLeave={onFrameUp}
          onTouchStart={onFrameDown}
          onTouchMove={onFrameMove}
          onTouchEnd={onFrameUp}
        >
          <img
            src={images[currentIndex]}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const r = e.target.naturalWidth / e.target.naturalHeight;
              setNaturalRatios((prev) => {
                const n = [...prev];
                n[currentIndex] = r;
                return n;
              });
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: comparing ? "none" : imgTransform,
              filter: comparing ? "none" : buildFilter(cur),
              transition: dragState.current ? "none" : "filter .12s ease",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />

          {!comparing && cur.vignette > 0 && (
            <div
              style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background: `radial-gradient(circle, transparent 35%, rgba(0,0,0,${(cur.vignette / 140).toFixed(2)}) 100%)`,
              }}
            />
          )}
          {!comparing && cur.grain > 0 && (
            <div
              style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: `url("${NOISE_SVG}")`,
                opacity: cur.grain / 160, mixBlendMode: "overlay",
              }}
            />
          )}

          {activeTool === "crop" && !comparing && (
            <div style={styles.grid}>
              {[1, 2].map((i) => <div key={"v" + i} style={{ ...styles.gridLineV, left: `${(i * 100) / 3}%` }} />)}
              {[1, 2].map((i) => <div key={"h" + i} style={{ ...styles.gridLineH, top: `${(i * 100) / 3}%` }} />)}
            </div>
          )}

          {comparing && <span style={styles.compareTag}>ORIGINAL</span>}
        </div>

        {hud && (
          <div className="mono hud-pop" style={styles.hud}>
            {hud.label} <span style={{ color: "#2FD9C4" }}>{hud.value > 0 ? "+" : ""}{hud.value}{hud.unit}</span>
          </div>
        )}

        <button
          style={styles.compareBtn}
          onMouseDown={() => setComparing(true)}
          onMouseUp={() => setComparing(false)}
          onMouseLeave={() => setComparing(false)}
          onTouchStart={() => setComparing(true)}
          onTouchEnd={() => setComparing(false)}
        >
          <Eye size={15} color="#F2F2F0" />
        </button>
      </div>

      {/* FILMSTRIP */}
      {images.length > 1 && (
        <div style={styles.filmstrip}>
          {images.map((src, i) => (
            <div
              key={i}
              className="filmstrip-thumb"
              onClick={() => setCurrentIndex(i)}
              style={{
                ...styles.filmThumb,
                borderColor: i === currentIndex ? "#2FD9C4" : "transparent",
              }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 7 }} />
              {editedFlags[i] && <div style={styles.editedDot} />}
            </div>
          ))}
        </div>
      )}

      {/* TOOL DRAWER */}
      <div key={activeTool} className="drawer-enter" style={styles.drawer}>
        {activeTool === "crop" && (
          <div>
            <div style={styles.rowBetween}>
              <div style={{ display: "flex", gap: 6 }}>
                {ASPECTS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => { setField("aspect", a.key); setTimeout(commit, 0); }}
                    style={{
                      ...styles.aspectPill,
                      background: cur.aspect === a.key ? "#2FD9C4" : "#1F2124",
                      color: cur.aspect === a.key ? "#0A0A0B" : "#C9CBD1",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
              <button style={styles.iconBtnGhost} className="tool-btn" onClick={() => rotate("l")}>
                <RotateCcw size={17} color="#F2F2F0" />
              </button>
              <button style={styles.iconBtnGhost} className="tool-btn" onClick={() => rotate("r")}>
                <RotateCw size={17} color="#F2F2F0" />
              </button>
              <button style={styles.iconBtnGhost} className="tool-btn" onClick={flip}>
                <FlipHorizontal size={17} color="#F2F2F0" />
              </button>
              <div style={{ flex: 1 }}>
                <input
                  type="range" min={1} max={3} step={0.05}
                  value={cur.zoom}
                  style={{ "--pct": `${((cur.zoom - 1) / 2) * 100}%` }}
                  onInput={(e) => { const v = Number(e.target.value); setField("zoom", v); showHud("ZOOM", v.toFixed(1), "×"); }}
                  onMouseUp={commit} onTouchEnd={commit}
                />
              </div>
            </div>
          </div>
        )}

        {activeTool === "adjust" && (
          <div style={styles.sliderGrid}>
            <SliderRow icon={Sun} label="Exposure" field="exposure" cur={cur} setField={setField} showHud={showHud} commit={commit} />
            <SliderRow icon={Contrast} label="Contrast" field="contrast" cur={cur} setField={setField} showHud={showHud} commit={commit} />
            <SliderRow icon={Droplets} label="Saturation" field="saturation" cur={cur} setField={setField} showHud={showHud} commit={commit} />
            <SliderRow icon={Thermometer} label="Warmth" field="warmth" cur={cur} setField={setField} showHud={showHud} commit={commit} />
            <SliderRow icon={CloudFog} label="Fade" field="fade" cur={cur} setField={setField} showHud={showHud} commit={commit} min={0} max={100} />
          </div>
        )}

        {activeTool === "effects" && (
          <div style={styles.sliderGrid}>
            <SliderRow icon={CircleDot} label="Vignette" field="vignette" cur={cur} setField={setField} showHud={showHud} commit={commit} min={0} max={100} />
            <SliderRow icon={Wind} label="Grain" field="grain" cur={cur} setField={setField} showHud={showHud} commit={commit} min={0} max={100} />
            <SliderRow icon={Focus} label="Sharpen" field="sharpen" cur={cur} setField={setField} showHud={showHud} commit={commit} min={0} max={100} />
          </div>
        )}

        {activeTool === "filters" && (
          <div style={styles.filterRow}>
            {FILTER_PRESETS.map((p) => (
              <div key={p.name} className="preset-thumb" onClick={() => applyPreset(p)} style={{ textAlign: "center", cursor: "pointer" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 10, overflow: "hidden",
                  border: cur.filterName === p.name ? "2px solid #2FD9C4" : "2px solid transparent",
                }}>
                  <img
                    src={images[currentIndex]}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", filter: buildFilter({ ...defaultEdit(), ...p.v }) }}
                  />
                </div>
                <p className="mono" style={{ fontSize: 10, marginTop: 5, color: cur.filterName === p.name ? "#2FD9C4" : "#8A8D93" }}>
                  {p.name.toUpperCase()}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={styles.resetRow}>
          <button className="mono" style={styles.resetBtn} onClick={resetCurrent}>Reset image</button>
        </div>
      </div>

      {/* BOTTOM TOOL DOCK */}
      <div style={styles.dock}>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = activeTool === t.key;
          return (
            <button key={t.key} className="tool-btn" style={styles.dockBtn} onClick={() => setActiveTool(t.key)}>
              <Icon size={19} color={active ? "#2FD9C4" : "#8A8D93"} />
              <span className="mono" style={{ fontSize: 10, marginTop: 4, color: active ? "#2FD9C4" : "#8A8D93", letterSpacing: 0.4 }}>
                {t.label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SliderRow({ icon: Icon, label, field, cur, setField, showHud, commit, min = -100, max = 100 }) {
  const val = cur[field];
  const pct = ((val - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={14} color="#8A8D93" />
        <span style={{ fontSize: 12.5, color: "#C9CBD1", fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ fontSize: 11.5, color: "#2FD9C4", marginLeft: "auto" }}>
          {val > 0 ? "+" : ""}{val}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={1}
        value={val}
        style={{ "--pct": `${pct}%` }}
        onInput={(e) => { const v = Number(e.target.value); setField(field, v); showHud(label.toUpperCase(), v); }}
        onMouseUp={commit} onTouchEnd={commit}
      />
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 430, margin: "0 auto", height: "100vh", background: "#0A0A0B",
    display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
    color: "#F2F2F0",
  },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 12px", background: "#0A0A0B", borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  topCenter: { display: "flex", flexDirection: "column", alignItems: "center" },
  topTitle: { fontSize: 14, fontWeight: 700, letterSpacing: 0.3 },
  pageCounter: { fontSize: 10, color: "#8A8D93", marginTop: 1, letterSpacing: 1 },
  iconBtn: {
    background: "none", border: "none", padding: 8, borderRadius: 8, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  iconBtnGhost: {
    background: "#17181B", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9,
    padding: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  },
  nextBtn: {
    background: "#F0A83C", color: "#0A0A0B", border: "none", borderRadius: 20,
    padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginLeft: 4,
  },
  canvas: {
    flex: 1, position: "relative", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#0A0A0B", overflow: "hidden", padding: 14,
  },
  frame: {
    position: "relative", maxHeight: "100%", maxWidth: "100%", width: "100%",
    overflow: "hidden", borderRadius: 4, background: "#111",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.06)", cursor: "grab",
  },
  grid: { position: "absolute", inset: 0, pointerEvents: "none" },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.35)" },
  gridLineH: { position: "absolute", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.35)" },
  compareTag: {
    position: "absolute", top: 10, left: 10, fontSize: 10, letterSpacing: 1.2,
    background: "rgba(0,0,0,0.55)", padding: "4px 8px", borderRadius: 5, fontWeight: 700,
  },
  hud: {
    position: "absolute", top: 24, left: "50%", background: "rgba(10,10,11,0.85)",
    border: "1px solid rgba(255,255,255,0.1)", padding: "6px 14px", borderRadius: 20,
    fontSize: 12, letterSpacing: 0.5, fontWeight: 600, whiteSpace: "nowrap",
  },
  compareBtn: {
    position: "absolute", bottom: 16, right: 16, width: 34, height: 34, borderRadius: "50%",
    background: "rgba(23,24,27,0.9)", border: "1px solid rgba(255,255,255,0.12)",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  },
  filmstrip: {
    display: "flex", gap: 8, padding: "8px 12px", overflowX: "auto", background: "#0A0A0B",
  },
  filmThumb: {
    position: "relative", width: 44, height: 44, borderRadius: 8, flexShrink: 0,
    border: "2px solid transparent", cursor: "pointer",
  },
  editedDot: {
    position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%",
    background: "#2FD9C4", border: "2px solid #0A0A0B",
  },
  drawer: {
    background: "#111214", borderTop: "1px solid rgba(255,255,255,0.07)",
    padding: "16px 16px 8px", minHeight: 128,
  },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  aspectPill: {
    border: "none", borderRadius: 16, padding: "6px 12px", fontSize: 11.5, fontWeight: 700,
    cursor: "pointer", letterSpacing: 0.3,
  },
  sliderGrid: { paddingTop: 2 },
  filterRow: { display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 },
  resetRow: { display: "flex", justifyContent: "flex-end", marginTop: 4 },
  resetBtn: {
    background: "none", border: "none", color: "#8A8D93", fontSize: 10.5,
    letterSpacing: 0.6, cursor: "pointer", padding: "6px 2px",
  },
  dock: {
    display: "flex", justifyContent: "space-around", background: "#0A0A0B",
    borderTop: "1px solid rgba(255,255,255,0.07)", padding: "10px 0 14px",
  },
  dockBtn: {
    background: "none", border: "none", cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
};