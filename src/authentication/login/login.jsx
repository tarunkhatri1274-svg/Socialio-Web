import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;
console.log("Google Client ID:", import.meta.env.VITE_GOOGLE_CLIENT_ID);

function Loginform() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false); // NEW
  const navigate = useNavigate();

  const handlelogin = async () => {
    setIsLoggingIn(true);
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify({
          _id: data._id,
          username: data.username,
          email: data.email,
        }));
        navigate("/home");
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const [googleBusy, setGoogleBusy] = useState(false);

  const handleGoogleSuccess = async (credentialResponse) => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const response = await fetch(`${API}/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: credentialResponse.credential }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify({
          _id: data._id,
          username: data.username,
          email: data.email,
        }));
        navigate("/home");
      } else if (data.notRegistered) {
        alert("No account found with this Google email. Please register first.");
        navigate("/verify-email");
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Google login error:", error);
      alert("Google login failed. Please try again.");
    } finally {
      setGoogleBusy(false);
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
        <h1 style={{
          marginBottom: '25px',
          color: '#333'
        }}>
          Login
        </h1>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          type="text"
          placeholder="Enter your username"
          disabled={isLoggingIn}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '15px'
          }}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Enter your password"
          disabled={isLoggingIn}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '20px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '15px'
          }}
        />
        <p
          onClick={() => navigate("/forgotpassword")}
          style={{
            textAlign: "right",
            fontSize: "13px",
            color: "#eab676",
            cursor: "pointer",
            marginBottom: "15px"
          }}
        >
          Forgot Password?
        </p>

        <button
          onClick={handlelogin}
          disabled={isLoggingIn}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: '#eab676',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isLoggingIn ? 'not-allowed' : 'pointer',
            opacity: isLoggingIn ? 0.7 : 1
          }}
        >
          {isLoggingIn ? "Logging in..." : "Login"}
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

        {/* Google Login — custom "Login with Google" text overlaying the real button */}
        <div style={{ position: 'relative', width: '100%', height: '44px' }}>
          {/* Real Google button — invisible but clickable */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, overflow: 'hidden' }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => alert("Google login failed")}
              width="316"
            />
          </div>

          {/* Fake button — what the user actually sees */}
          <button
            type="button"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              padding: '12px',
              fontSize: '15px',
              backgroundColor: 'white',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              pointerEvents: 'none' // clicks pass through to the real button underneath
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
            </svg>
            Login with Google
          </button>
        </div>

        <p style={{ marginTop: '15px', fontSize: '14px' }}>
          Don't have an account?{" "}
          <span
            onClick={() => navigate('/registeruser')}
            style={{ color: '#eab676', cursor: 'pointer', fontWeight: 'bold' }}
          >
            register
          </span>
        </p>

      </div>
    </div>
  );
}

export default Loginform;