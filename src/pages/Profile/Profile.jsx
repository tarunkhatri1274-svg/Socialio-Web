import React, { useState, useRef, useEffect } from "react";
import { FiImage, FiVideo, FiEdit, FiBookmark, FiSettings, FiX, FiSearch, FiBell } from "react-icons/fi";
import { FaLock, FaUserEdit } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "../../components/Navbar/navbar";
import socket from "../../sockets/sockets";
import StoryViewer from "../../components/StoryBar/storyviewer";
import MemoriesRow from "../../components/Memories/MemoryRow";
import MemoryViewer from "../../components/Memories/MemoryViewer";
import CreateMemoryModal from "../../components/Memories/CreateMemoryModal";
import { ProfileHeaderSkeleton, ProfileGridSkeleton } from "../../components/Skeleton/ProfileSkeleton.jsx";
const API = import.meta.env.VITE_API_URL;
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

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

function Profilepage() {
  const location = useLocation();
  const videoref = useRef();
  const fileref  = useRef();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);

  // ── PERSISTED ACTIVE TAB — read from localStorage on mount so coming
  // back to /profile (from a post, another user's profile, etc.) keeps
  // you on the tab you were last viewing instead of resetting to "posts".
// ── TAB MEMORY — only restored for a "return trip" from a post/reel/
  // text-post you navigated to FROM one of the tabs below (see the
  // sessionStorage.setItem calls inside Posts/Shorts/TextPosts). Any
  // other way of landing here — including the Navbar's profile button —
  // has nothing to consume, so it always starts fresh on "posts".
const [activeTab, setActiveTab] = useState("posts");
const consumedReturnTabRef = useRef(false);

useEffect(() => {
  if (consumedReturnTabRef.current) return; // already handled — Strict Mode replay guard
  consumedReturnTabRef.current = true;
  const remembered = sessionStorage.getItem("profileReturnTab");
  if (remembered) {
    sessionStorage.removeItem("profileReturnTab");
    setActiveTab(remembered);
  } else {
    sessionStorage.removeItem("profileReturnPostId");
  }
}, []);

  const [user, setUser] = useState(null);
const [loading, setLoading] = useState(true);
  const [showRequests, setShowRequests] = useState(false);
  const [requests,     setRequests]     = useState([]);

  const [listModal,    setListModal]    = useState(null); // "followers" | "following" | null
  const [searchQuery,  setSearchQuery]  = useState("");
  const [modalList,    setModalList]    = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // ── STORY STATE — your own active story, shown as a colorful gradient
  // ring around your profile photo.
  const [story,           setStory]           = useState(null);
  const [showStoryViewer, setShowStoryViewer]  = useState(false);
  const hasStory = !!story && story.slides.length > 0;

  // ── MEMORY (Highlight) STATE ─────────────────────────────────────────────
  const [groups,             setGroups]             = useState([]);
  const [viewerGroupId,      setViewerGroupId]       = useState(null); // null = viewer closed
  // ← NEW — which item inside viewerGroupId's group to land on. Set from
  // the sessionStorage handoff below when arriving here from a memory
  // notification (see the "openMemory" effect). null = just use the
  // group's default (first) item.
  const [viewerItemId,       setViewerItemId]        = useState(null);
  // ← NEW — which sheet (if any) MemoryViewer should auto-open, and
  // which comment/reply to highlight inside it, from the same "openMemory"
  // handoff (see stashMemorySheet() in utils/notificationHandoff.js).
  const [viewerSheet,        setViewerSheet]         = useState(null);
  const [viewerCommentId,    setViewerCommentId]     = useState(null);
  const [viewerReplyId,      setViewerReplyId]       = useState(null);
  const [createModal,        setCreateModal]         = useState(null); // { mode: "group" } | { mode: "item", groupId, groupName } | null

  const fetchStory = React.useCallback(async () => {
    if (!user?._id) { setStory(null); return; }
    try {
      const res  = await fetch(`${API}/stories/get-user-stories/${user._id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success || !data.stories?.length) { setStory(null); return; }
      setStory({
        id: user._id.toString(),
        username: user.username || "Unknown",
        userProfile: user.profilePic || "",
        isOwn: true,
slides: data.stories.map((s) => ({
  id: s._id,
  image: s.media?.url || "",
  type: s.media?.type || s.storyType,
  likes: s.likesCount || 0,
  isLive: s.storyType === "live",
  liveRoomId: s.liveRoomId || null,
  authorId: user._id.toString(),
  isHiddenFromNonFollowers: s.isHiddenFromNonFollowers || false,
  viewedByMe: !!s.viewedByMe,
  textOverlays: s.textOverlays || [],       // ← ADDED
  mentions: s.mentions || [],               // ← ADDED
  repostAttribution: s.repostAttribution || null,  // ← ADDED
})),
      });
    } catch {
      setStory(null);
    }
  }, [user?._id, user?.username, user?.profilePic]);

  useEffect(() => { fetchStory(); }, [fetchStory]);

  // ── Fetch own memory groups ("Highlights") ─────────────────────────────
  const fetchGroups = React.useCallback(async () => {
    if (!user?._id) { setGroups([]); return; }
    try {
      const res  = await fetch(`${API}/memories/groups/user/${user._id}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setGroups(data.groups);
    } catch {
      setGroups([]);
    }
  }, [user?._id]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ← NEW — pick up the "open this exact memory" handoff left by
  // ActivityPage.jsx (handleOpenMemory) when the user tapped a
  // memory_like / memory_comment / memory_reply / memory_like_comment
  // notification about one of THEIR OWN memories. Runs once we know who
  // we are, and only consumes/clears the handoff — if it were left for
  // a different profile (shouldn't happen, since ActivityPage navigates
  // straight to the right one) it's simply ignored here and picked up by
  // UserProfileView instead.
  useEffect(() => {
    if (!user?._id) return;
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem("openMemory") || "null"); } catch { pending = null; }
    if (!pending?.groupId || !pending?.itemId) return;
    sessionStorage.removeItem("openMemory");
    setViewerGroupId(pending.groupId);
    setViewerItemId(pending.itemId);
    setViewerSheet(pending.sheet || null);
    setViewerCommentId(pending.commentId || null);
    setViewerReplyId(pending.replyId || null);
  }, [user?._id]);

  // Refresh the memories row live after adding/deleting/hiding items or
  // whole groups, without needing a page reload.
  useEffect(() => {
    if (!user?._id) return;
    const myId = user._id.toString();
    const handler = (payload) => {
      const aid = payload?.authorId;
      if (!aid || aid === myId) fetchGroups();
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
  }, [user?._id, fetchGroups]);

  // Refresh the ring live after adding/deleting/hiding a story, or
  // starting/ending a live, without needing a page reload.
  useEffect(() => {
    if (!user?._id) return;
    const myId = user._id.toString();
    const handler = (payload) => {
      const aid = payload?.authorId;
      if (!aid || aid === myId) fetchStory();
    };
    socket.on("storyAdded",             handler);
    socket.on("storyDeleted",           handler);
    socket.on("storyVisibilityChanged", handler);
    socket.on("liveStoryEnded",         handler);
    socket.on("someoneLive",            handler);
    return () => {
      socket.off("storyAdded",             handler);
      socket.off("storyDeleted",           handler);
      socket.off("storyVisibilityChanged", handler);
      socket.off("liveStoryEnded",         handler);
      socket.off("someoneLive",            handler);
    };
  }, [user?._id, fetchStory]);

  // ── Fetch profile + posts together, on every fresh mount ─────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      try {
        const res  = await fetch(`${API}/auth/profile`, { headers: authHeaders() });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setUser(data.user);
          setRequests(data.user?.followRequests ?? []);
          await fetchPosts(data.user?._id); // fetch posts right away, don't wait on a separate effect
        }
      } catch (err) {
        console.error("PROFILE ERROR:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, []);

  const fetchPosts = async (userId) => {
    const uid = userId ?? user?._id;
    if (!uid) return;
    try {
      const res  = await fetch(`${API}/auth/get-posts/${uid}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setPosts(data.posts);
    } catch (err) {
      console.error("FETCH POSTS ERROR:", err);
    }
  };
  // ── Scroll to the exact post/short/text-post the user tapped, once
  // posts have loaded and the active tab's grid has rendered.
  useEffect(() => {
    if (loading || !posts.length) return;
    const targetId = sessionStorage.getItem("profileReturnPostId");
    if (!targetId) return;
    sessionStorage.removeItem("profileReturnPostId");

    const t = setTimeout(() => {
      const el = document.getElementById(`profile-post-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [loading, posts]);
  // ── Live socket: own profile events ───────────────────────────────────────
  useEffect(() => {
    if (!user?._id) return;
    const myId = user._id.toString();

    socket.emit("joinUserRoom", myId);

    const onFollowersList = ({ userId: uid, followers }) => {
      if (uid !== myId) return;
      setUser(prev => prev ? { ...prev, followers: followers ?? [] } : prev);
      if (listModal === "followers") {
        setModalList(followers ?? []);
        setModalLoading(false);
      }
    };

    const onFollowingList = ({ userId: uid, following }) => {
      if (uid !== myId) return;
      setUser(prev => prev ? { ...prev, following: following ?? [] } : prev);
      if (listModal === "following") {
        setModalList(following ?? []);
        setModalLoading(false);
      }
    };

    const onFollowRequestsList = ({ requests: reqs }) => {
      setRequests(reqs ?? []);
    };

    // ← THIS listener was missing before — the server already emits
    // "newFollowRequest" the moment someone requests to follow a private
    // account (see followUser in user.controllers.js), but nothing on
    // this page was listening for it, so the bell badge / dropdown never
    // updated live — only a full page reload (which re-runs the initial
    // /auth/profile fetch) ever picked up new requests. Re-requesting the
    // authoritative list here keeps this in sync with
    // "followRequestsList" (used elsewhere) instead of trusting a partial
    // payload off the raw event.
    const onNewFollowRequest = () => {
      socket.emit("getFollowRequests", { userId: myId, viewerId: myId });
    };
const onFollowRequestResolved = ({ requesterId }) => {
  setRequests(prev => prev.filter(r => (r._id ?? r.id)?.toString() !== requesterId));
};
    const onNewFollower = ({ fromUserId }) => {
      setUser(prev => {
        if (!prev) return prev;
        const alreadyIn = (prev.followers ?? []).some(
          f => (f?._id ?? f).toString() === fromUserId
        );
        if (alreadyIn) return prev;
        return { ...prev, followers: [...(prev.followers ?? []), { _id: fromUserId }] };
      });
    };

    const onUserUnfollowed = ({ fromUserId, toUserId }) => {
      if (toUserId !== myId) return;
      setUser(prev => prev ? {
        ...prev,
        followers: (prev.followers ?? []).filter(
          f => (f?._id ?? f).toString() !== fromUserId
        ),
      } : prev);
    };

    const onUserFollowed = ({ fromUserId, toUserId }) => {
      if (fromUserId !== myId) return;
      setUser(prev => {
        if (!prev) return prev;
        const alreadyIn = (prev.following ?? []).some(
          f => (f?._id ?? f).toString() === toUserId
        );
        if (alreadyIn) return prev;
        return { ...prev, following: [...(prev.following ?? []), { _id: toUserId }] };
      });
    };

    const onIUnfollowed = ({ fromUserId, toUserId }) => {
      if (fromUserId !== myId) return;
      setUser(prev => prev ? {
        ...prev,
        following: (prev.following ?? []).filter(
          f => (f?._id ?? f).toString() !== toUserId
        ),
      } : prev);
    };

    const onFollowAccepted = ({ from, toUserId }) => {
      if (from !== myId) return;
      setUser(prev => {
        if (!prev) return prev;
        const alreadyIn = (prev.following ?? []).some(
          f => (f?._id ?? f).toString() === toUserId
        );
        if (alreadyIn) return prev;
        return { ...prev, following: [...(prev.following ?? []), { _id: toUserId }] };
      });
    };

    const onNewPost = ({ post }) => {
      if ((post?.author?._id ?? post?.author)?.toString() === myId) {
        setPosts(prev => [post, ...prev]);
      }
    };

    const onPostDeleted = ({ postId }) => {
      setPosts(prev => prev.filter(p => p._id !== postId));
    };

    socket.on("followersList",     onFollowersList);
    socket.on("followingList",     onFollowingList);
    socket.on("followRequestsList", onFollowRequestsList);
    socket.on("newFollowRequest",  onNewFollowRequest);
    socket.on("newFollower",       onNewFollower);
    socket.on("userUnfollowed",    onUserUnfollowed);
    socket.on("userFollowed",      onUserFollowed);
    socket.on("userUnfollowed",    onIUnfollowed);   // same event, different guard
    socket.on("followAccepted",    onFollowAccepted);
    socket.on("newPost",           onNewPost);
    socket.on("postDeleted",       onPostDeleted);
    socket.on("followRequestResolved", onFollowRequestResolved);
    // Always request the current list on mount/login, not just when
    // user.isPrivate happens to already be true — isPrivate can still be
    // loading in from /auth/profile on first paint, and pending requests
    // sent while you were offline should show up without a reload too.
    socket.emit("getFollowRequests", { userId: myId, viewerId: myId });

    return () => {
      socket.emit("leaveUserRoom", myId);
      socket.off("followersList",      onFollowersList);
      socket.off("followingList",      onFollowingList);
      socket.off("followRequestsList", onFollowRequestsList);
      socket.off("newFollowRequest",   onNewFollowRequest);
      socket.off("newFollower",        onNewFollower);
      socket.off("userUnfollowed",     onUserUnfollowed);
      socket.off("userFollowed",       onUserFollowed);
      socket.off("userUnfollowed",     onIUnfollowed);
      socket.off("followAccepted",     onFollowAccepted);
      socket.off("newPost",            onNewPost);
      socket.off("postDeleted",        onPostDeleted);
      socket.off("followRequestResolved", onFollowRequestResolved);
    };
  }, [user?._id, listModal]);

  // ── Open modal — socket-powered ────────────────────────────────────────────
  const openModal = (type) => {
    setSearchQuery("");
    setListModal(type);
    setModalLoading(true);
    setModalList([]);

    const myId = user?._id?.toString();
    if (!myId) return;

    if (type === "followers") {
      socket.emit("getFollowers", { userId: myId, viewerId: myId });
    } else {
      socket.emit("getFollowing", { userId: myId, viewerId: myId });
    }
  };

  const closeModal = () => { setListModal(null); setSearchQuery(""); setModalList([]); };

  const filteredList = modalList.filter((u) =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAccept = async (requesterId) => {
    try {
      const res  = await fetch(`${API}/auth/follow/accept/${requesterId}`, {
        method: "POST", headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.filter(r => (r._id ?? r.id)?.toString() !== requesterId));
        setUser(prev => {
          if (!prev) return prev;
          const alreadyIn = (prev.followers ?? []).some(
            f => (f?._id ?? f).toString() === requesterId
          );
          if (alreadyIn) return prev;
          return { ...prev, followers: [...(prev.followers ?? []), { _id: requesterId }] };
        });
      }
    } catch (err) { console.error("Accept failed:", err); }
  };

  const handleReject = async (requesterId) => {
    try {
      const res  = await fetch(`${API}/auth/follow/reject/${requesterId}`, {
        method: "POST", headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setRequests(prev => prev.filter(r => (r._id ?? r.id)?.toString() !== requesterId));
      }
    } catch (err) { console.error("Reject failed:", err); }
  };

  const handleRemoveOrUnfollow = async (targetId) => {
    const msg = listModal === "followers" ? "Remove this follower?" : "Unfollow this user?";
    if (!window.confirm(msg)) return;
    try {
      const endpoint = listModal === "followers"
        ? `${API}/auth/remove-follower/${targetId}`
        : `${API}/auth/unfollow/${targetId}`;
      const res  = await fetch(endpoint, { method: "DELETE", headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setModalList(prev => prev.filter(u => u._id?.toString() !== targetId));
        if (listModal === "followers") {
          setUser(prev => prev ? {
            ...prev,
            followers: (prev.followers ?? []).filter(f => (f?._id ?? f).toString() !== targetId),
          } : prev);
        } else {
          setUser(prev => prev ? {
            ...prev,
            following: (prev.following ?? []).filter(f => (f?._id ?? f).toString() !== targetId),
          } : prev);
        }
      }
    } catch (err) { console.error("Modal action failed:", err); }
  };

  const handleFollowBack = async (targetId) => {
    try {
      const res  = await fetch(`${API}/auth/follow/${targetId}`, {
        method: "POST", headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setModalList(prev =>
          prev.map(u => u._id?.toString() === targetId ? { ...u, isFollowedBack: true } : u)
        );
        setUser(prev => {
          if (!prev) return prev;
          const alreadyIn = (prev.following ?? []).some(
            f => (f?._id ?? f).toString() === targetId
          );
          if (alreadyIn) return prev;
          return { ...prev, following: [...(prev.following ?? []), { _id: targetId }] };
        });
      } else {
        console.error(data.message);
      }
    } catch (err) { console.error("Follow back failed:", err); }
  };

  const isFollowingUser = (targetId) =>
    user?.following?.some(f => (f?._id ?? f).toString() === targetId);

  const isPrivate      = user?.isPrivate ?? false;
  const followersCount = user?.followers?.length ?? 0;
  const followingCount = user?.following?.length ?? 0;

  // ── Memory (Highlight) helpers ───────────────────────────────────────────
  // The big "+ Add memory" button — always creates a brand NEW group.
  const openCreateGroupModal = () => setCreateModal({ mode: "group" });

  // "Add another memory" from inside the viewer's ⋮ menu — adds into the
  // SAME group, never creates a new one.
  const openAddItemModal = (groupId, groupName) => {
    setViewerGroupId(null); // close the viewer while the picker is open
    setViewerItemId(null);
    setCreateModal({ mode: "item", groupId, groupName });
  };

  const handleGroupCreated = () => { fetchGroups(); };
  const handleItemsAdded   = (groupId) => { fetchGroups(); setViewerGroupId(groupId); };
  const handleGroupEmptied = () => { setViewerGroupId(null); setViewerItemId(null); setViewerSheet(null); setViewerCommentId(null); setViewerReplyId(null); fetchGroups(); };
  const closeViewer        = () => { setViewerGroupId(null); setViewerItemId(null); setViewerSheet(null); setViewerCommentId(null); setViewerReplyId(null); };
  if (loading) {
    return (
      <div style={styles.container}>
        <ProfileHeaderSkeleton />
        <ProfileGridSkeleton />
        <Navbar />
      </div>
    );
  }
  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>

      {/* ── Modal ── */}
      {listModal && (
        <div style={modalOverlayStyle} onClick={closeModal}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "16px" }}>
                {listModal === "followers" ? "Followers" : "Following"}
              </h4>
              <FiX size={20} style={{ cursor: "pointer" }} onClick={closeModal} />
            </div>
            <div style={{ borderTop: "1px solid #eee", marginBottom: "10px" }} />
            <div style={searchWrapperStyle}>
              <FiSearch size={15} color="#999" style={{ marginLeft: "10px" }} />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
              {searchQuery.length > 0 && (
                <FiX size={15} color="#999" style={{ marginRight: "10px", cursor: "pointer" }}
                  onClick={() => setSearchQuery("")} />
              )}
            </div>

            {modalLoading ? (
              <p style={{ textAlign: "center", color: "#aaa", fontSize: "14px", padding: "20px 0" }}>Loading...</p>
            ) : filteredList.length === 0 ? (
              <p style={{ textAlign: "center", color: "gray", fontSize: "14px", padding: "20px 0" }}>No results found</p>
            ) : (
              filteredList.map((u) => {
                const targetId      = u._id?.toString();
                const alreadyFollow = u.isFollowedBack || isFollowingUser(targetId);

                return (
                  <div key={u._id ?? u.id} style={userRowStyle}>
                    {u.profilePic
                      ? <img src={u.profilePic} alt={u.username} style={userAvatarStyle} />
                      : <div style={{ ...userAvatarStyle, background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#888" }}>
                          {u.username?.[0]?.toUpperCase()}
                        </div>
                    }
                    <span
                      style={{ flex: 1, fontSize: "14px", fontWeight: "500", cursor: "pointer" }}
                      onClick={() => { closeModal(); navigate(`/profile/${u._id}`); }}
                    >
                      {u.username}
                    </span>
                    {listModal === "followers" && (
                      alreadyFollow
                        ? <span style={followingBadgeStyle}>Following</span>
                        : <button style={followBackBtnStyle} onClick={() => handleFollowBack(targetId)}>Follow Back</button>
                    )}
                    <button style={actionBtnStyle} onClick={() => handleRemoveOrUnfollow(targetId)}>
                      {listModal === "followers" ? "Remove" : "Unfollow"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Top Bar ── */}
      <div style={styles.topBar}>
        <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", display: "flex", alignItems: "center", gap: "6px" }}>
          {user?.username}
          {isPrivate && <FaLock size={12} color="#888" />}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {isPrivate && (
            <div style={{ position: "relative", cursor: "pointer" }}
              onClick={() => setShowRequests(p => !p)}>
              <FiBell size={22} />
              {requests.length > 0 && (
                <span style={styles.badge}>{formatCount(requests.length)}</span>
              )}
            </div>
          )}
          <FiSettings size={22} style={{ cursor: "pointer" }} onClick={() => navigate("/settings")} />
        </div>
      </div>

      {/* ── Follow Requests Dropdown ── */}
      {showRequests && isPrivate && (
        <div style={styles.requestsDropdown}>
          <h4 style={{ margin: "0 0 10px", fontSize: "15px", borderBottom: "1px solid #eee", paddingBottom: "8px" }}>
            Follow Requests
          </h4>
          {requests.length === 0 ? (
            <p style={{ textAlign: "center", color: "gray", fontSize: "14px" }}>No pending requests</p>
          ) : (
            requests.map((req) => {
              const id = (req._id ?? req.id)?.toString();
              return (
                <div key={id} style={styles.requestRow}>
                  {req.profilePic
                    ? <img src={req.profilePic} alt={req.username}
                        style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover" }} />
                    : <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#888" }}>
                        {req.username?.[0]?.toUpperCase()}
                      </div>
                  }
                  <span style={{ flex: 1, fontSize: "14px", fontWeight: "500" }}>{req.username}</span>
                  <button onClick={() => handleAccept(id)} style={styles.acceptBtn}>Accept</button>
                  <button onClick={() => handleReject(id)} style={styles.declineBtn}>Decline</button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Cover ── */}
      <div style={styles.coverContainer}>
        {user?.coverPic
          ? <img src={user.coverPic} style={styles.cover} alt="cover" />
          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #e0e0e0, #c8c8c8)" }} />
        }
      </div>

      {/* ── Profile Section ── */}
      <div style={styles.profileSection}>
        {hasStory ? (
          <div onClick={() => setShowStoryViewer(true)} style={ownProfileRingWrap}>
            <div style={ownProfileRingInner}>
              {user?.profilePic
                ? <img src={user.profilePic} alt="profile" style={ownProfileImgNoBorder} />
                : <div style={ownProfileImgFallbackNoBorder}>{user?.username?.[0]?.toUpperCase()}</div>
              }
            </div>
          </div>
        ) : (
          user?.profilePic
            ? <img src={user.profilePic} style={styles.profileImg} alt="profile" />
            : <div style={{ ...styles.profileImg, background: "linear-gradient(135deg, #d0d0d0, #b0b0b0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", fontWeight: "700", color: "#fff" }}>
                {user?.username?.[0]?.toUpperCase()}
              </div>
        )}
        <div style={styles.profileInfo}>
          <h3 style={styles.username}>{user?.username}</h3>
          <div style={styles.stats}>
            <div style={styles.statItem}>
              <b style={styles.statNum}>{formatCount(posts.length)}</b>
              <span style={styles.statLabel}>posts</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statItem} onClick={() => openModal("followers")}>
              <b style={styles.statNum}>{formatCount(followersCount)}</b>
              <span style={styles.statLabel}>followers</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statItem} onClick={() => openModal("following")}>
              <b style={styles.statNum}>{formatCount(followingCount)}</b>
              <span style={styles.statLabel}>following</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bio ── */}
      {user?.bio && <p style={styles.bio}>{user.bio}</p>}

      {/* ── Action Boxes ── */}
      <div style={styles.actionsWrap}>
        <div style={styles.actions}>
          <div style={styles.actionBox} onClick={() => fileref.current.click()}>
            <div style={styles.actionIcon}><FiImage size={18} color="#fff" /></div>
            <p style={styles.actionLabel}>+ Image</p>
          </div>
          <input
            type="file" accept="image/*" multiple ref={fileref} style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length > 0) {
                navigate("/edit-image", {
                  state: {
                    images: files.map(f => URL.createObjectURL(f)),
                    files: files,
                  }
                });
              }
            }}
          />

          <div style={styles.actionBox} onClick={() => videoref.current.click()}>
            <div style={{ ...styles.actionIcon, background: "linear-gradient(135deg,#f093fb,#f5576c)" }}>
              <FiVideo size={18} color="#fff" />
            </div>
            <p style={styles.actionLabel}>+ Shorts</p>
          </div>
          <input type="file" accept="video/*" ref={videoref} style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) navigate("/create-video", { state: { file } });
            }}
          />

          <div style={styles.actionBox} onClick={() => navigate("/create-text")}>
            <div style={{ ...styles.actionIcon, background: "linear-gradient(135deg,#4facfe,#00f2fe)" }}>
              <FiEdit size={18} color="#fff" />
            </div>
            <p style={styles.actionLabel}>+ Text</p>
          </div>

          <div style={styles.actionBox} onClick={() => navigate("/saved")}>
            <div style={{ ...styles.actionIcon, background: "linear-gradient(135deg,#f6d365,#fda085)" }}>
              <FiBookmark size={18} color="#fff" />
            </div>
            <p style={styles.actionLabel}>Saves</p>
          </div>
        </div>
      </div>

      {/* ── Edit Profile Button ── */}
      <button onClick={() => navigate("/editprofile")} style={styles.editBtn}>
        <FaUserEdit size={15} />
        Edit Profile
      </button>

      {/* ── Memories ("Highlights") — Add Memory + existing groups ── */}
      <MemoriesRow
        groups={groups}
        showAdd
        onAdd={openCreateGroupModal}
        onOpenGroup={(groupId) => { setViewerGroupId(groupId); setViewerItemId(null); setViewerSheet(null); setViewerCommentId(null); setViewerReplyId(null); }}
      />

      {/* ── Tabs ── */}
      <div style={styles.tabs}>
        {["posts", "Shorts", "text"].map((tab) => (
          <p key={tab}
            style={activeTab === tab ? styles.activeTab : styles.inactiveTab}
            onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </p>
        ))}
      </div>

      <div style={{ padding: "10px" }}>
        {activeTab === "posts" && <Posts     posts={posts} />}
        {activeTab === "Shorts" && <Shorts    posts={posts} userId={user?._id} />}
        {activeTab === "text"  && <TextPosts posts={posts} />}
      </div>

      {showStoryViewer && hasStory && (
        <StoryViewer
          stories={[story]}
          index={0}
          close={() => setShowStoryViewer(false)}
        />
      )}

      {viewerGroupId && (
        <MemoryViewer
          groupId={viewerGroupId}
          isOwner
          initialItemId={viewerItemId}
          initialSheet={viewerSheet}
          initialCommentId={viewerCommentId}
          initialReplyId={viewerReplyId}
          onClose={closeViewer}
          onGroupEmptied={handleGroupEmptied}
          onItemDeleted={() => fetchGroups()}
          onRequestAddItem={openAddItemModal}
        />
      )}

      {createModal && (
        <CreateMemoryModal
          mode={createModal.mode}
          groupId={createModal.groupId}
          groupName={createModal.groupName}
          onClose={() => setCreateModal(null)}
          onGroupCreated={handleGroupCreated}
          onItemsAdded={() => handleItemsAdded(createModal.groupId)}
        />
      )}

      {!showStoryViewer && !viewerGroupId && <Navbar />}
    </div>
  );
}

export default Profilepage;

// ── Sub-components ─────────────────────────────────────────────────────────────
const Posts = ({ posts }) => {
  const navigate   = useNavigate();
  const imagePosts = posts.filter(p => p?.postType === "image" || p?.postType === "carousel");
  if (!imagePosts.length)
    return <div style={{ textAlign: "center", padding: "30px", color: "gray" }}>No posts yet</div>;
  return (
    <div style={styles.grid}>
      {imagePosts.map((post) => (
        <img key={post._id} id={`profile-post-${post._id}`}
          src={post?.media?.[0]?.url || "https://via.placeholder.com/300"}
          alt="" style={styles.postImg}
          onClick={() => {
            sessionStorage.setItem("profileReturnTab", "posts");
            sessionStorage.setItem("profileReturnPostId", post._id);
            navigate(`/post/${post._id}`, { state: { post, allPosts: imagePosts } });
          }} />
      ))}
    </div>
  );
};

const Shorts = ({ posts, userId }) => {
  const navigate   = useNavigate();
  const videoPosts = posts.filter(p => p?.postType === "video");
  if (!videoPosts.length)
    return <div style={{ textAlign: "center", padding: "20px", color: "gray" }}>No reels yet 🎥</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "4px" }}>
      {videoPosts.map((video) => (
        <div key={video._id} id={`profile-post-${video._id}`}
          style={{ position: "relative", aspectRatio: "1/1", overflow: "hidden", cursor: "pointer", borderRadius: "6px" }}
          onClick={() => {
            sessionStorage.setItem("profileReturnTab", "Shorts");
            sessionStorage.setItem("profileReturnPostId", video._id);
            navigate(`/profile-reel/${video._id}`, {
              state: { video, allVideos: videoPosts, ownerUserId: userId }
            });
          }}>
          <video src={video?.media?.[0]?.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", color: "white", fontSize: "20px" }}>▶</div>
        </div>
      ))}
    </div>
  );
};

// ── Expandable text for the profile's Text tab — truncates long posts
// with a "...more" link, and "less" to collapse back.
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

const TextPosts = ({ posts }) => {
  const navigate  = useNavigate();
  const textPosts = posts.filter(p => p?.postType === "text");
  if (!textPosts.length)
    return <div style={{ textAlign: "center", padding: "20px", color: "gray" }}>No text posts yet 📝</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {textPosts.map((post) => (
<div key={post._id} id={`profile-post-${post._id}`}
          onClick={() => {
            sessionStorage.setItem("profileReturnTab", "text");
            sessionStorage.setItem("profileReturnPostId", post._id);
            navigate(`/text-post/${post._id}`, { state: { post, allPosts: textPosts } });
          }}
          style={{ border: "1px solid #eee", borderRadius: "14px", overflow: "hidden", background: "#fff", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 12px 8px" }}>
            {post?.author?.profilePic
              ? <img src={post.author.profilePic} alt=""
                  style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#fff", fontSize: "15px", flexShrink: 0 }}>
                  {post?.author?.username?.[0]?.toUpperCase() || "?"}
                </div>
            }
            <div style={{ fontWeight: "600", fontSize: "14px", color: "#111" }}>{post?.author?.username}</div>
          </div>

          {post?.text && <ExpandableProfileText text={post.text} />}

          {post?.media?.length > 0 && (
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "0 12px 12px", scrollbarWidth: "none", msOverflowStyle: "none" }}>
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

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = {
  container:        { width: "100%", maxWidth: "420px", margin: "0 auto", background: "#fff", minHeight: "100vh", fontFamily: "sans-serif", overflowX: "hidden", boxSizing: "border-box", paddingBottom: "12px" },
  topBar:           { display: "flex", justifyContent: "space-between", padding: "16px 18px 8px", alignItems: "center" },
  badge:            { position: "absolute", top: "-4px", right: "-4px", background: "red", color: "white", borderRadius: "50%", minWidth: "16px", height: "16px", padding: "0 3px", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" },
  requestsDropdown: { position: "absolute", top: "52px", right: "10px", width: "300px", background: "#fff", border: "1px solid #ddd", borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 999, padding: "12px" },
  requestRow:       { display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px", marginBottom: "10px", borderBottom: "1px solid #f0f0f0" },
  acceptBtn:        { padding: "5px 10px", background: "#0095f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  declineBtn:       { padding: "5px 10px", background: "#f0f0f0", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
  coverContainer:   { width: "100%", padding: "0 18px", boxSizing: "border-box", height: "180px" },
  cover:            { width: "100%", height: "100%", objectFit: "cover", borderRadius: "18px", display: "block" },
  profileSection:   { display: "flex", flexDirection: "row", alignItems: "center", padding: "16px 18px 6px", gap: "16px" },
  profileImg:       { width: "90px", height: "90px", borderRadius: "50%", border: "4px solid white", objectFit: "cover", background: "#fff", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" },
  profileInfo:      { display: "flex", flexDirection: "column", marginTop: "0" },
  username:         { margin: "0 0 8px 0", fontSize: "18px", fontWeight: "800", color: "#111" },
  stats:            { display: "flex", alignItems: "center", gap: "16px" },
  statDivider:      { width: "1px", height: "26px", background: "#eee" },
  statItem:         { display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" },
  statNum:          { fontSize: "16px", fontWeight: "700", color: "#111" },
  statLabel:        { fontSize: "11px", color: "#888", marginTop: "1px" },
  bio:              { fontSize: "14px", fontWeight: "500", color: "#444", margin: "10px 18px 0", lineHeight: "1.5" },
  actionsWrap:      { padding: "16px 18px 4px" },
  actions:          { display: "flex", justifyContent: "space-around", background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: "18px", padding: "14px 6px" },
  actionBox:        { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "68px", cursor: "pointer" },
  actionIcon:       { width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg,#667eea,#764ba2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "6px", boxShadow: "0 3px 8px rgba(0,0,0,0.15)" },
  actionLabel:      { margin: 0, fontSize: "11px", fontWeight: "600", color: "#444" },
  editBtn:          { width: "calc(100% - 36px)", margin: "14px 18px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "11px", border: "1.5px solid #e2e2e2", borderRadius: "14px", background: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: "700", color: "#111" },
  tabs:             { display: "flex", justifyContent: "space-around", marginTop: "14px", borderTop: "1px solid #eee", padding: "12px 0 0" },
  activeTab:        { fontWeight: "700", borderBottom: "2px solid #111", cursor: "pointer", margin: 0, paddingBottom: "10px", color: "#111" },
  inactiveTab:      { color: "#aaa", cursor: "pointer", margin: 0, paddingBottom: "10px" },
  grid:             { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" },
  postImg:          { width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: "6px" },
};

const modalOverlayStyle   = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modalBoxStyle       = { background: "#fff", borderRadius: "12px", width: "90%", maxWidth: "380px", maxHeight: "70vh", overflowY: "auto", padding: "16px" };
const searchWrapperStyle  = { display: "flex", alignItems: "center", background: "#f0f0f0", borderRadius: "10px", marginBottom: "12px", gap: "6px" };
const searchInputStyle    = { flex: 1, border: "none", background: "transparent", padding: "9px 4px", fontSize: "14px", outline: "none" };
const userRowStyle        = { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid #f0f0f0" };
const userAvatarStyle     = { width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
const followBackBtnStyle  = { padding: "5px 10px", background: "#0095f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0 };
const followingBadgeStyle = { padding: "5px 10px", background: "#f0f0f0", color: "#555", borderRadius: "6px", fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0 };
const actionBtnStyle      = { padding: "5px 10px", background: "#f0f0f0", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", flexShrink: 0 };

// Expandable text styles for the profile's Text tab
const profileTextStyle = { padding: "0 12px 10px", fontSize: "15px", lineHeight: "1.6", color: "#222", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const moreLessStyle    = { color: "#8e8e8e", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" };

// ── Own-story ring styles — same proportions as the ring used everywhere
// else: ringSize = base (90) + 6. Always shown in this gradient — never
// grey — since there's no seen/unseen concept for your own content.
const ownProfileRingWrap = {
  width: 96, height: 96, borderRadius: "50%",
  background: "rgb(234,182,118)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, padding: 3,
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
};
const ownProfileRingInner = {
  width: "100%", height: "100%", borderRadius: "50%", background: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 2,
};
const ownProfileImgNoBorder = {
  width: "84px", height: "84px", borderRadius: "50%", objectFit: "cover", display: "block",
};
const ownProfileImgFallbackNoBorder = {
  width: "84px", height: "84px", borderRadius: "50%",
  background: "linear-gradient(135deg, #d0d0d0, #b0b0b0)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "32px", fontWeight: "700", color: "#fff",
};