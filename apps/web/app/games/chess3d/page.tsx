import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Tri-D Chess",
  description: "Three-level chess with sliding attack boards, the game from The Big Bang Theory. Play the computer or a friend, no account.",
};

export default function Page() {
  return <GameLoader />;
}
