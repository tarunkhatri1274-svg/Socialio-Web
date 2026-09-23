// services/authService.js
//
// Fixed version — original had four bugs that meant this file would crash
// the moment either function was called:
//   1. JSON.stingify (typo) instead of JSON.stringify
//   2. header: instead of headers: (singular vs plural — fetch silently
//      ignores unknown options, so Content-Type was never actually sent)
//   3. registerUser/loginUser referenced `username`/`password` without
//      ever receiving them as parameters — undefined variable crash
//   4. loginUser's return statement referenced `response`, but the actual
//      variable in scope was named `enteruser`
//
// Both functions now take their values as parameters and return the
// parsed JSON response, matching how Loginform.jsx's inline fetch already
// behaves so this can be swapped in as a drop-in replacement.

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const registerUser = async (username, password, email) => {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "Registration failed");
  }

  return res.json();
};

const loginUser = async (username, password) => {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "Login failed");
  }

  return res.json();
};

export default { registerUser, loginUser };