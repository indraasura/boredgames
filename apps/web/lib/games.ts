/** Everything the shelf needs to know about a game. Add a game here and it appears on the home page. */

export type ArtId = "milestones" | "chess" | "brawl" | "boxing";

export interface GameInfo {
  id: string;
  name: string;
  tagline: string;
  href: string;
  /** Tile colour (a CSS variable from globals.css). */
  color: string;
  art: ArtId;
  players: string;
  minutes: string;
  /** How you can play it. */
  solo: boolean;
  sameScreen: boolean;
  online: boolean;
}

export const GAMES: GameInfo[] = [
  {
    id: "milestones",
    name: "Milestones",
    tagline: "Spin, drive across a 3D map and live a whole life. Richest retiree wins.",
    href: "/games/milestones",
    color: "var(--lemon)",
    art: "milestones",
    players: "1–4",
    minutes: "~20 min",
    solo: true,
    sameScreen: false,
    online: true,
  },
  {
    id: "chess3d",
    name: "Tri-D Chess",
    tagline: "Three boards stacked in space and four you can slide around. Sheldon's favourite.",
    href: "/games/chess3d",
    color: "var(--grape)",
    art: "chess",
    players: "1–2",
    minutes: "15–40 min",
    solo: true,
    sameScreen: true,
    online: true,
  },
  {
    id: "botbrawl",
    name: "Bot Brawl",
    tagline: "Build a fighting robot against the clock, then wreck theirs in a steel cage.",
    href: "/games/botbrawl",
    color: "var(--mint)",
    art: "brawl",
    players: "1–2",
    minutes: "5–10 min",
    solo: true,
    sameScreen: true,
    online: true,
  },
  {
    id: "boxing",
    name: "Last Round",
    tagline: "First-person boxing. Slip, block, counter, and don't stay down for ten.",
    href: "/games/boxing",
    color: "var(--tomato)",
    art: "boxing",
    players: "1",
    minutes: "~5 min",
    solo: true,
    sameScreen: false,
    online: false,
  },
];

/** On the list but not built yet. */
export const SOON = ["Four in a Row", "Reversi", "Ludo", "Liar's Dice", "Imposter", "Dots and Boxes"];

export type Filter = "all" | "solo" | "sameScreen" | "online";

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "solo", label: "Just me" },
  { id: "sameScreen", label: "Same screen" },
  { id: "online", label: "Online friends" },
];

export const matches = (g: GameInfo, f: Filter) => f === "all" || g[f];
