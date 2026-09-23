import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiBell, FiSettings, FiArrowLeft, FiSearch, FiX } from "react-icons/fi";
import { FaLock } from "react-icons/fa";
import socket from "../../sockets/sockets.jsx";
import FollowButton from "./FollowButton.jsx";
import { useFollowAction } from "./useFollowAction.jsx";
import { setFollowStatus } from "./usefollowState.jsx";
import MemoriesRow from "../../components/Memories/MemoryRow.jsx";
import MemoryViewer from "../../components/Memories/MemoryViewer.jsx";
import StoryViewer from "../../components/StoryBar/storyviewer";
import MuteMenu from "./MuteMenu.jsx";
import { ProfileHeaderSkeleton, ProfileGridSkeleton } from "../../components/Skeleton/ProfileSkeleton.jsx";
const API = import.meta.env.VITE_API_URL;
const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

function getMyId() {
  try {
    const t = token();
    if (!t) return null;
    return JSON.parse(atob(t.split(".")[1])).id;
  } catch { return null; }
}

// ── Count formatter (1000 -> 1K, 1500000 -> 1.5M, etc.) ─────────────────────
function formatCount(num) {
  const n = Number(num) || 0;
  if (n < 1000) return `${n}`;
  const units = [
    { value: 1_000_000_000, symbol: "B" },
    { value: 1_000_000, symbol: "M" },
    { value: 1_000, symbol: "K" },
  ];
  for (const u of units) {
    if (n >= u.value) {
      const scaled = n / u.value;
      const rounded = scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1);
      return `${rounded}${u.symbol}`;
    }
  }
  return `${n}`;
}

// ── Mini Carousel ──────────────────────────────────────────────────────────
function PostGridCarousel({ post, onClick }) {
  const [current, setCurrent] = useState(0);
  const media = post?.media || [];
  const total = media.length;
  if (!total) return null;
  return (
    <div style={{ position: "relative", aspectRatio: "1/1", overflow: "hidden", cursor: "pointer", borderRadius: "6px" }} onClick={onClick}>
      <img src={media[current]?.url} alt="post"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onError={e => { e.target.style.display = "none"; }} />
      {total > 1 && (
        <>
          {current > 0 && (
            <button onClick={e => { e.stopPropagation(); setCurrent(i => i - 1); }} style={gridArrow("left")}>‹</button>
          )}
          {current < total - 1 && (
            <button onClick={e => { e.stopPropagation(); setCurrent(i => i + 1); }} style={gridArrow("right")}>›</button>
          )}
          <div style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 3 }}>
            {media.map((_, i) => (
              <div key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }}
                style={{ width: i === current ? 12 : 4, height: 4, borderRadius: 2, background: i === current ? "#fff" : "rgba(255,255,255,0.5)", transition: "all 0.2s" }} />
            ))}
          </div>
          <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 20, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>
            {current + 1}/{total}
          </div>
        </>
      )}
      {post?.isCollab && (
        <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
          🤝 Collab
        </div>
      )}
    </div>
  );
}

const gridArrow = (side) => ({
  position: "absolute", top: "50%", transform: "translateY(-50%)",
  [side]: 4, background: "rgba(0,0,0,0.45)", border: "none",
  borderRadius: "50%", width: 22, height: 22, color: "#fff",
  cursor: "pointer", display: "flex", alignItems: "center",
  justifyContent: "center", zIndex: 2, fontSize: 14,
});

// ── Main Component ─────────────────────────────────────────────────────────
function UserProfileView() {
  const navigate     = useNavigate();
  const { userId }   = useParams();
  const MY_ID        = getMyId();
  const isOwnProfile = MY_ID === userId;

  useEffect(() => {
    if (isOwnProfile) navigate("/profile", { replace: true });
  }, [isOwnProfile, navigate]);

  const [user,         setUser]         = useState(null);
  const [posts,        setPosts]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  // ── PERSISTED ACTIVE TAB — keyed by :userId so each profile you visit
  // remembers its own last-viewed tab independently (unlike your own
  // Profilepage, which only ever has one key since it's always "you").
  // Falls back to "posts" the first time you view a given profile.
const [activeTab, setActiveTab] = useState("posts");

  // ← ref, not state — Strict Mode's dev-mode double-invoke replays this
  // effect once, and a ref (unlike a plain flag inside a lazy useState
  // initializer) survives that replay correctly, so the sessionStorage
  // flag only ever gets read+deleted once instead of the 2nd
  // (replayed) call finding it already gone and resetting to "posts".
  const consumedReturnTabForUserRef = useRef(null);

  // Runs on mount AND whenever :userId changes (navigating from one
  // profile straight to another without unmounting) — checks for a
  // return-trip flag scoped to THAT user; otherwise starts fresh on
  // "posts".
useEffect(() => {
    if (consumedReturnTabForUserRef.current === userId) return; // already handled for this profile
    consumedReturnTabForUserRef.current = userId;

    const key = `userProfileReturnTab_${userId}`;
    const remembered = sessionStorage.getItem(key);
    if (remembered) {
      sessionStorage.removeItem(key);
      setActiveTab(remembered);
    } else {
      setActiveTab("posts");
      sessionStorage.removeItem(`userProfileReturnPostId_${userId}`);
    }
  }, [userId]);

  const [isBlocked,    setIsBlocked]    = useState(false);
  const [isPrivate,    setIsPrivate]    = useState(false);
  const [messageBusy,  setMessageBusy]  = useState(false);

  // ── Followers/Following modal state ───────────────────────────────────────
  const [listModal,    setListModal]    = useState(null); // "followers" | "following" | null
  const [searchQuery,  setSearchQuery]  = useState("");
  const [modalList,    setModalList]    = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Mutual followers ──────────────────────────────────────────────────────
  const [mutuals,      setMutuals]      = useState([]);
  const [mutualCount,  setMutualCount]  = useState(0);

  const { status: followState, handleFollowBtn, busy: followBusy } =
    useFollowAction(userId, { isPrivate });

  const canSeeFollowList = !isPrivate || followState === "following";
  const canSeePosts      = !isPrivate || followState === "following";

  // ── STORY STATE — single-author story group + seen/unseen ring state.
  const [story,             setStory]             = useState(null);
  const [showStoryPreview,  setShowStoryPreview]  = useState(false);

  const hasStory  = !!story && story.slides.length > 0;
  const seenStory = hasStory && story.slides.every(s => s.viewedByMe);

  // ── MEMORY (Highlight) STATE — view-only here. Access is enforced
  // server-side (canAccessMemoryItem), so a private account simply
  // returns an empty groups list until the follow request is accepted.
  const [groups,             setGroups]             = useState([]);
  // ← CHANGED — combined viewerGroupId + viewerItemId into one atomic
  // state object (same fix as Profilepage.jsx — see the comment there
  // for the full "Cannot update a component while rendering a different
  // component" explanation). null = viewer closed; { groupId, itemId }
  // otherwise (itemId may be null = just show the group's first item).
  const [memoryViewer, setMemoryViewer] = useState(null);

  const fetchGroups = React.useCallback(async () => {
    if (!userId || !canSeePosts) { setGroups([]); return; }
    try {
      const res  = await fetch(`${API}/memories/groups/user/${userId}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setGroups(data.groups);
    } catch {
      setGroups([]);
    }
  }, [userId, canSeePosts]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ← NEW — consume the "open this exact memory" handoff left by
  // ActivityPage.jsx. Waits for `groups` to have loaded at least once so
  // MemoryViewer always has fresh access-checked data to open into,
  // rather than racing it.
  //
  // Guarded on `!isOwnProfile`: ActivityPage now routes own-memory
  // notifications straight to /profile so this component never even
  // mounts for that case — but if anything else ever lands here with
  // userId === MY_ID, this guard stops it from reading (and deleting)
  // a handoff that's meant for Profilepage right before this component
  // redirects itself away and unmounts.
  useEffect(() => {
    if (!userId || isOwnProfile) return;
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem("openMemory") || "null"); } catch { pending = null; }
    if (!pending?.groupId || !pending?.itemId) return;
    sessionStorage.removeItem("openMemory");
    setMemoryViewer({
      groupId: pending.groupId,
      itemId: pending.itemId,
      sheet: pending.sheet || null,
      commentId: pending.commentId || null,
      replyId: pending.replyId || null,
    });
  }, [userId, isOwnProfile]);

  useEffect(() => {
    if (!userId) return;
    const handler = (payload) => {
      const aid = payload?.authorId;
      if (!aid || aid === userId) fetchGroups();
    };
    socket.on("memoryGroupAdded",        handler);
    socket.on("memoryGroupDeleted",      handler);
    socket.on("memoryItemAdded",         handler);
    socket.on("memoryItemDeleted",       handler);
    socket.on("memoryVisibilityChanged", handler);
    return () => {
      socket.off("memoryGroupAdded",        handler);
      socket.off("memoryGroupDeleted",      handler);
      socket.off("memoryItemAdded",         handler);
      socket.off("memoryItemDeleted",       handler);
      socket.off("memoryVisibilityChanged", handler);
    };
  }, [userId, fetchGroups]);

  const fetchStory = React.useCallback(async () => {
    if (!userId || !canSeePosts) { setStory(null); return; }
    try {
      const res  = await fetch(`${API}/stories/get-user-stories/${userId}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success || !data.stories?.length) { setStory(null); return; }
      setStory({
        id: userId,
        username: user?.username || "Unknown",
        userProfile: user?.profilePic || "",
        isOwn: false,
        slides: data.stories.map((s) => ({
          id: s._id,
          image: s.media?.url || "",
          type: s.media?.type || s.storyType,
          likes: s.likesCount || 0,
          isLive: s.storyType === "live",
          liveRoomId: s.liveRoomId || null,
          authorId: userId,
          isHiddenFromNonFollowers: s.isHiddenFromNonFollowers || false,
          viewedByMe: !!s.viewedByMe,
          textOverlays: s.textOverlays || [],
          mentions: s.mentions || [],
           repostAttribution: s.repostAttribution || null,
        })),
      });
    } catch {
      setStory(null);
    }
  }, [userId, canSeePosts, user?.username, user?.profilePic]);

  useEffect(() => { fetchStory(); }, [fetchStory]);

  useEffect(() => {
    if (!userId) return;
    const handler = (payload) => {
      const aid = payload?.authorId;
      if (!aid || aid === userId) fetchStory();
    };
    socket.on("storyAdded",            handler);
    socket.on("storyDeleted",          handler);
    socket.on("storyVisibilityChanged", handler);
    socket.on("liveStoryEnded",        handler);
    socket.on("someoneLive",           handler);
    return () => {
      socket.off("storyAdded",            handler);
      socket.off("storyDeleted",          handler);
      socket.off("storyVisibilityChanged", handler);
      socket.off("liveStoryEnded",        handler);
      socket.off("someoneLive",           handler);
    };
  }, [userId, fetchStory]);

  // ── Fetch profile ──────────────────────────────────────────────────────────
useEffect(() => {
  if (!userId) return;
  const fetchUser = async () => {
    try {
      const res  = await fetch(`${API}/auth/user/${userId}`, { headers: authHeaders() });
      if (!res.ok) { setError("Failed to load profile."); setLoading(false); return; }
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setIsPrivate(data.user.isPrivate ?? false);
        setIsBlocked(data.user.isBlockedByMe ?? false);

        // Seed the shared follow store with the REAL status from the
        // server. Without this, a stale localStorage entry (leftover
        // from testing, a previous account, or any earlier click) keeps
        // reporting "following" forever, regardless of what's actually
        // true on the backend — which is exactly the bug you hit.
        setFollowStatus(
          userId,
          data.user.isFollowedByMe ? "following"
            : data.user.followRequestPending ? "requested"
            : "none"
        );
      } else {
        setError("User not found.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  fetchUser();
}, [userId]);

  // ── Fetch posts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const fetchPosts = async () => {
      try {
        const res  = await fetch(`${API}/auth/get-posts/${userId}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setPosts(data.posts);
      } catch {}
    };
    fetchPosts();
  }, [userId]);
// ── Scroll to the exact post/short/text-post the user tapped, once
  // posts have loaded and the active tab's grid has rendered.
  useEffect(() => {
    if (loading || !posts.length) return;
    const key = `userProfileReturnPostId_${userId}`;
    const targetId = sessionStorage.getItem(key);
    if (!targetId) return;
    sessionStorage.removeItem(key);

    const t = setTimeout(() => {
      const el = document.getElementById(`user-profile-post-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [loading, posts, userId]);
  // ── Fetch mutual followers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || isOwnProfile) return;
    const fetchMutuals = async () => {
      try {
        const res  = await fetch(`${API}/auth/mutuals/${userId}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          setMutuals(data.mutuals || []);
          setMutualCount(data.count || 0);
        }
      } catch {}
    };
    fetchMutuals();
  }, [userId, isOwnProfile]);

  // ── Live socket: follower/following list updates ────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const onFollowersList = ({ userId: uid, followers, restricted }) => {
      if (uid !== userId) return;
      if (listModal === "followers") {
        setModalList(restricted ? [] : (followers || []));
        setModalLoading(false);
      }
      if (!restricted && followers) {
        setUser(prev => prev ? { ...prev, followers } : prev);
      }
    };

    const onFollowingList = ({ userId: uid, following, restricted }) => {
      if (uid !== userId) return;
      if (listModal === "following") {
        setModalList(restricted ? [] : (following || []));
        setModalLoading(false);
      }
      if (!restricted && following) {
        setUser(prev => prev ? { ...prev, following } : prev);
      }
    };

    socket.on("followersList", onFollowersList);
    socket.on("followingList", onFollowingList);

    return () => {
      socket.off("followersList", onFollowersList);
      socket.off("followingList", onFollowingList);
    };
  }, [userId, listModal]);

  // ── Live socket: profile/social events ────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const onPrivacyChanged = ({ userId: changedId, isPrivate: priv }) => {
      if (changedId === userId) {
        setIsPrivate(priv);
        setUser(prev => prev ? { ...prev, isPrivate: priv } : prev);
      }
    };

    const onProfileUpdated = ({ userId: updatedId, profilePic, coverPic, username, bio }) => {
      if (updatedId === userId) {
        setUser(prev => prev ? { ...prev, profilePic, coverPic, username, bio } : prev);
      }
    };

    const onFollowAccepted = ({ from, toUserId }) => {
      if (toUserId === userId && from === MY_ID) {
        setUser(prev => prev ? {
          ...prev,
          followers: [...(prev.followers ?? []), { _id: MY_ID }],
        } : prev);
      }
    };

    const onUserUnfollowed = ({ fromUserId, toUserId }) => {
      if (toUserId === userId) {
        setUser(prev => prev ? {
          ...prev,
          followers: (prev.followers ?? []).filter(f => (f?._id ?? f).toString() !== fromUserId),
        } : prev);
      }
    };

    const onUserFollowed = ({ fromUserId, toUserId }) => {
      if (toUserId === userId && fromUserId !== MY_ID) {
        setUser(prev => prev ? {
          ...prev,
          followers: [...(prev.followers ?? []), { _id: fromUserId }],
        } : prev);
      }
    };

    const onNewPost = ({ post }) => {
      if ((post?.author?._id ?? post?.author)?.toString() === userId) {
        setPosts(prev => [post, ...prev]);
      }
    };

    const onPostDeleted = ({ postId }) => {
      setPosts(prev => prev.filter(p => p._id !== postId));
    };

    const onCollabResponded = ({ postId, accepted }) => {
      if (!accepted) return;
      fetch(`${API}/auth/get-posts/${userId}`, { headers: authHeaders() })
        .then(res => res.json())
        .then(data => { if (data.success) setPosts(data.posts); })
        .catch(() => {});
    };

    const onUserAccountDeleted = ({ userId: deletedId }) => {
      if (deletedId === userId) {
        navigate("/", { replace: true });
      }
    };

    socket.emit("joinUserRoom", userId);
    socket.on("privacyChanged",      onPrivacyChanged);
    socket.on("profileUpdated",      onProfileUpdated);
    socket.on("followAccepted",      onFollowAccepted);
    socket.on("userUnfollowed",      onUserUnfollowed);
    socket.on("userFollowed",        onUserFollowed);
    socket.on("newPost",             onNewPost);
    socket.on("postDeleted",         onPostDeleted);
    socket.on("collabResponded",     onCollabResponded);
    socket.on("userAccountDeleted",  onUserAccountDeleted);

    return () => {
      socket.emit("leaveUserRoom", userId);
      socket.off("privacyChanged",     onPrivacyChanged);
      socket.off("profileUpdated",     onProfileUpdated);
      socket.off("followAccepted",     onFollowAccepted);
      socket.off("userUnfollowed",     onUserUnfollowed);
      socket.off("userFollowed",       onUserFollowed);
      socket.off("newPost",            onNewPost);
      socket.off("postDeleted",        onPostDeleted);
      socket.off("collabResponded",    onCollabResponded);
      socket.off("userAccountDeleted", onUserAccountDeleted);
    };
  }, [userId, MY_ID, navigate]);

  // ── Open modal — uses socket for live data ─────────────────────────────────
  const openModal = (type) => {
    if (!canSeeFollowList) return;
    setSearchQuery("");
    setListModal(type);
    setModalLoading(true);
    setModalList([]);

    if (type === "followers") {
      socket.emit("getFollowers", { userId, viewerId: MY_ID });
    } else {
      socket.emit("getFollowing", { userId, viewerId: MY_ID });
    }
  };

  const closeModal = () => { setListModal(null); setSearchQuery(""); setModalList([]); };
  const filteredList = modalList.filter(u => u.username?.toLowerCase().includes(searchQuery.toLowerCase()));

  // ── Block ──────────────────────────────────────────────────────────────────
  const handleBlockUserBtn = async () => {
    if (isBlocked) return;
    if (!window.confirm(`Block ${user?.username}?`)) return;
    try {
      const res  = await fetch(`${API}/auth/block/${userId}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.success) setIsBlocked(true);
    } catch {}
  };

  // ── Message ────────────────────────────────────────────────────────────────
  const handleMessageClick = async () => {
    if (messageBusy) return;
    setMessageBusy(true);
    try {
      const res = await fetch(`${API}/messages/chat/${MY_ID}/${userId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const conv = {
        _id: data.chatId,
        members: [{ _id: MY_ID }, user],
        otherUser: user,
      };
      sessionStorage.setItem("openConv", JSON.stringify(conv));
    } catch (err) {
      console.error("Open chat failed", err);
      sessionStorage.removeItem("openConv");
    } finally {
      setMessageBusy(false);
      navigate("/messages");
    }
  };

  const openStoryPreview = () => {
    if (!hasStory) return;
    setShowStoryPreview(true);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const followersCount = user?.followers?.length ?? 0;
  const followingCount = user?.following?.length ?? 0;
  const postsCount     = posts.length;

    if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <FiArrowLeft size={22} style={{ cursor: "pointer" }} onClick={() => navigate(-1)} />
          <div style={{ width: 22 }} />
          <div style={{ width: 22 }} />
        </div>
        <ProfileHeaderSkeleton />
        <ProfileGridSkeleton />
      </div>
    );
  }
  if (error)   return (
    <div style={centerScreen}>
      <p style={{ color: "#999", fontSize: "14px" }}>{error}</p>
      <button onClick={() => navigate(-1)} style={{ marginTop: "12px", padding: "8px 20px", border: "1px solid #ddd", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "14px" }}>
        Go Back
      </button>
    </div>
  );

  return (
    <div style={styles.container}>

      {/* ── Modal ── */}
      {listModal && (
        <div style={modalOverlayStyle} onClick={closeModal}>
          <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "16px" }}>
                {listModal === "followers" ? "Followers" : "Following"}
              </h4>
              <FiX size={20} style={{ cursor: "pointer" }} onClick={closeModal} />
            </div>
            <div style={{ borderTop: "1px solid #eee", marginBottom: "10px" }} />
            <div style={searchWrapperStyle}>
              <FiSearch size={15} color="#999" style={{ marginLeft: "10px" }} />
              <input type="text" placeholder="Search" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} style={searchInputStyle} />
              {searchQuery.length > 0 && (
                <FiX size={15} color="#999" style={{ marginRight: "10px", cursor: "pointer" }} onClick={() => setSearchQuery("")} />
              )}
            </div>
            {modalLoading ? (
              <p style={{ textAlign: "center", color: "#aaa", fontSize: "14px", padding: "20px 0" }}>Loading...</p>
            ) : filteredList.length === 0 ? (
              <p style={{ textAlign: "center", color: "gray", fontSize: "14px", padding: "20px 0" }}>No results found</p>
            ) : filteredList.map(u => (
              <div key={u._id ?? u.id} style={userRowStyle}
                onClick={() => { closeModal(); navigate(`/profile/${u._id}`); }}>
                {u.profilePic
                  ? <img src={u.profilePic} alt={u.username} style={userAvatarStyle} />
                  : <div style={{ ...userAvatarStyle, background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#888" }}>
                      {u.username?.[0]?.toUpperCase()}
                    </div>
                }
                <span style={{ flex: 1, fontSize: "14px", fontWeight: "500" }}>{u.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top Bar ── */}
      <div style={styles.topBar}>
        <FiArrowLeft size={22} style={{ cursor: "pointer" }} onClick={() => navigate(-1)} />
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800" }}>{user?.username}</h3>
        <div style={{ width: 22 }} />
      </div>

      {/* ── Cover ── */}
      <div style={styles.coverContainer}>
        {user?.coverPic
          ? <img src={user.coverPic} alt="cover" style={styles.cover} />
          : <div style={styles.coverFallback} />
        }
      </div>

      {/* ── Profile Row ── */}
      <div style={styles.profileRow}>
        {hasStory ? (
          <div onClick={openStoryPreview} style={profileRingWrap(seenStory)}>
            <div style={profileRingInner}>
              {user?.profilePic
                ? <img src={user.profilePic} alt="profile" style={profileImgNoBorder} />
                : <div style={profileImgFallbackNoBorder}>{user?.username?.[0]?.toUpperCase()}</div>
              }
            </div>
          </div>
        ) : (
          user?.profilePic
            ? <img src={user.profilePic} alt="profile" style={styles.profileImg} />
            : <div style={styles.profileImgFallback}>{user?.username?.[0]?.toUpperCase()}</div>
        )}
        <div style={styles.info}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <h4 style={{ margin: 0, fontSize: "17px", fontWeight: "800" }}>{user?.username}</h4>
            {isPrivate && <FaLock size={12} color="#888" />}
          </div>
          <div style={styles.stats}>
            <div style={styles.statItem}><b style={styles.statNum}>{formatCount(postsCount)}</b><span style={styles.statLabel}>posts</span></div>
            <div style={styles.statDivider} />
            <div style={{ ...styles.statItem, cursor: canSeeFollowList ? "pointer" : "default" }}
              onClick={() => canSeeFollowList && openModal("followers")}>
              <b style={styles.statNum}>{formatCount(followersCount)}</b>
              <span style={{ ...styles.statLabel, display: "flex", alignItems: "center", gap: "3px" }}>
                followers {isPrivate && !canSeeFollowList && <FaLock size={9} color="#bbb" />}
              </span>
            </div>
            <div style={styles.statDivider} />
            <div style={{ ...styles.statItem, cursor: canSeeFollowList ? "pointer" : "default" }}
              onClick={() => canSeeFollowList && openModal("following")}>
              <b style={styles.statNum}>{formatCount(followingCount)}</b>
              <span style={{ ...styles.statLabel, display: "flex", alignItems: "center", gap: "3px" }}>
                following {isPrivate && !canSeeFollowList && <FaLock size={9} color="#bbb" />}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bio ── */}
      {user?.bio && <p style={styles.bio}>{user.bio}</p>}

      {/* ── Mutual Followers ── */}
      {mutualCount > 0 && (
        <div style={styles.mutualRow}>
          <div style={styles.mutualAvatars}>
            {mutuals.slice(0, 3).map((m) => (
              m.profilePic
                ? <img key={m._id} src={m.profilePic} alt={m.username} style={styles.mutualAvatar} />
                : <div key={m._id} style={{ ...styles.mutualAvatar, background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#888" }}>
                    {m.username?.[0]?.toUpperCase()}
                  </div>
            ))}
          </div>
          <p style={styles.mutualText}>
            Followed by{" "}
            <span style={{ fontWeight: "700", color: "#111" }}>
              {mutuals[0]?.username}
            </span>
            {mutualCount > 1 && (
              <>
                {mutualCount === 2
                  ? <> and <span style={{ fontWeight: "700", color: "#111" }}>{mutuals[1]?.username}</span></>
                  : <> and <span style={{ fontWeight: "700", color: "#111" }}>{mutualCount - 1} others</span></>
                }
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div style={styles.actionsWrap}>
        <div style={styles.actions}>
          <FollowButton
            authorId={userId}
            isPrivate={isPrivate}
            isOwner={isOwnProfile}
            isBlocked={isBlocked}
          />
          <button style={{ ...styles.messageBtn, opacity: messageBusy ? 0.6 : 1, cursor: messageBusy ? "default" : "pointer" }}
            onClick={handleMessageClick} disabled={messageBusy}>
            {messageBusy ? "Opening…" : "Message"}
          </button>
          <button style={isBlocked ? styles.blockedBtn : styles.blockBtn} onClick={handleBlockUserBtn}>
            {isBlocked ? "Blocked" : "Block"}
          </button>
                    {!isBlocked && (
           <MuteMenu userId={userId} username={user?.username || "this user"} />
          )}
        </div>
      </div>

      {/* ── Memories ("Highlights") — view-only, below the action buttons ── */}
      {canSeePosts && (
        <MemoriesRow
          groups={groups}
          onOpenGroup={(groupId) => setMemoryViewer({ groupId, itemId: null })}
        />
      )}

      {/* ── Posts / Private Lock ── */}
      {!canSeePosts ? (
        <div style={styles.privateBox}>
          <FaLock size={32} color="#ccc" style={{ marginBottom: "10px" }} />
          <p style={{ margin: 0, fontSize: "15px", fontWeight: "600", color: "#444" }}>This account is private</p>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#999" }}>
            {followState === "requested"
              ? "Follow request sent. Waiting for approval."
              : "Follow this account to see their posts."}
          </p>
        </div>
      ) : (
        <>
          <div style={styles.tabs}>
            {["posts", "Shorts", "text"].map(tab => (
              <p key={tab} style={activeTab === tab ? styles.activeTab : styles.inactiveTab}
                onClick={() => setActiveTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </p>
            ))}
          </div>
          <div style={{ padding: "10px" }}>
           {activeTab === "posts" && <Posts     posts={posts} navigate={navigate} userId={userId} />}
           {activeTab === "Shorts" && <Shorts    posts={posts} userId={userId} navigate={navigate} />}
           {activeTab === "text"  && <TextPosts posts={posts} navigate={navigate} userId={userId} />}
          </div>
        </>
      )}

      {/* ── STORY PREVIEW OVERLAY ── */}
      {showStoryPreview && hasStory && (
        <StoryViewer
          stories={[story]}
          index={0}
          close={() => setShowStoryPreview(false)}
        />
      )}

      {/* ── MEMORY VIEWER OVERLAY (view-only: isOwner={false}) ── */}
      {memoryViewer && (
        <MemoryViewer
          groupId={memoryViewer.groupId}
          isOwner={false}
          initialItemId={memoryViewer.itemId}
          initialSheet={memoryViewer.sheet}
          initialCommentId={memoryViewer.commentId}
          initialReplyId={memoryViewer.replyId}
          onClose={() => setMemoryViewer(null)}
          onGroupEmptied={() => { setMemoryViewer(null); fetchGroups(); }}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
const Posts = ({ posts, navigate,userId }) => {
  const imagePosts = posts.filter(p =>
    (p?.postType === "image" || p?.postType === "carousel") &&
    p?.media?.length > 0 && p.media.some(m => m?.url)
  );
  if (!imagePosts.length)
    return <div style={{ textAlign: "center", padding: "30px", color: "gray" }}>No posts yet</div>;
  return (
    <div style={styles.grid}>
      {imagePosts.map(post => (
       <div key={post._id} id={`user-profile-post-${post._id}`}>
         <PostGridCarousel post={post}
           onClick={() => {
             sessionStorage.setItem(`userProfileReturnTab_${userId}`, "posts");
             sessionStorage.setItem(`userProfileReturnPostId_${userId}`, post._id);
             navigate(`/post/${post._id}`, { state: { post, allPosts: imagePosts } });
           }} />
       </div>
      ))}
    </div>
  );
};

const Shorts = ({ posts, userId, navigate }) => {
  const videoPosts = posts.filter(p => p?.postType === "video");
  if (!videoPosts.length)
    return <div style={{ textAlign: "center", padding: "20px", color: "gray" }}>No reels yet 🎥</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "4px" }}>
      {videoPosts.map(video => (
        <div key={video._id} id={`user-profile-post-${video._id}`}
          style={{ position: "relative", aspectRatio: "1/1", overflow: "hidden", cursor: "pointer", borderRadius: "6px" }}
          onClick={() => {
  sessionStorage.setItem(`userProfileReturnTab_${userId}`, "Shorts");
  sessionStorage.setItem(`userProfileReturnPostId_${userId}`, video._id);
  navigate(`/profile-reel/${video._id}`, { state: { video, allVideos: videoPosts, ownerUserId: userId } });
}}>
          <video src={video?.media?.[0]?.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", color: "white", fontSize: "20px" }}>▶</div>
          {video?.isCollab && (
            <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 20, padding: "2px 6px", fontSize: 9, fontWeight: 700 }}>🤝</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Expandable text for the profile's Text tab — truncates long posts
// with a "...more" link, and "less" to collapse back. stopPropagation
// is required since the parent card has an onClick that navigates to
// the post detail page — without it, clicking "more"/"less" would also
// navigate away. Same idiom as ExpandableProfileText in Profilepage.jsx.
const ExpandableProfileText = ({ text, limit = 180 }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const isLong = text.length > limit;

  if (!isLong || expanded) {
    return (
      <div style={profileTextStyle}>
        {text}
        {isLong && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={moreLessStyle}
          >
            {" "}less
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={profileTextStyle}>
      {text.slice(0, limit).trimEnd()}...
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        style={moreLessStyle}
      >
        {" "}more
      </span>
    </div>
  );
};

const TextPosts = ({ posts, navigate, userId }) => {
  const textPosts = posts.filter(p => p?.postType === "text");
  if (!textPosts.length)
    return <div style={{ textAlign: "center", padding: "20px", color: "gray" }}>No text posts yet 📝</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {textPosts.map(post => (
<div key={post._id} id={`user-profile-post-${post._id}`}
          onClick={() => {
            sessionStorage.setItem(`userProfileReturnTab_${userId}`, "text");
            sessionStorage.setItem(`userProfileReturnPostId_${userId}`, post._id);
            navigate(`/text-post/${post._id}`, { state: { post, allPosts: textPosts } });
          }}
          style={{ border: "1px solid #eee", borderRadius: "14px", overflow: "hidden", background: "#fff", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 12px 8px" }}>
            {post?.author?.profilePic
              ? <img src={post.author.profilePic} alt="" style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#fff", fontSize: "15px", flexShrink: 0 }}>
                  {post?.author?.username?.[0]?.toUpperCase() || "?"}
                </div>
            }
            <div style={{ fontWeight: "600", fontSize: "14px", color: "#111" }}>{post?.author?.username}</div>
          </div>

          {post?.text && <ExpandableProfileText text={post.text} />}

          {post?.media?.length > 0 && (
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "0 12px 12px", scrollbarWidth: "none" }}>
              {post.media.map((m, i) => (
                <img key={i} src={m.url} alt=""
                  style={{ width: post.media.length === 1 ? "100%" : "160px", height: "160px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────
const centerScreen       = { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh" };
const modalOverlayStyle  = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalBoxStyle      = { background: "#fff", borderRadius: "12px", width: "90%", maxWidth: "380px", maxHeight: "70vh", overflowY: "auto", padding: "16px" };
const searchWrapperStyle = { display: "flex", alignItems: "center", background: "#f0f0f0", borderRadius: "10px", marginBottom: "12px", gap: "6px" };
const searchInputStyle   = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: "14px", outline: "none" };
const userRowStyle       = { display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: "1px solid #f0f0f0", cursor: "pointer" };
const userAvatarStyle    = { width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover" };

// NOTE: container is intentionally full-width/full-page (like the
// original), NOT wrapped in an outer gray "page" background + floating
// rounded card the way Profilepage.jsx now is. Styling upgrades below
// (rounded action buttons/panel, bolder headings, tab underline, etc.)
// are applied directly to this full-page layout instead.
const styles = {
  container:          { width: "100%", maxWidth: "420px", margin: "0 auto", background: "#fff", minHeight: "100vh", fontFamily: "sans-serif", overflowX: "hidden", boxSizing: "border-box" },
  topBar:             { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 15px 8px" },
  coverContainer:     { width: "100%", padding: "0 15px", boxSizing: "border-box", height: "170px" },
  cover:              { width: "100%", height: "100%", objectFit: "cover", borderRadius: "16px", display: "block" },
  coverFallback:      { width: "100%", height: "100%", borderRadius: "16px", background: "linear-gradient(135deg, #e0e0e0, #c8c8c8)" },
  profileRow:         { display: "flex", alignItems: "center", padding: "16px 15px 6px", gap: "16px" },
  profileImg:         { width: "85px", height: "85px", borderRadius: "50%", border: "3px solid white", objectFit: "cover", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" },
  profileImgFallback: { width: "85px", height: "85px", borderRadius: "50%", border: "3px solid white", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", background: "linear-gradient(135deg, #d0d0d0, #b0b0b0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: "700", color: "#fff" },
  info:               { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  stats:              { display: "flex", alignItems: "center", gap: "14px", width: "100%", marginTop: "8px" },
  statDivider:        { width: "1px", height: "24px", background: "#eee" },
  statItem:           { display: "flex", flexDirection: "column", alignItems: "center", fontSize: "13px", color: "#555" },
  statNum:            { fontSize: "15px", fontWeight: "700", color: "#111" },
  statLabel:          { fontSize: "11px", color: "#888", marginTop: "1px" },
  bio:                { margin: "10px 15px 0", fontSize: "14px", fontWeight: "500", color: "#444", lineHeight: "1.5" },
  mutualRow:          { display: "flex", alignItems: "center", gap: "8px", margin: "12px 15px 0", padding: "8px 12px", background: "#f8f8f8", borderRadius: "12px" },
  mutualAvatars:      { display: "flex", flexDirection: "row" },
  mutualAvatar:       { width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", border: "2px solid #fff", marginLeft: "-6px" },
  mutualText:         { margin: 0, fontSize: "12px", color: "#666", lineHeight: "1.4", flex: 1 },
  actionsWrap:        { padding: "14px 15px 0" },
  actions:            { display: "flex", gap: "8px" },
  messageBtn:         { flex: 1, padding: "10px 12px", borderRadius: "12px", border: "1.5px solid #e2e2e2", background: "#fff", cursor: "pointer", fontWeight: "700", fontSize: "14px", color: "#111" },
  blockBtn:           { flex: 1, padding: "10px 12px", background: "#ff3b30", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", fontWeight: "700", fontSize: "14px" },
  blockedBtn:         { flex: 1, padding: "10px 12px", background: "#e0e0e0", color: "#333", border: "none", borderRadius: "12px", cursor: "default", fontWeight: "700", fontSize: "14px" },
  privateBox:         { textAlign: "center", padding: "50px 20px", display: "flex", flexDirection: "column", alignItems: "center" },
  tabs:               { display: "flex", justifyContent: "space-around", marginTop: "18px", borderTop: "1px solid #eee", padding: "12px 0 0" },
  activeTab:          { fontWeight: "700", borderBottom: "2px solid #111", margin: 0, cursor: "pointer", paddingBottom: "10px", color: "#111" },
  inactiveTab:        { color: "#aaa", margin: 0, cursor: "pointer", paddingBottom: "10px" },
  grid:               { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" },
  postImg:            { width: "100%", aspectRatio: "1/1", objectFit: "cover", cursor: "pointer" },
};

// ── Story ring styles for the profile photo ─────────────────────────────
// ringSize = base (85) + 6, same proportions as the Avatar ring used
// throughout Home.jsx / Explore.jsx / StoriesBar, so it looks consistent
// across the app.
const profileRingWrap = (seen) => ({
  width: 91, height: 91, borderRadius: "50%",
  background: seen ? "#c7c7c7" : "rgb(234,182,118)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, padding: 2,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
});
const profileRingInner = {
  width: "100%", height: "100%", borderRadius: "50%", background: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 2,
};
const profileImgNoBorder = {
  width: "83px", height: "83px", borderRadius: "50%", objectFit: "cover", display: "block",
};
const profileImgFallbackNoBorder = {
  width: "83px", height: "83px", borderRadius: "50%",
  background: "linear-gradient(135deg, #d0d0d0, #b0b0b0)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "30px", fontWeight: "700", color: "#fff",
};

// Expandable text styles for the Text tab
const profileTextStyle = { padding: "0 12px 10px", fontSize: "15px", lineHeight: "1.6", color: "#222", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const moreLessStyle    = { color: "#8e8e8e", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" };

export default UserProfileView;