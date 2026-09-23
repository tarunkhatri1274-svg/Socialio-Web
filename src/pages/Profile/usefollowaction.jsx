
import { useState, useCallback, useEffect } from "react";
import socket from "../../sockets/sockets.jsx";
import { useFollowStore } from "./usefollowState.jsx";

const API = import.meta.env.VITE_API_URL;
const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

// ─────────────────────────────────────────────────────────────────────────
// useFollowAction — the ONE place that knows how to follow/unfollow/cancel
// a request and keep the global store + backend in sync. Every card-style
// component (PostCard, video.jsx, ExploreReels, TextPostView,
// UserProfileVideoPost, UserProfileView, Home's feed cards) should call
// this instead of hand-rolling its own fetch + setFollowState logic.
//
// Why this fixes cross-page desync:
// Previously each file independently decided what "Follow" should do,
// and only some of them wrote into the shared store. A "Requested" state
// in particular never made it into the store at all in most files, so a
// different page rendering the SAME author would show "Follow" again.
// Centralizing means every consumer reads/writes the identical status.
// ─────────────────────────────────────────────────────────────────────────
export function useFollowAction(authorId, { isPrivate, onChange } = {}) {
  const { statusOf, follow, unfollow, requestFollow, cancelRequest } = useFollowStore();
  const [busy, setBusy] = useState(false);
  const status = statusOf(authorId); // 'following' | 'requested' | 'none'

  const handleFollowBtn = useCallback(async () => {
    if (!authorId || busy) return;
    setBusy(true);
    const current = statusOf(authorId);

    try {
      if (current === "none") {
        const res = await fetch(`${API}/auth/follow/${authorId}`, {
          method: "POST",
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!data.success) return;

        if (isPrivate || data.requested) {
          requestFollow(authorId);
        } else {
          follow(authorId);
          onChange?.(authorId, true);
        }
      } else if (current === "requested") {
        const res = await fetch(`${API}/auth/cancel-follow/${authorId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!data.success) return;
        cancelRequest(authorId);
      } else if (current === "following") {
        if (!window.confirm("Unfollow this user?")) return;
        const res = await fetch(`${API}/auth/unfollow/${authorId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        const data = await res.json();
        if (!data.success) return;
        unfollow(authorId);
        onChange?.(authorId, false);
        socket.emit("unfollowUser", { toUserId: authorId });
      }
    } catch (err) {
      console.error("Follow action failed:", err);
    } finally {
      setBusy(false);
    }
  }, [authorId, busy, isPrivate, onChange, statusOf, follow, unfollow, requestFollow, cancelRequest]);

  // ── live socket sync: another tab/page accepted/rejected a pending
  // request, or someone followed/unfollowed this author while we have
  // them rendered. Keeps the store correct even without a refetch.
  useEffect(() => {
    if (!authorId) return;

    const onFollowAccepted = ({ from, toUserId }) => {
      if (toUserId === authorId) follow(authorId);
    };
const onFollowRejected = ({ from }) => {
  if (from === authorId && statusOf(authorId) === "requested") cancelRequest(authorId);
};
    const onUserFollowed = ({ fromUserId, toUserId }) => {
      // someone else followed `authorId` — doesn't affect MY status, ignore
    };

    socket.on("followAccepted", onFollowAccepted);
    socket.on("followRejected", onFollowRejected);
    socket.on("userFollowed", onUserFollowed);

    return () => {
      socket.off("followAccepted", onFollowAccepted);
      socket.off("followRejected", onFollowRejected);
      socket.off("userFollowed", onUserFollowed);
    };
  }, [authorId, follow, cancelRequest, statusOf]);

  const label =
    status === "following" ? "Following" : status === "requested" ? "Requested" : isPrivate ? "Follow" : "Follow";

  return { status, label, busy, handleFollowBtn };
}