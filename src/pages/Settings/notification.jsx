import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL;

// ── Inject the spin keyframe once ──────────────────────────────────
if (!document.getElementById("rn-spinner-keyframes")) {
  const styleTag = document.createElement("style");
  styleTag.id = "rn-spinner-keyframes";
  styleTag.innerHTML = `@keyframes rnSpin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(styleTag);
}

// ── ActivityIndicator-style spinner (mirrors RN's <ActivityIndicator />) ──
function ActivityIndicator({ size = "large", color = "rgb(234,182,118)" }) {
  const dim = size === "large" ? 36 : 20;
  const border = size === "large" ? 4 : 2;
  return (
    <div
      style={{
        width: dim,
        height: dim,
        border: `${border}px solid rgba(0,0,0,0.08)`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "rnSpin 0.7s linear infinite",
      }}
    />
  );
}

function NotificationSettings() {
  const [settings, setSettings] = useState({
    message: true,
    post: true,
    reel: true,
    story: true,
    text: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Load saved settings on mount ───────────────────────────────────
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem("token");

        const res = await fetch(`${API}/auth/notifications/settings/`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) throw new Error("Failed to load settings");

        const data = await res.json();
        const loaded = {
          message: data.settings.message,
          post: data.settings.post,
          reel: data.settings.reel,
          story: data.settings.story,
          text: data.settings.text,
        };
        setSettings(loaded);
        localStorage.setItem("notifSettings", JSON.stringify(loaded));
      } catch (err) {
        console.error("Failed to fetch notification settings:", err);
        setError("Couldn't load your settings. Showing defaults.");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // ── Toggle + persist ────────────────────────────────────────────────
  const toggleSwitch = async (key) => {
    const newValue = !settings[key];
    const updated = { ...settings, [key]: newValue };
    setSettings(updated);
    localStorage.setItem("notifSettings", JSON.stringify(updated));
    setError("");

    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${API}/auth/notifications/settings/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key, value: newValue }),
      });

      if (!res.ok) throw new Error("Failed to save");
    } catch (err) {
      console.error("Failed to update setting:", err);
      setError("Couldn't save that change. Reverted.");
      setSettings((prev) => ({ ...prev, [key]: !newValue }));
    }
  };

  if (loading) {
    return (
      <div style={container}>
        <div style={card}>
          <h2 style={title}>Notification Settings</h2>
          <div style={loadingWrap}>
            <ActivityIndicator size="large" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={card}>
        <h2 style={title}>Notification Settings</h2>

        {error && <p style={errorText}>{error}</p>}

        {Object.keys(settings).map((key) => (
          <div key={key} style={row}>
            <span style={label}>{capitalize(key)}</span>

            <div
              style={{
                ...toggle,
                backgroundColor: settings[key] ? "rgb(234,182,118)" : "#ccc",
              }}
              onClick={() => toggleSwitch(key)}
            >
              <div
                style={{
                  ...circle,
                  transform: settings[key]
                    ? "translateX(26px)"
                    : "translateX(2px)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// helper
const capitalize = (word) =>
  word.charAt(0).toUpperCase() + word.slice(1);

// STYLES
const container = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  backgroundColor: "#f5f5f5",
};

const card = {
  width: "320px",
  backgroundColor: "#fff",
  padding: "24px",
  borderRadius: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

const title = {
  textAlign: "center",
  marginBottom: "20px",
};

const loadingWrap = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "30px 0",
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "#f0f0f0",
  padding: "10px 12px",
  borderRadius: "8px",
  marginBottom: "12px",
};

const label = {
  fontWeight: "500",
};

const toggle = {
  width: "50px",
  height: "26px",
  borderRadius: "50px",
  position: "relative",
  cursor: "pointer",
  transition: "0.3s",
};

const circle = {
  width: "22px",
  height: "22px",
  backgroundColor: "#fff",
  borderRadius: "50%",
  position: "absolute",
  top: "2px",
  left: "0",
  transition: "0.3s",
};

const errorText = {
  color: "#c0392b",
  fontSize: "13px",
  textAlign: "center",
  marginBottom: "12px",
};

export default NotificationSettings;