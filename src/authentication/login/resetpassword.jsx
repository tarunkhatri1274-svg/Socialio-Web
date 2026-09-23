import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;

function ResetPassword() {
  const { state } = useLocation();
  const email = state?.email;
  const otp = state?.otp; // ⚠️ currently always undefined — see note below

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false); // NEW
  const navigate = useNavigate();

  // ✅ FIX: guard against missing email (direct visit / refresh / expired session)
  useEffect(() => {
    if (!email) {
      alert("Session expired. Please try again.");
      navigate("/forgot-password");
    }
  }, [email, navigate]);

  if (!email) {
    return null;
  }

  const handleReset = async () => {
    if (password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          newPassword: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message);
        return;
      }

      alert("Password reset successful ✅");
      navigate("/"); // go to login page
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Logo />

        <h1 style={styles.title}>Reset Password</h1>
        <p style={styles.subtitle}>Create a new password</p>

        <input
          type="password"
          placeholder="New Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isResetting}
          style={styles.input}
        />

        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isResetting}
          style={styles.input}
        />

        <button
          style={{
            ...styles.button,
            opacity: isResetting ? 0.7 : 1,
            cursor: isResetting ? "not-allowed" : "pointer"
          }}
          onClick={handleReset}
          disabled={isResetting}
        >
          {isResetting ? "Resetting Password..." : "Reset Password"}
        </button>

        <p style={styles.link} onClick={() => navigate("/")}>
          Back to Login
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "rgb(234, 182, 118)",
    fontFamily: "Poppins, sans-serif",
  },

  card: {
    background: "#fff",
    padding: "40px",
    width: "350px",
    borderRadius: "15px",
    textAlign: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
  },

  title: {
    margin: "10px 0",
    fontSize: "24px",
    color: "#333",
  },

  subtitle: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "20px",
  },

  input: {
    width: "100%",
    padding: "12px",
    margin: "10px 0",
    borderRadius: "8px",
    border: "1px solid #ccc",
    outline: "none",
    fontSize: "14px",
  },

  button: {
    width: "100%",
    padding: "12px",
    marginTop: "10px",
    border: "none",
    borderRadius: "8px",
    background: "rgb(234, 182, 118)",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
  },

  link: {
    marginTop: "15px",
    fontSize: "14px",
    color: "rgb(234, 182, 118)",
    cursor: "pointer",
  },
};