import {
  TEAMS,
  clampSetup,
  type CarSnapshot,
  type Compound,
  type Difficulty,
  type Entry,
  type RaceConfig,
  type Setup,
  type WeatherChoice,
} from "@boredgames/f1";
import { GuestNet as Guest, HostNet as Host, type Link, type Net as GenericNet, type Peer } from "../p2p";

export { joinRoom, openRoom, webrtcSupported } from "../p2p";

/** A car as it travels over the wire: teams are sent by id. */
export interface EntryLite {
  id: string;
  name: string;
  teamId: string;
  setup: Setup;
  compound: Compound;
  /** A person (on any computer) or a computer driver. */
  kind: "human" | "ai";
}

export interface ConfigLite {
  mode: "race";
  track: string;
  laps: number;
  weather: WeatherChoice;
  difficulty: Difficulty;
  entries: EntryLite[];
  seed: number;
}

export type F1Msg =
  | { t: "hello"; name: string }
  | { t: "ready"; entry: Omit<EntryLite, "id" | "kind"> }
  | { t: "start"; cfg: ConfigLite; you: string }
  | { t: "s"; id: string; snap: CarSnapshot }
  | { t: "a"; cars: { id: string; snap: CarSnapshot }[] };

export type Net = GenericNet<F1Msg>;

/** A guest's state goes to the other guests as well; a guest cannot move anybody else's car. */
export class HostNet extends Host<F1Msg> {
  constructor(peers: Peer[], room?: { close(): void }) {
    super(
      peers,
      (m, from) => (m.t === "s" ? (m.id === from.id ? "relay" : "drop") : "keep"),
      (m) => m.t === "s" || m.t === "a",
      room,
    );
  }
}

export class GuestNet extends Guest<F1Msg> {
  constructor(link: Link) {
    super(link, (m, net) => {
      if (m.t === "start") net.localId = m.you;
    });
  }
}

export function toLite(e: Entry, kind: "human" | "ai"): EntryLite {
  return { id: e.id, name: e.name, teamId: e.team.id, setup: e.setup, compound: e.compound, kind };
}

/** Turn what came over the wire into a race for this computer: our own car is driven here, the others are placed from snapshots. */
export function fromLite(cfg: ConfigLite, localId: string): RaceConfig {
  const entries: Entry[] = cfg.entries.map((e) => ({
    id: e.id,
    name: e.name,
    team: TEAMS.find((t) => t.id === e.teamId) ?? TEAMS[0]!,
    setup: clampSetup(e.setup),
    compound: e.compound,
    human: e.id === localId,
    remote: e.id !== localId && (e.kind === "human" || !isHost(localId)),
  }));
  return { mode: cfg.mode, track: cfg.track, laps: cfg.laps, weather: cfg.weather, difficulty: cfg.difficulty, entries, seed: cfg.seed };
}

const isHost = (id: string) => id === "p0";
