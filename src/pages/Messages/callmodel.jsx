import React, { useEffect, useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video
} from "lucide-react";

const CallModal = ({
  open,
  caller,
  callType = "audio",
  isIncoming = false,
  isConnected = false,
  onAccept,
  onReject,
  onEnd
}) => {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let timer;

    if (isConnected) {
      timer = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [isConnected]);

  if (!open) return null;

  const formatTime = sec => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;

    return `${String(mins).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#020817] flex flex-col items-center justify-center text-white">

      {/* Avatar */}
      <div className="w-32 h-32 rounded-full bg-purple-500 flex items-center justify-center text-5xl font-bold mb-5">
        {caller?.username?.charAt(0)?.toUpperCase() || "U"}
      </div>

      {/* Name */}
      <h2 className="text-4xl font-bold mb-2">
        {caller?.username || "Unknown User"}
      </h2>

      {/* Status */}
      {!isConnected && !isIncoming && (
        <p className="text-xl text-gray-300">
          Calling...
        </p>
      )}

      {isIncoming && (
        <p className="text-xl text-green-400">
          Incoming {callType} call
        </p>
      )}

      {isConnected && (
        <p className="text-xl text-gray-300">
          {formatTime(seconds)}
        </p>
      )}

      {/* Incoming Call Buttons */}
      {isIncoming && !isConnected && (
        <div className="flex gap-8 mt-10">

          <button
            onClick={onAccept}
            className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center hover:scale-110 transition"
          >
            <Phone size={34} />
          </button>

          <button
            onClick={onReject}
            className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center hover:scale-110 transition"
          >
            <PhoneOff size={34} />
          </button>

        </div>
      )}

      {/* Active Call Controls */}
      {isConnected && (
        <div className="flex gap-8 mt-12">

          <button
            onClick={() => setMuted(!muted)}
            className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center"
          >
            {muted ? (
              <MicOff size={30} />
            ) : (
              <Mic size={30} />
            )}
          </button>

          <button
            onClick={onEnd}
            className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center"
          >
            <PhoneOff size={34} />
          </button>

        </div>
      )}

      {/* Ringing Screen */}
      {!isIncoming && !isConnected && (
        <div className="mt-12">
          <button
            onClick={onEnd}
            className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center"
          >
            <PhoneOff size={34} />
          </button>
        </div>
      )}

      {/* Call Type Badge */}
      <div className="absolute top-6 right-6 bg-black/30 px-4 py-2 rounded-full flex items-center gap-2">

        {callType === "video" ? (
          <>
            <Video size={18} />
            <span>Video Call</span>
          </>
        ) : (
          <>
            <Mic size={18} />
            <span>Audio Call</span>
          </>
        )}

      </div>

    </div>
  );
};

export default CallModal;