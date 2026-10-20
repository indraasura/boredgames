"use client";

import dynamic from "next/dynamic";

// Three.js is browser-only and heavy: load it only on this route, never on the shelf.
const MilestonesGame = dynamic(() => import("@/components/milestones/MilestonesGame"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "#dff0f1", fontFamily: "var(--font-fredoka), sans-serif", fontSize: 20 }}>
      Loading…
    </div>
  ),
});

export default function GameLoader() {
  return <MilestonesGame />;
}
