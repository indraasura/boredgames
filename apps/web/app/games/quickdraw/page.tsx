import type { Metadata } from "next";
import { Bitter, Rye } from "next/font/google";
import GameLoader from "./GameLoader";

const rye = Rye({ subsets: ["latin"], weight: "400", variable: "--font-rye" });
const bitter = Bitter({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-bitter" });

export const metadata: Metadata = {
  title: "Quick Draw",
  description: "A wild west duel for two. Wait for the call, then shoot. Against outlaws, a friend on the same keyboard, or a friend online.",
};

export default function Page() {
  return (
    <div className={`${rye.variable} ${bitter.variable}`}>
      <GameLoader />
    </div>
  );
}
