const API = import.meta.env.VITE_API_URL;
const getToken = () => localStorage.getItem("token");

let mutedMap = {};
const listeners = new Set();

export async function loadMutedMap() {
  try {
    const res = await fetch(`${API}/mute`, {           // ← was /auth/muted
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (data.success) {
      mutedMap = data.muted;
      listeners.forEach((l) => l(mutedMap));
    }
  } catch {}
  return mutedMap;
}

export function getMutedMap() {
  return mutedMap;
}

export function subscribeMuted(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function toggleMuteApi(userId, type) {
  try {
    const res = await fetch(`${API}/mute/${userId}`, {  // ← was /auth/mute/:id
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (data.success) {
      mutedMap = {
        ...mutedMap,
        [userId]: { muteStory: data.muteStory, mutePost: data.mutePost, muteMessage: data.muteMessage },
      };
      listeners.forEach((l) => l(mutedMap));
    }
    return data;
  } catch (err) {
    console.error("toggleMuteApi failed:", err);
    return { success: false };
  }
}