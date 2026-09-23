import { useRef } from "react";
import React from "react";
import { FaPlus, FaVideo } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
const API = import.meta.env.VITE_API_URL;
function StoriesBar({ stories, setStories, openStory, userProfile, currentUserId }) {
  const navigate = useNavigate();

  return (
    <div style={bar}>

      {/* YOUR STORY — a fixed, always-plus "add story" button. It never
          changes appearance, even after a story has been added — the
          user's own story shows up as its own separate circle in the
          list below instead (same treatment as everyone else's story),
          exactly like it already looks to other users. */}
      <div style={item} onClick={() => navigate("/create-story")}>
        <div style={plusCircle}>
          <FaPlus size={22} color="#fff" />
        </div>
        <p style={name}>Your Story</p>
      </div>

      {/* STORIES LIST — includes the owner's own story (if any) as a
          normal entry, labeled "Your Story" so it's still recognizable,
          instead of being folded into the add-button above. */}
{stories.map((story, index) => {
const isLive = story.slides?.some(s => s.type === "live" || s.isLive);

// ← Belt-and-suspenders ownership check: trust story.isOwn if it's set,
// but ALSO fall back to comparing story.id against the live currentUserId
// prop. This guards against exactly the bug seen in testing — one
// account's own story showing a grey "seen" ring instead of always
// staying gold — which happens if story.isOwn was ever wrong/stale for
// any reason. Either signal being true is enough to treat it as your own.
const isOwnStory = story.isOwn || (currentUserId && story.id?.toString() === currentUserId);

// ← "Seen" (grey ring) once EVERY current slide from this author has
// been viewed by you — driven by the persisted `viewedByMe` flag that
// getAllStories() returns per story (from Story.views on the backend),
// not local-only state, so it survives a refresh. Your own story is
// NEVER shown as "seen/unseen" — it always keeps the normal gold ring.
const isSeen = !isOwnStory && story.slides?.length > 0 && story.slides.every(s => s.viewedByMe);

  const ringColor = isLive
  ? "rgb(234,182,118)" // ← explicit: live story always gold, never grey, regardless of isSeen
  : story.id === "local"
  ? "#aaa"
  : isOwnStory
  ? "rgb(234,182,118)" // ← explicit: own story always gold, never grey, regardless of isSeen
  : isSeen
  ? "#c7c7c7"
  : "rgb(234,182,118)";

  return (
    <div
      key={story._id || story.id || index}
      style={item}
      onClick={() => openStory(index)}
    >
      <div style={{
        ...ring,
        background: ringColor,
        position: "relative",
      }}>
        <img
          src={story.userProfile || story.slides?.[0]?.image}
          style={img}
          alt="story"
        />
        {/* LIVE badge */}
        {isLive && (
          <div style={liveBadge}>LIVE</div>
        )}
        {/* video badge — only for non-live */}
        {!isLive && story.slides?.[0]?.type === "video" && (
          <div style={videoBadge}>
            <FaVideo size={7} color="#fff" />
          </div>
        )}
      </div>
      <p style={name}>{isOwnStory ? "Your Story" : (story.username || "User")}</p>
    </div>
  );
})}
    </div>
  );
}

export default StoriesBar;

/* ─── styles — same as your original ────────────────────────────────────── */
const bar = {
  display: "flex",
  gap: "12px",
  padding: "12px 16px",
  overflowX: "auto",
  borderBottom: "1px solid #efefef",
  scrollbarWidth: "none",
  background: "#fff",
};
const item = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  cursor: "pointer",
  flexShrink: 0,
};
const ring = {
  padding: "3px",
  borderRadius: "50%",
  background: "rgb(234,182,118)",
};
const img = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  border: "2.5px solid white",
  display: "block",
  objectFit: "cover",
};
const name = {
  fontSize: "11px",
  color: "#262626",
  margin: 0,
  maxWidth: "70px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "center",
};
const videoBadge = {
  position: "absolute",
  bottom: 0,
  left: 0,
  width: "18px",
  height: "18px",
  background: "#e53935",
  borderRadius: "50%",
  border: "2px solid white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const liveBadge = {
  position: "absolute",
  bottom: 0,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#ff3b30",
  color: "#fff",
  fontSize: 8,
  fontWeight: 800,
  padding: "2px 5px",
  borderRadius: 4,
  border: "1.5px solid #fff",
  letterSpacing: "0.05em",
};
// ── Plain "+" circle for "Your Story" — no ring, no photo, just a solid
// golden circle with a plus. Same footprint (70x70) as the ring+avatar
// combo below so the bar doesn't jump when a story is added. This is now
// permanent — it no longer swaps to an avatar once a story exists.
const plusCircle = {
  width: "70px",
  height: "70px",
  borderRadius: "50%",
  background: "rgb(234,182,118)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2.5px solid white",
};