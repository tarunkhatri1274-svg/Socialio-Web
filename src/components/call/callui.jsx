import React, { useState, useRef, useCallback, useEffect } from "react";
import socket from "../../sockets/sockets";
import { ICE_SERVERS } from "../../sockets/iceServers";

const GOLDEN = "rgb(234,182,118)";

/* ─── Icons ─── */
export const SpeakerIcon = ({ on }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>{on?<><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>:<line x1="23" y1="9" x2="17" y2="15"/>}</svg>);
export const BluetoothIcon = ({ on }) => (<svg viewBox="0 0 24 24" fill={on?"currentColor":"none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/></svg>);
export const VideoIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
export const MicIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
export const MicOffIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
export const PhoneOffIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" style={{ transform: "rotate(135deg)" }}>
    <path fill="currentColor" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
export const PhoneAcceptIcon = () => <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
export const FlipCameraIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;

/* ─── Avatar ─── */
const COLORS = ["#e74c3c","#e67e22","#2ecc71","#3498db","#9b59b6","#1abc9c","#e91e63","#ff5722"];
const getColor = (str) => COLORS[(str?.charCodeAt(0)||0) % COLORS.length];
const getInitials = (name) => name?.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2)||"?";

export function Avatar({ user, size=42, extraStyle={} }) {
  const bg = getColor(user?.username||user?.name||"");
  const initials = getInitials(user?.username||user?.name||"");
  const pic = user?.profilePic || user?.avatar;
  return pic
    ? <img src={pic} alt={user?.username} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,...extraStyle}}/>
    : <div style={{width:size,height:size,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:size*0.38,flexShrink:0,...extraStyle}}>{initials}</div>;
}

/* ─── Incoming Call Modal ─── */
export function IncomingCallModal({ callerUser, callType, onAccept, onReject }) {
  return (
    <div style={s.incomingOverlay}>
      <style>{`
        @keyframes ringPulse { 0%{transform:scale(1);opacity:0.55} 100%{transform:scale(1.55);opacity:0} }
        .ring-pulse { animation: ringPulse 1.8s ease-out infinite; }
      `}</style>
      <div style={s.incomingTop}>
        <Avatar user={callerUser} size={104} extraStyle={{margin:"0 auto 22px"}}/>
        <p style={s.incomingName}>{callerUser?.username||"Unknown"}</p>
        <p style={s.incomingSubtitle}>{callType==="video"?"Video calling…":"is calling"}</p>
      </div>
      <div style={s.incomingBottom}>
        <div style={s.incomingBtns}>
          <div style={s.incomingBtnCol}>
            <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span className="ring-pulse" style={{position:"absolute",width:64,height:64,borderRadius:"50%",background:"#e53935"}}/>
              <button style={s.rejectBtn} onClick={onReject}><PhoneOffIcon/></button>
            </div>
            <span style={s.incomingBtnLabel}>Decline</span>
          </div>
          <div style={s.incomingBtnCol}>
            <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span className="ring-pulse" style={{position:"absolute",width:64,height:64,borderRadius:"50%",background:"#4caf50"}}/>
              <button style={s.acceptBtn} onClick={onAccept}>{callType==="video"?<VideoIcon/>:<PhoneAcceptIcon/>}</button>
            </div>
            <span style={s.incomingBtnLabel}>Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
const findOutput = async (kind) => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  const has = (d, words) => words.some((w) => d.label.toLowerCase().includes(w));

  if (kind === "bluetooth") {
    // anything that isn't built-in speakers/earpiece/default entries
    return (
      outputs.find((d) => has(d, ["bluetooth", "airpod", "buds", "headset", "headphone", "wireless", "bt "])) ||
      outputs.find(
        (d) =>
          d.deviceId !== "default" &&
          d.deviceId !== "communications" &&
          !has(d, ["speaker", "earpiece", "receiver", "built-in"])
      )
    );
  }
  if (kind === "speaker") {
    return outputs.find((d) => has(d, ["speaker"])) || outputs.find((d) => d.deviceId === "default") || outputs[0];
  }
  return outputs.find((d) => has(d, ["earpiece", "receiver"])) || outputs.find((d) => d.deviceId === "default");
};
/* ─── Call Screen ─── */
export function CallScreen({ otherUser, callSession, onEnd }) {
  const { type, isReceiver, pc: existingPc, stream: existingStream } = callSession;
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState(isReceiver?"Connecting…":"Calling…");
  const [speaker, setSpeaker] = useState(false);
  const [bluetooth, setBluetooth] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [flipping, setFlipping] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(existingPc||null);
  const streamRef = useRef(existingStream||null);
  const timerRef = useRef(null);
const sentConnectedRef = useRef(false);
const fallbackRef = useRef(null);
  const fmt = sec => `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
  }, []);

  const attachRemoteStream = useCallback((stream) => {
    const el = type === "video" ? remoteVideoRef.current : remoteAudioRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch((err) => {
        if (err.name !== "AbortError") console.error("[call] remote play() blocked:", err);
      });
    }
  }, [type]);

  const attachRemoteTrack = useCallback((event) => {
    if (event.streams?.[0]) attachRemoteStream(event.streams[0]);
  }, [attachRemoteStream]);

const monitorConnection = useCallback((pc) => {
  const check = () => {
    const state = pc.iceConnectionState;
    console.log(new Date().toISOString(), `[call][${isReceiver ? "receiver" : "caller"}] iceConnectionState:`, state);
    if (state === "connected" || state === "completed") {
      setStatus("Connected");
      if (isReceiver) {
        // receiver: start timer now and tell the caller to start too
        if (!sentConnectedRef.current) {
          sentConnectedRef.current = true;
          socket.emit("callConnected", { to: otherUser._id });
        }
        startTimer();
      } else if (!fallbackRef.current) {
        // caller: wait for the receiver's signal, but never more than 3s
        fallbackRef.current = setTimeout(startTimer, 3000);
      }
    } else if (state === "failed") {
      setStatus("Connection failed");
    } else if (state === "disconnected") {
      setStatus("Reconnecting…");
    }
  };
  pc.oniceconnectionstatechange = check;
  check();
}, [startTimer, isReceiver, otherUser?._id]);
useEffect(() => {
  const onPeerConnected = () => {
    clearTimeout(fallbackRef.current);
    startTimer();
  };
  socket.on("callConnected", onPeerConnected);
  return () => {
    socket.off("callConnected", onPeerConnected);
    clearTimeout(fallbackRef.current);
  };
}, [startTimer]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (type !== "audio") return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d=>d.kind==="audiooutput");
        const ear = outputs.find(d=>d.label.toLowerCase().includes("earpiece")||d.label.toLowerCase().includes("receiver"));
        const el = remoteAudioRef.current;
        if (el && el.setSinkId && ear) await el.setSinkId(ear.deviceId);
      } catch {}
    }, 600);
    return ()=>clearTimeout(t);
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    let handleRemoteIce = null;
    let handleAnswer = null;

    if (isReceiver && existingPc && existingStream) {
      navigator.mediaDevices.enumerateDevices().catch(() => {}); 
      if (localVideoRef.current && type==="video") localVideoRef.current.srcObject = existingStream;

      existingPc.ontrack = (event) => {
        if (cancelled) return;
        if (event.streams?.[0]) attachRemoteStream(event.streams[0]);
      };

      const tracks = existingPc.getReceivers().map(r=>r.track).filter(Boolean);
      if (tracks.length > 0) attachRemoteStream(new MediaStream(tracks));

      monitorConnection(existingPc);

      return ()=>{ cancelled = true; clearInterval(timerRef.current); timerRef.current = null; };
    }

    let pc;
    const startCall = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { setStatus("Browser not supported"); return; }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: type==="video",
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return; }
           navigator.mediaDevices.enumerateDevices().catch(() => {}); 
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
        stream.getTracks().forEach(t=>pc.addTrack(t,stream));
        pc.ontrack = attachRemoteTrack;
        monitorConnection(pc);

        pc.onsignalingstatechange = () => console.log("[call][caller] signalingState:", pc.signalingState);
        pc.onicegatheringstatechange = () => console.log("[call][caller] iceGatheringState:", pc.iceGatheringState);
        pc.onconnectionstatechange = () => console.log("[call][caller] connectionState:", pc.connectionState);

        const iceBuf = [];
        pc.onicecandidate = ({candidate}) => {
          if (candidate) {
            if (!cancelled) socket.emit("iceCandidate",{to:otherUser._id,candidate});
          }
        };

        // Guarded against group-call candidates — the "iceCandidate" event
        // is shared with GroupCallContext, so without this check a
        // candidate meant for someone's group-call mesh could get fed
        // into this unrelated 1:1 pc.
        handleRemoteIce = async ({candidate, group})=>{
          if (group) return;
          if(!candidate || cancelled) return;
          try{ if(pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(candidate)); else iceBuf.push(candidate); }
          catch(e){console.error("ICE",e);}
        };
        socket.on("iceCandidate",handleRemoteIce);

        // Same reasoning — "liveAnswer" is shared with group calls too.
        handleAnswer = async ({answer, group})=>{
          if (group) return;
          if (cancelled) return;
          try{
            if(pc.signalingState!=="have-local-offer") return;
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            for(const c of iceBuf){try{await pc.addIceCandidate(new RTCIceCandidate(c));}catch{}}
            iceBuf.length=0;
          }catch(e){console.error("setRemoteDesc",e);}
        };
        socket.once("liveAnswer",handleAnswer);

        const offer = await pc.createOffer();
        if (cancelled) return;
        await pc.setLocalDescription(offer);
        if (cancelled) return;

        socket.emit("callOffer",{to:otherUser._id,offer,type});
        socket.once("callRejected",()=>{
          if (cancelled) return;
          setStatus(type==="video"?"Video call declined":"Call declined");
          setTimeout(onEnd,1500);
        });
      } catch(err){
        if (!cancelled) { console.error(err); setStatus("Failed to access camera/mic"); }
      }
    };
    startCall();

    return ()=>{
      cancelled = true;
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t=>t.stop());
      streamRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      if (handleRemoteIce) socket.off("iceCandidate", handleRemoteIce);
      if (handleAnswer) socket.off("liveAnswer", handleAnswer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const switchAudioOutput = async (deviceId) => {
    const el = type==="video" ? remoteVideoRef.current : remoteAudioRef.current;
    if (el?.setSinkId) { try{ await el.setSinkId(deviceId); }catch(e){console.error("setSinkId",e);} }
  };

  const switchCamera = async () => {
    if (flipping || type !== "video") return;
    setFlipping(true);
    const nextFacing = facingMode === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      const oldTrack = streamRef.current?.getVideoTracks?.()[0];
      const sender = pcRef.current?.getSenders?.().find(sd => sd.track && sd.track.kind === "video");
      if (sender && newTrack) await sender.replaceTrack(newTrack);
      if (oldTrack) { streamRef.current.removeTrack(oldTrack); oldTrack.stop(); }
      if (streamRef.current && newTrack) streamRef.current.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
      setFacingMode(nextFacing);
    } catch (e) { console.error("switchCamera failed", e); }
    setFlipping(false);
  };

  const isVideo = type === "video";
  const isConnected = status === "Connected";

  return (
    <div style={s.callScreen}>
      {isVideo && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline
            style={{ ...s.remoteVideo, display: isConnected ? "block" : "none" }}/>
          <video ref={localVideoRef} autoPlay playsInline muted
            style={isConnected ? s.localVideo : s.localVideoFull}/>
        </>
      )}
      {!isVideo && (
        <>
          <audio ref={remoteAudioRef} autoPlay style={{display:"none"}}/>
          <div style={s.callBg}><Avatar user={otherUser} size={120} extraStyle={{opacity:0.12,filter:"blur(14px)",transform:"scale(2.2)"}}/></div>
        </>
      )}

      <div style={isVideo ? s.callTopOverlay : s.callCenter}>
        {!isVideo && <Avatar user={otherUser} size={92}/>}
        <p style={isVideo ? s.callNameOnVideo : s.callName}>{otherUser?.username}</p>
        <p style={isVideo ? s.callStatusOnVideo : s.callStatus}>{isConnected?fmt(seconds):status}</p>
      </div>

      {isVideo && !isConnected ? (
        <div style={s.callControls}>
          <button style={s.callCtrlBtnEnd} onClick={onEnd}><PhoneOffIcon/></button>
        </div>
      ) : (
        <div style={s.callControls}>
          {isVideo && (
            <button style={s.callCtrlBtnPlain} onClick={switchCamera} disabled={flipping}>
              <FlipCameraIcon/>
            </button>
          )}
          <button style={{...s.callCtrlBtnEnd}} onClick={onEnd}><PhoneOffIcon/></button>
          <button style={s.callCtrlBtnPlain} onClick={()=>{ streamRef.current?.getAudioTracks().forEach(t=>{t.enabled=!t.enabled;}); setMuted(m=>!m); }}>
            {muted?<MicOffIcon/>:<MicIcon/>}
          </button>
<>
  <button
    style={{ ...s.callCtrlBtnPlain, ...(speaker ? { background: "rgba(255,255,255,0.35)" } : {}) }}
    onClick={async () => {
      const next = !speaker;
      const target = await findOutput(next ? "speaker" : "earpiece");
      if (target) await switchAudioOutput(target.deviceId);
      setSpeaker(next);
      if (next) setBluetooth(false);
    }}
  >
    <SpeakerIcon on={speaker} />
  </button>

  <button
    style={{ ...s.callCtrlBtnPlain, ...(bluetooth ? { background: "rgba(255,255,255,0.35)" } : {}) }}
    onClick={async () => {
      const next = !bluetooth;
      const target = await findOutput(next ? "bluetooth" : "earpiece");
      if (next && !target) {
        alert("No Bluetooth headset found. Connect it in your system settings first.");
        return;
      }
      if (target) await switchAudioOutput(target.deviceId);
      setBluetooth(next);
      if (next) setSpeaker(false);
    }}
  >
    <BluetoothIcon on={bluetooth} />
  </button>
</>
        </div>
      )}
    </div>
  );
}

/* ─── Styles (call UI only) ─── */
const s = {
  incomingOverlay:{position:"fixed",inset:0,background:"#000",zIndex:9500,display:"flex",flexDirection:"column",justifyContent:"space-between",maxWidth:480,margin:"0 auto",padding:"90px 24px 56px",boxSizing:"border-box"},
  incomingTop:{textAlign:"center"},
  incomingName:{fontSize:30,fontWeight:600,color:"#fff",margin:0,letterSpacing:"0.2px"},
  incomingSubtitle:{fontSize:16,color:"rgba(255,255,255,0.55)",margin:"6px 0 0"},
  incomingBottom:{width:"100%"},
  incomingBtns:{display:"flex",justifyContent:"space-between",padding:"0 18px"},
  incomingBtnCol:{display:"flex",flexDirection:"column",alignItems:"center",gap:10},
  incomingBtnLabel:{fontSize:13,color:"rgba(255,255,255,0.75)",fontWeight:500},
  rejectBtn:{width:64,height:64,borderRadius:"50%",border:"none",background:"#e53935",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:"0 6px 18px rgba(229,57,53,0.4)",position:"relative",zIndex:1},
  acceptBtn:{width:64,height:64,borderRadius:"50%",border:"none",background:"#4caf50",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",boxShadow:"0 6px 18px rgba(76,175,80,0.4)",position:"relative",zIndex:1},
  callScreen:{position:"fixed",inset:0,background:"#0d1117",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",zIndex:9400,maxWidth:480,margin:"0 auto",padding:"50px 20px 44px",boxSizing:"border-box"},
  remoteVideo:{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",zIndex:0,background:"#000"},
  localVideo:{position:"absolute",top:54,right:16,width:92,height:130,objectFit:"cover",borderRadius:16,border:"2px solid rgba(255,255,255,0.35)",boxShadow:"0 6px 18px rgba(0,0,0,0.35)",zIndex:2,transform:"scaleX(-1)"},
  localVideoFull:{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",zIndex:1,transform:"scaleX(-1)"},
  callBg:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"},
  callCenter:{display:"flex",flexDirection:"column",alignItems:"center",gap:12,zIndex:1},
  callName:{fontSize:24,fontWeight:700,color:"#fff",margin:0},
  callStatus:{fontSize:15,color:"rgba(255,255,255,0.6)",margin:0},
  callTopOverlay:{zIndex:2,textAlign:"left",alignSelf:"flex-start"},
  callNameOnVideo:{fontSize:19,fontWeight:700,color:"#fff",margin:0,textShadow:"0 1px 6px rgba(0,0,0,0.5)"},
  callStatusOnVideo:{fontSize:13,color:"rgba(255,255,255,0.8)",margin:"2px 0 0",textShadow:"0 1px 6px rgba(0,0,0,0.5)"},
  callControls:{display:"flex",gap:14,zIndex:2,alignItems:"center",justifyContent:"center"},
  callCtrlBtnPlain:{background:"rgba(255,255,255,0.18)",border:"none",borderRadius:"50%",width:54,height:54,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff"},
  callCtrlBtnEnd:{background:"#e53935",border:"none",borderRadius:"50%",width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",boxShadow:"0 6px 18px rgba(229,57,53,0.45)"},
};