"use client";

import dynamic from "next/dynamic";

// Three.js is browser-only and heavy: load it only on this route.
const F1Game = dynamic(() => import("@/components/f1/F1Game"), {
  ssr: false,
  loading: () => <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "#0d0f13", color: "#f2f4f8", fontSize: 18 }}>Loading…</div>,
});

export default function GameLoader() {
  return <F1Game />;
}
