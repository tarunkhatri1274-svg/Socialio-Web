import React from "react";
import { useFollowAction } from "./useFollowAction.jsx";

// ─────────────────────────────────────────────────────────────────────────
// <FollowButton /> — drop this anywhere instead of hand-rolling a button +
// local followState. It reads/writes the SAME global store as every other
// instance of this component, so following someone on Home immediately
// shows "Following" on Explore, VideoPage, their profile, etc. — no
// refetch, no page reload required.
//
// Usage:
//   <FollowButton
//     authorId={post.author._id}
//     isPrivate={post.author.isPrivate}
//     isOwner={isOwner}
//     isBlocked={isBlocked}
//     onChange={(id, followed) => { ...optional side effect... }}
//     variant="pill" // "pill" (default, light bg) | "outline" (dark video overlay style)
//   />
// ─────────────────────────────────────────────────────────────────────────
export default function FollowButton({
  authorId,
  isPrivate,
  isOwner,
  isBlocked,
  onChange,
  variant = "pill",
  style: extraStyle = {},
}) {
  const { status, label, busy, handleFollowBtn } = useFollowAction(authorId, {
    isPrivate,
    onChange,
  });

  if (isOwner || isBlocked || !authorId) return null;

  const pillStyle = {
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
    border: status !== "none" ? "1px solid #ddd" : "none",
    background: status !== "none" ? "#f0f0f0" : "#0095f6",
    color: status !== "none" ? "#333" : "#fff",
    opacity: busy ? 0.7 : 1,
    transition: "opacity 0.15s",
  };

  const outlineStyle = {
    border: "1px solid #fff",
    color: "#fff",
    background: status !== "none" ? "rgba(255,255,255,0.15)" : "transparent",
    padding: "7px 18px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
  };

  const baseStyle = variant === "outline" ? outlineStyle : pillStyle;

  return (
    <button onClick={handleFollowBtn} disabled={busy} style={{ ...baseStyle, ...extraStyle }}>
      {busy ? "…" : label}
    </button>
  );
}