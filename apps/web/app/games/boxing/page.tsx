import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Last Round",
  description: "First-person boxing: three rounds, slip, block, counter. No account, runs in your browser.",
};

export default function Page() {
  return <GameLoader />;
}
