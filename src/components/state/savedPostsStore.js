const listeners = new Set();

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function storageKeyFor(post) {
  return post?.postType === "video" ? "savedVideos" : "savedPosts";
}

export function isPostSaved(postId) {
  if (!postId) return false;
  const sp = readList("savedPosts");
  const sv = readList("savedVideos");
  return sp.some(p => p._id === postId) || sv.some(v => v._id === postId);
}

export function toggleSavedPost(post) {
  if (!post?._id) return false;
  const key = storageKeyFor(post);
  let list = readList(key);
  const alreadySaved = list.some(item => item._id === post._id);

  if (alreadySaved) {
    list = list.filter(item => item._id !== post._id);
  } else {
    list.push(post);
  }
  writeList(key, list);

  const nextState = !alreadySaved;
  listeners.forEach(fn => fn(post._id, nextState));

  window.dispatchEvent(
    new CustomEvent(nextState ? "postSaved" : "postUnsaved", {
      detail: nextState ? { post } : { postId: post._id, postType: post.postType },
    })
  );

  return nextState;
}

export function subscribeSavedPosts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}