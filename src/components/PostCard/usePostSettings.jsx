// src/components/PostCard/usePostSettings.jsx  (WEB version)
//
// Lets the post OWNER change "hide like count / hide comment count /
// disable download / disable comments" AFTER the post is created, from the
// ⋮ menu of any post card. One shared store per postId, optimistic update
// with rollback, and live updates for everyone via the
// "postSettingsChanged" socket event.
//
// Backend: PATCH /auth/update-post-settings/:postId  (same route the app uses)

import { useEffect, useState } from "react";
import { FaEyeSlash, FaCommentSlash, FaDownload } from "react-icons/fa";
import socket from "../../sockets/sockets";

const API = import.meta.env.VITE_API_URL;
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

const KEYS = ["hideLikeCount", "hideCommentCount", "disableDownload", "disableComments"];
const store = new Map(); // postId -> partial settings override
const listeners = new Set();

function pick(src) {
  const out = {};
  KEYS.forEach((k) => {
    if (typeof src?.[k] === "boolean") out[k] = src[k];
  });
  return out;
}

export function subscribePostSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyPostSettings(postId, patch) {
  if (!postId) return;
  const id = String(postId);
  store.set(id, { ...(store.get(id) || {}), ...pick(patch) });
  listeners.forEach((l) => l(id));
}

let socketBound = false;
function bindSocket() {
  if (socketBound) return;
  socketBound = true;
  socket.on("postSettingsChanged", ({ postId, settings } = {}) => {
    if (postId && settings) applyPostSettings(postId, settings);
  });
}
bindSocket();

export async function updatePostSettings(postId, patch, current) {
  const id = String(postId);
  const rollback = {};
  Object.keys(patch).forEach((k) => {
    rollback[k] = !!current?.[k];
  });

  applyPostSettings(id, patch); // optimistic
  try {
    const res = await fetch(`${API}/auth/update-post-settings/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || "Could not update post settings.");
    if (data.settings) applyPostSettings(id, data.settings);
    return true;
  } catch (err) {
    applyPostSettings(id, rollback);
    alert(err?.message || "Couldn't update. Please try again.");
    return false;
  }
}

/**
 * usePostSettings(post, isOwner, { includeDownload })
 * Returns the live settings + buildSettingsOptions(menu) which gives the
 * extra ⋮-menu entries (owner only). Entries have `custom: true`, their own
 * `action`, a `key`, a `label`, a `color` and an `icon` element, so they work
 * with every menu renderer in the app.
 */
export default function usePostSettings(post, isOwner, { includeDownload = true } = {}) {
  const postId = post?._id;
  const [, bump] = useState(0);

  useEffect(() => {
    if (!postId) return undefined;
    return subscribePostSettings((id) => {
      if (id === String(postId)) bump((v) => v + 1);
    });
  }, [postId]);

  const override = (postId && store.get(String(postId))) || {};
  const settings = {
    hideLikeCount: override.hideLikeCount ?? !!post?.hideLikeCount,
    hideCommentCount: override.hideCommentCount ?? !!post?.hideCommentCount,
    disableDownload: override.disableDownload ?? !!post?.disableDownload,
    disableComments: override.disableComments ?? !!post?.disableComments,
  };

  const buildSettingsOptions = (menu) => {
    if (!isOwner || !postId) return [];
    const toggle = (key) => () => {
      menu?.close?.();
      updatePostSettings(postId, { [key]: !settings[key] }, settings);
    };
    const opts = [
      {
        key: "settings-hide-like",
        custom: true,
        icon: <FaEyeSlash size={13} />,
        label: settings.hideLikeCount ? "Show like count" : "Hide like count",
        color: "#333",
        action: toggle("hideLikeCount"),
      },
      {
        key: "settings-hide-comment-count",
        custom: true,
        icon: <FaEyeSlash size={13} />,
        label: settings.hideCommentCount ? "Show comment count" : "Hide comment count",
        color: "#333",
        action: toggle("hideCommentCount"),
      },
      {
        key: "settings-disable-comments",
        custom: true,
        icon: <FaCommentSlash size={13} />,
        label: settings.disableComments ? "Turn on comments" : "Turn off comments",
        color: "#333",
        action: toggle("disableComments"),
      },
    ];
    if (includeDownload) {
      opts.push({
        key: "settings-disable-download",
        custom: true,
        icon: <FaDownload size={13} />,
        label: settings.disableDownload ? "Allow download" : "Disable download",
        color: "#333",
        action: toggle("disableDownload"),
      });
    }
    return opts;
  };

  return { ...settings, buildSettingsOptions };
}