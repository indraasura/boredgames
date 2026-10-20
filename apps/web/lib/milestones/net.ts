import type { BotLevel } from "@boredgames/engine";
import type { Move } from "@boredgames/milestones";

/**
 * Friends play over WebRTC, browser to browser. There is no server: the invite link carries the
 * connection offer, and the friend sends a reply code back. One side (the host) runs the game and
 * relays moves; everyone else applies the same moves to the same seeded game.
 */

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

const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ------------------------------------------------------------------ codes

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function run(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** A short text code for a session description. Starts with z when compressed, r when not. */
async function pack(desc: RTCSessionDescriptionInit): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
  if (typeof CompressionStream === "undefined") return "r" + toB64(raw);
  return "z" + toB64(await run(raw, new CompressionStream("deflate-raw")));
}

async function unpack(code: string): Promise<RTCSessionDescriptionInit> {
  const text = code.trim().replace(/\s+/g, "");
  const bytes = fromB64(text.slice(1));
  const raw = text[0] === "z" ? await run(bytes, new DecompressionStream("deflate-raw")) : bytes;
  const desc = JSON.parse(new TextDecoder().decode(raw)) as RTCSessionDescriptionInit;
  if (!desc || (desc.type !== "offer" && desc.type !== "answer") || typeof desc.sdp !== "string") throw new Error("bad code");
  return desc;
}

function gathered(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, 5000);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

// ------------------------------------------------------------------- link

/** One data channel to one other browser. */
export class Link {
  onMessage: (m: Msg) => void = () => {};
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  open = false;
  closed = false;
  private ch: RTCDataChannel | null = null;

  constructor(readonly pc: RTCPeerConnection) {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.drop();
    };
  }

  attach(ch: RTCDataChannel) {
    this.ch = ch;
    ch.onopen = () => {
      this.open = true;
      this.onOpen();
    };
    ch.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as Msg);
      } catch {
        /* ignore malformed messages */
      }
    };
    ch.onclose = () => this.drop();
    if (ch.readyState === "open") ch.onopen(new Event("open"));
  }

  send(m: Msg) {
    if (this.ch?.readyState === "open") this.ch.send(JSON.stringify(m));
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
      this.ch?.close();
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}

/** Host side, step 1: make an invite. Share `code`, then pass the friend's reply to `accept`. */
export async function createInvite(): Promise<{ code: string; link: Link; accept(reply: string): Promise<void> }> {
  const pc = new RTCPeerConnection(ICE);
  const link = new Link(pc);
  link.attach(pc.createDataChannel("milestones"));
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await pack(pc.localDescription!);
  return {
    code,
    link,
    accept: async (reply) => {
      await pc.setRemoteDescription(await unpack(reply));
    },
  };
}

/** Guest side: turn an invite code into a reply code to send back to the host. */
export async function answerInvite(invite: string): Promise<{ code: string; link: Link }> {
  const pc = new RTCPeerConnection(ICE);
  const link = new Link(pc);
  pc.ondatachannel = (e) => link.attach(e.channel);
  await pc.setRemoteDescription(await unpack(invite));
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await pack(pc.localDescription!), link };
}

// -------------------------------------------------------------------- net

export interface Net {
  role: "host" | "guest";
  /** The seat id this browser plays. */
  localId: string;
  send(m: Msg): void;
  subscribe(fn: (m: Msg, from: string) => void): () => void;
  onLeave(fn: (id: string) => void): void;
  close(): void;
}

/** Holds messages until somebody is listening, so nothing sent during a screen change is lost. */
abstract class Base {
  private subs = new Set<(m: Msg, from: string) => void>();
  private buffer: { m: Msg; from: string }[] = [];
  protected leave: (id: string) => void = () => {};

  protected emit(m: Msg, from: string) {
    if (this.subs.size) this.subs.forEach((fn) => fn(m, from));
    else this.buffer.push({ m, from });
  }

  subscribe(fn: (m: Msg, from: string) => void) {
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

export interface Peer {
  id: string;
  name: string;
  link: Link;
}

export class HostNet extends Base implements Net {
  readonly role = "host" as const;
  readonly localId = "p0";

  constructor(readonly peers: Peer[]) {
    super();
    for (const p of peers) {
      p.link.onMessage = (m) => {
        if (m.t === "move") {
          if (m.id !== p.id) return;
          for (const o of peers) if (o !== p) o.link.send(m);
        }
        this.emit(m, p.id);
      };
      p.link.onClose = () => this.leave(p.id);
    }
  }

  send(m: Msg) {
    for (const p of this.peers) p.link.send(m);
  }

  close() {
    for (const p of this.peers) p.link.close();
  }
}

export class GuestNet extends Base implements Net {
  readonly role = "guest" as const;
  localId = "";

  constructor(private link: Link) {
    super();
    link.onMessage = (m) => {
      if (m.t === "start") this.localId = m.you;
      this.emit(m, "p0");
    };
    link.onClose = () => this.leave("p0");
  }

  send(m: Msg) {
    this.link.send(m);
  }

  close() {
    this.link.close();
  }
}

export const webrtcSupported = () => typeof RTCPeerConnection !== "undefined";
