const KEY = "viewed_posts_v1";
const MAX = 3000;

// returns true only the FIRST time this browser sees this post
export function markViewOnce(postId) {
  try {
    const id = String(postId);
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (list.includes(id)) return false;
    list.push(id);
    if (list.length > MAX) list.splice(0, list.length - MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return true;
  }
}