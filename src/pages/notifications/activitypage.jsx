import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar/navbar.jsx";
import socket from "../../sockets/sockets.jsx";
import { NotifRowSkeleton } from "../../components/Skeleton/Skeleton.jsx";
// ← NEW — StoryViewer is rendered directly on this page now (see
// handleOpenStory/directStory below) instead of handing off through
// Home.jsx, so a story notification opens immediately without a visible
// stop on the home page first.
import StoryViewer from "../../components/StoryBar/storyviewer";
import {
  SHEET_FOR_POST_NOTIF,
  SHEET_FOR_MEMORY_NOTIF,
  stashPostSheet,
  stashMemorySheet,
  stashStoryViewers,
} from "../../utils/notificationHandoff.js";
const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const getToken = () => localStorage.getItem("token");

// ← NEW — decode the JWT to know our own id, same pattern as
// getMyId() in UserProfileView.jsx. Needed so handleOpenMemory (below)
// can route straight to /profile instead of /profile/:id when the
// memory in question is our own.
const getMyId = () => {
  try {
    const t = getToken();
    if (!t) return null;
    return JSON.parse(atob(t.split(".")[1])).id;
  } catch { return null; }
};

const fetchNotifications = async (page = 1) => {
  const res = await fetch(`${API}/auth/notifications?page=${page}&limit=20`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
};

const markRead = async (notificationId) => {
  await fetch(`${API}/auth/notifications/${notificationId}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
};

const deleteNotificationApi = async (notificationId) => {
  await fetch(`${API}/auth/notifications/${notificationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
};

const acceptFollowRequestApi = async (requesterId) => {
  await fetch(`${API}/auth/follow/accept/${requesterId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
};

const rejectFollowRequestApi = async (requesterId) => {
  await fetch(`${API}/auth/follow/reject/${requesterId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
  });
};

// ← accept/decline a collaborator invite (the postId lives on the
// notification itself, see notification.model.js's `post` field).
const respondToCollabApi = async (postId, accept) => {
  const res = await fetch(`${API}/auth/collaborator-respond/${postId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ accept }),
  });
  return res.json();
};

const TYPE_DISPLAY = {
  follow:          { icon: "follow" },
  follow_request:  { icon: "request" },
  follow_accepted: { icon: "follow" },
  like_post:       { icon: "like" },
  like_comment:    { icon: "like" },
  like_reply:      { icon: "like" },
  story_like:      { icon: "like" },
  comment:         { icon: "comment" },
  reply:           { icon: "comment" },
  message:         { icon: "message" },
  collab_request:  { icon: "collab" },
  story_view:      { icon: "story" },
  story_live:      { icon: "story" },
  // ← NEW — memory ("Highlight") activity reuses the same like/comment
  // icon glyphs, same as post activity does.
  memory_like:         { icon: "like" },
  memory_comment:      { icon: "comment" },
  memory_reply:        { icon: "comment" },
  memory_like_comment: { icon: "like" },
  memory_like_reply:   { icon: "like" },
};

const ICON = {
  follow: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  request: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  like: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1.5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  comment: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  message: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  collab: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  story: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  ),
};

const ICON_COLOR = {
  follow:  "#0095f6",
  request: "#8e44ad",
  like:    "#e74c3c",
  comment: "#f39c12",
  message: "#16a085",
  collab:  "#2980b9",
  story:   "#d35400",
};

const timeAgo = (dateStr) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
};

// ─────────────────────────────────────────────────────────────────────────
// Where a tap on a notification card should go. Falls back through a few
// signals since not every notification type carries the same fields:
//   - post-shaped activity (comments/replies/likes/collab) → the post
//     itself, preferring the backend's own `link` when present
//   - identity-shaped activity (follow/story) → the sender's profile
//   - message → the conversation
// Returns null when there's nowhere sensible to send the user (e.g. a
// pending follow_request card, which already has its own Accept/Decline
// actions instead of a navigation target).
//
// NOTE: story_view / story_like / story_live are handled separately by
// handleOpenStory, and memory_like / memory_comment / memory_reply /
// memory_like_comment are handled separately by handleOpenMemory (see
// below) — both need extra logic (liveness check / picking the right
// item inside a group) that a plain route can't express, so this
// function intentionally does NOT return a target for those types.
// ─────────────────────────────────────────────────────────────────────────
const POSTTYPE_TO_ROUTE = {
  image:    (id) => `/post/${id}`,
  carousel: (id) => `/post/${id}`,
  video:    (id) => `/profile-reel/${id}`,
  text:     (id) => `/text-post/${id}`,
};

const getNotificationTarget = (n) => {
  const postId = n.post?._id || n.post || n.postId;
  const senderId = n.sender?._id || n.sender;

  switch (n.type) {
    case "comment":
    case "reply":
    case "like_post":
    case "like_comment":
    case "like_reply":
    case "new_post":          // ← NEW — "shared a new post/reel/text post" now opens the post
    case "collab_request": {
      if (!postId) return null;
      const routeFor = POSTTYPE_TO_ROUTE[n.postType] || POSTTYPE_TO_ROUTE.image;
      return routeFor(postId);
    }
    case "follow":
    case "follow_accepted":
      return senderId ? `/profile/${senderId}` : null;
    case "message":
      return n.chatId ? `/messages/${n.chatId}` : "/messages";
    default:
      return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Notification sound — synthesized with the Web Audio API rather than an
// audio file, so there's no asset to host/copy and no licensing concern.
// Plays a quick two-tone "ding" (a common notification-sound shape: a
// higher note immediately followed by a slightly lower one).
//
// The AudioContext is created lazily on first use, not at module load,
// because browsers block audio until triggered by a real user gesture —
// creating it eagerly would just throw or sit suspended until interaction.
// ─────────────────────────────────────────────────────────────────────────
let audioCtx = null;

const playNotificationSound = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const playTone = (freq, startTime, duration) => {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = freq;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      oscillator.connect(gain);
      gain.connect(audioCtx.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioCtx.currentTime;
    playTone(880, now, 0.12);
    playTone(660, now + 0.1, 0.15);
  } catch (err) {
    console.error("Notification sound failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Same per-category mute gate used in sockets.jsx / navbar.jsx — kept as
// a local copy for the same reason (avoid coupling this page's logic to
// those modules' internals over a ~15-line duplication).
// ─────────────────────────────────────────────────────────────────────────
const NOTIF_TYPE_TO_SETTING_KEY = {
  message: "message",
  story_view: "story",
  story_like: "story",
  story_live: "story",
  collab_request: "post",
  memory_like: "post",
  memory_comment: "post",
  memory_reply: "post",
  memory_like_comment: "post",
  memory_like_reply: "post",
};
const POSTTYPE_TO_SETTING_KEY = { image: "post", carousel: "post", video: "reel", text: "text" };
const POST_DEPENDENT_TYPES = new Set(["comment", "reply", "like_post", "like_comment", "like_reply", "new_post"]);

const isNotifTypeAllowed = (type, postType) => {
  try {
    let settingKey = NOTIF_TYPE_TO_SETTING_KEY[type];
    if (!settingKey && POST_DEPENDENT_TYPES.has(type)) {
      settingKey = POSTTYPE_TO_SETTING_KEY[postType] || "post";
    }
    if (!settingKey) return true;
    const raw = localStorage.getItem("notifSettings");
    if (!raw) return true;
    const settings = JSON.parse(raw);
    return settings[settingKey] !== false;
  } catch {
    return true;
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Post previews on notification cards (Instagram-style).
//   - image / video / carousel posts → small square thumbnail on the right
//     (videos show a ▶ badge, using the first frame as the picture)
//   - text posts → the text under the notification message, with the
//     post's images in a rounded strip below it (mini TextPostView)
// Needs the backend to populate `post` with `media postType text` — see
// notification.controller.js / notification.helper.js.
// ─────────────────────────────────────────────────────────────────────────
const THUMB_TYPES = new Set([
  "like_post", "like_comment", "like_reply",
  "comment", "reply", "collab_request", "new_post",
]);

const isTextPostWithText = (post) =>
  !!post && typeof post === "object" && post.postType === "text" && !!post.text?.trim();

// Renders one media item as a thumbnail using the stored url as-is (no URL
// tricks). Images use <img>; videos use a muted <video> that only loads
// metadata, and "#t=0.1" makes the browser show the first frame.
function MediaThumb({ m }) {
  if (!m?.url) return null;
  if (m.type === "video") {
    return (
      <video
        src={`${m.url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        style={s.thumbImg}
      />
    );
  }
  return <img src={m.url} alt="" loading="lazy" style={s.thumbImg} />;
}

// image / video posts → small square on the right (text posts use
// TextPostPreview instead, so this returns null for them)
function PostThumb({ post }) {
  if (!post || typeof post !== "object") return null;
  if (isTextPostWithText(post)) return null;

  const first = post.media?.[0];
  if (!first?.url) return null;

  return (
    <div style={s.thumbWrap}>
      <MediaThumb m={first} />
      {first.type === "video" && <span style={s.thumbPlay}>▶</span>}
    </div>
  );
}

// text post → text first, images underneath (like TextPostView)
function TextPostPreview({ post }) {
  if (!isTextPostWithText(post)) return null;

  const text = post.text.trim();
  const media = post.media || [];
  const shown = media.slice(0, 2);
  const extra = media.length - shown.length;

  return (
    <div style={s.tpCard}>
      <p style={s.tpText}>
        {text.length > 90 ? text.slice(0, 90).trimEnd() + "..." : text}
      </p>

      {shown.length > 0 && (
        <div style={s.tpStrip}>
          {shown.map((m, i) => {
            if (!m?.url) return null;
            return (
              <div
                key={i}
                style={{ ...s.tpImgBox, width: shown.length === 1 ? "100%" : "calc(50% - 3px)" }}
              >
                <MediaThumb m={m} />
                {i === shown.length - 1 && extra > 0 && (
                  <span style={s.tpMore}>+{extra}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  // ← NEW — holds the single-author "reel" to hand StoryViewer when a
  // story notification is tapped, so it renders right here in an
  // overlay instead of routing through Home.jsx first.
  const [directStory, setDirectStory] = useState(null);

  const loadPage = useCallback(async (pageNum) => {
    try {
      const data = await fetchNotifications(pageNum);
      setNotifications((prev) =>
        pageNum === 1 ? data.notifications : [...prev, ...data.notifications]
      );
      setHasMore(data.hasMore);
      setPage(pageNum);
      setError(null);
    } catch (err) {
      setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    const handleNewNotification = (notif) => {
      // ← NEW — skip if this notification is already in the list (e.g. it
      // arrived over the socket AND was fetched on page load). Prevents the
      // duplicate-key warning and double cards.
      const addIfNew = (prev) =>
        prev.some((x) => x._id === notif._id) ? prev : [notif, ...prev];

      if (!isNotifTypeAllowed(notif?.type, notif?.postType)) {
        setNotifications(addIfNew);
        return;
      }
      setNotifications(addIfNew);
      playNotificationSound();
    };

    const handleCollabInviteResolved = ({ postId }) => {
      setNotifications((prev) =>
        prev.filter(
          (n) =>
            !(
              n.type === "collab_request" &&
              (n.post?._id || n.post)?.toString() === postId?.toString() &&
              n.message?.toLowerCase().includes("invited you")
            )
        )
      );
    };

    const handleFollowRequestResolved = ({ requesterId }) => {
      setNotifications((prev) =>
        prev.filter(
          (n) =>
            !(
              n.type === "follow_request" &&
              (n.sender?._id || n.sender)?.toString() === requesterId?.toString()
            )
        )
      );
    };

    const handleNotificationsExpired = ({ notificationIds }) => {
      if (!Array.isArray(notificationIds) || notificationIds.length === 0) return;
      const expiredSet = new Set(notificationIds.map((id) => id.toString()));
      setNotifications((prev) => prev.filter((n) => !expiredSet.has(n._id.toString())));
    };

    socket.on("receiveNotification", handleNewNotification);
    socket.on("collabInviteResolved", handleCollabInviteResolved);
    socket.on("followRequestResolved", handleFollowRequestResolved);
    socket.on("notificationsExpired", handleNotificationsExpired);

    return () => {
      socket.off("receiveNotification", handleNewNotification);
      socket.off("collabInviteResolved", handleCollabInviteResolved);
      socket.off("followRequestResolved", handleFollowRequestResolved);
      socket.off("notificationsExpired", handleNotificationsExpired);
    };
  }, []);

  useEffect(() => {
    if (!loading && notifications.some((n) => !n.isRead)) {
      notifications
        .filter((n) => !n.isRead)
        .forEach((n) => markRead(n._id).catch(() => {}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleAccept = async (notif) => {
    if (pendingIds.has(notif._id)) return;
    setPendingIds((prev) => new Set(prev).add(notif._id));
    try {
      await acceptFollowRequestApi(notif.sender._id);
      setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
    } catch {
      // leave the card in place so the user can retry
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(notif._id); return next; });
    }
  };

  const handleReject = async (notif) => {
    if (pendingIds.has(notif._id)) return;
    setPendingIds((prev) => new Set(prev).add(notif._id));
    try {
      await rejectFollowRequestApi(notif.sender._id);
      setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
    } catch {
      // leave the card in place so the user can retry
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(notif._id); return next; });
    }
  };

  const handleCollabRespond = async (notif, accept) => {
    if (pendingIds.has(notif._id)) return;
    setPendingIds((prev) => new Set(prev).add(notif._id));
    try {
      const postId = notif.post?._id || notif.post;
      const data = await respondToCollabApi(postId, accept);
      if (data?.success) {
        setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
      }
    } catch {
      // leave the card in place so the user can retry
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(notif._id); return next; });
    }
  };

  const handleDismiss = async (notif) => {
    setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
    try {
      await deleteNotificationApi(notif._id);
    } catch {
      // silent — worst case it reappears on next reload
    }
  };

  const handleOpen = (notif) => {
    const target = getNotificationTarget(notif);
    if (!target) return;

    // ← NEW — tell the destination screen (Post / TextPostView /
    // UserProfileVideoPost) which sheet to pop open once it mounts, and
    // for comment/reply notifications, which exact comment/reply to
    // scroll to + highlight. See consumePostSheet() on that end.
    const sheet = SHEET_FOR_POST_NOTIF[notif.type];
    if (sheet) {
      const postId = notif.post?._id || notif.post || notif.postId;
    // FIXED — the Notification schema stores these as `comment`/`reply`
    // (see notification.model.js), not `commentId`/`replyId` — those are
    // only createNotification()'s own parameter names on the way in.
      stashPostSheet({
        postId,
        sheet,
        commentId: notif.comment || null,
        replyId: notif.reply || null,
      });
    }

    navigate(target);
  };

  const handleOpenStory = async (n) => {
    if (pendingIds.has(n._id)) return;
    const senderId = n.sender?._id || n.sender;
    // FIXED — for story_like, `sender` is the person who liked the story,
    // not its owner (only story_view/story_live use sender as the poster).
    // `author` (the schema field createNotification saves authorId into —
    // added on the backend for story_like) always points at whoever's
    // stories we actually need to fetch — falls back to senderId for the
    // types where that already IS the owner.
    const targetUserId = n.author?._id || n.author || senderId;
    if (!targetUserId) return;

    const storyId    = n.storyId || n.story?._id || n.story;
    const isLiveType = n.type === "story_live";

    setPendingIds((prev) => new Set(prev).add(n._id));
    try {
      const res  = await fetch(`${API}/stories/get-user-stories/${targetUserId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();

      if (res.status === 403) {
        alert(data.message || "You can't view this story.");
        return;
      }

      const stories = data.success ? data.stories : [];
      const match = storyId
        ? stories.find((s) => s._id === storyId)
        : stories.find((s) => (isLiveType ? s.storyType === "live" : s.storyType !== "live"));

      if (!match) {
        alert(isLiveType ? "This live story has ended." : "This story is no longer available.");
        return;
      }
      if (isLiveType && !match.liveRoomId) {
        alert("This live story has ended.");
        return;
      }

      // ← CHANGED — used to stash the target userId to sessionStorage and
      // navigate("/home"), letting Home.jsx pick it up and open
      // StoryViewer over the feed. That meant a visible stop on the home
      // page before the story appeared. Now we build the same
      // single-author "reel" shape Home.jsx would have built (see its
      // fetchStories grouping) directly from data already fetched above,
      // and open StoryViewer right here — no navigation at all.
      // ← FIX — this preferred n.author/n.sender over match.author, but
      // for story_like, n.sender is the person who LIKED the story (not
      // its owner), and n.author often isn't populated into a full user
      // object by the backend (just a raw id) — so this was silently
      // falling through to n.sender and showing the LIKER's name/avatar
      // in the header while the actual story/viewers data underneath
      // was correctly the real owner's. match.author comes straight off
      // the story doc we just fetched FOR targetUserId (the real
      // owner), so it's the one source that's always right — check it
      // first, and only fall back to the notification's own fields if
      // the backend somehow didn't populate it.
      const authorObj =
        match.author ||
        (n.author && typeof n.author === "object" && n.author) ||
        (n.sender && typeof n.sender === "object" && n.sender) ||
        {};
      const authorIdStr = (authorObj._id || targetUserId)?.toString();
      const myId = getMyId();

      const slides = stories.map((s) => ({
        id: s._id,
        image: s.media?.url || "",
        type: s.media?.type || s.storyType,
        likes: s.likesCount || 0,
        isLive: s.storyType === "live",
        liveRoomId: s.liveRoomId || null,
        authorId: authorIdStr,
        isHiddenFromNonFollowers: s.isHiddenFromNonFollowers || false,
        viewedByMe: !!s.viewedByMe,
        textOverlays: s.textOverlays || [],
        mentions: s.mentions || [],
        repostAttribution: s.repostAttribution || null,
      }));

      // ← story_like should land on the story AND pop its Viewers sheet
      // open (the viewer has no separate "who liked" list — the sheet
      // itself now shows a heart next to anyone who also liked it).
      // story_view is a "new story posted" broadcast, not an interaction
      // on your own story, so it doesn't get this.
      if (n.type === "story_like") {
        stashStoryViewers();
      }

      setDirectStory({
        stories: [{
          id: authorIdStr,
          username: authorObj.username || "User",
          userProfile: authorObj.profilePic || "",
          isOwn: authorIdStr === myId?.toString(),
          slides,
        }],
        initialStoryId: match._id,
      });
    } catch {
      alert("Couldn't open this story right now.");
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(n._id); return next; });
    }
  };

  // ← NEW — open the target for a memory_like / memory_comment /
  // memory_reply / memory_like_comment card. MemoryViewer is an overlay,
  // not a route, so — same trick as handleOpenStory above — we hand off
  // the group/item we want opened via sessionStorage and navigate to the
  // owning profile; Profilepage.jsx (own memories) and
  // UserProfileView.jsx (someone else's) both check for this handoff on
  // mount and open MemoryViewer at exactly that slide.
  const handleOpenMemory = (n) => {
    // FIXED — createNotification()'s `memoryGroupId`/`memoryItemId`/
    // `authorId` are only its own parameter names on the way IN. The
    // Notification schema (and therefore what GET /notifications
    // actually returns) stores these as `memoryGroup`/`memoryItem`/
    // `author` — see notification.model.js / notification.helper.js.
    // They also come back as raw unpopulated ObjectId strings (only
    // `sender` gets `.populate()`'d), so `n.memoryItem?.author` was
    // never going to resolve — `author` needed its own top-level field,
    // which is why it was missing from the schema entirely until now.
    const groupId  = n.memoryGroup?._id || n.memoryGroup;
    const itemId   = n.memoryItem?._id || n.memoryItem;
    const authorId = n.author?._id || n.author;

    if (!groupId || !itemId || !authorId) {
      alert("This memory is no longer available.");
      return;
    }

    // ← NEW — also tells MemoryViewer which sheet to open (Likes/Comments)
    // and, for comment/reply notifications, which one to highlight.
    // Same field-name fix as above: schema fields are `comment`/`reply`.
    stashMemorySheet({
      groupId,
      itemId,
      sheet: SHEET_FOR_MEMORY_NOTIF[n.type] || null,
      commentId: n.comment || null,
      replyId: n.reply || null,
    });

    // Own memory → go straight to /profile (Profilepage). Going via
    // /profile/:id instead would mount UserProfileView first, which
    // immediately redirects to /profile for your own id — but its
    // effects (including the one that reads and clears this same
    // sessionStorage handoff) still run once during that brief mount,
    // consuming and discarding it before Profilepage ever gets a
    // chance to see it. Routing directly here avoids mounting
    // UserProfileView at all in this case.
    const myId = getMyId();
    navigate(authorId === myId ? "/profile" : `/profile/${authorId}`);
  };

  const unread = notifications.filter((n) => !n.isRead);
  const earlier = notifications.filter((n) => n.isRead);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.heading}>Notifications</h2>
      </div>

      {loading && Array.from({ length: 8 }).map((_, i) => <NotifRowSkeleton key={i} />)}

      {error && <p style={s.errorText}>{error}</p>}

      {!loading && !error && notifications.length === 0 && (
        <div style={s.center}>
          <p style={{ color: "#999", fontSize: "14px" }}>No notifications yet</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {unread.length > 0 && (
            <>
              <p style={s.sectionLabel}>New</p>
              {unread.map((n) => (
                <NotifCard
                  key={n._id}
                  n={n}
                  busy={pendingIds.has(n._id)}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onCollabRespond={handleCollabRespond}
                  onDismiss={handleDismiss}
                  onOpen={handleOpen}
                  onOpenStory={handleOpenStory}
                  onOpenMemory={handleOpenMemory}
                />
              ))}
            </>
          )}

          {earlier.length > 0 && (
            <>
              <p style={s.sectionLabel}>Earlier</p>
              {earlier.map((n) => (
                <NotifCard
                  key={n._id}
                  n={n}
                  busy={pendingIds.has(n._id)}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onCollabRespond={handleCollabRespond}
                  onDismiss={handleDismiss}
                  onOpen={handleOpen}
                  onOpenStory={handleOpenStory}
                  onOpenMemory={handleOpenMemory}
                />
              ))}
            </>
          )}

          {hasMore && (
            <button style={s.loadMoreBtn} onClick={() => loadPage(page + 1)}>
              Load more
            </button>
          )}
        </>
      )}

      <div style={{ height: "80px" }} />
      <Navbar />

      {/* ← NEW — opens directly on this page; no navigation to Home. */}
      {directStory && (
        <StoryViewer
          stories={directStory.stories}
          index={0}
          initialStoryId={directStory.initialStoryId}
          close={() => setDirectStory(null)}
        />
      )}
    </div>
  );
}

export default ActivityPage;

function NotifCard({ n, busy, onAccept, onReject, onCollabRespond, onDismiss, onOpen, onOpenStory, onOpenMemory }) {
  const username = n.sender?.username || "Someone";
  const avatar = n.sender?.profilePic || null;
  const display = TYPE_DISPLAY[n.type] || { icon: "comment" };
  const isFollowRequest = n.type === "follow_request";

  const isStoryType = n.type === "story_view" || n.type === "story_like" || n.type === "story_live";
  // ← NEW
  const isMemoryType =
    n.type === "memory_like" || n.type === "memory_comment" ||
    n.type === "memory_reply" || n.type === "memory_like_comment" ||
    n.type === "memory_like_reply";

  const isCollabInvite =
    n.type === "collab_request" && n.message?.toLowerCase().includes("invited you");

  const target = getNotificationTarget(n);
  const isClickable = isStoryType
    ? !!(n.sender?._id || n.sender)
    : isMemoryType
      ? !!(n.memoryItem?._id || n.memoryItem)
      : !!target && !isFollowRequest;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  const handleCardClick = () => {
    if (!isClickable) return;
    if (isStoryType) return onOpenStory(n);
    if (isMemoryType) return onOpenMemory(n);
    return onOpen(n);
  };

  return (
    <div
      style={{
        ...s.card,
        background: n.isRead ? "#fff" : "#f0f7ff",
        opacity: busy ? 0.6 : 1,
        cursor: isClickable ? "pointer" : "default",
      }}
      onClick={handleCardClick}
    >
      <div style={s.avatarWrapper}>
        {avatar ? (
          <img src={avatar} alt={username} style={s.avatar} />
        ) : (
          <div style={s.avatarFallback}>{username.charAt(0).toUpperCase()}</div>
        )}
        <div style={{ ...s.typeIcon, background: ICON_COLOR[display.icon] }}>
          {ICON[display.icon]}
        </div>
      </div>

      <div style={s.textContainer}>
        <p style={s.notifText}>
          {n.message ? (
            <span style={s.text}>{n.message}</span>
          ) : (
            <>
              <span style={s.username}>{username}</span>{" "}
              <span style={s.text}>sent you a notification</span>
            </>
          )}
        </p>
        <span style={s.time}>{timeAgo(n.createdAt)}</span>

        {/* text posts: text + images shown under the message */}
        {THUMB_TYPES.has(n.type) && <TextPostPreview post={n.post} />}
      </div>

      {isFollowRequest && (
        <div style={s.actions}>
          <button style={s.acceptBtn} disabled={busy} onClick={stop(() => onAccept(n))}>Confirm</button>
          <button style={s.rejectBtn} disabled={busy} onClick={stop(() => onReject(n))}>Delete</button>
        </div>
      )}

      {isCollabInvite && (
        <div style={s.actions}>
          <button style={s.acceptBtn} disabled={busy} onClick={stop(() => onCollabRespond(n, true))}>Accept</button>
          <button style={s.rejectBtn} disabled={busy} onClick={stop(() => onCollabRespond(n, false))}>Decline</button>
        </div>
      )}

      {/* image / video posts: small square thumbnail on the right */}
      {THUMB_TYPES.has(n.type) && <PostThumb post={n.post} />}

      {!isFollowRequest && !isCollabInvite && (
        <button style={s.dismissBtn} onClick={stop(() => onDismiss(n))} aria-label="Dismiss notification">
          ×
        </button>
      )}

      {!n.isRead && <div style={s.unreadDot} />}
    </div>
  );
}

const s = {
  container: {
    maxWidth: "400px",
    margin: "auto",
    background: "#fafafa",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  header: {
    padding: "14px 16px 4px",
    background: "#fff",
    borderBottom: "1px solid #efefef",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  heading: { margin: 0, fontSize: "18px", fontWeight: "700", color: "#111" },
  sectionLabel: { fontSize: "13px", fontWeight: "700", color: "#111", padding: "12px 16px 6px", margin: 0 },
  card: {
    display: "flex",
    alignItems: "center",
    padding: "10px 16px",
    gap: "10px",
    borderBottom: "1px solid #f0f0f0",
    position: "relative",
    transition: "opacity 0.15s",
  },
  avatarWrapper: { position: "relative", flexShrink: 0 },
  avatar: { width: "46px", height: "46px", borderRadius: "50%", objectFit: "cover" },
  avatarFallback: {
    width: "46px",
    height: "46px",
    borderRadius: "50%",
    background: "#ddd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "600",
    color: "#666",
  },
  typeIcon: {
    position: "absolute",
    bottom: "-2px",
    right: "-4px",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: "2px solid #fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: { flex: 1, minWidth: 0 },
  notifText: { margin: "0 0 2px", fontSize: "13.5px", lineHeight: "1.4", color: "#111" },
  username: { fontWeight: "700" },
  text: { color: "#333" },
  time: { fontSize: "12px", color: "#999" },

  // ── image / video thumbnail (right side) ──
  thumbWrap: {
    position: "relative",
    width: "44px",
    height: "44px",
    borderRadius: "6px",
    overflow: "hidden",
    flexShrink: 0,
    background: "#efefef",
  },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  thumbPlay: {
    position: "absolute", bottom: "2px", right: "3px",
    color: "#fff", fontSize: "10px", textShadow: "0 0 3px rgba(0,0,0,.7)",
  },

  // ── text post preview (under the message) ──
  tpCard: {
    marginTop: "8px",
    background: "#fff",
    border: "1px solid #ececec",
    borderRadius: "12px",
    padding: "8px",
  },
  tpText: {
    margin: 0,
    fontSize: "12px",
    lineHeight: 1.45,
    color: "#111",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  tpStrip: {
    display: "flex",
    gap: "6px",
    marginTop: "8px",
  },
  tpImgBox: {
    position: "relative",
    height: "78px",
    borderRadius: "10px",
    overflow: "hidden",
    background: "#f0f0f0",
    flexShrink: 0,
  },
  tpMore: {
    position: "absolute",
    bottom: "4px",
    right: "6px",
    background: "rgba(0,0,0,.6)",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: "10px",
  },

  actions: { display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 },
  acceptBtn: {
    background: "#0095f6",
    color: "#fff",
    border: "none",
    padding: "7px 14px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  rejectBtn: {
    background: "#efefef",
    color: "#111",
    border: "none",
    padding: "7px 14px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  dismissBtn: {
    background: "transparent",
    border: "none",
    color: "#999",
    fontSize: "20px",
    lineHeight: 1,
    cursor: "pointer",
    padding: "4px 6px",
    flexShrink: 0,
  },
  unreadDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#0095f6", flexShrink: 0 },
  center: { display: "flex", justifyContent: "center", alignItems: "center", padding: "60px 0" },
  spinner: {
    width: "28px",
    height: "28px",
    border: "3px solid #efefef",
    borderTop: "3px solid #0095f6",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  errorText: { textAlign: "center", color: "#e74c3c", padding: "20px", fontSize: "14px" },
  loadMoreBtn: {
    display: "block",
    margin: "16px auto",
    background: "#efefef",
    border: "none",
    borderRadius: "8px",
    padding: "8px 18px",
    fontSize: "13px",
    fontWeight: "600",
    color: "#111",
    cursor: "pointer",
  },
};

if (!document.getElementById("notif-spin-keyframes")) {
  const styleTag = document.createElement("style");
  styleTag.id = "notif-spin-keyframes";
  styleTag.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleTag);
}