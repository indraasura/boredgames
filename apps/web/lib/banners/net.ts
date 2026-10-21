import type { BotLevel } from "@boredgames/engine";
import type { HouseId, Move } from "@boredgames/banners";
import { GuestNet as Guest, HostNet as Host, type Link, type Net as GenericNet, type Peer } from "../p2p";

export { joinRoom, openRoom, webrtcSupported } from "../p2p";

export interface SeatInfo {
  id: string;
  name: string;
  house: HouseId;
  bot?: BotLevel;
}

export type Msg =
  | { t: "hello"; name: string }
  | { t: "start"; seats: SeatInfo[]; seed: number; you: string; rounds: number }
  | { t: "move"; id: string; move: Move };

export type Net = GenericNet<Msg>;

/** The host passes each move on to the other guests, and ignores a guest who moves for somebody else. */
export class HostNet extends Host<Msg> {
  constructor(peers: Peer[], room?: { close(): void }) {
    super(peers, (m, from) => (m.t === "move" ? (m.id === from.id ? "relay" : "drop") : "keep"), undefined, room);
  }
}

export class GuestNet extends Guest<Msg> {
  constructor(link: Link) {
    super(link, (m, net) => {
      if (m.t === "start") net.localId = m.you;
    });
  }
}
