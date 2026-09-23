import { useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import Videopost from "./video.jsx";

function Reelspage() {
  const location = useLocation();
  const navigate = useNavigate();

  const { video, allVideos = [] } = location.state || {};

  if (!video) {
    return (
      <div style={styles.emptyContainer}>
        <h2>No reel found</h2>

        <button
          style={styles.backBtn}
          onClick={() => navigate(-1)}
        >
          Go Back
        </button>
      </div>
    );
  }

  // Find clicked reel index
  const currentIndex = allVideos.findIndex(
    (item) => item._id === video._id
  );

  // Arrange reels so clicked reel appears first
const orderedVideos = allVideos.length > 0 ? 
  [...allVideos.slice(allVideos.findIndex(i => i._id === video._id)), 
   ...allVideos.slice(0, allVideos.findIndex(i => i._id === video._id))] 
  : [video];

  return (
    <div style={styles.container}>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <FiArrowLeft
          size={24}
          color="white"
          style={{ cursor: "pointer" }}
          onClick={() => navigate(-1)}
        />

        <h3 style={styles.heading}>Reels</h3>

        <div style={{ width: 24 }} />
      </div>

      {/* Reels Feed */}
      <div style={styles.feed}>
        {orderedVideos.map((v) => (
          <div key={v._id} style={styles.reelWrapper}>
            <Videopost p={v} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Reelspage;

//////////////////////////////////////////////////////
// STYLES

const styles = {
  container: {
    background: "#000",
    minHeight: "100vh",
    width: "100%",
    maxWidth: "400px",
    margin: "0 auto",
    overflow: "hidden",
    position: "relative",
  },

  topBar: {
    position: "fixed",
    top: 0,
    width: "100%",
    maxWidth: "400px",
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
  },

  heading: {
    color: "white",
    margin: 0,
    fontSize: "18px",
    fontWeight: "600",
  },

  feed: {
    height: "100vh",
    overflowY: "scroll",
    scrollSnapType: "y mandatory",
  },

  reelWrapper: {
    height: "100vh",
    scrollSnapAlign: "start",
  },

  emptyContainer: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    background: "#000",
    color: "white",
  },

  backBtn: {
    padding: "10px 18px",
    border: "none",
    borderRadius: "8px",
    background: "white",
    color: "black",
    cursor: "pointer",
    fontWeight: "600",
  },
};