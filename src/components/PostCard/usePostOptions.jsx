// src/components/PostCard/usePostOptions.jsx   (WEB version)
//
// ONE place for every "⋯" menu action on a post / video / text post:
//   Owner:     Delete, Hide from non-followers / Show to everyone, Remove collab
//   Non-owner: Not Interested / Interested, Block, Remove myself as collaborator
//
// Used by post.jsx, video.jsx, TextPostView.jsx and the cards inside
// Home.jsx / Explore.jsx / ExploreReels.jsx / userProfileVideoPost.jsx.
// Add or change an option HERE and it changes on every page.
//
// Same API as the React Native hook (usePostOptions.js in the app), so both
// codebases stay identical in shape. Every request logs
// "[POST_OPTIONS] METHOD path -> status body" to the browser console and
// alerts on failure, so nothing fails silently.

import { useState, useCallback } from "react";
import { FaTrash, FaEyeSlash, FaBan, FaThumbsDown } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL;

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Last value set from the ⋯ menu, per post, for this browser session.
// Why: cards remount (route changes, list virtualisation, key changes) and
// profile pages pass a `post` object fetched earlier, so without this a
// remounted card re-reads stale flags and the toggle looks like it never saved.
const optionCache = new Map(); // postId -> { isHidden?, isNotInterested? }
const remember = (postId, patch) => {
  if (!postId) return;
  const key = String(postId);
  optionCache.set(key, { ...(optionCache.get(key) || {}), ...patch });
};
const recall = (postId) => optionCache.get(String(postId)) || {};

// Safe request: never throws, never loses the status, tolerates HTML error pages
// (e.g. Render cold-start 502/503) instead of crashing on res.json().
async function request(path, method, body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: authHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    console.log(`[POST_OPTIONS] ${method} ${path} -> ${res.status}`, text.slice(0, 150));
    let data = {};
    try { data = JSON.parse(text); } catch { /* non-JSON error page */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.log(`[POST_OPTIONS] ${method} ${path} ERROR`, err?.message);
    return { ok: false, status: 0, data: {}, networkError: err?.message || "Network error" };
  }
}

function failAlert(r) {
  alert(r.data?.message || (r.networkError ? `Network error: ${r.networkError}` : `Request failed (${r.status})`));
}

export default function usePostOptions({
  post,                       // the post object (p)
  isOwner,                    // boolean
  authorId,                   // author's id
  username,                   // author's username (for "Block <name>")
  noun = "post",              // "post" | "video" -> "Delete this video?"
  menu,                       // { close: () => setMenuOpen(false) } — only .close() is used
  currentUserId,              // logged-in user's id
  collaborators = [],         // current collaborators array of the post
  onCollaboratorsChange,      // (newCollaborators) => void — keep your setCollaborators here
  // Optional list-level callbacks (feeds use these to drop the card from the list):
  onBlock,                    // (authorId) => void
  onDeleted,                  // (postId) => void
  onNotInterested,            // (postId) => void   — only called when turning it ON
  onHide,                     // (postId) => void   — only called when hiding
}) {
  const postId = post?._id;

  const [isHidden, setIsHidden] = useState(
    () => recall(postId).isHidden ?? (post?.isHiddenFromNonFollowers || false)
  );
  const [isNotInterested, setIsNotInterested] = useState(
    () => recall(postId).isNotInterested ?? (post?.isNotInterested || false)
  );
  const [isBlocked, setIsBlocked] = useState(false);
  const [removedFromView, setRemovedFromView] = useState(false);

  const acceptedCollaborators = (collaborators || []).filter((c) => c.status === "accepted");
  const myCollabEntry = acceptedCollaborators.find(
    (c) => (c.user?._id ?? c.user)?.toString() === currentUserId?.toString()
  );

  // ───────────────────────── handlers ─────────────────────────

  const toggleHide = useCallback(async () => {
    const r = await request(`/auth/hide-from-non-followers/${postId}`, "PATCH");
    if (!r.ok) return failAlert(r);
    setIsHidden(!!r.data.isHidden);
    remember(postId, { isHidden: !!r.data.isHidden });
    if (r.data.isHidden && onHide) onHide(postId);
    else alert(r.data.message || (r.data.isHidden ? "Hidden from non-followers" : "Visible to everyone"));
  }, [postId, onHide]);

  const toggleNotInterested = useCallback(async () => {
    const wasOn = isNotInterested;
    const r = await request(`/auth/not-interested/${postId}`, "PATCH");
    if (!r.ok || !r.data.success) return failAlert(r);
    setIsNotInterested(!wasOn);
    remember(postId, { isNotInterested: !wasOn });
    if (!wasOn && onNotInterested) onNotInterested(postId);
    else alert(r.data.message || (wasOn ? "Marked as interested" : "Marked as not interested"));
  }, [postId, isNotInterested, onNotInterested]);

  const blockAuthor = useCallback(async () => {
    if (isBlocked) return;
    if (!window.confirm(`Block ${username}?`)) return;
    const r = await request(`/auth/block/${authorId}`, "POST");
    if (!r.ok || r.data.success === false) return failAlert(r);
    setIsBlocked(true);
    onBlock?.(authorId?.toString());
  }, [isBlocked, username, authorId, onBlock]);

  const deletePost = useCallback(async () => {
    if (!window.confirm(`Delete this ${noun}?`)) return;
    const r = await request(`/auth/delete-post/${postId}`, "DELETE");
    if (!r.ok) return failAlert(r);
    setRemovedFromView(true);
    onDeleted?.(postId);
  }, [noun, postId, onDeleted]);

  const removeCollab = useCallback(
    async (collabUser) => {
      const isLeavingSelf = collabUser?._id?.toString() === currentUserId?.toString();
      const msg = isLeavingSelf
        ? "Remove yourself as a collaborator on this post? It will no longer show on your profile."
        : `Remove ${collabUser?.username} as a collaborator? The post will no longer show on their profile.`;
      if (!window.confirm(msg)) return;
      const r = await request(`/auth/remove-collaborator/${postId}`, "PATCH", { userId: collabUser._id });
      if (!r.ok || !r.data.success) return failAlert(r);
      onCollaboratorsChange?.(r.data.collaborators ?? []);
      if (isLeavingSelf && !isOwner) {
        setRemovedFromView(true);
        onDeleted?.(postId);
      }
    },
    [postId, currentUserId, isOwner, onCollaboratorsChange, onDeleted]
  );

  // ───────────────────────── menu options ─────────────────────────
  // Shape works for every existing web menu renderer:
  //   { key, label, icon, color, danger, disabled, action }
  // action() already closes the menu and ignores any click event passed in, so
  // both `onClick={opt.action}` and `onClick={() => handleMenuAction(opt)}` work.

  const make = (key, label, fn, extra = {}) => ({
    key,
    label,
    danger: !!extra.danger,
    disabled: !!extra.disabled,
    icon: extra.icon,
    color: extra.disabled ? "#888" : extra.danger ? "#e53935" : "#222",
    action: () => {
      menu?.close?.();
      if (!extra.disabled) fn();
    },
  });

  const options = [];
  if (isOwner) {
    options.push(make("delete", "Delete", deletePost, { danger: true, icon: <FaTrash size={13} /> }));
    options.push(
      make("hide", isHidden ? "Show to everyone" : "Hide from non-followers", toggleHide, {
        icon: <FaEyeSlash size={13} />,
      })
    );
    acceptedCollaborators.forEach((c, i) => {
      const uid = c.user?._id || c.user || i;
      options.push(
        make(`remove-${uid}`, `Remove collab: ${c.user?.username ?? "Unknown"}`, () => removeCollab(c.user), {
          danger: true,
          icon: <FaBan size={13} />,
        })
      );
    });
  } else if (isBlocked) {
    options.push(make("blocked", "Blocked", () => {}, { disabled: true, icon: <FaBan size={13} /> }));
  } else {
    options.push(
      make("interest", isNotInterested ? "Interested" : "Not Interested", toggleNotInterested, {
        icon: <FaThumbsDown size={13} />,
      })
    );
    options.push(make("block", `Block ${username ?? ""}`.trim(), blockAuthor, { danger: true, icon: <FaBan size={13} /> }));
    if (myCollabEntry) {
      options.push(
        make("leave-collab", "Remove myself as collaborator", () => removeCollab(myCollabEntry.user), {
          danger: true,
          icon: <FaBan size={13} />,
        })
      );
    }
  }

  const handleMenuAction = (opt) => {
    if (opt.disabled) return;
    opt.action();
  };

  return {
    options,
    handleMenuAction,
    // state the card needs for rendering
    isHidden,
    isNotInterested,
    isBlocked,
    removedFromView,
    acceptedCollaborators,
    myCollabEntry,
    // raw setters, for cards that flip these from elsewhere (sockets, effects)
    setIsHidden,
    setIsNotInterested,
    setIsBlocked,
    setRemovedFromView,
    // raw handlers, if a card wants to call one directly
    toggleHide,
    toggleNotInterested,
    blockAuthor,
    deletePost,
    removeCollab,
  };
}