import type { Metadata } from "next";
import { Cinzel, IM_Fell_English } from "next/font/google";
import GameLoader from "./GameLoader";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-cinzel" });
const fell = IM_Fell_English({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-fell" });

export const metadata: Metadata = {
  title: "Banners",
  description: "A war of crowns for 2 to 4 houses. Raise armies, swear alliances and break them, and take the realm. Against the computer or friends.",
};

export default function Page() {
  return (
    <div className={`${cinzel.variable} ${fell.variable}`}>
      <GameLoader />
    </div>
  );
}
