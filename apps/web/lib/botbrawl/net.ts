import type { Design, Input, Snap } from "@boredgames/botbrawl";
import { GuestNet as Guest, HostNet as Host, type Link, type Net as GenericNet, type Peer } from "../p2p";

export type Msg =
  | { t: "hello"; name: string }
  | { t: "build"; seconds: number }
  | { t: "design"; d: Design }
  | { t: "fight"; designs: [Design, Design] }
  | { t: "in"; i: Input }
  | { t: "snap"; s: Snap }
  | { t: "rebuild"; seconds: number };

export type Net = GenericNet<Msg>;

const isFast = (m: Msg) => m.t === "snap" || m.t === "in";

/** The host runs the fight; the one guest sends controls and receives snapshots. */
export class HostNet extends Host<Msg> {
  constructor(peers: Peer[], room?: { close(): void }) {
    super(peers, () => "keep", isFast, room);
  }
}

export class GuestNet extends Guest<Msg> {
  constructor(link: Link) {
    super(link);
  }
}
