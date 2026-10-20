import type { Metadata } from "next";
import GameLoader from "./GameLoader";

export const metadata: Metadata = {
  title: "Grand Prix",
  description: "Race 40 real circuits with real car physics. Free ride, against the computer, or with friends. Tune the car, choose tyres, race in any weather.",
};

export default function Page() {
  return <GameLoader />;
}
