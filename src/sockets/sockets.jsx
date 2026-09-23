import { io } from "socket.io-client";

// ── Same-origin connection ─────────────────────────────────────────────────
// No hardcoded host here. Passing no URL makes socket.io-client connect to
// whatever origin the page is currently served from (localhost:5173,
// http://192.168.x.x:5173, or the ngrok domain). Vite's dev proxy (see
// vite.config.js "/socket.io" block) then forwards that connection to the
// real backend at VITE_API_TARGET — resolved on the computer, not the phone.
const socket = io({
  auth: { token: localStorage.getItem("token") },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

socket.on("connect", () => {
  console.log("Socket connected, id:", socket.id);
  const raw = localStorage.getItem("user");
  if (!raw) return;

  let userId = null;
  try {
    userId = JSON.parse(raw)?._id || null;
  } catch {
    userId = null;
  }

  if (userId) {
    console.log("Registering as userId:", userId);
    socket.emit("register", userId);
  } else {
    console.log("No userId found in localStorage — cannot register!");
  }
});

// ── Re-register on reconnect (e.g. after network drop) ────────────────────
// Without this, the server's onlineUsers map loses this socket after a
// disconnect/reconnect cycle and all targeted emits (DMs, notifications,
// follow events) silently fail until a full page reload.
socket.on("reconnect", () => {
  const raw = localStorage.getItem("user");
  if (!raw) return;
  try {
    const userId = JSON.parse(raw)?._id;
    if (userId) socket.emit("register", userId);
  } catch {}
});

// ── Notification permission ────────────────────────────────────────────────
if (typeof window !== "undefined" && "Notification" in window) {
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// ── Play OS notification sound ─────────────────────────────────────────────
const playDefaultNotificationSound = () => {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const note = new Notification(" ", { silent: false, tag: "msg-ping" });
    setTimeout(() => note.close(), 1500);
  } catch (e) {
    console.log("Notification sound error:", e.message);
  }
};

// ── Is the user currently in this chat? ───────────────────────────────────
const isChatCurrentlyOpen = (chatId) => {
  const openChatId = window.__activeChatId;
  return openChatId && chatId && openChatId === chatId;
};

// ── Notification category → settings key map ──────────────────────────────
const NOTIF_TYPE_TO_SETTING_KEY = {
  message:        "message",
  story_view:     "story",
  story_like:     "story",
  collab_request: "post",
  story_live:     "story",
};

const POSTTYPE_TO_SETTING_KEY = {
  image:    "post",
  carousel: "post",
  video:    "reel",
  text:     "text",
};

const POST_DEPENDENT_TYPES = new Set(["comment", "reply", "like_post", "like_comment", "new_post"]);

const isNotifTypeAllowed = (type, postType) => {
  try {
    let settingKey = NOTIF_TYPE_TO_SETTING_KEY[type];
    if (!settingKey && POST_DEPENDENT_TYPES.has(type)) {
      settingKey = POSTTYPE_TO_SETTING_KEY[postType] || "post";
    }
    if (!settingKey) return true; // follow events — always allowed
    const raw = localStorage.getItem("notifSettings");
    if (!raw) return true;
    const settings = JSON.parse(raw);
    return settings[settingKey] !== false;
  } catch {
    return true;
  }
};

const isMessageNotifAllowed = () => isNotifTypeAllowed("message");

// ── Message sound ──────────────────────────────────────────────────────────
socket.on("receiveMessage", (data) => {
  if (!isChatCurrentlyOpen(data.conversationId) && isMessageNotifAllowed()) {
    playDefaultNotificationSound();
  }
});

socket.on("newMessageRequest", (data) => {
  if (!isChatCurrentlyOpen(data.conversationId) && isMessageNotifAllowed()) {
    playDefaultNotificationSound();
  }
});

// ── General notification sound ─────────────────────────────────────────────
socket.on("receiveNotification", (notification) => {
  if (isNotifTypeAllowed(notification?.type, notification?.postType)) {
    playDefaultNotificationSound();
  }
});

// ── Follow request sound ───────────────────────────────────────────────────
socket.on("newFollowRequest", () => {
  playDefaultNotificationSound();
});

// ── New follower sound ─────────────────────────────────────────────────────
socket.on("newFollower", () => {
  playDefaultNotificationSound();
});

// ── Follow accepted sound ──────────────────────────────────────────────────
socket.on("followAccepted", () => {
  playDefaultNotificationSound();
});

// ── Account deleted — force logout if server says my account is gone ───────
socket.on("userAccountDeleted", ({ userId }) => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return;
    const myId = JSON.parse(raw)?._id;
    if (myId && myId === userId) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
  } catch {}
});

// ── Debug helpers (dev only) ───────────────────────────────────────────────
if (import.meta.env.DEV) {
  socket.on("connect_error", (err) => {
    console.warn("Socket connect error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
  });

  socket.on("reconnect_attempt", (attempt) => {
    console.log(`Socket reconnect attempt #${attempt}`);
  });

  socket.on("reconnect_failed", () => {
    console.error("Socket reconnect failed after max attempts");
  });
}

export default socket;