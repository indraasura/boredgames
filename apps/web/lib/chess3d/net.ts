import type { Color, Move } from "@boredgames/tridchess";
import { GuestNet as Guest, HostNet as Host, type Link, type Net as GenericNet, type Peer } from "../p2p";

export type Msg = { t: "hello"; name: string } | { t: "start"; you: Color } | { t: "move"; m: Move } | { t: "resign" };

export type Net = GenericNet<Msg>;

/** One friend, two players: the host relays nothing, it just plays. */
export class HostNet extends Host<Msg> {
  constructor(peers: Peer[], room?: { close(): void }) {
    super(peers, () => "keep", undefined, room);
  }
}

export class GuestNet extends Guest<Msg> {
  constructor(link: Link) {
    super(link);
  }
}
