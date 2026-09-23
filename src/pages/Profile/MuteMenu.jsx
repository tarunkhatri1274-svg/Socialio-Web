import React, { useState, useEffect, useRef } from "react";
import { FaBellSlash, FaEllipsisV } from "react-icons/fa";
import { toggleMuteApi, getMutedMap, subscribeMuted } from "../../components/state/MuteStore.js";

const GOLDEN = "rgb(234,182,118)";
const EMPTY = { muteStory: false, mutePost: false, muteMessage: false };

export default function MuteMenu({ userId, username }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => getMutedMap()[userId] || EMPTY);
  const ref = useRef(null);

  useEffect(
    () => subscribeMuted((map) => setState(map[userId] || EMPTY)),
    [userId]
  );

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const anyMuted = state.muteStory || state.mutePost || state.muteMessage;

  const handleToggle = async (type) => {
    await toggleMuteApi(userId, type);
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "none",
          background: anyMuted ? "#fff0e6" : "#f0f0f0",
          width: 32,
          height: 32,
          borderRadius: 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: anyMuted ? GOLDEN : "#555",
          flexShrink: 0,
        }}
        title={`Mute options for ${username}`}
      >
        {anyMuted ? <FaBellSlash size={13} /> : <FaEllipsisV size={13} />}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 38,
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
            minWidth: 220,
            zIndex: 200,
            border: "0.5px solid #eee",
            overflow: "hidden",
          }}
        >
          <p style={{ margin: 0, padding: "10px 14px 6px", fontSize: 12, fontWeight: 700, color: "#999" }}>
            Mute {username}
          </p>
          {[
            { key: "muteStory", label: "Stories", type: "story" },
            { key: "mutePost", label: "Posts", type: "post" },
            { key: "muteMessage", label: "Message notifications", type: "message" },
          ].map((row) => (
            <label
              key={row.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                fontSize: 14,
                color: "#111",
                cursor: "pointer",
                borderTop: "0.5px solid #f5f5f5",
              }}
            >
              <span>{row.label}</span>
              <input
                type="checkbox"
                checked={!!state[row.key]}
                onChange={() => handleToggle(row.type)}
                style={{ width: 18, height: 18, accentColor: GOLDEN, cursor: "pointer" }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}