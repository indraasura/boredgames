import type { BotLevel } from "@boredgames/engine";
import type { Move } from "@boredgames/milestones";
import { GuestNet as Guest, HostNet as Host, type Net as GenericNet, type Peer } from "../p2p";

export { joinRoom, openRoom, webrtcSupported, type Link } from "../p2p";

export interface SeatInfo {
  id: string;
  name: string;
  color: string;
  bot?: BotLevel;
}

export type Msg =
  | { t: "hello"; name: string }
  | { t: "start"; seats: SeatInfo[]; map: string; seed: number; you: string; fast: boolean }
  | { t: "move"; id: string; move: Move }
  | { t: "restart"; seed: number };

export type Net = GenericNet<Msg>;

/** The host passes moves on to the other guests, and ignores a guest who moves for somebody else. */
export class HostNet extends Host<Msg> {
  constructor(peers: Peer[], room?: { close(): void }) {
    super(peers, (m, from) => (m.t === "move" ? (m.id === from.id ? "relay" : "drop") : "keep"), undefined, room);
  }
}

export class GuestNet extends Guest<Msg> {
  constructor(link: import("../p2p").Link) {
    super(link, (m, net) => {
      if (m.t === "start") net.localId = m.you;
    });
  }
}
