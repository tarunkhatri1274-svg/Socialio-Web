import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;

function OtpVerify() {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const inputRefs = useRef([]);

  const email = location.state?.email;

  // ✅ FIX: side effect moved into useEffect instead of running during render
  useEffect(() => {
    if (!email) {
      alert("Session expired. Please try again.");
      navigate("/forgot-password");
    }
  }, [email, navigate]);

  // ✅ FIX: bail out of rendering the form while redirecting
  if (!email) {
    return null;
  }

  const handleChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // ✅ FIX: added backspace handling to move focus back
  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpValue = otp.join("");

    if (otpValue.length !== 6) {
      alert("Enter complete OTP");
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, otp: otpValue }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message);
        return;
      }

      navigate("/resetpassword", { state: { email } });

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <Logo />

        <h1 style={styles.title}>Verify OTP</h1>

        <div style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <input
              key={index}
              id={`otp-${index}`}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              maxLength="1"
              value={digit}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={isVerifying}
              style={styles.otpInput}
            />
          ))}
        </div>

        <button
          style={{
            ...styles.button,
            opacity: isVerifying ? 0.7 : 1,
            cursor: isVerifying ? "not-allowed" : "pointer"
          }}
          onClick={handleVerify}
          disabled={isVerifying}
        >
          {isVerifying ? "Verifying..." : "Verify OTP"}
        </button>
      </div>
    </div>
  );
}

export default OtpVerify;

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

  otpContainer: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "20px",
  },

  otpInput: {
    width: "40px",
    height: "45px",
    fontSize: "18px",
    textAlign: "center",
    borderRadius: "8px",
    border: "1px solid #ccc",
    outline: "none",
  },

  button: {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    background: "rgb(234, 182, 118) ",
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