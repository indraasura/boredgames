import type { Home, JobTier } from "./types";

export interface Job {
  title: string;
  salary: number;
  /** A bonus Growth Fund stake that comes with the job, $k. */
  perk?: number;
}

export const JOBS: Record<JobTier, readonly Job[]> = {
  degree: [
    { title: "Doctor", salary: 110 },
    { title: "Lawyer", salary: 100 },
    { title: "Software engineer", salary: 95 },
    { title: "Architect", salary: 90 },
    { title: "Veterinarian", salary: 85 },
  ],
  trade: [
    { title: "Electrician", salary: 65 },
    { title: "Mechanic", salary: 60 },
    { title: "Chef", salary: 55 },
    { title: "Hair stylist", salary: 50 },
    { title: "Musician", salary: 45 },
  ],
  corporate: [
    { title: "Account manager", salary: 85 },
    { title: "Product marketer", salary: 78 },
    { title: "Financial analyst", salary: 80 },
    { title: "Sales lead", salary: 72 },
    { title: "Office manager", salary: 62 },
  ],
  venture: [
    { title: "Founder", salary: 40, perk: 90 },
    { title: "Early engineer", salary: 55, perk: 60 },
    { title: "Growth hacker", salary: 50, perk: 70 },
    { title: "Designer-in-residence", salary: 45, perk: 80 },
    { title: "Chief of staff", salary: 60, perk: 45 },
  ],
};

export const TIER_NAME: Record<JobTier, string> = {
  degree: "Degree jobs",
  trade: "Trades and crafts",
  corporate: "Corporate ladder",
  venture: "Startup roles with a bonus stake",
};

export const RULES = {
  startingCash: 20,
  loanChunk: 50,
  loanInterest: 1.1,
  retireFirstBonus: 40,
  kidValue: 50,
  twinsChance: 0.2,
  weddingGift: 20,
  maxSpin: 10,
  raiseEvery: 5,
  raisePct: 0.04,
  /** The Growth Fund grows this much every round. */
  fundRate: 0.04,
  /** Stake sizes at a Market tile, $k. */
  fundAmounts: [50, 100],
  /** Home value growth per round, times the home's own growth factor. */
  homeRate: 0.015,
  /** Salary used to price bills while a player has none. */
  billFloor: 40,
} as const;

const home = (name: string, price: number, growth: number): Omit<Home, "value"> => ({ name, price, growth });

export const HOMES_BY_MAP: Record<string, readonly Omit<Home, "value">[]> = {
  "sunny-isle": [
    home("Treehouse cottage", 90, 0.8),
    home("City loft", 150, 1.4),
    home("Farmhouse", 180, 0.9),
    home("Lighthouse", 220, 1.1),
    home("Lake villa", 260, 1.2),
  ],
  "alpine-valley": [
    home("Woodcutter's cabin", 85, 0.8),
    home("Ski chalet", 190, 1.3),
    home("Village townhouse", 140, 1.0),
    home("Mountain lodge", 240, 1.2),
    home("Glass-roof retreat", 280, 1.5),
  ],
  "neon-metropolis": [
    home("Micro-studio", 95, 1.1),
    home("Warehouse loft", 170, 1.5),
    home("Terrace flat", 200, 1.2),
    home("Skyline condo", 250, 1.4),
    home("Rooftop penthouse", 300, 1.6),
  ],
  "dune-kingdom": [
    home("Mud-brick house", 80, 0.7),
    home("Oasis bungalow", 150, 1.0),
    home("Spice merchant's villa", 210, 1.2),
    home("Courtyard riad", 250, 1.3),
    home("Minaret tower", 290, 1.5),
  ],
};

export interface LifeEvent {
  text: string;
  /** $k change. */
  cash: number;
}

const ev = (text: string, cash: number): LifeEvent => ({ text, cash });

export const SHARED_EVENTS: readonly LifeEvent[] = [
  ev("Won the neighbourhood bake-off", 20),
  ev("Your side project got acquired", 60),
  ev("New tyres for the car", -10),
  ev("Adopted a very fancy cat", -15),
  ev("Found a rare record at a yard sale", 15),
  ev("Tax refund!", 25),
  ev("Ski trip. Broken leg.", -30),
  ev("Wrote a hit jingle", 40),
  ev("Flooded basement", -25),
  ev("Bought a sailboat on a whim", -35),
  ev("Inherited a vintage car", 30),
  ev("Learned to salsa. Priceless.", 5),
  ev("A mentor bought you lunch", 8),
  ev("Sold old furniture online", 12),
  ev("Speeding ticket", -8),
  ev("Cousin's surprise gift", 18),
  ev("Won a pub quiz", 10),
];

export const MAP_EVENTS: Record<string, readonly LifeEvent[]> = {
  "sunny-isle": [
    ev("A seagull stole your lunch (and your wallet)", -6),
    ev("Sold seashell jewellery at the pier", 22),
    ev("Hurricane damage to the porch", -22),
    ev("Treasure map from a stranger. It was real.", 45),
  ],
  "alpine-valley": [
    ev("Avalanche closed the pass: hotel bill", -18),
    ev("Found a gold nugget in the creek", 35),
    ev("Ski instructor gig", 22),
    ev("Yodel competition winner", 16),
  ],
  "neon-metropolis": [
    ev("Viral video with your face on it", 45),
    ev("Rent spike in your building", -20),
    ev("Met an investor in the lift", 30),
    ev("Parking fine, again", -12),
  ],
  "dune-kingdom": [
    ev("Found a buried coin hoard", 50),
    ev("Sandstorm ruined the roof", -22),
    ev("Sold spices at the bazaar", 28),
    ev("A camel sneezed on your best robe", -5),
  ],
};

export interface BillKind {
  text: string;
  /** Share of salary (minimum RULES.billFloor). */
  rate: number;
}

export const BILLS: readonly BillKind[] = [
  { text: "Income taxes", rate: 0.35 },
  { text: "Dentist", rate: 0.2 },
  { text: "Car repair", rate: 0.25 },
  { text: "Leaky roof", rate: 0.3 },
  { text: "Phone, internet and everything else", rate: 0.12 },
  { text: "Vet bill", rate: 0.18 },
];
