"use client";

import dynamic from "next/dynamic";

// Three.js is browser-only and heavy: load it only on this route, never on the shelf.
const Chess3DGame = dynamic(() => import("@/components/chess3d/Chess3DGame"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--night)", color: "var(--cream)", fontFamily: "var(--font-arcade)", fontSize: 15 }}>Loading…</div>
  ),
});

export default function GameLoader() {
  return <Chess3DGame />;
}
