import React from "react";

if (!document.getElementById("skeleton-shimmer-style")) {
  const s = document.createElement("style");
  s.id = "skeleton-shimmer-style";
  s.innerHTML = `
    @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
    .skel { background: linear-gradient(90deg, #eee 25%, #f5f5f5 37%, #eee 63%); background-size: 400px 100%; animation: shimmer 1.4s ease infinite; }
  `;
  document.head.appendChild(s);
}

export function SkelBlock({ w = "100%", h = 14, radius = 8, style = {} }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: radius, ...style }} />;
}

export function SkelCircle({ size = 38 }) {
  return <div className="skel" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }} />;
}

export function FeedCardSkeleton() {
  return (
    <div style={{ borderBottom: "1px solid #efefef", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <SkelCircle size={38} />
        <div style={{ flex: 1 }}>
          <SkelBlock w="40%" h={12} style={{ marginBottom: 6 }} />
          <SkelBlock w="25%" h={10} />
        </div>
      </div>
      <SkelBlock w="100%" h={320} radius={12} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <SkelBlock w={60} h={32} radius={10} />
        <SkelBlock w={60} h={32} radius={10} />
        <SkelBlock w={60} h={32} radius={10} />
      </div>
    </div>
  );
}

export function DmRowSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}>
      <SkelCircle size={46} />
      <div style={{ flex: 1 }}>
        <SkelBlock w="35%" h={13} style={{ marginBottom: 6 }} />
        <SkelBlock w="55%" h={11} />
      </div>
    </div>
  );
}

export function NotifRowSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
      <SkelCircle size={46} />
      <div style={{ flex: 1 }}>
        <SkelBlock w="70%" h={12} style={{ marginBottom: 6 }} />
        <SkelBlock w="20%" h={10} />
      </div>
    </div>
  );
}

export function ChatBubbleSkeleton({ me = false }) {
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <SkelBlock w={Math.floor(Math.random() * 100) + 120} h={38} radius={18} />
    </div>
  );
}
export function ToggleRowSkeleton() {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "#f0f0f0", padding: "10px 12px", borderRadius: 8, marginBottom: 12,
    }}>
      <SkelBlock w={90} h={14} />
      <SkelBlock w={50} h={26} radius={50} />
    </div>
  );
}