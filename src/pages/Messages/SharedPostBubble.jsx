import React, { useEffect, useState, useRef } from "react";

const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
const getToken = () => localStorage.getItem("token");

const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { Authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

const GroupIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const RepostIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;

/**
 * Inline post viewer — opens as a centered overlay on top of the chat
 * (same z-index pattern as CallScreen/IncomingCallModal in Messages.jsx)
 * instead of navigating to a separate /post page. Supports the same
 * multi-image carousel as the real post page (post.media is an array).
 */
// ── Builds the Instagram-style italic caption shown above a shared
// post/story card in the chat window — e.g. "You shared a post",
// "username shared a story", "username mentioned you in their story".
// Used identically by MessageBubble (1:1) and GroupMessageBubble (group)
// so the wording stays consistent everywhere a sharedPost renders.
export function getShareCaption(msg, fromMe, otherUsername) {
  if (!msg?.sharedPost) return null;
  const isStory = msg.sharedPost.kind === "story";
  const senderName = msg.user?.username || "Someone";

  if (msg.isMentionMessage) {
    return fromMe
      ? `You mentioned ${otherUsername || "them"} in your story`
      : `${senderName} mentioned you in their story`;
  }

  if (isStory) {
    return fromMe ? "You shared a story" : `${senderName} shared a story`;
  }

  return fromMe ? "You shared a post" : `${senderName} shared a post`;
}
function PostViewerOverlay({ post, onClose }) {
  const [index, setIndex] = useState(0);

  if (!post) return null;

  const mediaList = Array.isArray(post.media) && post.media.length > 0
    ? post.media
    : (post.mediaUrl ? [{ url: post.mediaUrl, type: post.mediaType }] : []);

  const current = mediaList[index] || null;
  const isVideo = current?.type === "video";
  const hasMultiple = mediaList.length > 1;

  const goNext = (e) => {
    e.stopPropagation();
    setIndex((i) => (i + 1) % mediaList.length);
  };
  const goPrev = (e) => {
    e.stopPropagation();
    setIndex((i) => (i - 1 + mediaList.length) % mediaList.length);
  };

  return (
    <div style={ov.overlay} onClick={onClose}>
      <div style={ov.card} onClick={(e) => e.stopPropagation()}>
        <div style={ov.header}>
          {post.authorProfilePic || post.user?.profilePic || post.author?.profilePic ? (
            <img src={post.authorProfilePic || post.user?.profilePic || post.author?.profilePic} alt="" style={ov.avatar} />
          ) : (
            <div style={{ ...ov.avatar, background: GOLDEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
              {(post.authorUsername || post.user?.username || post.author?.username || "?")[0]?.toUpperCase()}
            </div>
          )}
          <span style={ov.username}>{post.authorUsername || post.user?.username || post.author?.username}</span>
          <button style={ov.closeBtn} onClick={onClose}>✕</button>
        </div>

        {current && (
          <div style={{ ...ov.mediaWrap, position: "relative" }}>
            {isVideo ? (
              <video src={current.url} style={ov.media} controls autoPlay playsInline />
            ) : (
              <img src={current.url} alt="" style={ov.media} />
            )}

            {hasMultiple && (
              <>
                <button onClick={goPrev} style={{ ...ov.navBtn, left: 8 }}>‹</button>
                <button onClick={goNext} style={{ ...ov.navBtn, right: 8 }}>›</button>
                <div style={ov.dotsWrap}>
                  {mediaList.map((_, i) => (
                    <span key={i} style={{ ...ov.dot, opacity: i === index ? 1 : 0.4 }} />
                  ))}
                </div>
                <div style={ov.counter}>{index + 1}/{mediaList.length}</div>
              </>
            )}
          </div>
        )}

        {(post.caption || post.text) && <p style={ov.caption}>{post.caption || post.text}</p>}
      </div>
    </div>
  );
}

/**
 * Inline story viewer — same overlay pattern, no navigation away from chat.
 * Story model stores media as a nested object { url, type }, not a flat
 * string field — story.mediaUrl never existed on its own, hence the
 * fallback chain below.
 */
function StoryViewerOverlay({ story, author, onClose }) {
  if (!story) return null;

  const mediaUrl = story.media?.url || story.mediaUrl || null;
  const isVideo = story.media?.type === "video" || story.mediaType === "video";

  return (
    <div style={ov.overlay} onClick={onClose}>
      <div style={{ ...ov.card, background: "#000" }} onClick={(e) => e.stopPropagation()}>
        <div style={ov.storyHeader}>
          {author?.profilePic ? (
            <img src={author.profilePic} alt="" style={ov.avatar} />
          ) : (
            <div style={{ ...ov.avatar, background: GOLDEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
              {author?.username?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <span style={{ ...ov.username, color: "#fff" }}>{author?.username}</span>
          <button style={{ ...ov.closeBtn, color: "#fff" }} onClick={onClose}>✕</button>
        </div>

        <div style={{ ...ov.mediaWrap, aspectRatio: "9/16", maxHeight: "70vh", background: "#000" }}>
          {mediaUrl ? (
            isVideo ? (
              <video src={mediaUrl} style={ov.media} controls autoPlay playsInline />
            ) : (
              <img src={mediaUrl} alt="" style={ov.media} />
            )
          ) : (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>No media found for this story.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders a shared post OR a shared story inside a chat bubble.
 * Tapping it opens an inline overlay (PostViewerOverlay / StoryViewerOverlay)
 * directly on top of the chat — it does NOT navigate to a different route.
 *
 * Used identically in 1:1 chats AND group chats — the sharedPost payload
 * shape is the same either way (see message.controllers.js / group
 * share.controller.js), so this component has no idea (and doesn't need
 * to know) whether it's rendering inside a 1:1 bubble or a group bubble.
 * GroupChatWindow.jsx should import THIS component directly rather than
 * a duplicate, so viewing/expiry behavior stays in one place.
 *
 * NEW: `isMentionMessage` — when true AND sharedPost.kind === "story" AND
 * this bubble is being rendered for the RECIPIENT (fromMe === false, since
 * a mention message's `user` field is the story author, not the viewer),
 * shows an "Add to Your Story" action that reposts the original story's
 * media onto the current viewer's own story via POST /stories/repost/:id.
 */
export function SharedPostBubble({ sharedPost, fromMe, isMentionMessage }) {
  const [expanded, setExpanded] = useState(false);
  // null | "checking" | "available" | "expired" | "denied"
  const [storyStatus, setStoryStatus] = useState(null);
  const [opening, setOpening] = useState(false);
  const videoRef = useRef(null);

  // Drives the inline overlays
  const [viewingPost, setViewingPost] = useState(null);   // post object | null
  const [viewingStory, setViewingStory] = useState(null); // { story, author } | null

  // "Add to Your Story" state
  const [reposting, setReposting] = useState(false);
  const [reposted, setReposted] = useState(false);

  const isStory = sharedPost?.kind === "story";
  const canAddToStory = isMentionMessage && isStory && !fromMe && storyStatus !== "expired" && storyStatus !== "denied";

  // ── Check story availability on mount. Uses raw fetch (not apiFetch)
  // because apiFetch throws on non-2xx, which would make a 403
  // (viewer doesn't follow the author) indistinguishable from a genuine
  // network failure — we need to treat those two cases differently.
  useEffect(() => {
    if (!isStory || !sharedPost?.storyId) return;
    setStoryStatus("checking");

    fetch(`${API}/stories/get-user-stories/${sharedPost.authorId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (res) => {
        if (res.status === 403) {
          setStoryStatus("denied");
          return;
        }
        const data = await res.json();
        const stillThere = data.success && data.stories?.some(s => s._id === sharedPost.storyId);
        setStoryStatus(stillThere ? "available" : "expired");
      })
      .catch(() => setStoryStatus("expired"));
  }, [isStory, sharedPost?.storyId, sharedPost?.authorId]);

  if (!sharedPost) return null;

  const openPost = async () => {
    if (!sharedPost.authorId || !sharedPost.postId) {
      console.warn("Cannot open shared post: missing authorId or postId on sharedPost payload.");
      return;
    }
    setOpening(true);
    try {
      const data = await apiFetch(`${API}/auth/get-posts/${sharedPost.authorId}`);
      const allPosts = data.success ? data.posts : [];
      const post = allPosts.find(p => p._id === sharedPost.postId);

      if (!post) {
        alert("This post is no longer available.");
        return;
      }

      setViewingPost(post);
    } catch (err) {
      console.error("Failed to open shared post:", err);
      alert("Couldn't open this post.");
    } finally {
      setOpening(false);
    }
  };

  // Uses raw fetch (not apiFetch) so a 403 can be handled explicitly
  // instead of being thrown into a silent catch block that never
  // updated storyStatus.
  const openStory = async () => {
    setOpening(true);
    try {
      const res = await fetch(`${API}/stories/get-user-stories/${sharedPost.authorId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (res.status === 403) {
        setStoryStatus("denied");
        return;
      }

      const data = await res.json();
      const story = data.success ? data.stories?.find(s => s._id === sharedPost.storyId) : null;

      if (!story) {
        setStoryStatus("expired");
        return;
      }

      setViewingStory({
        story,
        author: { username: sharedPost.authorUsername, profilePic: sharedPost.authorProfilePic },
      });
    } catch (err) {
      console.error("Failed to open shared story:", err);
    } finally {
      setOpening(false);
    }
  };

  const handleOpen = () => {
    // Kill the inline preview video's playback/sound first — otherwise it
    // keeps playing behind the full-screen overlay (which starts its own
    // <video>), and you get two audio tracks running at once.
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.muted = true;
    }
    setExpanded(false);

    if (isStory) {
      if (storyStatus === "available") openStory();
      return;
    }
    openPost();
  };

  const handleVideoTap = (e) => {
    e.stopPropagation();
    if (!expanded) { setExpanded(true); return; }
    const vid = videoRef.current;
    if (!vid) return;
    vid.paused ? vid.play() : vid.pause();
  };

  // ── "Add to Your Story" — reuses the original story's Cloudinary asset
  // server-side (no re-upload), goes live on the current user's story
  // immediately. Stops propagation so it doesn't also trigger handleOpen.
  const handleAddToStory = async (e) => {
    e.stopPropagation();
    if (reposting || reposted || !sharedPost.storyId) return;
    setReposting(true);
    try {
      const res = await fetch(`${API}/stories/repost/${sharedPost.storyId}`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setReposted(true);
      } else {
        alert(data.message || "Couldn't add to your story.");
      }
    } catch (err) {
      console.error("Failed to repost story:", err);
      alert("Couldn't add to your story.");
    } finally {
      setReposting(false);
    }
  };

  // ── expired story ───────────────────────────────────────────────────
  if (isStory && storyStatus === "expired") {
    return (
      <div style={{ ...s.card, background: fromMe ? "rgba(255,255,255,0.1)" : "#f0f2f5", opacity: 0.7 }}>
        <div style={s.expiredRow}>
          <span style={{ fontSize: 18 }}>⏱️</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: fromMe ? "#fff" : "#111" }}>Story no longer available</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: fromMe ? "rgba(255,255,255,0.6)" : "#999" }}>This story has expired</p>
          </div>
        </div>
      </div>
    );
  }

  // ── viewer doesn't follow the story author (backend's followers-only gate) ──
  if (isStory && storyStatus === "denied") {
    return (
      <div style={{ ...s.card, background: fromMe ? "rgba(255,255,255,0.1)" : "#f0f2f5", opacity: 0.7 }}>
        <div style={s.expiredRow}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: fromMe ? "#fff" : "#111" }}>Story unavailable</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: fromMe ? "rgba(255,255,255,0.6)" : "#999" }}>
              Follow {sharedPost.authorUsername || "this user"} to view their story
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {viewingPost && (
        <PostViewerOverlay post={viewingPost} onClose={() => setViewingPost(null)} />
      )}
      {viewingStory && (
        <StoryViewerOverlay
          story={viewingStory.story}
          author={viewingStory.author}
          onClose={() => setViewingStory(null)}
        />
      )}

      <div
        style={{
          ...s.card,
          cursor: opening ? "wait" : (isStory ? storyStatus === "available" : true) ? "pointer" : "default",
          opacity: opening ? 0.7 : 1,
        }}
        onClick={handleOpen}
      >
        <div style={s.headerRow}>
          {sharedPost.authorProfilePic ? (
            <img src={sharedPost.authorProfilePic} alt="" style={s.tinyAvatar} />
          ) : (
            <div style={{ ...s.tinyAvatar, background: GOLDEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>
              {sharedPost.authorUsername?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <span style={s.headerName}>{sharedPost.authorUsername}</span>
          {isStory && <span style={s.storyPill}>{isMentionMessage ? "Mentioned you" : "Story"}</span>}
        </div>

        {sharedPost.mediaUrl && (
          <div style={s.mediaWrap} onClick={sharedPost.mediaType === "video" ? handleVideoTap : undefined}>
            {sharedPost.mediaType === "video" ? (
              <>
                <video
                  ref={videoRef}
                  src={sharedPost.mediaUrl}
                  style={s.media}
                  playsInline
                  muted={!expanded}
                  controls={expanded}
                  loop={!expanded}
                  autoPlay={!expanded}
                />
                {!expanded && (
                  <div style={s.playOverlay}>
                    <svg viewBox="0 0 24 24" width="34" height="34" fill="rgba(255,255,255,0.92)"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.35)" /><polygon points="10,8 17,12 10,16" /></svg>
                  </div>
                )}
              </>
            ) : (
              <img src={sharedPost.mediaUrl} alt="" style={s.media} />
            )}
          </div>
        )}

        {sharedPost.caption && (
          <p style={{ ...s.caption, color: fromMe ? "rgba(255,255,255,0.85)" : "#444" }}>
            {sharedPost.caption.length > 80 ? sharedPost.caption.slice(0, 80) + "…" : sharedPost.caption}
          </p>
        )}

        {/* ── NEW: Add to Your Story — only for the mentioned recipient,
            only while the original story is still viewable */}
        {canAddToStory && (
          <button
            onClick={handleAddToStory}
            disabled={reposting || reposted}
            style={{
              ...s.repostBtn,
              background: reposted ? "rgba(76,175,80,0.15)" : GOLDEN,
              color: reposted ? "#2e7d32" : "#fff",
              cursor: reposted ? "default" : "pointer",
              opacity: reposting ? 0.7 : 1,
            }}
          >
            {reposted ? "Added to Your Story ✓" : (
              <>
                <RepostIcon />
                {reposting ? "Adding…" : "Add to Your Story"}
              </>
            )}
          </button>
        )}

        <p style={{ ...s.tapHint, color: fromMe ? "rgba(255,255,255,0.55)" : "#999" }}>
          {isStory
            ? (storyStatus === "checking" || storyStatus === null ? "Checking…" : "Tap to view story")
            : (opening ? "Opening…" : "Tap to view post")}
        </p>
      </div>
    </>
  );
}

/**
 * Forward an existing message's shared content (post, story, text, or
 * media) to other destinations.
 *
 * UPGRADED: now has two tabs —
 *   • "People"  — forwards to 1:1 chats (unchanged: POST /messages/forward/:id)
 *   • "Groups"  — NEW — forwards straight into a group chat via
 *                 POST /groups/:chatId/messages/forward, the same
 *                 endpoint GroupChatWindow's own forward flow uses.
 *
 * "People" still opens showing your most recently-messaged people by
 * default (backed by GET /messages/recent-users), and switches to a live
 * search against all users once you start typing. "Groups" lists every
 * group you belong to (GET /groups/mine), also filterable by the same
 * search box.
 *
 * You can select a mix of people AND groups in one go — Send fires off
 * all of them in parallel.
 */
export function ForwardModal({ msg, currentUser, onClose }) {
  const [tab, setTab] = useState("people"); // "people" | "groups"
  const [search, setSearch] = useState("");

  const [recentUsers, setRecentUsers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searching, setSearching] = useState(false);

  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [sending, setSending] = useState(false);
  const timer = useRef(null);

  const isSearchMode = search.trim().length > 0;
  const peopleList = isSearchMode ? searchResults : recentUsers;

  useEffect(() => {
    apiFetch(`${API}/messages/recent-users`)
      .then(data => { if (data.success) setRecentUsers(data.users); })
      .catch(console.error)
      .finally(() => setLoadingUsers(false));

    apiFetch(`${API}/groups/mine`)
      .then(data => { if (data.success) setGroups(data.groups); })
      .catch(console.error)
      .finally(() => setLoadingGroups(false));
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!search.trim()) { setSearchResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const data = await apiFetch(`${API}/messages/search-users?q=${encodeURIComponent(search)}`);
        if (data.success) setSearchResults(data.users);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [search]);

  const toggleUser = (id) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleGroup = (chatId) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      next.has(chatId) ? next.delete(chatId) : next.add(chatId);
      return next;
    });
  };

  const totalSelected = selectedUsers.size + selectedGroups.size;

  const filteredGroups = isSearchMode
    ? groups.filter(g => g.name?.toLowerCase().includes(search.toLowerCase()))
    : groups;

  const handleForward = async () => {
    if (totalSelected === 0) return;
    setSending(true);
    try {
      await Promise.all([
        ...Array.from(selectedUsers).map(async (recipientId) => {
          const toChatId = [currentUser._id, recipientId].sort().join("_");
          await apiFetch(`${API}/messages/forward/${msg._id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: recipientId, toChatId }),
          });
        }),
        ...Array.from(selectedGroups).map(async (chatId) => {
          await apiFetch(`${API}/groups/${chatId}/messages/forward`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: msg._id }),
          });
        }),
      ]);
      onClose();
    } catch (err) {
      console.error("Forward failed", err);
      alert("Failed to forward message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const showLoading = tab === "people" ? (isSearchMode ? searching : loadingUsers) : loadingGroups;

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.forwardModal} onClick={e => e.stopPropagation()}>
        <div style={s.forwardModalHeader}>
          <p style={s.forwardModalTitle}>Forward to</p>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.tabsRow}>
          <button style={{ ...s.tabBtn, ...(tab === "people" ? s.tabBtnActive : {}) }} onClick={() => setTab("people")}>
            People{selectedUsers.size > 0 ? ` (${selectedUsers.size})` : ""}
          </button>
          <button style={{ ...s.tabBtn, ...(tab === "groups" ? s.tabBtnActive : {}) }} onClick={() => setTab("groups")}>
            <GroupIcon /> Groups{selectedGroups.size > 0 ? ` (${selectedGroups.size})` : ""}
          </button>
        </div>

        <div style={s.forwardSearchWrap}>
          <input
            style={s.forwardSearchInput}
            placeholder={tab === "people" ? "Search people…" : "Search groups…"}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {tab === "people" && !isSearchMode && <p style={s.sectionLabel}>Recent</p>}
        {tab === "groups" && <p style={s.sectionLabel}>Your Groups</p>}

        <div style={s.forwardUserList}>
          {showLoading && <p style={{ textAlign: "center", color: "#bbb", padding: "24px 0" }}>Loading…</p>}

          {!showLoading && tab === "people" && peopleList.length === 0 && (
            <p style={{ textAlign: "center", color: "#bbb", padding: "24px 0" }}>No users found</p>
          )}
          {!showLoading && tab === "people" && peopleList.map(u => (
            <div key={u._id} style={s.forwardUserItem} onClick={() => toggleUser(u._id)}>
              {u.profilePic ? (
                <img src={u.profilePic} style={s.userAvatar} alt="" />
              ) : (
                <div style={{ ...s.userAvatar, background: GOLDEN, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
                  {u.username?.[0]?.toUpperCase()}
                </div>
              )}
              <span style={{ flex: 1, marginLeft: 12, fontSize: 14, fontWeight: 600, color: "#111" }}>{u.username}</span>
              <div style={{ ...s.checkbox, ...(selectedUsers.has(u._id) ? s.checkboxChecked : {}) }}>
                {selectedUsers.has(u._id) && "✓"}
              </div>
            </div>
          ))}

          {!showLoading && tab === "groups" && filteredGroups.length === 0 && (
            <p style={{ textAlign: "center", color: "#bbb", padding: "24px 0" }}>No groups found</p>
          )}
          {!showLoading && tab === "groups" && filteredGroups.map(g => (
            <div key={g.chatId} style={s.forwardUserItem} onClick={() => toggleGroup(g.chatId)}>
              {g.avatar ? (
                <img src={g.avatar} style={s.userAvatar} alt="" />
              ) : (
                <div style={{ ...s.userAvatar, background: "#ececec", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                  <GroupIcon />
                </div>
              )}
              <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111" }}>{g.name}</p>
                {g.memberCount != null && <p style={{ margin: "1px 0 0", fontSize: 11, color: "#999" }}>{g.memberCount} members</p>}
              </div>
              <div style={{ ...s.checkbox, ...(selectedGroups.has(g.chatId) ? s.checkboxChecked : {}) }}>
                {selectedGroups.has(g.chatId) && "✓"}
              </div>
            </div>
          ))}
        </div>

        <div style={s.forwardFooter}>
          <button
            style={{ ...s.forwardSendBtn, opacity: totalSelected > 0 && !sending ? 1 : 0.5 }}
            disabled={totalSelected === 0 || sending}
            onClick={handleForward}
          >
            {sending ? "Sending…" : `Send${totalSelected > 0 ? ` (${totalSelected})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  card:           { borderRadius: 14, overflow: "hidden", background: "rgba(0,0,0,0.06)", maxWidth: 220, marginBottom: 4 },
  headerRow:      { display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 6px" },
  tinyAvatar:     { width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  headerName:     { fontSize: 12, fontWeight: 700, color: "inherit" },
  storyPill:      { marginLeft: "auto", fontSize: 9, fontWeight: 700, background: GOLDEN, color: "#fff", borderRadius: 8, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.04em" },
  mediaWrap:      { position: "relative", width: "100%", aspectRatio: "1/1", background: "#000", overflow: "hidden" },
  media:          { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  playOverlay:    { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  caption:        { fontSize: 12, margin: "6px 10px 0", lineHeight: 1.4 },
  tapHint:        { fontSize: 10, margin: "6px 10px 8px", fontStyle: "italic" },
  expiredRow:     { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" },
  // ── NEW: Add to Your Story button
  repostBtn:      { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "calc(100% - 20px)", margin: "2px 10px 6px", padding: "8px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "opacity 0.15s" },
  modalOverlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  forwardModal:   { background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "78vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  forwardModalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 8px", borderBottom: "1px solid #f0f0f0" },
  forwardModalTitle: { fontSize: 16, fontWeight: 700, margin: 0, color: "#111" },
  closeBtn:       { background: "none", border: "none", fontSize: 16, color: "#888", cursor: "pointer" },
  tabsRow:        { display: "flex", gap: 8, padding: "10px 16px 0" },
  tabBtn:         { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 10, border: "none", background: "#f2f2f2", color: "#888", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  tabBtnActive:   { background: "#111", color: "#fff" },
  forwardSearchWrap: { padding: "10px 16px", borderBottom: "1px solid #f0f0f0" },
  forwardSearchInput: { width: "100%", border: "none", outline: "none", fontSize: 14, color: "#111", background: "#f2f2f2", borderRadius: 10, padding: "9px 14px", boxSizing: "border-box" },
  sectionLabel:   { fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, padding: "12px 16px 2px" },
  forwardUserList: { flex: 1, overflowY: "auto", padding: "6px 0 16px" },
  forwardUserItem: { display: "flex", alignItems: "center", padding: "10px 16px", cursor: "pointer" },
  userAvatar:     { width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  checkbox:       { width: 22, height: 22, borderRadius: "50%", border: "2px solid #ddd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0 },
  checkboxChecked: { background: GOLDEN, border: "none" },
  forwardFooter:  { padding: "10px 16px 18px", borderTop: "1px solid #f0f0f0" },
  forwardSendBtn: { width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: GOLDEN, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
};

const ov = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  card:        { background: "#fff", borderRadius: 18, width: "100%", maxWidth: 420, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" },
  header:      { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)" },
  storyHeader: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", position: "relative", zIndex: 2, background: "linear-gradient(rgba(0,0,0,0.5), transparent)" },
  avatar:      { width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  username:    { fontSize: 14, fontWeight: 700, color: "#111", flex: 1 },
  closeBtn:    { background: "none", border: "none", fontSize: 16, color: "#888", cursor: "pointer", padding: 4 },
  mediaWrap:   { width: "100%", aspectRatio: "1/1", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  media:       { width: "100%", height: "100%", objectFit: "contain" },
  caption:     { fontSize: 13, color: "#333", padding: "10px 14px", margin: 0 },

  navBtn: {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 32, height: 32, borderRadius: "50%", border: "none",
    background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 18,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", zIndex: 2,
  },
  dotsWrap: {
    position: "absolute", bottom: 10, left: 0, right: 0,
    display: "flex", justifyContent: "center", gap: 5, zIndex: 2,
  },
  dot: {
    width: 6, height: 6, borderRadius: "50%", background: "#fff",
  },
  counter: {
    position: "absolute", top: 8, right: 10, zIndex: 2,
    background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11,
    fontWeight: 600, padding: "2px 8px", borderRadius: 12,
  },
};