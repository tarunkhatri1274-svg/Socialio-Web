import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;

function OtpVerifyPage() {
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false); // NEW
  const [isResending, setIsResending] = useState(false); // NEW
  const navigate = useNavigate();
  const { state } = useLocation();

  const handleVerifyOtp = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: state?.email,
          otp,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        navigate("/registeruser", { state: { email: state?.email } });
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    try {
      await fetch(`${API}/auth/resend-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: state?.email }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsResending(false);
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

        <h1 style={{ marginBottom: '10px', color: '#333' }}>
          Enter OTP
        </h1>

        <p style={{ fontSize: '14px', marginBottom: '20px', color: '#666' }}>
          OTP sent to {state?.email}
        </p>

        <input
          type="text"
          placeholder="Enter 6-digit OTP"
          value={otp}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "");
            setOtp(value);
          }}
          maxLength={6}
          disabled={isVerifying}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '20px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '15px',
            textAlign: 'center',
            letterSpacing: '5px'
          }}
        />

        <button
          onClick={handleVerifyOtp}
          disabled={isVerifying}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: '#eab676',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isVerifying ? 'not-allowed' : 'pointer',
            opacity: isVerifying ? 0.7 : 1
          }}>
          {isVerifying ? "Verifying..." : "Verify OTP"}
        </button>

        <p style={{ marginTop: '15px', fontSize: '14px' }}>
          Didn't receive OTP?{" "}
          <span
            onClick={isResending ? undefined : handleResendOtp}
            style={{
              color: '#eab676',
              cursor: isResending ? 'default' : 'pointer',
              fontWeight: 'bold',
              opacity: isResending ? 0.6 : 1
            }}>
            {isResending ? "Resending..." : "Resend"}
          </span>
        </p>

      </div>
    </div>
  );
}

export default OtpVerifyPage;