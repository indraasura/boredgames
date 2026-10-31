import type { TileType } from "@boredgames/milestones";

/**
 * One line-icon set for the whole game: 24×24, drawn with a 1.8 stroke, round caps. Used in the interface
 * (as SVG) and on the board's tiles and signs (as Path2D on a canvas), so both speak the same language.
 */
export const ICONS = {
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  banknote: "M3 7h18v10H3z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M6.5 10v4 M17.5 10v4",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z",
  receipt: "M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z M9 8h6 M9 12h6 M9 16h3",
  trend: "M3 17l6-6 4 4 8-8 M15 7h6v6",
  trendDown: "M3 7l6 6 4-4 8 8 M15 17h6v-6",
  flat: "M4 12h16 M16 8l4 4-4 4",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z",
  briefcase: "M3.5 8h17v11.5h-17z M9 8V5h6v3 M3.5 13.5h17",
  ring: "M12 9.5a5.7 5.7 0 1 0 0 11.4a5.7 5.7 0 1 0 0-11.4 M9.2 3.5h5.6l1.7 2.7-4.5 3.3-4.5-3.3z",
  house: "M3.5 11.5L12 4l8.5 7.5 M6 9.8V20h12V9.8 M10 20v-5.5h4V20",
  signpost: "M12 3v18 M12 5.5h6.5l2 2.2-2 2.3H12 M12 12.5H5.5l-2 2.2 2 2.3H12 M9 21h6",
  umbrella: "M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8z M12 12v7a2 2 0 0 1-4 0",
  cap: "M2 9.5L12 5l10 4.5L12 14z M6 11.5v4.5c3.5 2.5 8.5 2.5 12 0v-4.5 M22 9.5v5",
  wrench: "M14.5 6.2a4.2 4.2 0 0 0-5.6 5.6L3.5 17.2l3.3 3.3 5.4-5.4a4.2 4.2 0 0 0 5.6-5.6l-2.6 2.6-2.7-.6-.6-2.7z",
  backpack: "M6 9.5a6 6 0 0 1 12 0V21H6z M9.5 4.6V3h5v1.6 M9 14h6 M9 14v3h6v-3",
  building: "M5 21V3.5h9V21 M14 9h5v12 M8 7.5h3 M8 11.5h3 M8 15.5h3 M3 21h18",
  rocket: "M12 2.5c3 2.2 5 6 5 10l-2 3.5H9l-2-3.5c0-4 2-7.8 5-10z M12 8.5a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2 M9.5 16l-2.5 4.5 M14.5 16l2.5 4.5",
  moon: "M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4",
  scroll: "M8 4h11v12.5a3.5 3.5 0 0 1-3.5 3.5H6.5A3.5 3.5 0 0 1 3 16.5V16h11v.5a3.5 3.5 0 0 0 3.5 3.5 M8 4a2.5 2.5 0 0 0-2.5 2.5V16 M10.5 8h5 M10.5 11.5h5",
  coin: "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17 M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2 M12 6.5V8 M12 16v1.5",
  bolt: "M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6z",
  road: "M8.5 3L5 21 M15.5 3L19 21 M12 4.5v2.5 M12 10.5V13 M12 16.5V19",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.1 7.9-7.5 9.5-4.4-1.6-7.5-4.9-7.5-9.5V6z M8.8 12l2.2 2.2 4.2-4.4",
  alert: "M12 4L2.5 20h19z M12 10v4.5 M12 17.2v.1",
  handshake: "M2.5 11.5L7 7l4 2.5L15.5 7 21.5 13 M5 13.5l4.5 4.5c.8.8 2 .8 2.8 0l5.7-5.7 M11 9.5L8 12.5c-.7.7-.7 1.8 0 2.5s1.8.7 2.5 0l2-2",
  scales: "M12 4v16 M8 20h8 M5 7.5h14 M5 7.5L2.5 13.5a2.5 2.5 0 0 0 5 0z M19 7.5l-2.5 6a2.5 2.5 0 0 0 5 0z M12 4v3.5",
  hand: "M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5 M11 11V4.5a1.5 1.5 0 0 1 3 0V11 M14 11V5.8a1.5 1.5 0 0 1 3 0V13 M17 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7c-2.8 0-4.6-1.3-6-3.4l-2.5-3.8a1.5 1.5 0 0 1 2.5-1.6L8 13.5",
  suitcase: "M5 7.5h14V20H5z M9 7.5V4.5h6v3 M9 11v6 M15 11v6",
  people: "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11z M2.8 20a6.2 6.2 0 0 1 12.4 0 M16.5 11a2.6 2.6 0 1 0 0-5.2 M17.2 14.2A5.2 5.2 0 0 1 21.2 20",
  // interface
  back: "M15 5.5L8.5 12l6.5 6.5",
  arrow: "M4 12h15 M13 6l6 6-6 6",
  map: "M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z M9 4v14 M15 6v14",
  target: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16 M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M12 1.5v3 M12 19.5v3 M1.5 12h3 M19.5 12h3",
  restart: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9 M4.5 4v5h5",
  sound: "M4 9h3.5L13 4.5v15L7.5 15H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9h3.5L13 4.5v15L7.5 15H4z M16.5 9.5l5 5 M21.5 9.5l-5 5",
  music: "M9 18V5.5l11-2V16 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0 M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 11v5.5 M12 7.8v.1",
  close: "M6 6l12 12 M18 6L6 18",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2 M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
} as const;

export type IconName = keyof typeof ICONS;

export const TILE_ICON: Record<TileType, IconName> = {
  start: "flag",
  payday: "banknote",
  event: "sparkle",
  bills: "receipt",
  invest: "trend",
  baby: "heart",
  graduate: "briefcase",
  wedding: "ring",
  house: "house",
  fork: "signpost",
  retire: "umbrella",
};

/** The maps describe their opening roads with emoji; the interface draws these instead. */
const FROM_EMOJI: Record<string, IconName> = {
  "🎓": "cap",
  "🛠️": "wrench",
  "🔧": "wrench",
  "🎒": "backpack",
  "🏢": "building",
  "🚀": "rocket",
  "🌙": "moon",
  "🐪": "sun",
  "📜": "scroll",
  "🪙": "coin",
  "⚡": "bolt",
  "🛣️": "road",
};

export const iconFor = (emoji: string | undefined | null): IconName => (emoji && FROM_EMOJI[emoji]) || "road";

/** Draw an icon on a canvas, centred at (cx, cy), `size` pixels wide. */
export function drawIcon(x: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number, color: string, weight = 1.9) {
  x.save();
  x.translate(cx - size / 2, cy - size / 2);
  x.scale(size / 24, size / 24);
  x.strokeStyle = color;
  x.lineWidth = weight;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.stroke(new Path2D(ICONS[name]));
  x.restore();
}
