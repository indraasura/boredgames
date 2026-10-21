import { COAST, MAP_H, MAP_W, PROVINCE_DATA } from "./map.data";
import type { Army, HouseId, ProvinceDef, Season, Tiding, Unit } from "./types";

export { COAST, MAP_H, MAP_W };

export const PROVINCES: readonly ProvinceDef[] = PROVINCE_DATA as unknown as ProvinceDef[];
export const CROWNS: readonly number[] = PROVINCES.filter((p) => p.crown).map((p) => p.id);

export interface House {
  id: HouseId;
  name: string;
  /** Banner colours: field and charge. */
  color: string;
  charge: string;
  /** Heraldic device drawn on the shield. */
  device: "lion" | "eagle" | "stag" | "raven";
  motto: string;
  capital: string;
  home: string[];
}

export const HOUSES: Record<HouseId, House> = {
  varn: { id: "varn", name: "House Varn", color: "#8e1b1b", charge: "#e8c766", device: "lion", motto: "Iron before gold", capital: "Varnhold", home: ["Ashford"] },
  aldmoor: { id: "aldmoor", name: "House Aldmoor", color: "#1f3f7a", charge: "#e9e2cf", device: "eagle", motto: "From the high winds", capital: "Aldmoor", home: ["Eastmarch"] },
  brennic: { id: "brennic", name: "House Brennic", color: "#2f5e34", charge: "#e8c766", device: "stag", motto: "We endure", capital: "Goldhaven", home: ["Duskvale"] },
  corvain: { id: "corvain", name: "House Corvain", color: "#4a2a5e", charge: "#d9d3c2", device: "raven", motto: "Night remembers", capital: "Stormcliff", home: ["Oakheart"] },
};

/** Which houses sit at the table, by number of players: rivals start far apart. */
export const SEATING: Record<number, HouseId[]> = {
  2: ["varn", "brennic"],
  3: ["varn", "aldmoor", "corvain"],
  4: ["varn", "aldmoor", "brennic", "corvain"],
};

export const COST: Record<Unit, number> = { foot: 2, archers: 3, knights: 4 };
export const CASTLE_COST = 6;
/** Troops a stronghold can raise in one turn. */
export const MUSTER_CAP = 3;
export const START_GOLD = 6;
export const ROYAL_LEVY = 2;
export const DEFAULT_ROUNDS = 12;
/** Crowns a house needs alone, or an alliance together, to take the realm. */
export const CROWNS_SOLO = 4;
export const CROWNS_ALLIANCE = 5;
export const BETRAYAL_PRESTIGE = 3;
export const GRUDGE_ROUNDS = 3;

export const UNIT_INFO: Record<Unit, { name: string; plural: string; blurb: string }> = {
  foot: { name: "Footman", plural: "Footmen", blurb: "Cheap and plentiful. They hold the line." },
  archers: { name: "Archer", plural: "Archers", blurb: "A defender with archers adds +1 to their best die." },
  knights: { name: "Knight", plural: "Knights", blurb: "An attack with knights adds +1 to the best die. Knights ride two provinces." },
};

export const SEASON_INFO: Record<Season, { name: string; blurb: string }> = {
  spring: { name: "Spring", blurb: "The roads open." },
  summer: { name: "Summer", blurb: "Campaigning season." },
  autumn: { name: "Autumn", blurb: "Harvest: half as much gold again." },
  winter: { name: "Winter", blurb: "Attackers roll at most two dice. Knights ride only one province." },
};

export const TIDING_INFO: Record<Tiding, { name: string; blurb: string }> = {
  quiet: { name: "A quiet year", blurb: "Nothing stirs." },
  harvest: { name: "Bountiful harvest", blurb: "Every house gains 2 gold." },
  plague: { name: "Plague", blurb: "Sickness takes half the footmen of one province." },
  mercenaries: { name: "Sellswords", blurb: "Knights cost 3 gold this round." },
  storms: { name: "Great storms", blurb: "The roads to one province are washed out: no one may march into it this round." },
};

export const emptyArmy = (): Army => ({ foot: 0, archers: 0, knights: 0 });
export const size = (a: Army) => a.foot + a.archers + a.knights;
export const addArmy = (a: Army, b: Army): Army => ({ foot: a.foot + b.foot, archers: a.archers + b.archers, knights: a.knights + b.knights });
export const subArmy = (a: Army, b: Army): Army => ({ foot: a.foot - b.foot, archers: a.archers - b.archers, knights: a.knights - b.knights });
export const fits = (inner: Army, outer: Army) => inner.foot <= outer.foot && inner.archers <= outer.archers && inner.knights <= outer.knights;
export const validArmy = (a: Army) => [a.foot, a.archers, a.knights].every((n) => Number.isInteger(n) && n >= 0);

export const provinceByName = (name: string) => PROVINCES.find((p) => p.name === name)!;
export const isAdjacent = (a: number, b: number) => PROVINCES[a]!.adj.includes(b);
