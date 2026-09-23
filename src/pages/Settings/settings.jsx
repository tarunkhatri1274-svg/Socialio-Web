import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
const API = import.meta.env.VITE_API_URL;

function Settings() {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const handleDeleteAccount = () => navigate("/delete-account");
  const changepassword = () => navigate("/changepassword");
  const privacytoggle = () => navigate("/privacy");
  const notificationsettings = () => navigate("/notification");
  const blocked = () => navigate("/blocked");

  const handleLogout = async () => {
    setError("");
    setLoggingOut(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (err) {
      // Even if the request fails, still log the user out locally
      console.log("Logout request failed:", err.message);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setLoggingOut(false);
      navigate("/login");
    }
  };

  return (
    <div style={container}>
      <div style={card}>
        <h2 style={title}>Account Settings</h2>

        <button onClick={handleDeleteAccount} style={btn}>Delete Account</button>
        <button onClick={changepassword} style={btn}>Change Password</button>
        <button onClick={privacytoggle} style={btn}>Privacy Settings</button>
        <button onClick={blocked} style={btn}>Blocked Accounts</button>
        <button onClick={notificationsettings} style={btn}>Notification Settings</button>

        {error && <p style={errorText}>{error}</p>}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            ...btn,
            ...logoutBtn,
            opacity: loggingOut ? 0.7 : 1,
            cursor: loggingOut ? "not-allowed" : "pointer",
          }}
        >
          {loggingOut ? "Logging out..." : "Log Out"}
        </button>
      </div>
    </div>
  );
}

const container = {
  display: "flex", justifyContent: "center",
  alignItems: "center", minHeight: "100vh", backgroundColor: "#f0f2f5",
};
const card = {
  width: "100%", maxWidth: "320px", backgroundColor: "white",
  borderRadius: "12px", padding: "20px", boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  textAlign: "center",
};
const title = {
  marginBottom: "20px", color: "#333",
};
const btn = {
  width: "100%",
  padding: "12px", marginBottom: "10px", border: "none",
  borderRadius: "8px", backgroundColor: "#e4e6eb",
  cursor: "pointer", fontSize: "14px",
};
const logoutBtn = {
  backgroundColor: "#fddede",
  color: "#b91c1c",
  fontWeight: "bold",
};
const errorText = {
  color: "red", fontSize: "13px", marginBottom: "10px",
};

export default Settings;