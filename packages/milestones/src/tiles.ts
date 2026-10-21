export type TileType =
  | "start"
  | "payday"
  | "event"
  | "bills"
  | "invest"
  | "baby"
  | "graduate"
  | "wedding"
  | "house"
  | "fork"
  | "retire";

export type TileTone = "good" | "bad" | "choice" | "neutral" | "milestone";

export interface TileInfo {
  name: string;
  /** Every tile type has its own hue, glyph and a one-line promise, so a tile is readable before you land on it. */
  color: string;
  icon: string;
  /** One line, shown in the tile guide. */
  short: string;
  /** Full explanation, shown on hover. */
  long: string;
  tone: TileTone;
  /** Landing here ends the move even with spaces left. */
  stop: boolean;
}

export const TILE_INFO: Record<TileType, TileInfo> = {
  start: {
    name: "Start",
    color: "#FFFFFF",
    icon: "🚩",
    short: "Everyone starts here.",
    long: "Everyone starts here. Pick an opening road.",
    tone: "neutral",
    stop: false,
  },
  payday: {
    name: "Payday",
    color: "#2FBF71",
    icon: "💰",
    short: "Get paid. Landing on or passing one counts.",
    long: "You get your salary every time you land on or pass a payday.",
    tone: "good",
    stop: false,
  },
  event: {
    name: "Life event",
    color: "#FFD60A",
    icon: "✨",
    short: "A card. Usually cash, but 1 in 3 is a twist.",
    long: "Draw a card. Most give a little cash, a few cost some, and some are twists: lawsuits, layoffs, market crashes, comebacks.",
    tone: "neutral",
    stop: false,
  },
  bills: {
    name: "Bills",
    color: "#8A94A6",
    icon: "🧾",
    short: "Pay a bill, or face a nasty surprise.",
    long: "Taxes, repairs, the dentist. Bigger salaries pay bigger bills, and sometimes it is a lawsuit, an audit or a layoff.",
    tone: "bad",
    stop: false,
  },
  invest: {
    name: "Market",
    color: "#00A6A6",
    icon: "📈",
    short: "Invest in the market, buy insurance, or skip.",
    long: "Put cash in the Growth Fund or buy insurance against the next twist. The fund rises and falls with the market and is paid out at the end.",
    tone: "choice",
    stop: false,
  },
  baby: {
    name: "Family",
    color: "#FF8FC7",
    icon: "👶",
    short: "Stop. A baby joins you (20% chance of twins). Worth $50k at the end.",
    long: "You must stop here. A baby joins your car. Each child adds $50k to your final score.",
    tone: "milestone",
    stop: true,
  },
  graduate: {
    name: "Job board",
    color: "#8B5A2B",
    icon: "🎓",
    short: "Stop. Pick a job from three offers.",
    long: "You must stop here. Pick one of three jobs. More training means better offers.",
    tone: "milestone",
    stop: true,
  },
  wedding: {
    name: "Wedding",
    color: "#E5383B",
    icon: "💍",
    short: "Stop. Get married and receive $20k in gifts.",
    long: "You must stop here. You get married, your guests give gifts, and a spouse joins your car.",
    tone: "milestone",
    stop: true,
  },
  house: {
    name: "Home",
    color: "#1E88E5",
    icon: "🏠",
    short: "Stop. Buy a home, or skip it.",
    long: "You must stop here. A home gains value every round and is sold when you retire. If you are short, the bank lends in $50k chunks.",
    tone: "milestone",
    stop: true,
  },
  fork: {
    name: "Crossroads",
    color: "#2D3FE0",
    icon: "🧭",
    short: "Stop. Choose a road.",
    long: "You must stop here. The road splits: one way has more paydays, the other more Market tiles.",
    tone: "milestone",
    stop: true,
  },
  retire: {
    name: "Retirement",
    color: "#1B1F2A",
    icon: "🏖️",
    short: "Stop. The first to retire earns a bonus.",
    long: "You must stop here and retire. Your Growth Fund keeps growing until everyone has finished.",
    tone: "milestone",
    stop: true,
  },
};

export const TILE_TYPES = Object.keys(TILE_INFO) as TileType[];
