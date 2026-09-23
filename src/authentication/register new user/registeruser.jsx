import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "../../logo";
const API = import.meta.env.VITE_API_URL;

function RegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false); // NEW

  const navigate = useNavigate();
  const { state } = useLocation();
  const email = state?.email;

  useEffect(() => {
    if (!email) {
      navigate("/verify-email");
    }
  }, [email, navigate]);

  const handleregister = async () => {
    setError("");

    if (password.length < 6) {
      return setError("Password must be at least 6 characters");
    }

    if (password !== confirmPassword) {
      return setError("Passwords do not match");
    }

    if (!age) {
      return setError("Please enter your age");
    }

    const numericAge = Number(age);
    if (isNaN(numericAge) || numericAge <= 0) {
      return setError("Please enter a valid age");
    }

    if (numericAge < 18) {
      return setError("You are not eligible to use Socialio");
    }

    if (!gender) {
      return setError("Please select your gender");
    }

    setIsRegistering(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          email,
          password,
          age: numericAge,
          gender,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify({
          _id: data._id,
          username: data.username,
          email: data.email,
        }));
        navigate("/home");
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Something went wrong");
    } finally {
      setIsRegistering(false);
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
          <Logo/>
        </div>

        <h1 style={{ marginBottom: '15px', color: '#333' }}>
          Register
        </h1>

        <p style={{ fontSize: '14px', marginBottom: '15px', color: '#666' }}>
          Registering with: {email}
        </p>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          type="text"
          placeholder="Username (lowercase, no spaces)"
          disabled={isRegistering}
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
          disabled={isRegistering}
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
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
          placeholder="Confirm password"
          disabled={isRegistering}
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
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))}
          type="text"
          inputMode="numeric"
          placeholder="Age"
          disabled={isRegistering}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '15px'
          }}
        />

        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          disabled={isRegistering}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '15px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '15px',
            color: gender ? '#333' : '#999',
            backgroundColor: 'white'
          }}
        >
          <option value="" disabled>Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>

        {error && (
          <p style={{ color: 'red', marginBottom: '10px', fontSize: '14px' }}>
            {error}
          </p>
        )}

        <button
          onClick={handleregister}
          disabled={isRegistering}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: '#eab676',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isRegistering ? 'not-allowed' : 'pointer',
            opacity: isRegistering ? 0.7 : 1
          }}
        >
          {isRegistering ? "Creating Account..." : "Register"}
        </button>

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

export default RegisterForm;