// src/utils/notificationHandoff.js
// ─────────────────────────────────────────────────────────────────────────
// Shared sessionStorage "handoff" helpers so tapping a notification can
// tell the destination screen not just WHERE to go, but WHICH sheet to
// pop open when it gets there (Likes sheet / Comments sheet), and, for
// comment/reply notifications, which exact comment or reply to scroll to
// and highlight.
//
// Same trick activitypage.jsx already used for stories/memories
// (sessionStorage handoff, consumed once on the destination's mount) —
// this file just centralizes it and extends it to post/reel/text-post
// likes+comments too.
// ─────────────────────────────────────────────────────────────────────────

const POST_SHEET_KEY = "openPostSheet";

// notif.type -> which sheet to auto-open on the post/reel/text-post screen
export const SHEET_FOR_POST_NOTIF = {
  like_post: "likes",
  like_comment: "comments",
  like_reply: "comments",
  comment: "comments",
  reply: "comments",
};

export function stashPostSheet({ postId, sheet, commentId = null, replyId = null }) {
  if (!postId || !sheet) return;
  try {
    sessionStorage.setItem(
      POST_SHEET_KEY,
      JSON.stringify({ postId: postId.toString(), sheet, commentId, replyId })
    );
  } catch {
    /* non-fatal */
  }
}

// Call once, on the post/reel/text-post screen's mount (or once the post's
// real _id is known). Returns the pending sheet info only if it was left
// for THIS post, and always clears the key so it can't re-fire on a later
// visit, refresh, or a different post rendered from the same list.
export function consumePostSheet(postId) {
  try {
    const raw = sessionStorage.getItem(POST_SHEET_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(POST_SHEET_KEY);
    const data = JSON.parse(raw);
    if (!postId || data.postId !== postId.toString()) return null;
    return data;
  } catch {
    return null;
  }
}

const MEMORY_HANDOFF_KEY = "openMemory";

// notif.type -> which sheet to auto-open inside MemoryViewer
export const SHEET_FOR_MEMORY_NOTIF = {
  memory_like: "likes",
  memory_like_comment: "comments",
  memory_like_reply: "comments",
  memory_comment: "comments",
  memory_reply: "comments",
};

// Superset of the { groupId, itemId } payload Profilepage.jsx /
// UserProfileView.jsx already read to pick the slide — now also carries
// which sheet (if any) MemoryViewer should open, plus which comment/reply
// to highlight.
export function stashMemorySheet({ groupId, itemId, sheet = null, commentId = null, replyId = null }) {
  if (!groupId || !itemId) return;
  try {
    sessionStorage.setItem(
      MEMORY_HANDOFF_KEY,
      JSON.stringify({
        groupId: groupId.toString(),
        itemId: itemId.toString(),
        sheet,
        commentId,
        replyId,
      })
    );
  } catch {
    /* non-fatal */
  }
}

// Reads + clears the whole memory handoff object in one shot. Existing
// callers that only used groupId/itemId keep working unchanged — sheet/
// commentId/replyId just come along for the ride now.
export function readMemoryHandoff() {
  try {
    const raw = sessionStorage.getItem(MEMORY_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(MEMORY_HANDOFF_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const STORY_VIEWERS_KEY = "openStoryViewers";

// story_view / story_like notifications don't carry a "who liked" list —
// StoryViewer only has one people-sheet (Viewers), so both types open that.
export function stashStoryViewers() {
  try {
    sessionStorage.setItem(STORY_VIEWERS_KEY, "1");
  } catch {
    /* non-fatal */
  }
}

export function consumeStoryViewers() {
  try {
    const v = sessionStorage.getItem(STORY_VIEWERS_KEY);
    sessionStorage.removeItem(STORY_VIEWERS_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

const STORY_TARGET_ID_KEY = "openStoryId";

// FIXED — the notification handoff previously only carried WHICH USER's
// stories to open, never WHICH SPECIFIC STORY ITEM. handleOpenStory
// already validates that the exact story still exists before navigating,
// but was throwing that id away — so Home.jsx's preview always fell back
// to its default (slide 0), regardless of which story was actually
// liked/viewed. This carries that id through so the preview can jump to
// the right slide.
export function stashOpenStoryId(storyId) {
  if (!storyId) return;
  try {
    sessionStorage.setItem(STORY_TARGET_ID_KEY, storyId.toString());
  } catch {
    /* non-fatal */
  }
}

export function consumeOpenStoryId() {
  try {
    const v = sessionStorage.getItem(STORY_TARGET_ID_KEY);
    sessionStorage.removeItem(STORY_TARGET_ID_KEY);
    return v || null;
  } catch {
    return null;
  }
}