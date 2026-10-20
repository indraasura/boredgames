import type { Theme } from "@boredgames/milestones";
import type { MusicMood } from "../audio";

export interface WorldTheme {
  /** CSS gradient behind the (transparent) canvas. */
  sky: string;
  fog: number;
  /** Colour of the water, void or horizon beyond the ground. */
  outer: number;
  groundTop: number;
  groundSide: number;
  rim: number;
  road: number;
  /** Tiles glow a little (night maps). */
  glow: number;
  night: boolean;
  hemi: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number };
  music: MusicMood;
  /** Accent for map cards in the lobby. */
  accent: string;
  emoji: string;
}

export const THEMES: Record<Theme, WorldTheme> = {
  island: {
    sky: "linear-gradient(180deg, #bfe3f2 0%, #dff0f1 50%, #fbefdd 100%)",
    fog: 0xe2f0f0,
    outer: 0x9ed6e4,
    groundTop: 0xb7de9c,
    groundSide: 0xebd3a6,
    rim: 0xffffff,
    road: 0xf4e6c8,
    glow: 0,
    night: false,
    hemi: { sky: 0xffffff, ground: 0xc4ae8e, intensity: 2.3 },
    sun: { color: 0xfff0d8, intensity: 2.4 },
    music: "island",
    accent: "#E86F51",
    emoji: "🏝️",
  },
  alpine: {
    sky: "linear-gradient(180deg, #a9c9ec 0%, #dbe8f6 55%, #fde9e4 100%)",
    fog: 0xdde8f3,
    outer: 0x86a9c6,
    groundTop: 0xf1f7fb,
    groundSide: 0xb4cde0,
    rim: 0xffffff,
    road: 0x9db3c9,
    glow: 0,
    night: false,
    hemi: { sky: 0xeaf3ff, ground: 0xb4c7de, intensity: 2.3 },
    sun: { color: 0xfff4e4, intensity: 2.2 },
    music: "alpine",
    accent: "#4F7CC3",
    emoji: "🏔️",
  },
  city: {
    sky: "linear-gradient(180deg, #151a38 0%, #2f2557 55%, #7a3b6e 100%)",
    fog: 0x2a2450,
    outer: 0x121528,
    groundTop: 0x2a3148,
    groundSide: 0x161a2b,
    rim: 0x10131f,
    road: 0x4b536c,
    glow: 0.42,
    night: true,
    hemi: { sky: 0x7d8cd0, ground: 0x1b1d33, intensity: 1.5 },
    sun: { color: 0xaab8ff, intensity: 1.2 },
    music: "city",
    accent: "#B23AE6",
    emoji: "🌃",
  },
  desert: {
    sky: "linear-gradient(180deg, #ffd49b 0%, #ffe8c6 55%, #fff6e3 100%)",
    fog: 0xfbe6c2,
    outer: 0xe9cf98,
    groundTop: 0xf0d9a6,
    groundSide: 0xd2a860,
    rim: 0xfff6e0,
    road: 0xc9a26a,
    glow: 0,
    night: false,
    hemi: { sky: 0xfff3dc, ground: 0xd9b27a, intensity: 2.4 },
    sun: { color: 0xffe2b0, intensity: 2.6 },
    music: "desert",
    accent: "#E2A13A",
    emoji: "🏜️",
  },
};
