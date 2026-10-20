import Peer, { type DataConnection } from "peerjs";

/**
 * Friends play over WebRTC, browser to browser. The host opens a room and gets a 6 digit code; friends type
 * the code to join. The only outside help is the free public PeerJS broker, which introduces the two
 * browsers to each other (it never sees game traffic) and a public STUN server for finding routes.
 * One side (the host) is the hub that every other browser connects to; games decide what to send over it.
 */

/** Every message has a type tag. */
export interface Wire {
  t: string;
}

const PREFIX = "boredgames-";

// ------------------------------------------------------------------- link

/** The connection to one other browser: a reliable channel and a second one for state that is replaced every few milliseconds. */
export class Link {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage: (m: any) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  open = false;
  closed = false;
  private main: DataConnection | null = null;
  private fast: DataConnection | null = null;

  /** `peer` is set for a guest, whose link owns its connection to the broker. A host's links share the room's peer, which the room closes. */
  constructor(private peer: Peer | null) {}

  attach(conn: DataConnection, fast: boolean) {
    conn.on("data", (d) => {
      try {
        this.onMessage(d);
      } catch (e) {
        console.error(e);
      }
    });
    if (fast) {
      this.fast = conn;
      return;
    }
    this.main = conn;
    conn.on("open", () => {
      this.open = true;
      this.onOpen();
    });
    conn.on("close", () => this.drop());
    conn.on("error", () => this.drop());
    if (conn.open) {
      this.open = true;
      queueMicrotask(() => this.onOpen());
    }
  }

  /** `fast` messages may be dropped or arrive out of order; everything else is reliable and ordered. */
  send(m: object, fast = false) {
    const c = fast && this.fast?.open ? this.fast : this.main;
    if (c?.open) c.send(m);
  }

  private drop() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.onClose();
  }

  close() {
    this.closed = true;
    this.open = false;
    try {
      this.main?.close();
      this.fast?.close();
      this.peer?.destroy();
    } catch {
      /* already closed */
    }
  }
}

// ------------------------------------------------------------------ rooms

const randomCode = () => String(100000 + Math.floor(Math.random() * 900000));

/** Host: open a room. `onJoin` is called for every friend who connects. */
export async function openRoom(onJoin: (link: Link) => void): Promise<{ code: string; close(): void }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    try {
      const peer = await new Promise<Peer>((resolve, reject) => {
        const p = new Peer(PREFIX + code);
        const timer = setTimeout(() => {
          p.destroy();
          reject(new Error("timeout"));
        }, 9000);
        p.on("open", () => {
          clearTimeout(timer);
          resolve(p);
        });
        p.on("error", (e) => {
          clearTimeout(timer);
          p.destroy();
          reject(e);
        });
      });
      const links = new Map<string, Link>();
      peer.on("connection", (conn) => {
        let link = links.get(conn.peer);
        const fast = conn.label === "fast";
        if (!link) {
          link = new Link(null);
          links.set(conn.peer, link);
          const l = link;
          // Tell the game about the friend once their reliable channel is open.
          const announce = () => onJoin(l);
          if (!fast) {
            l.attach(conn, false);
            if (conn.open) announce();
            else conn.on("open", announce);
          } else l.attach(conn, true);
          return;
        }
        link.attach(conn, fast);
      });
      peer.on("disconnected", () => {
        // The broker connection dropped. Rooms keep working between connected peers; try to be findable again.
        if (!peer.destroyed) peer.reconnect();
      });
      return {
        code,
        close() {
          peer.destroy();
        },
      };
    } catch (e) {
      const type = (e as { type?: string }).type;
      if (type !== "unavailable-id") throw e;
    }
  }
  throw new Error("Could not open a room");
}

/** Guest: join the room with this code. Rejects with a message that is safe to show. */
export function joinRoom(code: string): Promise<Link> {
  const clean = code.replace(/\D/g, "");
  return new Promise((resolve, reject) => {
    if (clean.length !== 6) return reject(new Error("The code is 6 digits."));
    const peer = new Peer();
    const fail = (msg: string) => {
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail("Could not reach that room. Check the code and try again."), 12000);
    peer.on("error", (e) => fail(e.type === "peer-unavailable" ? "No room has that code." : "Could not connect. Check your internet connection."));
    peer.on("open", () => {
      const link = new Link(peer);
      const main = peer.connect(PREFIX + clean, { label: "game", serialization: "json", reliable: true });
      const fast = peer.connect(PREFIX + clean, { label: "fast", serialization: "json", reliable: false });
      link.attach(fast, true);
      link.attach(main, false);
      main.on("open", () => {
        clearTimeout(timer);
        resolve(link);
      });
    });
  });
}

// -------------------------------------------------------------------- net

export interface Net<M extends Wire> {
  role: "host" | "guest";
  /** The seat id this browser plays. */
  localId: string;
  send(m: M, fast?: boolean): void;
  subscribe(fn: (m: M, from: string) => void): () => void;
  onLeave(fn: (id: string) => void): void;
  close(): void;
}

/** Holds messages until somebody is listening, so nothing sent during a screen change is lost. */
abstract class Base<M extends Wire> {
  private subs = new Set<(m: M, from: string) => void>();
  private buffer: { m: M; from: string }[] = [];
  protected leave: (id: string) => void = () => {};

  protected emit(m: M, from: string) {
    if (this.subs.size) this.subs.forEach((fn) => fn(m, from));
    else this.buffer.push({ m, from });
  }

  subscribe(fn: (m: M, from: string) => void) {
    this.subs.add(fn);
    const queued = this.buffer;
    this.buffer = [];
    queued.forEach((q) => fn(q.m, q.from));
    return () => {
      this.subs.delete(fn);
    };
  }

  onLeave(fn: (id: string) => void) {
    this.leave = fn;
  }
}

export interface Peer_ {
  id: string;
  name: string;
  link: Link;
}
export type { Peer_ as Peer };

export class HostNet<M extends Wire> extends Base<M> implements Net<M> {
  readonly role = "host" as const;
  readonly localId = "p0";

  /**
   * @param relay decides, for a message from a guest, whether the host passes it on to the other guests (and may reject it).
   */
  constructor(
    readonly peers: Peer_[],
    relay: (m: M, from: Peer_) => "relay" | "keep" | "drop" = () => "keep",
    fast: (m: M) => boolean = () => false,
    private room?: { close(): void },
  ) {
    super();
    for (const p of peers) {
      p.link.onMessage = (raw) => {
        const m = raw as M;
        const verdict = relay(m, p);
        if (verdict === "drop") return;
        if (verdict === "relay") for (const o of peers) if (o !== p) o.link.send(m, fast(m));
        this.emit(m, p.id);
      };
      p.link.onClose = () => this.leave(p.id);
    }
  }

  send(m: M, fast = false) {
    for (const p of this.peers) p.link.send(m, fast);
  }

  /** Send to one guest. */
  sendTo(id: string, m: M, fast = false) {
    this.peers.find((p) => p.id === id)?.link.send(m, fast);
  }

  close() {
    for (const p of this.peers) p.link.close();
    this.room?.close();
  }
}

export class GuestNet<M extends Wire> extends Base<M> implements Net<M> {
  readonly role = "guest" as const;
  localId = "";

  /** @param learn called for every incoming message so the game can learn who this guest is (for example from a start message). */
  constructor(
    private link: Link,
    private learn: (m: M, net: GuestNet<M>) => void = () => {},
  ) {
    super();
    link.onMessage = (raw) => {
      const m = raw as M;
      this.learn(m, this);
      this.emit(m, "p0");
    };
    link.onClose = () => this.leave("p0");
  }

  send(m: M, fast = false) {
    this.link.send(m, fast);
  }

  close() {
    this.link.close();
  }
}

export const webrtcSupported = () => typeof RTCPeerConnection !== "undefined";
