import { useEffect, useState, useCallback } from "react";
import Videopost from "../../components/PostCard/video.jsx";
import Navbar from "../../components/Navbar/navbar.jsx";
import { useLocation } from "react-router-dom";
import socket from "../../sockets/sockets";
// ── NEW — same hoist-to-parent pattern used in ExploreReels.jsx: fetch
// the real following list ONCE here and pass it down as a prop, instead
// of letting every mounted <Videopost /> in this scroll list each fire
// its own /auth/profile request. Videopost.jsx now accepts
// myFollowingIds/onFollowChange as optional props and only falls back
// to its own internal fetch when a parent doesn't supply them — so this
// is a pure efficiency win, not a behavior change.
import { useFollowStore, initFollowStore, addFollowing, removeFollowing } from "../../pages/Profile/usefollowState.jsx";

const API = import.meta.env.VITE_API_URL;

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

function VideoPage() {
  const [videos,      setVideos]      = useState([]);
  const [blockedIds,  setBlockedIds]  = useState(new Set());
  // ← renamed from commentsOpen: now tracks ANY open sheet (likers,
  // comments, share, or views) — Videopost fires this via onSheetOpen
  // whenever showLikers/showComments/showShare/showViews changes, so the
  // navbar drops behind all four sheets, not just comments.
  const [sheetOpen,   setSheetOpen]   = useState(false);

  const location = useLocation();
  const hasNavbar = location.state?.hasNavbar ?? true;

  // ── NEW — myFollowingIds kept in sync with the server, fetched once
  // for this whole page instead of once per video card.
  const { followingIds: myFollowingIds } = useFollowStore();

  useEffect(() => {
    const fetchProfileAndFollowing = async () => {
      try {
        const res  = await fetch(`${API}/auth/profile`, { headers: authHeaders() });
        const data = await res.json();
        if (!data?.user) return;
        localStorage.setItem("user", JSON.stringify(data.user));
        const followingIds = (data.user.following || []).map(f => (f?._id ?? f).toString());
        initFollowStore(followingIds);
      } catch (err) { console.error("FETCH PROFILE ERROR:", err); }
    };
    fetchProfileAndFollowing();
  }, []);

  const handleFollowChange = useCallback((authorId, followed) => {
    if (followed) addFollowing(authorId);
    else removeFollowing(authorId);
  }, []);

  useEffect(() => {
    const fetchBlocked = async () => {
      try {
        const res  = await fetch(`${API}/auth/blocked-users`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) {
          const ids = (data.blockedUsers || []).map((u) => (u?._id ?? u).toString());
          setBlockedIds(new Set(ids));
        }
      } catch (err) { console.error("FETCH BLOCKED USERS ERROR:", err); }
    };
    fetchBlocked();
  }, []);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res  = await fetch(`${API}/auth/public-reels`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setVideos(data.reels);
      } catch (err) { console.error("FETCH REELS ERROR:", err); }
    };
    fetchVideos();
  }, []);

  // ── NEW — live privacy toggling, same as Home.jsx/Explore.jsx/
  // ExploreReels.jsx: patches author.isPrivate on any matching video
  // already sitting in `videos`. Combined with the visibleVideos filter
  // below, this makes a video disappear from Shorts the instant its
  // author goes private (if you don't follow them) — no reload needed.
  // This page previously had neither the listener nor the filter, so
  // going private never removed anything here even though it correctly
  // did on Home/Explore/ExploreReels.
  useEffect(() => {
    const patchPrivacy = (list, userId, isPrivate) =>
      list.map(v => {
        const vAuthorId = v.author?._id ? v.author._id.toString() : v.author?.toString();
        if (vAuthorId !== userId.toString()) return v;
        return {
          ...v,
          author: {
            ...(v.author?._id ? v.author : { _id: v.author }),
            isPrivate,
          },
        };
      });

    const handler = ({ userId, isPrivate }) => {
      setVideos(prev => patchPrivacy(prev, userId, isPrivate));
    };

    socket.on("privacyChanged", handler);
    return () => socket.off("privacyChanged", handler);
  }, []);

  const handleBlock = useCallback((blockedAuthorId) => {
    setBlockedIds((prev) => new Set([...prev, blockedAuthorId]));
    setVideos((prev) =>
      prev.filter((v) => {
        const vid_authorId = (v?.author?._id ?? v?.author)?.toString();
        return vid_authorId !== blockedAuthorId;
      })
    );
  }, []);

  // ── CHANGED — previously only filtered blockedIds. Now also hides a
  // reel if its author is private and the viewer doesn't follow them
  // (and it isn't the viewer's own reel) — same rule used everywhere
  // else in the app. Combined with the privacyChanged listener above,
  // this is what actually makes a reel vanish live when its author
  // flips to private mid-session.
  const currentUserForFilter = (() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw || raw === "undefined" || raw === "null") return {};
      return JSON.parse(raw);
    } catch { return {}; }
  })();
  const myIdForFilter = (currentUserForFilter?._id || currentUserForFilter?.id)?.toString();

  const visibleVideos = videos.filter((v) => {
    const vid_authorId = (v?.author?._id ?? v?.author)?.toString();
    if (blockedIds.has(vid_authorId)) return false;
    if (vid_authorId === myIdForFilter) return true;
    if (v?.author?.isPrivate && !myFollowingIds.includes(vid_authorId)) return false;
    return true;
  });

  return (
    <>
      <div
        style={{
          height: "100vh",
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          background: "#000",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
{visibleVideos.map((post) => (
  <div
    key={`${post._id}-${location.key}`}
    style={{ height: "100vh", scrollSnapAlign: "start", flexShrink: 0 }}
  >
    <Videopost
      p={post}
      hasNavbar={hasNavbar}
      onBlock={handleBlock}
      onSheetOpen={setSheetOpen}
      myFollowingIds={myFollowingIds}
      onFollowChange={handleFollowChange}
    />
  </div>
))}
      </div>

      {/* Navbar hides behind whenever any sheet is open */}
      {hasNavbar && (
        <div style={{ zIndex: sheetOpen ? -1 : 100, position: "relative" }}>
          <Navbar />
        </div>
      )}
    </>
  );
}

export default VideoPage;