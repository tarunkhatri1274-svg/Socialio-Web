import React, { useState, useEffect } from "react";

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

function PrivacyToggle() {

  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── load real privacy state on mount ──
  useEffect(() => {

    const fetchProfile = async () => {
      try {

        const res = await fetch(
          `${API}/auth/profile`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        const data = await res.json();

        if (data.success) {
          setIsPrivate(data.user.isPrivate);
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

  }, []);

  // ── toggle privacy ──
  const togglePrivacy = async () => {
    try {

      const res = await fetch(
        `${API}/auth/private/toggle`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      const data = await res.json();

      if (data.success) {
        setIsPrivate(data.isPrivate);
      }

    } catch (err) {
      console.error("Error toggling privacy:", err);
    }
  };

  // ── loading state: plain inline styles, since the `styles` object
  // below depends on `isPrivate` and can't be referenced before its
  // own declaration runs (const is in the temporal dead zone) ──
  if (loading) {
    return (
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        minHeight: "100vh", backgroundColor: "#f5f5f5",
      }}>
        <div style={{
          width: "100%", maxWidth: "320px", backgroundColor: "white", borderRadius: "12px",
          padding: "20px", boxShadow: "0 4px 10px rgba(0,0,0,0.1)", textAlign: "center",
        }}>
          <h2 style={{ marginBottom: "20px", color: "#333", fontWeight: "bold", fontSize: "22px" }}>
            Privacy Settings
          </h2>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "30px 0" }}>
            <ActivityIndicator size="large" />
          </div>
        </div>
      </div>
    );
  }

  const styles = {
    container: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      backgroundColor: "#f5f5f5",
    },

    card: {
      width: "100%",
      maxWidth: "320px",
      backgroundColor: "white",
      borderRadius: "12px",
      padding: "20px",
      boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
      textAlign: "center",
    },

    title: {
      marginBottom: "20px",
      color: "#333",
      fontWeight: "bold",
      fontSize: "22px",
    },

    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#f0f0f0",
      borderRadius: "8px",
      padding: "12px 16px",
      marginBottom: "10px",
    },

    text: {
      fontWeight: "bold",
      fontSize: "14px",
      fontFamily: "Arial",
    },

    toggle: {
      width: "60px",
      height: "30px",
      borderRadius: "30px",
      display: "flex",
      alignItems: "center",
      padding: "5px",
      cursor: "pointer",
      transition: "0.3s",
      backgroundColor: isPrivate
        ? "rgb(234,182,118)"
        : "#ccc",
    },

    circle: {
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      backgroundColor: "white",
      transition: "0.3s",
      transform: isPrivate
        ? "translateX(30px)"
        : "translateX(0px)",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        <h2 style={styles.title}>
          Privacy Settings
        </h2>

        <div style={styles.row}>

          <span style={styles.text}>
            {isPrivate
              ? "Private Account 🔒"
              : "Public Account 🌐"}
          </span>

          <div
            style={styles.toggle}
            onClick={togglePrivacy}
          >
            <div style={styles.circle}></div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default PrivacyToggle;