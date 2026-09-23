import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
const API = import.meta.env.VITE_API_URL;

function ChangePassword() {
  const navigate = useNavigate();
  const [CurrentPassword, SetCurrentPassword] = useState("");
  const [Newpassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState(0); // 0=change password, 1=email, 2=otp, 3=reset
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");

  // NEW: loading states for each async action
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (Newpassword !== confirmPassword) {
      alert("New password and confirm password do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch(`${API}/auth/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          currentPassword: CurrentPassword,
          newPassword: Newpassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message);
        return;
      }

      alert(data.message);
      SetCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      navigate("/settings");
    } catch (error) {
      console.error("Error changing password:", error);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email) {
      alert("Please enter your email");
      return;
    }

    setIsSendingOtp(true);
    try {
      const response = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (response.ok) {
        setStep(2);
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

  const handleVerifyOtp = async () => {
    if (!otp) {
      alert("Please enter the OTP");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const response = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: String(otp) })
      });
      const data = await response.json();
      if (response.ok) {
        setStep(3);
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      alert("Failed to verify OTP. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResetPassword = async () => {
    if (!password) {
      alert("Please enter a new password");
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword: password })
      });
      const data = await response.json();

      if (response.ok) {
        alert(data.message);
        navigate("/settings");
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Error resetting password:", error);
      alert("Failed to reset password. Please try again.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Reset Password</h2>

        {/* STEP 0: password */}
        {step === 0 && (
          <>
            <input
              type="password"
              placeholder="Enter your current password"
              value={CurrentPassword}
              onChange={(e) => SetCurrentPassword(e.target.value)}
              style={styles.input}
              disabled={isChangingPassword}
            />
            <input
              type="password"
              placeholder="Enter your new password"
              value={Newpassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={styles.input}
              disabled={isChangingPassword}
            />
            <input
              type="password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.input}
              disabled={isChangingPassword}
            />

            <button
              style={{
                ...styles.button,
                opacity: isChangingPassword ? 0.7 : 1,
                cursor: isChangingPassword ? "not-allowed" : "pointer"
              }}
              onClick={handleChangePassword}
              disabled={isChangingPassword}
            >
              {isChangingPassword ? "Changing Password..." : "Change Password"}
            </button>
            <p style={styles.forgotText} onClick={() => setStep(1)}>
              Forgot Password?
            </p>
          </>
        )}

        {/* STEP 1: EMAIL */}
        {step === 1 && (
          <>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
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
          </>
        )}

        {/* STEP 2: OTP */}
        {step === 2 && (
          <>
            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              style={styles.input}
              disabled={isVerifyingOtp}
            />

            <button
              style={{
                ...styles.button,
                opacity: isVerifyingOtp ? 0.7 : 1,
                cursor: isVerifyingOtp ? "not-allowed" : "pointer"
              }}
              onClick={handleVerifyOtp}
              disabled={isVerifyingOtp}
            >
              {isVerifyingOtp ? "Verifying OTP..." : "Verify OTP"}
            </button>
          </>
        )}

        {/* STEP 3: NEW PASSWORD */}
        {step === 3 && (
          <>
            <input
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={isResettingPassword}
            />

            <button
              style={{
                ...styles.button,
                opacity: isResettingPassword ? 0.7 : 1,
                cursor: isResettingPassword ? "not-allowed" : "pointer"
              }}
              onClick={handleResetPassword}
              disabled={isResettingPassword}
            >
              {isResettingPassword ? "Changing Password..." : "Change Password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ChangePassword;

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
    padding: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
    textAlign: "center",
  },
  title: {
    marginBottom: "20px",
    fontSize: "22px",
    fontWeight: "600",
    color: "#222",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    marginBottom: "12px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "14px",
    boxSizing: "border-box",
    outline: "none",
    color: "#333",
    backgroundColor: "#fafafa",
  },
  button: {
    width: "100%",
    padding: "12px",
    marginTop: "6px",
    backgroundColor: "#e8e8e8",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    cursor: "pointer",
    color: "#333",
    fontWeight: "500",
    transition: "0.2s",
  },
  forgotText: {
    marginTop: "14px",
    fontSize: "14px",
    color: "#555",
    cursor: "pointer",
    textDecoration: "underline",
  },
};