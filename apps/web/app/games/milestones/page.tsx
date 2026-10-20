import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Milestones",
  description: "Spin, drive across a 3D map, make a few choices, and retire with the most money.",
};

export default function Page() {
  return <GameLoader />;
}
