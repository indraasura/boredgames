"use client";

import dynamic from "next/dynamic";

const BannersGame = dynamic(() => import("@/components/banners/BannersGame"), {
  ssr: false,
  loading: () => <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "#1b1510", color: "#efe3c4", fontFamily: "Georgia, serif", letterSpacing: "0.1em" }}>Unrolling the map…</div>,
});

export default function GameLoader() {
  return <BannersGame />;
}
