import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Global follow store.
//
// UPGRADED from a flat boolean "am I following this id" set to a 3-state
// status map: 'following' | 'requested' | 'none'. This is what actually
// fixes cross-page desync — previously every page (PostCard, video.jsx,
// TextPostView, UserProfileView, Home) kept its OWN local `followState`
// string for the "requested" case (private accounts) and only used this
// store for the boolean "following" case. That's why a follow request
// sent from one page never showed as "Requested" on another page showing
// the same author — "requested" never touched the shared store at all.
//
// BACKWARD COMPATIBLE: followingIds / isFollowing / follow / unfollow /
// addFollowing / removeFollowing / getFollowingIds / getIsFollowing /
// initFollowStore all still exist with the same signatures, so any file
// not yet migrated to the new status API keeps working unchanged.
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "followingIds";       // legacy key — array of "following" ids only
const STATUS_KEY  = "followStatusMap";    // new key — { id: 'following'|'requested' }

function loadIdsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadStatusFromStorage() {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveIdsToStorage(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
}

function saveStatusToStorage(statusMap) {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(statusMap)); } catch {}
}

// `globalStatusMap` is the source of truth. `globalFollowingIds` is always
// derived from it (every id whose status === 'following') purely for
// backward compatibility with old consumers.
let globalStatusMap = loadStatusFromStorage();
let globalFollowingIds = loadIdsFromStorage();
let listeners = [];

// Reconcile on first load: anything in the legacy ids-array but missing
// from the status map (e.g. user upgraded from the old store) gets
// promoted to 'following' in the status map too.
(function reconcileOnLoad() {
  let changed = false;
  for (const id of globalFollowingIds) {
    if (globalStatusMap[id] !== "following") {
      globalStatusMap[id] = "following";
      changed = true;
    }
  }
  if (changed) saveStatusToStorage(globalStatusMap);
})();

function deriveIdsFromStatus() {
  return Object.keys(globalStatusMap).filter(
    (id) => globalStatusMap[id] === "following"
  );
}

function persistAndNotify() {
  globalFollowingIds = deriveIdsFromStatus();
  saveStatusToStorage(globalStatusMap);
  saveIdsToStorage(globalFollowingIds);
  listeners.forEach((fn) => fn());
}

// ── Bulk init (e.g. after fetching /auth/profile) ──────────────────────
// Accepts either a plain array of "following" ids (legacy call shape) or
// a status map { id: status }. Anything not passed defaults to 'none'
// implicitly (i.e. just isn't in the map).
export function initFollowStore(idsOrStatusMap) {
  if (Array.isArray(idsOrStatusMap)) {
    const next = {};
    idsOrStatusMap.forEach((id) => { next[id.toString()] = "following"; });
    globalStatusMap = next;
  } else if (idsOrStatusMap && typeof idsOrStatusMap === "object") {
    const next = {};
    Object.entries(idsOrStatusMap).forEach(([id, status]) => {
      if (status === "following" || status === "requested") next[id] = status;
    });
    globalStatusMap = next;
  }
  persistAndNotify();
}

// ── Status read/write ───────────────────────────────────────────────────
export function getFollowStatus(id) {
  return globalStatusMap[id?.toString()] || "none";
}

export function setFollowStatus(id, status) {
  const s = id?.toString();
  if (!s) return;
  if (status === "none") {
    delete globalStatusMap[s];
  } else {
    globalStatusMap[s] = status;
  }
  persistAndNotify();
}

// ── Legacy boolean API (kept for old call sites) ───────────────────────
export function addFollowing(id) {
  setFollowStatus(id, "following");
}

export function removeFollowing(id) {
  setFollowStatus(id, "none");
}

export function getFollowingIds() {
  return [...globalFollowingIds];
}

export function getIsFollowing(id) {
  return getFollowStatus(id) === "following";
}

// ── New explicit helpers for the requested/private-account flow ────────
export function requestFollow(id) {
  setFollowStatus(id, "requested");
}

export function cancelRequest(id) {
  setFollowStatus(id, "none");
}

// ── Hook ─────────────────────────────────────────────────────────────────
export function useFollowStore() {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const listener = () => forceTick((t) => t + 1);
    listeners.push(listener);

    // cross-tab sync — either key changing means re-sync from storage
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY && e.key !== STATUS_KEY) return;
      globalStatusMap = loadStatusFromStorage();
      globalFollowingIds = deriveIdsFromStatus();
      forceTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners = listeners.filter((fn) => fn !== listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const follow = useCallback((id) => setFollowStatus(id, "following"), []);
  const unfollow = useCallback((id) => setFollowStatus(id, "none"), []);
  const requestFollowCb = useCallback((id) => setFollowStatus(id, "requested"), []);
  const cancelRequestCb = useCallback((id) => setFollowStatus(id, "none"), []);
  const isFollowing = useCallback((id) => getFollowStatus(id) === "following", []);
  const isRequested = useCallback((id) => getFollowStatus(id) === "requested", []);
  const statusOf = useCallback((id) => getFollowStatus(id), []);

  return {
    // legacy shape — unchanged for old consumers
    followingIds: [...globalFollowingIds],
    follow,
    unfollow,
    isFollowing,
    // new 3-state shape
    statusMap: { ...globalStatusMap },
    statusOf,
    isRequested,
    requestFollow: requestFollowCb,
    cancelRequest: cancelRequestCb,
  };
}