import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter-tight" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "idleminds: games for when you are bored", template: "%s · idleminds" },
  description: "Games that run in your browser: Tri-D chess, build-a-robot battles, first-person boxing and more. No account, no download, nothing saved.",
};

export const viewport: Viewport = { themeColor: "#2f35e8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${serif.variable} ${mono.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
