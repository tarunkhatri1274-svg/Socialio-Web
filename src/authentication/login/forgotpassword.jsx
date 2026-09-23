import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false); // NEW
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    if (!email) {
      alert("Please enter your email");
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message);
        return;
      }

      // ✅ PASS EMAIL VIA NAVIGATION
      navigate("/otpverify", { state: { email } });

    } catch (error) {
      console.error(error);
      alert("Error sending OTP");
    } finally {
      setIsSendingOtp(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Logo />

        <h1 style={styles.title}>Forgot Password</h1>

        <input
          style={styles.input}
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSendingOtp}
        />

        <button
          style={{
            ...styles.button,
            opacity: isSendingOtp ? 0.7 : 1,
            cursor: isSendingOtp ? "not-allowed" : "pointer"
          }}
          onClick={handleSendOtp}
          disabled={isSendingOtp}
        >
          {isSendingOtp ? "Sending OTP..." : "Send OTP"}
        </button>

        <p style={styles.link} onClick={() => navigate("/")}>
          Back to Login
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;

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
    margin: "15px 0",
    fontSize: "24px",
    color: "#333",
  },

  input: {
    width: "100%",
    padding: "12px",
    margin: "15px 0",
    borderRadius: "8px",
    border: "1px solid #ccc",
    outline: "none",
    fontSize: "14px",
  },

  button: {
    width: "100%",
    padding: "12px",
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