"use client";

import dynamic from "next/dynamic";

const QuickDraw = dynamic(() => import("@/components/quickdraw/QuickDraw"), {
  ssr: false,
  loading: () => <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "#3a1a2a", color: "#f2c27a", fontFamily: "Georgia, serif", letterSpacing: "0.2em" }}>RIDING INTO TOWN…</div>,
});

export default function GameLoader() {
  return <QuickDraw />;
}
