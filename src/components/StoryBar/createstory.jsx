import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiImage, FiRefreshCw, FiMessageCircle, FiVolumeX, FiSend } from "react-icons/fi";
import { FaCircle } from "react-icons/fa";
import socket from "../../sockets/sockets";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

const API = import.meta.env.VITE_API_URL;
const GOLDEN = "rgb(234,182,118)";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const LIVE_REACTIONS = ["❤️", "😂", "😮", "🔥", "👏"];

const getToken = () => localStorage.getItem("token");

// ── Filter catalog. `css` filters are cheap (canvas ctx.filter each
// frame). `blur-bg` runs MediaPipe's selfie segmenter to separate person
// from background and blur only the background — everything else stays
// a plain 2D canvas draw, so it's still fast on mobile.
const CSS_FILTERS = {
  none: "none",
  grayscale: "grayscale(1)",
  sepia: "sepia(0.8)",
  vintage: "sepia(0.35) contrast(1.1) brightness(0.9) saturate(1.3)",
  warm: "saturate(1.4) hue-rotate(-8deg) brightness(1.05)",
  cool: "saturate(1.2) hue-rotate(15deg) brightness(1.03)",
  invert: "invert(1)",
  noir: "grayscale(1) contrast(1.4) brightness(0.85)",
};

const FILTERS = [
  { id: "none", label: "Normal", emoji: "✨" },
  { id: "grayscale", label: "B&W", emoji: "⚫" },
  { id: "sepia", label: "Sepia", emoji: "🟤" },
  { id: "vintage", label: "Vintage", emoji: "📼" },
  { id: "warm", label: "Warm", emoji: "🌅" },
  { id: "cool", label: "Cool", emoji: "❄️" },
  { id: "invert", label: "Invert", emoji: "🔄" },
  { id: "noir", label: "Noir", emoji: "🎬" },
  { id: "blur-bg", label: "Blur BG", emoji: "🌫️" },
];

// ── Tiny avatar used next to "X joined/left the live" lines ──────────────
function MiniAvatar({ src, username, size = 18 }) {
  const letter = username?.[0]?.toUpperCase() || "?";
  const base = { width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
  if (src) return <img src={src} alt={username} style={base} />;
  return (
    <div style={{ ...base, background: "#1877f2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.55 }}>
      {letter}
    </div>
  );
}

function formatCount(num) {
  const n = Number(num) || 0;
  if (n < 1000) return `${n}`;
  const format = (value, suffix) => {
    const rounded = Math.floor(value * 10) / 10;
    const str = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
    return `${str}${suffix}`;
  };
  if (n < 1_000_000) return format(n / 1000, "k");
  if (n < 1_000_000_000) return format(n / 1_000_000, "m");
  return format(n / 1_000_000_000, "b");
}

function CreateStory() {
  const navigate         = useNavigate();
  const galleryRef       = useRef(null);
  const videoRef         = useRef(null);   // hidden raw camera source
  const canvasRef        = useRef(null);   // visible, filtered preview + capture source
  const offscreenRef     = useRef(null);   // scratch canvas for segmentation compositing
  const streamRef        = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const peerConnections  = useRef({});
  const iceBuffersRef     = useRef({});
  const commentsEndRef   = useRef(null);
  const liveStoryIdRef   = useRef(null);
  const viewerIdsRef     = useRef(new Set());
  const rafRef           = useRef(null);
  const segmenterRef     = useRef(null);
  const segmenterLoadingRef = useRef(false);

  const [cameraActive,   setCameraActive]   = useState(false);
  const [facingMode,     setFacingMode]     = useState("environment");
  const [error,          setError]          = useState("");
  const [isRecording,    setIsRecording]    = useState(false);
  const [isLive,         setIsLive]         = useState(false);
  const [liveViewers,    setLiveViewers]    = useState(0);
  const [liveLikes,      setLiveLikes]      = useState(0);
  const [liveRoomId,     setLiveRoomId]     = useState(null);
  const [liveComments,   setLiveComments]   = useState([]);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [comment,        setComment]        = useState("");
  const [showComments,   setShowComments]   = useState(true);
  const [recordSeconds,  setRecordSeconds]  = useState(0);
  const recordTimerRef   = useRef(null);

  // ── NEW: active filter (only applies to normal capture, never live)
  const [activeFilter,   setActiveFilter]   = useState("none");
  const [segmenterReady, setSegmenterReady] = useState(false);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const safeParseUser = () => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw || raw === "undefined") return {};
      return JSON.parse(raw);
    } catch { return {}; }
  };

  // ── Lazy-load the MediaPipe selfie segmenter only when "Blur BG" is
  // actually picked, so normal photo/video capture never pays this cost.
  const ensureSegmenter = async () => {
    if (segmenterRef.current || segmenterLoadingRef.current) return;
    segmenterLoadingRef.current = true;
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
      });
      segmenterRef.current = segmenter;
      setSegmenterReady(true);
    } catch (e) {
      console.error("Segmenter load failed, falling back to Normal:", e);
      setActiveFilter("none");
    } finally {
      segmenterLoadingRef.current = false;
    }
  };

  const handleSelectFilter = (id) => {
    setActiveFilter(id);
    if (id === "blur-bg") ensureSegmenter();
  };

  const startCamera = async (facing = facingMode) => {
    stopCamera();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      setError("Camera access denied. Please allow camera permission.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  // ── The filtered render loop — draws the raw <video> into the visible
  // <canvas> every frame, applying either a CSS canvas filter or the
  // MediaPipe background-blur composite. This canvas is what's shown to
  // the user AND what capturePhoto()/startRecording() read from, so the
  // filter is baked into the actual output, not just a preview overlay.
  // Intentionally NEVER runs while isLive — live keeps using the raw
  // camera stream untouched, exactly as before.
  useEffect(() => {
    if (!cameraActive || isLive) return;

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }
      const ctx = canvas.getContext("2d");
      const mirror = facingMode === "user";

      if (activeFilter === "blur-bg" && segmenterRef.current) {
        try {
          const result = segmenterRef.current.segmentForVideo(video, performance.now());
          const mask = result?.categoryMask;
          if (mask) {
            ctx.save();
            if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.filter = "blur(14px)";
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.filter = "none";

            const off = offscreenRef.current || (offscreenRef.current = document.createElement("canvas"));
            off.width = canvas.width;
            off.height = canvas.height;
            const octx = off.getContext("2d");
            octx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = octx.getImageData(0, 0, canvas.width, canvas.height);
            const maskData = mask.getAsUint8Array();
            for (let i = 0; i < maskData.length; i++) {
              if (maskData[i] !== 1) frame.data[i * 4 + 3] = 0; // category 1 = person
            }
            octx.putImageData(frame, 0, 0);
            ctx.drawImage(off, 0, 0);
            ctx.restore();
            mask.close?.();
          } else {
            ctx.save();
            if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        } catch {
          ctx.save();
          if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      } else {
        ctx.save();
        if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        ctx.filter = CSS_FILTERS[activeFilter] || "none";
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraActive, isLive, activeFilter, facingMode]);

  const checkSizeOrReject = (file, type) => {
    const limit = type === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > limit) {
      setError(`That ${type} is too large. Max size is ${type === "video" ? "20MB" : "10MB"}.`);
      return false;
    }
    return true;
  };

  // ── UPDATED: captures from the filtered canvas, not the raw video ──────
  const capturePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      const file = new File([blob], "story-photo.jpg", { type: "image/jpeg" });
      if (!checkSizeOrReject(file, "image")) return;
      stopCamera();
      navigate("/story-preview", { state: { file, filter: activeFilter } });
    }, "image/jpeg", 0.92);
  };

  // ── UPDATED: records from a MediaStream built off canvas.captureStream()
  // (video) + the mic track from the raw camera stream (audio), so the
  // filter is baked into the recorded video, not just the live preview.
  const startRecording = () => {
    if (!streamRef.current || !canvasRef.current || isRecording) return;
    chunksRef.current = [];

    const canvasStream = canvasRef.current.captureStream(30);
    const audioTracks = streamRef.current.getAudioTracks();
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    const recorder = new MediaRecorder(combined, { mimeType: "video/webm" });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], "story-video.webm", { type: "video/webm" });
      if (!checkSizeOrReject(file, "video")) { stopCamera(); return; }
      stopCamera();
      navigate("/story-preview", { state: { file, filter: activeFilter } });
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordSeconds(0);
    clearInterval(recordTimerRef.current);
    recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
  };

  const stopRecording = () => {
    if (!isRecording) return;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setRecordSeconds(0);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // ── Everything below (live comments socket, startLive, stopLive,
  // WebRTC offer/answer/ICE handling, sendComment) is UNCHANGED — live
  // still uses streamRef.current directly, never the filtered canvas. ──

  useEffect(() => {
    if (!isLive || !liveStoryIdRef.current) return;
    const storyId = liveStoryIdRef.current;
    const onComment = (payload) => {
      setLiveComments(prev => [...prev.slice(-49), payload]);
      if (LIVE_REACTIONS.includes(payload.text)) {
        const id = Date.now() + Math.random();
        setFloatingEmojis(prev => [...prev.slice(-6), { id, emoji: payload.text }]);
        setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2200);
      }
    };
    const onLikes = ({ likesCount }) => {
      if (typeof likesCount === "number") setLiveLikes(likesCount);
    };
    socket.on(`story:${storyId}:comment`, onComment);
    socket.on(`story:${storyId}:likes`, onLikes);
    return () => {
      socket.off(`story:${storyId}:comment`, onComment);
      socket.off(`story:${storyId}:likes`, onLikes);
    };
  }, [isLive]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveComments.length]);

  useEffect(() => {
    const user = safeParseUser();
    const userId = user?._id || user?.id;
    if (userId) socket.emit("register", userId);
  }, []);

  const startLive = async () => {
    if (!streamRef.current) {
      await startCamera();
      await new Promise(r => setTimeout(r, 500));
    }
    const user   = safeParseUser();
    const roomId = `live_${user._id || user.id}`;

    try {
      const res = await fetch(`${API}/stories/live/start`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Could not start live story");
      liveStoryIdRef.current = data.story._id;
    } catch (err) {
      setError("Couldn't start live story: " + err.message);
      return;
    }

    setLiveRoomId(roomId);
    setIsLive(true);
    setLiveComments([]);
    setLiveLikes(0);
    viewerIdsRef.current = new Set();
    setLiveViewers(0);

    try {
      const vres = await fetch(`${API}/stories/viewers/${liveStoryIdRef.current}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        credentials: "include",
      });
      const vdata = await vres.json();
      if (vdata.success) setLiveLikes(vdata.likesCount ?? 0);
    } catch { /* non-fatal */ }

    socket.emit("startLive", {
      roomId,
      hostId:   user._id || user.id,
      username: user.username,
      storyId:  liveStoryIdRef.current,
    });

    socket.on("viewerJoined", async ({ viewerId, username, profilePic }) => {
      if (viewerIdsRef.current.has(viewerId)) return;
      viewerIdsRef.current.add(viewerId);
      setLiveViewers(viewerIdsRef.current.size);
      setLiveComments(prev => [
        ...prev.slice(-49),
        { system: true, username: username || "Someone", profilePic, text: "joined the live" },
      ]);
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerConnections.current[viewerId] = pc;
      streamRef.current?.getTracks().forEach(track => pc.addTrack(track, streamRef.current));
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("iceCandidate", { to: viewerId, candidate });
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("liveOffer", { to: viewerId, offer });
    });

    socket.on("liveAnswer", async ({ from, answer }) => {
      const pc = peerConnections.current[from];
      if (pc && pc.signalingState === "have-local-offer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          const buffered = iceBuffersRef.current[from] || [];
          for (const c of buffered) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
            catch (e) { console.error("Host buffered ICE error:", e); }
          }
          iceBuffersRef.current[from] = [];
        } catch (e) { console.error("Host setRemoteDesc error:", e); }
      }
    });

    socket.on("iceCandidate", async ({ from, candidate }) => {
      const pc = peerConnections.current[from];
      if (!pc || !candidate) return;
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.error("Host ICE error:", e); }
      } else {
        iceBuffersRef.current[from] = [...(iceBuffersRef.current[from] || []), candidate];
      }
    });

    socket.on("viewerLeft", ({ viewerId, username, profilePic }) => {
      peerConnections.current[viewerId]?.close();
      delete peerConnections.current[viewerId];
      delete iceBuffersRef.current[viewerId];
      viewerIdsRef.current.delete(viewerId);
      setLiveViewers(viewerIdsRef.current.size);
      setLiveComments(prev => [
        ...prev.slice(-49),
        { system: true, username: username || "Someone", profilePic, text: "left the live" },
      ]);
    });
  };

  const stopLive = async () => {
    socket.emit("endLive", { roomId: liveRoomId });
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    iceBuffersRef.current = {};
    viewerIdsRef.current = new Set();
    socket.off("viewerJoined");
    socket.off("liveAnswer");
    socket.off("iceCandidate");
    socket.off("viewerLeft");
    if (liveStoryIdRef.current) {
      socket.off(`story:${liveStoryIdRef.current}:comment`);
      socket.off(`story:${liveStoryIdRef.current}:likes`);
      try {
        await fetch(`${API}/stories/live/${liveStoryIdRef.current}/end`, {
          method: "DELETE",
          credentials: "include",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
      } catch (err) { console.error("Failed to clean up live story:", err); }
      liveStoryIdRef.current = null;
    }
    setIsLive(false);
    setLiveViewers(0);
    setLiveLikes(0);
    setLiveRoomId(null);
    setLiveComments([]);
    setFloatingEmojis([]);
    stopCamera();
  };

  const sendComment = () => {
    if (!comment.trim() || !liveStoryIdRef.current) return;
    const user = safeParseUser();
    socket.emit("storyComment", {
      storyId:  liveStoryIdRef.current,
      userId:   user._id || user.id,
      username: user.username,
      text:     comment,
    });
    setComment("");
  };

  const handleFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;

    // ← NEW — gallery uploads can now select several images/videos at
    // once (any mix of the two). Each is validated against its own
    // size limit; a rejected file is skipped (with the last error kept
    // visible) rather than blocking the whole selection.
    const valid = [];
    for (const file of picked) {
      const type = file.type.startsWith("video") ? "video" : "image";
      if (checkSizeOrReject(file, type)) valid.push(file);
    }
    if (valid.length === 0) return;

    stopCamera();
    navigate("/story-preview", { state: { files: valid, filter: "none" } }); // gallery uploads skip filters
  };

  useEffect(() => {
    return () => { stopCamera(); if (isLive) stopLive(); clearInterval(recordTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShutter = () => {
    if (!cameraActive) { startCamera(); return; }
    if (isRecording)   { stopRecording(); return; }
    capturePhoto();
  };

  return (
    <div style={S.wrapper}>
      <style>{`
        @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-140px); opacity: 0; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes ringPulse { 0% { box-shadow: 0 0 0 0 rgba(255,59,48,0.55); } 100% { box-shadow: 0 0 0 14px rgba(255,59,48,0); } }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .filter-strip::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={S.topBar}>
        <button style={S.roundBtn} onClick={() => { if (isLive) stopLive(); stopCamera(); navigate(-1); }}>
          <FiX size={18} />
        </button>
        <span style={S.topTitle}>
          {isLive ? (
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={S.livePulse} />
              LIVE · {formatCount(liveViewers)} watching
            </span>
          ) : "Your Story"}
        </span>
        {isLive ? (
          <button style={S.roundBtn} onClick={() => setShowComments(v => !v)}>
            {showComments ? <FiMessageCircle size={16} /> : <FiVolumeX size={16} />}
          </button>
        ) : cameraActive ? (
          <button style={S.roundBtn} onClick={flipCamera}>
            <FiRefreshCw size={16} />
          </button>
        ) : <div style={{ width: 36 }} />}
      </div>

      <div style={S.cameraArea}>
        {/* Raw camera feed — hidden, used only as the frame source for canvas */}
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={{ display: "none" }}
        />

        {/* Live still uses the raw feed directly */}
        {isLive && (
          <video
            autoPlay playsInline muted
            ref={(el) => { if (el && streamRef.current) el.srcObject = streamRef.current; }}
            style={{ ...S.video, display: cameraActive ? "block" : "none" }}
          />
        )}

        {/* Normal capture: filtered canvas preview (this IS what gets saved) */}
        {!isLive && (
          <canvas
            ref={canvasRef}
            style={{ ...S.video, display: cameraActive ? "block" : "none" }}
          />
        )}

        {!cameraActive && (
          <div style={S.placeholder}>
            {error ? (
              <>
                <div style={S.placeholderIconWrap}><FiX size={26} color="#ff3b30" /></div>
                <p style={S.errorText}>{error}</p>
              </>
            ) : (
              <>
                <div style={S.placeholderIconWrap}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={GOLDEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
                <p style={S.placeholderText}>Tap the shutter to start your camera</p>
              </>
            )}
          </div>
        )}

        {isRecording && (
          <div style={S.recIndicator}><span style={S.recDot} /> REC {formatTimer(recordSeconds)}</div>
        )}

        {/* ── NEW: filter strip — click to select, tap "Blur BG" to load
            the MediaPipe segmenter on demand. Hidden entirely once live. */}
        {cameraActive && !isLive && (
          <div className="filter-strip" style={S.filterStrip}>
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => handleSelectFilter(f.id)}
                style={{
                  ...S.filterChip,
                  ...(activeFilter === f.id ? S.filterChipActive : {}),
                }}
              >
                <span style={{ fontSize: 20 }}>{f.emoji}</span>
                <span style={S.filterLabel}>{f.label}</span>
                {f.id === "blur-bg" && activeFilter === "blur-bg" && !segmenterReady && (
                  <span style={S.filterLoadingDot} />
                )}
              </button>
            ))}
          </div>
        )}

        {isLive && (
          <>
            <div style={S.viewersBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
              {formatCount(liveViewers)} watching
            </div>
            <div style={S.likesBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#ff5f6d" stroke="#ff5f6d"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {formatCount(liveLikes)}
            </div>
            <div style={S.floatZone}>
              {floatingEmojis.map(e => <span key={e.id} style={S.floatEmoji}>{e.emoji}</span>)}
            </div>
            {showComments && liveComments.length > 0 && (
              <div style={S.commentsFeed} className="no-scrollbar">
                {liveComments.map((c, i) => (
                  c.system ? (
                    <div key={i} style={S.systemBubble}>
                      <MiniAvatar src={c.profilePic} username={c.username} size={16} />
                      <span style={S.systemText}>{c.username} {c.text}</span>
                    </div>
                  ) : (
                    <div key={i} style={S.commentBubble}>
                      <span style={S.commentUser}>{c.username}</span>
                      <span style={S.commentText}>{c.text}</span>
                    </div>
                  )
                ))}
                <div ref={commentsEndRef} />
              </div>
            )}
          </>
        )}

        {error && cameraActive && <div style={S.errorBanner}>{error}</div>}
      </div>

      {isLive ? (
        <div style={S.liveBottom}>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendComment()}
            placeholder="Say something to viewers…"
            style={S.liveInput}
          />
          <button onClick={sendComment} disabled={!comment.trim()} style={{ ...S.sendBtn, opacity: comment.trim() ? 1 : 0.4 }}>
            <FiSend size={16} />
          </button>
          <button onClick={stopLive} style={S.endLiveButton}>End Live</button>
        </div>
      ) : (
        <div style={S.bottomPanel}>
          <div style={S.actionItem} onClick={() => galleryRef.current?.click()}>
            <div style={S.iconBtn}><FiImage size={20} color="#fff" /></div>
            <span style={S.actionLabel}>Gallery</span>
          </div>

          <div style={S.actionItem} onClick={handleShutter}>
            <div style={{ ...S.shutterRing, ...(isRecording ? S.shutterRingRec : {}) }}>
              <div style={{ ...S.shutterInner, background: isRecording ? "#ff3b30" : cameraActive ? "#fff" : "rgba(255,255,255,0.35)" }} />
            </div>
            <span style={S.actionLabel}>{isRecording ? "Stop" : cameraActive ? "Capture" : "Camera"}</span>
          </div>

          {cameraActive ? (
            <div style={S.actionItem} onClick={toggleRecording}>
              <div style={{ ...S.iconBtn, border: "1.5px solid #ff3b30", background: isRecording ? "rgba(255,59,48,0.28)" : "rgba(255,59,48,0.12)" }}>
                <FaCircle size={14} color="#ff3b30" />
              </div>
              <span style={S.actionLabel}>{isRecording ? "Stop" : "Record Video"}</span>
            </div>
          ) : (
            <div style={{ ...S.actionItem, visibility: "hidden" }}>
              <div style={S.iconBtn} />
              <span style={S.actionLabel}>—</span>
            </div>
          )}

          <div style={S.actionItem} onClick={startLive}>
            <div style={{ ...S.iconBtn, ...S.liveBtnStyle }}><span style={S.liveDot} /></div>
            <span style={S.actionLabel}>Go Live</span>
          </div>
        </div>
      )}

      <input type="file" accept="image/*,video/*" multiple ref={galleryRef} style={{ display: "none" }} onChange={handleFiles} />
    </div>
  );
}

export default CreateStory;

const S = {
  wrapper:         { display: "flex", flexDirection: "column", height: "100dvh", background: "#000", fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif", overflow: "hidden" },
  topBar:          { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", zIndex: 10 },
  topTitle:        { color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: 0.2, display: "flex", alignItems: "center" },
  roundBtn:        { width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  cameraArea:      { flex: 1, background: "linear-gradient(180deg, #14141a 0%, #050505 100%)", position: "relative", overflow: "hidden" },
  video:           { width: "100%", height: "100%", objectFit: "cover" },
  placeholder:     { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 },
  placeholderIconWrap: { width: 68, height: 68, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" },
  placeholderText: { color: "rgba(255,255,255,0.45)", fontSize: 13.5, textAlign: "center", padding: "0 40px", margin: 0 },
  errorText:       { color: "#ff6259", fontSize: 13.5, textAlign: "center", padding: "0 30px", margin: 0, fontWeight: 600 },
  errorBanner:     { position: "absolute", bottom: 16, left: 16, right: 16, background: "rgba(255,59,48,0.92)", color: "#fff", padding: "10px 14px", borderRadius: 12, fontSize: 13, textAlign: "center", zIndex: 10, fontWeight: 600 },
  viewersBadge:  { position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.55)", color: "#fff", padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, zIndex: 10, backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.08)" },
  likesBadge:    { position: "absolute", top: 58, right: 16, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.55)", color: "#fff", padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, zIndex: 10, backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.08)" },
  floatZone:     { position: "absolute", bottom: 80, right: 16, zIndex: 12, display: "flex", flexDirection: "column-reverse", gap: 6, pointerEvents: "none" },
  floatEmoji:    { fontSize: 26, animation: "floatUp 2s ease-out forwards", opacity: 0 },
  commentsFeed:  { position: "absolute", bottom: 80, left: 12, right: 70, zIndex: 9, display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto", pointerEvents: "none" },
  commentBubble: { background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", borderRadius: 16, padding: "6px 12px", display: "flex", gap: 6, alignItems: "baseline", maxWidth: "88%", alignSelf: "flex-start" },
  commentUser:   { color: GOLDEN, fontSize: 11.5, fontWeight: 700, flexShrink: 0 },
  commentText:   { color: "#fff", fontSize: 13, wordBreak: "break-word" },
  systemBubble:  { background: "rgba(0,0,0,0.35)", borderRadius: 12, padding: "4px 10px", alignSelf: "center", maxWidth: "88%", display: "flex", alignItems: "center", gap: 6 },
  systemText:    { color: "rgba(255,255,255,0.65)", fontSize: 11.5, fontStyle: "italic" },
  liveBottom:    { display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 32px", background: "rgba(10,10,10,0.9)", backdropFilter: "blur(10px)", borderTop: "1px solid rgba(255,255,255,0.06)" },
  liveInput:     { flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 24, padding: "11px 16px", color: "#fff", outline: "none", fontSize: 14 },
  sendBtn:       { width: 42, height: 42, borderRadius: "50%", background: GOLDEN, border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 10px rgba(234,182,118,0.35)" },
  endLiveButton: { background: "#ff3b30", border: "none", borderRadius: 20, padding: "11px 18px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0, boxShadow: "0 3px 10px rgba(255,59,48,0.35)" },
  bottomPanel:   { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: 36, paddingTop: 22, background: "linear-gradient(180deg, transparent, #000 40%)" },
  actionItem:    { display: "flex", flexDirection: "column", alignItems: "center", gap: 9, cursor: "pointer" },
  iconBtn:       { width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center" },
  liveBtnStyle:  { background: "rgba(255,59,48,0.16)", border: "1.5px solid #ff3b30", animation: "ringPulse 1.8s infinite" },
  liveDot:       { display: "inline-block", width: 18, height: 18, borderRadius: "50%", background: "#ff3b30" },
  shutterRing:   { width: 74, height: 74, borderRadius: "50%", border: `3px solid ${GOLDEN}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "box-shadow 0.2s" },
  shutterRingRec:{ boxShadow: "0 0 0 4px rgba(255,59,48,0.25)" },
  shutterInner:  { width: 58, height: 58, borderRadius: "50%", transition: "background 0.2s" },
  actionLabel:   { color: "rgba(255,255,255,0.7)", fontSize: 11.5, fontWeight: 600 },
  recIndicator:  { position: "absolute", top: 16, left: 16, background: "#ff3b30", color: "#fff", padding: "5px 11px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, zIndex: 10, boxShadow: "0 3px 10px rgba(255,59,48,0.4)" },
  recDot:        { width: 7, height: 7, borderRadius: "50%", background: "#fff", animation: "pulse 1s infinite" },
  livePulse:     { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#ff3b30", animation: "pulse 1.2s infinite" },
  // ── NEW: filter strip styles
  filterStrip:   { position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", gap: 10, overflowX: "auto", padding: "0 16px", zIndex: 9 },
  filterChip:    { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 56, padding: "8px 4px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", cursor: "pointer", flexShrink: 0, position: "relative" },
  filterChipActive: { border: `1.5px solid ${GOLDEN}`, background: "rgba(234,182,118,0.22)" },
  filterLabel:   { color: "#fff", fontSize: 10.5, fontWeight: 600 },
  filterLoadingDot: { position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: GOLDEN, animation: "pulse 0.8s infinite" },
};