import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FaThumbsUp, FaRegThumbsUp } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL;
const authHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/* ─────────────────────────── Reaction definitions ─────────────────────────── */
export const REACTIONS = [
  { key: "like",  emoji: "👍", label: "Like",  color: "#1877f2" },
  { key: "love",  emoji: "❤️", label: "Love",  color: "#f33e58" },
  { key: "haha",  emoji: "😆", label: "Haha",  color: "#f7b125" },
  { key: "wow",   emoji: "😮", label: "Wow",   color: "#f7b125" },
  { key: "sad",   emoji: "😢", label: "Sad",   color: "#f7b125" },
  { key: "angry", emoji: "😡", label: "Angry", color: "#e9710f" },
];

export const REACTION_MAP = REACTIONS.reduce((acc, r) => {
  acc[r.key] = r;
  return acc;
}, {});

export function reactionColor(key, fallback = "#555") {
  return REACTION_MAP[key]?.color || fallback;
}

/* ─────────────────────────── one-time CSS ───────────────────────────
   Injected once (guarded by id), same idiom the rest of the app uses. */
if (typeof document !== "undefined" && !document.getElementById("reactions-keyframes")) {
  const tag = document.createElement("style");
  tag.id = "reactions-keyframes";
  tag.innerHTML = `
    @keyframes rxPickerIn {
      0%   { opacity: 0; transform: translateY(14px) scale(0.7); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes rxOptionIn {
      0%   { opacity: 0; transform: translateY(18px) scale(0.2); }
      60%  { opacity: 1; transform: translateY(-6px) scale(1.15); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes rxIdle {
      0%, 55%, 100% { transform: translateY(0); }
      25%           { transform: translateY(-4px); }
    }
    @keyframes rxPop {
      0%   { transform: scale(0.3) rotate(0deg); }
      40%  { transform: scale(1.35) rotate(-18deg); }
      70%  { transform: scale(0.92) rotate(10deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    .rx-option {
      position: relative; width: 46px; height: 56px; border: none; background: none;
      padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
      animation: rxOptionIn 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      -webkit-tap-highlight-color: transparent;
    }
    .rx-option .rx-emoji { font-size: 30px; line-height: 1; display: block; animation: rxIdle 2.4s ease-in-out infinite; }
    .rx-option:hover, .rx-option:active { transform: translateY(-10px) scale(1.5); z-index: 2; }
    .rx-option:hover .rx-emoji { animation-play-state: paused; }
    .rx-option .rx-tip {
      position: absolute; top: -14px; left: 50%; transform: translateX(-50%) scale(0.67);
      background: rgba(0,0,0,0.78); color: #fff; font-size: 11px; font-weight: 700;
      padding: 2px 8px; border-radius: 10px; white-space: nowrap; pointer-events: none;
      opacity: 0; transition: opacity 0.12s ease;
    }
    .rx-option:hover .rx-tip { opacity: 1; }
    .rx-btn-noselect { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  `;
  document.head.appendChild(tag);
}

/* ─────────────────────────── ReactionIcon ───────────────────────────
   Shows the chosen reaction's emoji (with a pop animation every time it
   changes — the `key` forces the CSS animation to replay) or the default
   thumbs-up when nothing is picked. */
export function ReactionIcon({ reaction, size = 17, inactiveColor = "#555", outline = false }) {
  const r = REACTION_MAP[reaction];
  if (!r) {
    const Thumb = outline ? FaRegThumbsUp : FaThumbsUp;
    return <Thumb size={size} color={inactiveColor} />;
  }
  return (
    <span
      key={reaction}
      style={{
        fontSize: size * 1.2,
        lineHeight: 1,
        display: "inline-block",
        animation: "rxPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {r.emoji}
    </span>
  );
}

/* ─────────────────────────── The floating picker ─────────────────────────── */
const OPTION_W = 46;
const PICKER_W = REACTIONS.length * OPTION_W + 16;
const PICKER_H = 60;

function ReactionPicker({ rect, current, onPick, onEnter, onLeave }) {
  const vw = window.innerWidth;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - PICKER_W / 2, vw - PICKER_W - 8));
  // above the button; if there's no room, drop below it
  const above = rect.top - PICKER_H - 10;
  const top = above >= 8 ? above : rect.bottom + 10;

  return createPortal(
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left, top, width: PICKER_W, height: PICKER_H,
        padding: "0 8px", boxSizing: "border-box",
        display: "flex", alignItems: "center",
        background: "#fff", borderRadius: PICKER_H / 2,
        boxShadow: "0 6px 22px rgba(0,0,0,0.28)",
        zIndex: 2000,
        animation: "rxPickerIn 0.22s ease-out both",
      }}
    >
      {REACTIONS.map((r, i) => (
        <button
          key={r.key}
          className="rx-option"
          aria-label={r.label}
          title={r.label}
          style={{
            animationDelay: `${i * 45}ms`,
            background: current === r.key ? "rgba(24,119,242,0.12)" : "none",
            borderRadius: 12,
          }}
          onClick={(e) => { e.stopPropagation(); onPick(r.key); }}
        >
          <span className="rx-tip">{r.label}</span>
          <span className="rx-emoji" style={{ animationDelay: `${i * 180}ms` }}>{r.emoji}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

/* ─────────────────────────── ReactionButton ───────────────────────────
   Drop-in replacement for the old like <button>:
     click / tap              -> onQuickPress (like / remove reaction)
     hover (mouse, ~0.45s)    -> opens the picker
     long-press (touch, 0.4s) -> opens the picker
   Picking an emoji calls onReact(key). */
export function ReactionButton({ myReaction, onQuickPress, onReact, style, className = "", children }) {
  const btnRef = useRef(null);
  const [rect, setRect] = useState(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const lastTouch = useRef(0); // browsers fire emulated mouse events after touch — ignore those

  const open = () => {
    if (!btnRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    setRect({ left: b.left, top: b.top, bottom: b.bottom, width: b.width });
  };
  const close = () => setRect(null);

  const clearAll = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    clearTimeout(pressTimer.current);
  };
  useEffect(() => clearAll, []);

  // tap outside closes the picker (touch devices have no mouseleave)
  useEffect(() => {
    if (!rect) return;
    const onDown = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [rect]);

  const isEmulated = () => Date.now() - lastTouch.current < 800;

  const handleMouseEnter = () => {
    if (isEmulated()) return;
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(open, 450);
  };
  const handleMouseLeave = () => {
    if (isEmulated()) return;
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(close, 260);
  };
  const keepOpen = () => clearTimeout(closeTimer.current);
  const leavePicker = () => {
    closeTimer.current = setTimeout(close, 260);
  };

  const handleTouchStart = () => {
    lastTouch.current = Date.now();
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      open();
    }, 400);
  };
  const handleTouchEnd = () => {
    lastTouch.current = Date.now();
    clearTimeout(pressTimer.current);
  };

  const handleClick = (e) => {
    // the click that follows a long-press must not also toggle a like
    if (longPressed.current) {
      longPressed.current = false;
      e.stopPropagation();
      return;
    }
    clearTimeout(openTimer.current);
    close();
    onQuickPress?.(e);
  };

  return (
    <>
      <button
        ref={btnRef}
        className={`rx-btn-noselect ${className}`.trim()}
        style={style}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={() => clearTimeout(pressTimer.current)}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => { if (isEmulated()) e.preventDefault(); }}
      >
        {children}
      </button>
      {rect && (
        <ReactionPicker
          rect={rect}
          current={myReaction}
          onEnter={keepOpen}
          onLeave={leavePicker}
          onPick={(key) => { close(); onReact?.(key); }}
        />
      )}
    </>
  );
}

/* ─────────────────────────── useReaction hook ───────────────────────────
   Keeps `liked` / `setLiked` for backwards-compat with the existing code,
   and adds `myReaction`, `react(key)` and `quickToggle()`.

   Server: POST /auth/like/:postId  body { reaction }
   -> { success, liked, reaction, totalLikes, likedBy:[{_id, username, profilePic, reaction}] } */
export function useReaction({ postId, myId, likedByUsers, setLikesCount, setLikedByUsers, onLiked }) {
  const [myReaction, setMyReaction] = useState(null);

  // Whenever the likers list refreshes (initial fetch / socket), pick up my reaction type from it.
  useEffect(() => {
    if (!myId) return;
    const me = (likedByUsers || []).find((u) => (u?._id ?? u)?.toString() === myId.toString());
    if (me?.reaction && REACTION_MAP[me.reaction]) setMyReaction(me.reaction);
  }, [likedByUsers, myId]);

  // compat with the old `setLiked(boolean)` calls in fetchLikers / socket handlers
  const setLiked = useCallback((v) => setMyReaction((prev) => (v ? prev || "like" : null)), []);

  const react = async (key) => {
    if (!postId || !REACTION_MAP[key]) return;
    const prev = myReaction;
    setMyReaction(key === prev ? null : key); // optimistic: same reaction again = remove
    try {
      const res = await fetch(`${API}/auth/like/${postId}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reaction: key }),
      });
      const data = await res.json();
      if (data.success) {
        setMyReaction(data.liked ? (REACTION_MAP[data.reaction] ? data.reaction : key) : null);
        if (data.totalLikes != null) setLikesCount?.(data.totalLikes);
        if (data.likedBy) {
          const seen = new Set();
          setLikedByUsers?.(
            data.likedBy.filter((u) => {
              const id = u?._id ?? u;
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            })
          );
        }
        if (data.liked) onLiked?.(postId);
      } else {
        setMyReaction(prev);
      }
    } catch {
      setMyReaction(prev);
    }
  };

  const quickToggle = () => react(myReaction || "like");

  return { liked: !!myReaction, setLiked, myReaction, react, quickToggle };
}