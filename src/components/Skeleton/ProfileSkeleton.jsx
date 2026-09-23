import React from "react";
import { SkelBlock, SkelCircle } from "./Skeleton.jsx";

export function ProfileHeaderSkeleton() {
  return (
    <div style={{ padding: "16px 18px" }}>
      <SkelBlock w="100%" h={170} radius={16} style={{ marginBottom: 16 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <SkelCircle size={90} />
        <div style={{ flex: 1, display: "flex", gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <SkelBlock w={30} h={16} />
              <SkelBlock w={50} h={11} />
            </div>
          ))}
        </div>
      </div>
      <SkelBlock w="70%" h={13} style={{ marginBottom: 8 }} />
      <SkelBlock w="50%" h={12} style={{ marginBottom: 18 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <SkelBlock w="100%" h={40} radius={12} />
        <SkelBlock w="100%" h={40} radius={12} />
        <SkelBlock w="100%" h={40} radius={12} />
      </div>
    </div>
  );
}

export function ProfileGridSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: "10px" }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <SkelBlock key={i} w="100%" h={0} radius={6} style={{ aspectRatio: "1/1" }} />
      ))}
    </div>
  );
}