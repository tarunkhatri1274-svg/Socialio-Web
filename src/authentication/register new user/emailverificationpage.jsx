import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;
console.log("Google Client ID:", import.meta.env.VITE_GOOGLE_CLIENT_ID);

function EmailVerifyPage() {
  const [email, setEmail] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false); // NEW
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    setIsSendingOtp(true);
    try {
      const response = await fetch(`${API}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        navigate("/verify-otp", { state: { email } });
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      alert("Failed to send OTP. Please try again.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleGoogleSignup = async (credentialResponse) => {
    try {
      const response = await fetch(`${API}/auth/google-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: credentialResponse.credential }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.registered) {
          // Existing full account -> log straight in
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify({
            _id: data._id,
            username: data.username,
            email: data.email,
          }));
          navigate("/home");
        } else {
          // Email verified via Google, but still needs username/password
          navigate("/registeruser", { state: { email: data.email } });
        }
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Google signup error:", error);
      alert("Google signup failed. Please try again.");
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #eab676, #f5d3a2)',
    }}>
      <div style={{
        width: '90%',
        maxWidth: '400px',
        padding: '40px',
        borderRadius: '15px',
        backgroundColor: 'white',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>

        <div style={{ marginBottom: '20px' }}>
          <Logo />
        </div>

        <h1 style={{ marginBottom: '25px', color: '#333' }}>
          Verify Email
        </h1>

        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSendingOtp}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '20px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '15px'
          }}
        />

        <button
          onClick={handleSendOtp}
          disabled={isSendingOtp}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: '#eab676',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isSendingOtp ? 'not-allowed' : 'pointer',
            opacity: isSendingOtp ? 0.7 : 1
          }}>
          {isSendingOtp ? "Sending OTP..." : "Send OTP"}
        </button>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          margin: '20px 0',
          color: '#999',
          fontSize: '13px'
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd' }} />
          <span style={{ margin: '0 10px' }}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd' }} />
        </div>

        {/* Google Signup — creates account if none exists */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSignup}
            onError={() => alert("Google signup failed")}
            shape="pill"
            width="316"
            text="signup_with"
          />
        </div>

        <p style={{ marginTop: '15px', fontSize: '14px' }}>
          Already have an account?{" "}
          <span
            onClick={() => navigate('/login')}
            style={{ color: '#eab676', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Login
          </span>
        </p>

      </div>
    </div>
  );
}

export default EmailVerifyPage;