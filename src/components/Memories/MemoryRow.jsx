import React from "react";

// ── Horizontal row of memory-group ("Highlight") bubbles, shown below
// Edit Profile on your own profile (with a leading "+ Add memory"
// button that creates a NEW group) and below the Follow/Message/Block
// row on other profiles (view-only). Each bubble opens that group's
// MemoryViewer, which itself fetches and pages through all items inside
// that one group.
function MemoriesRow({ groups, onOpenGroup, onAdd, showAdd }) {
  if (!showAdd && (!groups || groups.length === 0)) return null;

  return (
    <div style={wrapStyle}>
      {showAdd && (
        <div style={itemStyle} onClick={onAdd}>
          <div style={addCircleStyle}>
            <span style={{ fontSize: 26, lineHeight: 1, color: "#333" }}>+</span>
          </div>
          <span style={labelStyle}>Add memory</span>
        </div>
      )}
      {groups.map((g) => (
        <div key={g._id} style={itemStyle} onClick={() => onOpenGroup(g._id)}>
          <div style={ringStyle}>
            <div style={ringInnerStyle}>
              {g.coverType === "video"
                ? <video src={g.coverUrl} style={thumbStyle} muted />
                : <img src={g.coverUrl} alt={g.name} style={thumbStyle} />
              }
            </div>
            {g.itemsCount > 1 && (
              <span style={countBadgeStyle}>{g.itemsCount}</span>
            )}
          </div>
          <span style={labelStyle}>{g.name}</span>
        </div>
      ))}
    </div>
  );
}

export default MemoriesRow;

const wrapStyle       = { display: "flex", gap: 16, overflowX: "auto", padding: "4px 18px 6px", scrollbarWidth: "none", msOverflowStyle: "none" };
const itemStyle        = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, width: 66 };
const addCircleStyle   = { width: 60, height: 60, borderRadius: "50%", border: "1.5px dashed #ccc", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "center" };
// ← Ring color changed from the rainbow Instagram gradient to a solid
// gold — rgb(234,182,118) — to match the story ring used everywhere
// else in the app (Profilepage's own-story ring, UserProfileView's
// unseen-story ring).
const ringStyle         = { position: "relative", width: 62, height: 62, borderRadius: "50%", background: "rgb(234,182,118)", display: "flex", alignItems: "center", justifyContent: "center", padding: 2 };
const ringInnerStyle    = { width: "100%", height: "100%", borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 2, overflow: "hidden" };
const thumbStyle         = { width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" };
const labelStyle         = { fontSize: 11, color: "#444", fontWeight: 500, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" };
const countBadgeStyle    = { position: "absolute", bottom: -2, right: -2, background: "#111", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 6px", border: "2px solid #fff" };