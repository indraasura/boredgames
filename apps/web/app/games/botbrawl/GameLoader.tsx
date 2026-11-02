"use client";

import dynamic from "next/dynamic";

// Three.js is browser-only and heavy: load it only on this route, never on the shelf.
const BotBrawlGame = dynamic(() => import("@/components/botbrawl/BotBrawlGame"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--night)", color: "var(--cream)", fontFamily: "var(--font-arcade)", fontSize: 15 }}>Loading…</div>
  ),
});

export default function GameLoader() {
  return <BotBrawlGame />;
}
