import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-inter-tight" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: { default: "boredgames", template: "%s · boredgames" },
  description: "Board games in your browser. No sign-up, no saved data.",
};

export const viewport: Viewport = { themeColor: "#f7f7f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${mono.variable} ${fredoka.variable}`}>
      <body>{children}</body>
    </html>
  );
}
