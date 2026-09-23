import React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
const API = import.meta.env.VITE_API_URL;

function DeleteAccount() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false); // NEW
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${API}/auth/delete-account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}` // ✅ send JWT
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.removeItem("token"); // ✅ clear token after deletion
        navigate("/login");
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Error deleting account:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={container}>
      <div style={card}>
        <h2 style={title}>Delete Account</h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          type="text"
          placeholder="enter username"
          style={inputStyle}
          disabled={isDeleting}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="enter password"
          style={inputStyle}
          disabled={isDeleting}
        />
        <input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
          placeholder="confirm password"
          style={inputStyle}
          disabled={isDeleting}
        />
        <button
          style={{
            ...btn,
            opacity: isDeleting ? 0.7 : 1,
            cursor: isDeleting ? "not-allowed" : "pointer"
          }}
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting Account..." : "Delete Account"}
        </button>
      </div>
    </div>
  );
}

const container = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  backgroundColor: "#f5f5f5",
};

const card = {
  width: "100%",
  maxWidth: "320px",
  backgroundColor: "white",
  borderRadius: "12px",
  padding: "20px",
  boxShadow: "0 4px 10px rgba(0, 0, 0, 0.1)",
  textAlign: "center",
};

const title = {
  marginBottom: "20px",
  fontSize: "22px",
  fontWeight: "bold",
  color: "#222",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  marginBottom: "12px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
  color: "#333",
  backgroundColor: "#fafafa",
};

const btn = {
  width: "100%",
  padding: "12px",
  marginTop: "4px",
  backgroundColor: "#e8e8e8",
  border: "none",
  borderRadius: "8px",
  fontSize: "15px",
  cursor: "pointer",
  color: "#333",
  fontWeight: "500",
};

export default DeleteAccount;