import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Bot Brawl",
  description: "Build a fighting robot from blocks against the clock, then battle in a steel cage. Solo, same keyboard or with a friend. No account.",
};

export default function Page() {
  return <GameLoader />;
}
