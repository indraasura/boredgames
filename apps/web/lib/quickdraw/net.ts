import type { RoundResult, Shot } from "@boredgames/quickdraw";
import { GuestNet as Guest, HostNet as Host, type Link, type Net as GenericNet, type Peer } from "../p2p";

export { webrtcSupported } from "../p2p";

/**
 * The host (seat 0) runs the duel: it starts each round and judges it. Each browser times its own player from
 * the moment the call appears on its own screen, so a slow connection never decides who was faster.
 */
export type Msg =
  | { t: "hello"; name: string }
  | { t: "start"; seed: number; names: [string, string] }
  | { t: "round"; n: number }
  | { t: "shot"; n: number; shot: Shot }
  | { t: "result"; n: number; result: RoundResult }
  | { t: "again" };

export type Net = GenericNet<Msg>;

export class HostNet extends Host<Msg> {
  constructor(peer: Peer, room?: { close(): void }) {
    super([peer], () => "keep", undefined, room);
  }
}

export class GuestNet extends Guest<Msg> {
  constructor(link: Link) {
    super(link, (m, net) => {
      if (m.t === "start") net.localId = "p1";
    });
  }
}
