import React, { useEffect, useState, useRef } from "react";
import { FaHome, FaSearch, FaVideo, FaBell, FaEnvelope, FaUser, FaRegComment, FaHeart, FaUserFriends } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import socket from "../../sockets/sockets.jsx"; // ← adjust path to match where Navbar actually lives relative to sockets.jsx

const API = import.meta.env.VITE_API_URL;

const BADGE_COLOR = "rgb(234,182,118)";
const TOAST_DURATION_MS = 5000;
// ← how long the red comment/like/follow popup stays open above the bell
// before auto-dismissing, same cadence as the existing toast.
const SUMMARY_DURATION_MS = 5000;

// ── Swipe-to-switch-page tuning ──────────────────────────────────────────
// The gesture now moves between PAGES, not screen positions. Swiping left
// advances to the next tab in PAGE_ORDER, swiping right goes back one.
// The bar itself only ever nudges a few px to give the finger some visual
// feedback, then springs back to dead-center — it never stays docked.
const SWIPE_THRESHOLD = 60;     // px of horizontal travel needed to trigger a page change
const MAX_DRAG_OFFSET = 36;     // rubber-band cap so the bar can't be dragged far off-center
const RUBBER_BAND = 0.35;       // how much of the raw finger movement actually shows (0-1)

// ── The tab order swiping moves through. Kept as a flat list (not tied to
// the button JSX below) so handleTouchEnd can just look up
// PAGE_ORDER.indexOf(location.pathname) and step +/-1 — add/reorder a tab
// here and the swipe gesture picks it up automatically.
const PAGE_ORDER = ["/home", "/search", "/videopage", "/notifications", "/messages", "/profile"];

function safeParseUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "undefined" || raw === "null") return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const getToken = () => localStorage.getItem("token");

const fetchLatestUnread = async () => {
  const res = await fetch(`${API}/auth/notifications?page=1&limit=20`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
};

// ─────────────────────────────────────────────────────────────────────────
// Per-category mute gate for the toast/badge, mirroring sockets.jsx's
// device-sound gate and notification.helper.js's server-side gate. Kept
// as a local copy rather than imported from sockets.jsx to avoid coupling
// this UI component's logic to that module's internals — duplicating
// ~15 lines is cheaper than restructuring the module boundary for this.
// ─────────────────────────────────────────────────────────────────────────
const NOTIF_TYPE_TO_SETTING_KEY = {
  message: "message",
  story_view: "story",
  story_like: "story",
  collab_request: "post",
};

const POSTTYPE_TO_SETTING_KEY = {
  image: "post",
  carousel: "post",
  video: "reel",
  text: "text",
};

const POST_DEPENDENT_TYPES = new Set(["comment", "reply", "like_post", "like_comment"]);

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

// ── Type → bubble icon + color — same mapping as notifications.jsx's
// NotifCard, kept in sync so the bell badge, the toast, and the list page
// all agree on what each notification type looks like.
const TYPE_DISPLAY = {
  follow:          { icon: "follow" },
  follow_request:  { icon: "request" },
  follow_accepted: { icon: "follow" },
  like_post:       { icon: "like" },
  like_comment:    { icon: "like" },
  story_like:      { icon: "like" },
  comment:         { icon: "comment" },
  reply:           { icon: "comment" },
  message:         { icon: "message" },
  collab_request:  { icon: "collab" },
  story_view:      { icon: "story" },
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

const SMALL_ICON = {
  follow: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  request: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  like: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1.5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  comment: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  message: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  collab: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  story: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  ),
};

// ── Which of the 3 summary-popup buckets (comment / like / follow) a
// notification type belongs to. Types outside these three (message,
// collab_request, story_view) still bump unreadCount/the bell badge as
// before, they just don't have a bucket in this popup.
const CATEGORY_BUCKET = {
  comment:         "comment",
  reply:           "comment",
  like_post:       "like",
  like_comment:    "like",
  story_like:      "like",
  follow:          "follow",
  follow_request:  "follow",
  follow_accepted: "follow",
};

// ── Icon + label shown inside the single-bucket popup, keyed by bucket
// name rather than by raw notification type — this is what makes the
// popup show ONLY "like" when a like just happened, or ONLY "follow"
// when a follow just happened, instead of always rendering all three.
const BUCKET_DISPLAY = {
  comment: { icon: <FaRegComment size={13} />, label: "Comments" },
  like:    { icon: <FaHeart size={13} />,      label: "Likes" },
  follow:  { icon: <FaUserFriends size={13} />, label: "Follows" },
};

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profilePic, setProfilePic] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestType, setLatestType] = useState(null);

  // ── Toast popup state (single most-recent notification, unchanged) ─────
  const [toast, setToast] = useState(null); // { message, type, senderUsername, senderAvatar } | null
  const toastTimerRef = useRef(null);

  // ── Bell summary popup state ────────────────────────────────────────────
  const [categoryCounts, setCategoryCounts] = useState({ comment: 0, like: 0, follow: 0 });
  const [latestBucket, setLatestBucket] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const summaryTimerRef = useRef(null);

  // ── Swipe-to-switch-page state ───────────────────────────────────────────
  // dragX is purely visual (rubber-banded finger feedback while a swipe
  // is in progress); it always animates back to 0 on release, whether or
  // not the swipe was long enough to actually change page.
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const swipeRef = useRef({ startX: 0, startY: 0, dx: 0, active: false });
  const navRootRef = useRef(null);

  const isVideoPage = location.pathname === "/videopage";
  const isProfilePage = location.pathname === "/profile";
  const isNotificationsPage = location.pathname === "/notifications";

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setCommentsOpen(document.body.classList.contains("comments-open"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fetchPic = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && data.user?.profilePic) {
          setProfilePic(data.user.profilePic);
        }
      } catch {
        const user = safeParseUser();
        if (user?.profilePic) setProfilePic(user.profilePic);
      }
    };
    fetchPic();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLatest = async () => {
      try {
        const data = await fetchLatestUnread();
        if (!isMounted) return;
        setUnreadCount(data.unreadCount || 0);
        const unread = (data.notifications || []).filter((n) => !n.isRead);
        setLatestType(unread[0]?.type || null);

        const seeded = { comment: 0, like: 0, follow: 0 };
        unread.forEach((n) => {
          const bucket = CATEGORY_BUCKET[n.type];
          if (bucket) seeded[bucket] += 1;
        });
        setCategoryCounts(seeded);
      } catch {
        // Badge is non-critical — fail silently
      }
    };

    loadLatest();

    const handleNewNotification = (notif) => {
      if (!isNotifTypeAllowed(notif?.type, notif?.postType)) return;

      setUnreadCount((prev) => prev + 1);
      setLatestType(notif?.type || null);

      const bucket = CATEGORY_BUCKET[notif?.type];
      if (bucket) {
        setCategoryCounts((prev) => ({ ...prev, [bucket]: prev[bucket] + 1 }));
        setLatestBucket(bucket);
        setShowSummary(true);
        if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
        summaryTimerRef.current = setTimeout(() => {
          setShowSummary(false);
        }, SUMMARY_DURATION_MS);
      }

      if (!notif?.message) return;

      setToast({
        message: notif.message,
        type: notif.type,
        senderAvatar: notif.sender?.profilePic || null,
        senderUsername: notif.sender?.username || "Someone",
      });

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
      }, TOAST_DURATION_MS);
    };

    socket.on("receiveNotification", handleNewNotification);

    return () => {
      isMounted = false;
      socket.off("receiveNotification", handleNewNotification);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isNotificationsPage) {
      setUnreadCount(0);
      setLatestType(null);
      setCategoryCounts({ comment: 0, like: 0, follow: 0 });
      setLatestBucket(null);
      setShowSummary(false);
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    }
  }, [isNotificationsPage]);

  // ── Horizontal swipe-to-switch-page ──────────────────────────────────────
  // Listens on window so a swipe anywhere on screen works, not just one
  // that starts on the bar — same as before. What changed is handleTouchEnd:
  // instead of moving the BAR to a screen edge, it steps to the next/
  // previous route in PAGE_ORDER and actually navigates there. The bar
  // itself only rubber-bands a few px for feedback, then always resets to
  // dead-center — it's the PAGE that moves now, not the navbar's dock spot.
  useEffect(() => {
    const handleTouchStart = (e) => {
      if (commentsOpen) return;
      const t = e.touches[0];
      swipeRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, active: true };
      setIsDragging(true);
    };

    const handleTouchMove = (e) => {
      if (!swipeRef.current.active) return;
      const t = e.touches[0];
      const dx = t.clientX - swipeRef.current.startX;
      const dy = t.clientY - swipeRef.current.startY;

      // Only treat it as a horizontal swipe once horizontal movement
      // clearly dominates vertical — avoids hijacking vertical scrolls.
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        swipeRef.current.dx = dx;
        // Rubber-band: the bar visually moves only a fraction of the
        // raw finger travel, and is capped, so a long swipe still gives
        // feedback without the bar flying off past its neighbors.
        const rubberBanded = Math.max(
          -MAX_DRAG_OFFSET,
          Math.min(MAX_DRAG_OFFSET, dx * RUBBER_BAND)
        );
        setDragX(rubberBanded);
      }
    };

    const handleTouchEnd = () => {
      if (!swipeRef.current.active) return;
      const { dx } = swipeRef.current;
      swipeRef.current.active = false;
      setIsDragging(false);
      setDragX(0); // always spring back to center, whether or not we navigate

      if (Math.abs(dx) < SWIPE_THRESHOLD) return; // too short to count as a page-change swipe

      const currentIndex = PAGE_ORDER.indexOf(location.pathname);
      // If the current route isn't one of the swipeable tabs (e.g. a post
      // detail page rendering this same Navbar), there's nothing sensible
      // to step from — ignore the swipe rather than jumping to a random tab.
      if (currentIndex === -1) return;

      if (dx <= -SWIPE_THRESHOLD) {
        // swiped left → next tab
        const nextIndex = Math.min(currentIndex + 1, PAGE_ORDER.length - 1);
        if (nextIndex !== currentIndex) navigate(PAGE_ORDER[nextIndex]);
      } else if (dx >= SWIPE_THRESHOLD) {
        // swiped right → previous tab
        const prevIndex = Math.max(currentIndex - 1, 0);
        if (prevIndex !== currentIndex) navigate(PAGE_ORDER[prevIndex]);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [commentsOpen, location.pathname, navigate]);

  const getBtnStyle = (path) => ({
    margin: "1px",
    height: "42px",
    width: "42px",
    borderRadius: "10px",
    border: "0px",
    cursor: "pointer",
    background: location.pathname === path ? BADGE_COLOR : "transparent",
    color: location.pathname === path ? "white" : isVideoPage ? "white" : "#555",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    transition: "all 0.2s ease",
    position: "relative",
  });

  const bubble = latestType ? TYPE_DISPLAY[latestType] : null;
  const bubbleColor = bubble ? ICON_COLOR[bubble.icon] : BADGE_COLOR;
  const bubbleIcon = bubble ? SMALL_ICON[bubble.icon] : null;

  const toastDisplay = toast ? TYPE_DISPLAY[toast.type] : null;
  const toastColor = toastDisplay ? ICON_COLOR[toastDisplay.icon] : BADGE_COLOR;
  const toastIcon = toastDisplay ? SMALL_ICON[toastDisplay.icon] : null;

  const activeBucketDisplay = latestBucket ? BUCKET_DISPLAY[latestBucket] : null;
  const activeBucketCount = latestBucket ? categoryCounts[latestBucket] : 0;

  return (
    <>
      {/* ── Toast banner — top of screen, auto-dismisses after 5s ─────────
          Tapping it jumps straight to the notifications page, same as
          tapping the bell. Mounted here (not inside notifications.jsx) so
          it can appear no matter which page the user is currently on. */}
      {toast && (
        <div
          onClick={() => {
            setToast(null);
            navigate("/notifications");
          }}
          style={{
            position: "fixed",
            top: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "white",
            borderRadius: "14px",
            padding: "10px 14px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
            maxWidth: "320px",
            width: "calc(100% - 32px)",
            cursor: "pointer",
            animation: "toast-slide-down 0.25s ease-out",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            {toast.senderAvatar ? (
              <img
                src={toast.senderAvatar}
                alt={toast.senderUsername}
                style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  background: "#ddd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "700",
                  color: "#666",
                  fontSize: "15px",
                }}
              >
                {toast.senderUsername.charAt(0).toUpperCase()}
              </div>
            )}
            {toastIcon && (
              <div
                style={{
                  position: "absolute",
                  bottom: "-2px",
                  right: "-2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: toastColor,
                  border: "1.5px solid white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {toastIcon}
              </div>
            )}
          </div>
          <span
            style={{
              fontSize: "13.5px",
              color: "#111",
              lineHeight: "1.35",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {toast.message}
          </span>
        </div>
      )}

      <style>{`
        @keyframes toast-slide-down {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes summary-pop-in {
          from { opacity: 0; transform: translate(-50%, 6px) scale(0.94); }
          to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>

      <div
        ref={navRootRef}
        className="navbar-root"
        style={{
          position: "fixed",
          bottom: "1px",
          // ← Always dead-center now — dragX is the only thing that ever
          // moves it, and only transiently while a finger is actually
          // dragging. No more permanent left/right docking.
          left: "50%",
          transform: `translateX(calc(-50% + ${dragX}px))`,
          transition: isDragging ? "none" : "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "8px 12px",
          borderRadius: "20px",
          gap: "10px",
          zIndex: commentsOpen ? -1 : 1000,
          width: "fit-content",
          maxWidth: "360px",
          background: isVideoPage ? "rgba(0,0,0,0.4)" : "white",
          boxShadow: isVideoPage ? "none" : "0 4px 20px rgba(0,0,0,0.15)",
          backdropFilter: isVideoPage ? "blur(8px)" : "none",
          touchAction: "pan-y",
        }}
      >
        <button style={getBtnStyle("/home")} onClick={() => navigate("/home")}>
          <FaHome />
        </button>
        <button style={getBtnStyle("/search")} onClick={() => navigate("/search")}>
          <FaSearch />
        </button>
        <button style={getBtnStyle("/videopage")} onClick={() => navigate("/videopage")}>
          <FaVideo />
        </button>

        <button
          style={getBtnStyle("/notifications")}
          onClick={() => {
            setShowSummary(false);
            navigate("/notifications");
          }}
        >
          <FaBell />
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "1px",
                right: "1px",
                minWidth: "17px",
                height: "17px",
                padding: bubbleIcon ? "0" : "0 4px",
                borderRadius: "999px",
                background: bubbleColor,
                color: "white",
                fontSize: "10px",
                fontWeight: "700",
                lineHeight: "17px",
                textAlign: "center",
                border: "1.5px solid white",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {bubbleIcon ? bubbleIcon : unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}

          {showSummary && activeBucketDisplay && activeBucketCount > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 10px)",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgb(234,182,118)",
                borderRadius: "16px",
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
                whiteSpace: "nowrap",
                animation: "summary-pop-in 0.2s ease-out",
                zIndex: 1500,
              }}
            >
              <SummaryItem icon={activeBucketDisplay.icon} count={activeBucketCount} />

              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "7px solid transparent",
                  borderRight: "7px solid transparent",
                  borderTop: "7px solid rgb(234,182,118)",
                }}
              />
            </div>
          )}
        </button>

        <button style={getBtnStyle("/messages")} onClick={() => navigate("/messages")}>
          <FaEnvelope />
        </button>

        <button
          style={{
            ...getBtnStyle("/profile"),
            padding: 0,
            overflow: "hidden",
            border: isProfilePage
              ? "2px solid rgb(234,182,118)"
              : isVideoPage
              ? "2px solid rgba(255,255,255,0.5)"
              : "2px solid #eee",
            background: "transparent",
            borderRadius: "10px",
          }}
          onClick={() => navigate("/profile")}
        >
          {profilePic ? (
            <img
              src={profilePic}
              alt="profile"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                borderRadius: "8px",
              }}
            />
          ) : (
            <FaUser color={isVideoPage ? "white" : "#555"} />
          )}
        </button>
      </div>
    </>
  );
}

// ── One "icon + count" slot inside the summary popup ───────────────────
function SummaryItem({ icon, count }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "white" }}>
      <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      <span style={{ fontSize: "14px", fontWeight: "700" }}>{count}</span>
    </span>
  );
}

export default Navbar;