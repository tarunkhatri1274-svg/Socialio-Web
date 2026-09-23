import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiGrid, FiVideo, FiFileText } from "react-icons/fi";
import socket from "../../sockets/sockets";

function SavedPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("posts");
  const [savedPosts,  setSavedPosts]  = useState([]);
  const [savedVideos, setSavedVideos] = useState([]);
  const [savedTexts,  setSavedTexts]  = useState([]);

  // ── Restore active tab on a "return trip" from a saved post/video/text
  // post — mirrors Profilepage.jsx / UserProfileView.jsx. Any other way
  // of landing here (e.g. navbar) has nothing to consume, so it stays on
  // "posts".
  useEffect(() => {
    const remembered = sessionStorage.getItem("savedPageReturnTab");
    if (remembered) {
      sessionStorage.removeItem("savedPageReturnTab");
      setActiveTab(remembered);
    } else {
      sessionStorage.removeItem("savedPageReturnPostId");
    }
  }, []);

useEffect(() => {
  loadFromStorage(); // ✅ always fresh on mount

  const onSaved = (e) => {
    const { post } = e.detail;
    if (!post) return;
    if (post.postType === "text") {
      setSavedTexts(prev => prev.some(t => t._id === post._id) ? prev : [...prev, post]);
    } else if (post.postType === "video") {
      setSavedVideos(prev => prev.some(v => v._id === post._id) ? prev : [...prev, post]);
    } else {
      setSavedPosts(prev => prev.some(p => p._id === post._id) ? prev : [...prev, post]);
    }
  };

  const onUnsaved = (e) => {
    const { postId, postType } = e.detail;
    if (postType === "text") {
      setSavedTexts(prev => prev.filter(t => t._id !== postId));
    } else if (postType === "video") {
      setSavedVideos(prev => prev.filter(v => v._id !== postId));
    } else {
      setSavedPosts(prev => prev.filter(p => p._id !== postId));
    }
  };

  window.addEventListener("postSaved",   onSaved);
  window.addEventListener("postUnsaved", onUnsaved);

  return () => {
    window.removeEventListener("postSaved",   onSaved);
    window.removeEventListener("postUnsaved", onUnsaved);
  };
}, []);

 const loadFromStorage = () => {
  const all = JSON.parse(localStorage.getItem("savedPosts")) || [];
  setSavedPosts(all.filter(p => p.postType === "image" || p.postType === "carousel"));
  setSavedTexts(all.filter(p => p.postType === "text"));
  setSavedVideos(JSON.parse(localStorage.getItem("savedVideos")) || []);
};

  // ── Scroll to the exact saved item the user tapped, once the relevant
  // tab's list has actually rendered.
  useEffect(() => {
    const targetId = sessionStorage.getItem("savedPageReturnPostId");
    if (!targetId) return;

    const list =
      activeTab === "posts"  ? savedPosts  :
      activeTab === "videos" ? savedVideos :
      savedTexts;
    if (!list.length) return;

    sessionStorage.removeItem("savedPageReturnPostId");

    const t = setTimeout(() => {
      const el = document.getElementById(`saved-item-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [activeTab, savedPosts, savedVideos, savedTexts]);

  const tabs = [
    { key: "posts",  icon: <FiGrid     size={20} />, label: "Posts"  },
    { key: "videos", icon: <FiVideo    size={20} />, label: "Videos" },
    { key: "texts",  icon: <FiFileText size={20} />, label: "Text"   },
  ];
const handleUnsave = (post) => {
  if (post.postType === "video") {
    let sv = JSON.parse(localStorage.getItem("savedVideos")) || [];
    sv = sv.filter(item => item._id !== post._id);
    localStorage.setItem("savedVideos", JSON.stringify(sv));
    setSavedVideos(prev => prev.filter(v => v._id !== post._id));
  } else {
    let sp = JSON.parse(localStorage.getItem("savedPosts")) || [];
    sp = sp.filter(item => item._id !== post._id);
    localStorage.setItem("savedPosts", JSON.stringify(sp));
    if (post.postType === "text") {
      setSavedTexts(prev => prev.filter(t => t._id !== post._id));
    } else {
      setSavedPosts(prev => prev.filter(p => p._id !== post._id));
    }
  }
};

  return (
    <div style={{ maxWidth: "400px", margin: "auto", minHeight: "100vh", fontFamily: "sans-serif", background: "#fff" }}>

      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 15px", borderBottom: "1px solid #eee" }}>
        <FiArrowLeft size={22} onClick={() => navigate(-1)} style={{ cursor: "pointer" }} />
        <h3 style={{ margin: "0 auto", fontSize: "16px" }}>Saved</h3>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #eee" }}>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: "12px 0", border: "none", background: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
            fontSize: "11px", color: activeTab === tab.key ? "#000" : "#aaa",
            borderBottom: activeTab === tab.key ? "2px solid #000" : "2px solid transparent",
            fontWeight: activeTab === tab.key ? "600" : "400",
          }}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
     {/* Content */}
<div>
  {activeTab === "posts"  && <PostsGrid  posts={savedPosts}   navigate={navigate} onUnsave={handleUnsave} />}
{activeTab === "videos" && <VideosGrid videos={savedVideos} navigate={navigate} onUnsave={handleUnsave} />}
  {activeTab === "texts"  && <TextList   texts={savedTexts}   navigate={navigate} onUnsave={handleUnsave} />}
</div>
    </div>
  );
}

/* ── Posts Grid ── */
// In PostsGrid, add unsave button on each item:
function PostsGrid({ posts, navigate, onUnsave }) {
  if (posts.length === 0) return <Empty message="No saved posts yet 📌" />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px", padding: "3px" }}>
      {posts.map((post) => (
        <div key={post._id} id={`saved-item-${post._id}`} style={{ position: "relative" }}>
          <img src={post?.media?.[0]?.url} alt=""
            style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", cursor: "pointer" }}
            onClick={() => {
              sessionStorage.setItem("savedPageReturnTab", "posts");
              sessionStorage.setItem("savedPageReturnPostId", post._id);
              navigate(`/post/${post._id}`, { state: { post, allPosts: posts } });
            }} />
          {/* ✅ unsave button */}
          <button onClick={() => onUnsave(post)} style={{
            position: "absolute", top: 6, right: 6,
            background: "rgba(0,0,0,0.5)", border: "none",
            borderRadius: "50%", width: 28, height: 28,
            color: "#fff", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ── Videos Grid ── */
function VideosGrid({ videos, navigate, onUnsave }) {
  if (videos.length === 0) return <Empty message="No saved videos yet 🎥" />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px", padding: "3px" }}>
      {videos.map((video) => (
        <div key={video._id} id={`saved-item-${video._id}`}
          style={{ position: "relative", aspectRatio: "1/1", cursor: "pointer", overflow: "hidden" }}
          onClick={() => {
            sessionStorage.setItem("savedPageReturnTab", "videos");
            sessionStorage.setItem("savedPageReturnPostId", video._id);
            navigate(`/profile-reel/${video._id}`, {
              state: {
                video,
                allVideos: videos,
                ownerUserId: video?.author?._id || video?.author, // ✅ pass author id
              }
            });
          }}>

          <video src={(video?.media?.[0]?.url || video?.url) + "#t=0.1"}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />

          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)" }}>
            <span style={{ fontSize: "22px", color: "#fff" }}>▶</span>
          </div>

          {/* ✅ unsave button */}
          <button onClick={(e) => { e.stopPropagation(); onUnsave(video); }} style={{
            position: "absolute", top: 6, right: 6,
            background: "rgba(0,0,0,0.55)", border: "none",
            borderRadius: "50%", width: 26, height: 26,
            color: "#fff", cursor: "pointer", fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1,
          }}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ── Text List ── */
function TextList({ texts, navigate, onUnsave }) {
  if (texts.length === 0) return <Empty message="No saved text posts yet 📝" />;
  return (
    <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
      {texts.map((post) => (
        <div key={post._id} id={`saved-item-${post._id}`} style={{ position: "relative", border: "1px solid #eee", borderRadius: "14px", overflow: "hidden", background: "#fff", cursor: "pointer" }}
          onClick={() => {
            sessionStorage.setItem("savedPageReturnTab", "texts");
            sessionStorage.setItem("savedPageReturnPostId", post._id);
            navigate(`/text-post/${post._id}`, { state: { post, allPosts: texts } });
          }}>

          {/* ✅ unsave button top-right corner */}
          <button onClick={(e) => { e.stopPropagation(); onUnsave(post); }} style={{
            position: "absolute", top: 10, right: 10,
            background: "rgba(0,0,0,0.55)", border: "none",
            borderRadius: "50%", width: 26, height: 26,
            color: "#fff", cursor: "pointer", fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1,
          }}>✕</button>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 12px 8px" }}>
            {post?.author?.profilePic
              ? <img src={post.author.profilePic} alt=""
                  style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1877f2", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", color: "#fff", fontSize: "14px", flexShrink: 0 }}>
                  {(post?.author?.username || post?.username || "U")[0].toUpperCase()}
                </div>
            }
            <div>
              <div style={{ fontWeight: "600", fontSize: "14px" }}>{post?.author?.username || post?.username}</div>
              {post?.createdAt && (
                <div style={{ fontSize: "11px", color: "#aaa" }}>
                  {new Date(post.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {post?.text && (
            <div style={{ padding: "0 12px 10px", fontSize: "15px", lineHeight: "1.6", color: "#222", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {post.text}
            </div>
          )}

          {post?.media?.length > 0 && (
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "0 12px 12px", scrollbarWidth: "none" }}>
              {post.media.map((m, i) => (
                <img key={i} src={m.url} alt="" style={{
                  width: post.media.length === 1 ? "100%" : "160px",
                  height: "160px", objectFit: "cover", borderRadius: "10px", flexShrink: 0,
                }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Empty ── */
function Empty({ message }) {
  return <p style={{ textAlign: "center", padding: "60px 20px", color: "#aaa", fontSize: "14px" }}>{message}</p>;
}

export default SavedPage;