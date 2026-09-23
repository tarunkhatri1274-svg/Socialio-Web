import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

const API = import.meta.env.VITE_API_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function BlockedAccounts() {
  const navigate = useNavigate();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading]           = useState(true);

  // ── Fetch blocked users from backend ──────────────────────────────────────
  useEffect(() => {
    const fetchBlockedUsers = async () => {
      try {
        const res  = await fetch(`${API}/auth/blocked-users`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setBlockedUsers(data.blockedUsers);
        } else {
          console.error(data.message);
        }
      } catch (err) {
        console.error("Failed to fetch blocked users:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBlockedUsers();
  }, []);

  // ── Unblock ───────────────────────────────────────────────────────────────
  const handleUnblock = async (userId) => {
    try {
      const res  = await fetch(`${API}/auth/unblock/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setBlockedUsers((prev) => prev.filter((u) => u._id !== userId));
      } else {
        console.error(data.message);
      }
    } catch (err) {
      console.error("Unblock failed:", err);
    }
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <p style={{ color: "#aaa" }}>Loading...</p>
    </div>
  );

  return (
    <div style={styles.container}>

      {/* Top Bar */}
      <div style={styles.topBar}>
        <FiArrowLeft size={22} style={{ cursor: "pointer" }} onClick={() => navigate(-1)} />
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Blocked Accounts</h3>
        <div style={{ width: 22 }} />
      </div>

      {blockedUsers.length === 0 ? (
        <p style={styles.empty}>No blocked users</p>
      ) : (
        blockedUsers.map((user) => (
          <div key={user._id} style={styles.card}>
            <div style={styles.userInfo}>
              {user.profilePic ? (
                <img src={user.profilePic} alt="avatar" style={styles.avatar} />
              ) : (
                <div style={styles.avatarFallback}>
                  {user.username?.[0]?.toUpperCase()}
                </div>
              )}
              <span style={styles.username}>{user.username}</span>
            </div>
            <button style={styles.unblockBtn} onClick={() => handleUnblock(user._id)}>
              Unblock
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export default BlockedAccounts;

const styles = {
  container:      { maxWidth: "400px", margin: "auto", backgroundColor: "#fff", minHeight: "100vh", fontFamily: "sans-serif" },
  topBar:         { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", borderBottom: "1px solid #eee" },
  card:           { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", borderBottom: "1px solid #f0f0f0" },
  userInfo:       { display: "flex", alignItems: "center", gap: "10px" },
  avatar:         { width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover" },
  avatarFallback: { width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #d0d0d0, #b0b0b0)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "18px", color: "#fff" },
  username:       { fontWeight: "600", fontSize: "14px" },
  unblockBtn:     { padding: "7px 14px", backgroundColor: "#ff4d4f", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "13px" },
  empty:          { textAlign: "center", color: "gray", marginTop: "40px" },
};