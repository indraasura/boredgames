"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { joinRoom, openRoom, type GuestNet, type Link, type Wire } from "@/lib/p2p";
import r from "./invite.module.css";

export interface Friend {
  name: string;
  link: Link;
  /** What the friend sent in a `ready` message, if anything (their chosen car, for example). */
  ready?: unknown;
}

interface Joined {
  id: number;
  name: string;
  link: Link;
  ready?: unknown;
}

export interface SlotsHandle {
  /** The friends who have joined, and the room they are in (keep it open for the whole game). New arrivals are turned away from now on. */
  take(): { friends: Friend[]; room: { close(): void } | null };
}

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * Opens a room and shows its 6 digit code. Friends type the code to join; up to `max` can.
 * Games read the friends who joined with `take()` when the host starts.
 */
export function FriendSlots({ ref, max = 3, onJoined }: { ref: Ref<SlotsHandle>; max?: number; onJoined?(count: number): void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [friends, setFriends] = useState<Joined[]>([]);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const room = useRef<{ close(): void } | null>(null);
  const friendsRef = useRef(friends);
  friendsRef.current = friends;
  const handedOff = useRef(false);
  const seq = useRef(0);

  useImperativeHandle(ref, () => ({
    take() {
      handedOff.current = true;
      return { friends: friendsRef.current.map((f) => ({ name: f.name, link: f.link, ready: f.ready })), room: room.current };
    },
  }));

  useEffect(() => {
    let cancelled = false;
    setCode(null);
    setError("");
    openRoom((link) => {
      if (cancelled || handedOff.current || friendsRef.current.length >= max) {
        link.close();
        return;
      }
      const id = ++seq.current;
      link.onMessage = (m: { t: string; name?: string; entry?: unknown }) => {
        if (m.t === "hello") setFriends((all) => all.map((f) => (f.id === id ? { ...f, name: String(m.name ?? "Friend").slice(0, 14) } : f)));
        if (m.t === "ready") setFriends((all) => all.map((f) => (f.id === id ? { ...f, ready: m.entry } : f)));
      };
      link.onClose = () => setFriends((all) => all.filter((f) => f.id !== id));
      setFriends((all) => [...all, { id, name: "Friend", link }]);
    })
      .then((opened) => {
        if (cancelled) {
          opened.close();
          return;
        }
        room.current = opened;
        setCode(opened.code);
      })
      .catch(() => {
        if (!cancelled) setError("Could not open a room. Check your internet connection.");
      });
    return () => {
      cancelled = true;
      if (!handedOff.current) {
        friendsRef.current.forEach((f) => f.link.close());
        room.current?.close();
      }
      room.current = null;
    };
  }, [attempt, max]);

  useEffect(() => {
    onJoined?.(friends.length);
  }, [friends, onJoined]);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* the code is on screen */
    }
  }

  return (
    <div className={r.room}>
      <span className={r.label}>ROOM CODE</span>
      {code ? (
        <div className={r.codeRow}>
          <span className={r.bigCode} aria-label={`Room code ${code.split("").join(" ")}`}>
            {spaced(code)}
          </span>
          <button type="button" className={r.btn} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : error ? (
        <div className={r.codeRow}>
          <span className={r.note}>{error}</span>
          <button type="button" className={r.btn} onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <span className={r.note}>Opening a room…</span>
      )}
      <p className={r.note}>Friends choose &ldquo;Join with code&rdquo; on this page and type this code.</p>
      <div className={r.people}>
        {Array.from({ length: max }, (_, i) => {
          const f = friends[i];
          return f ? (
            <div key={f.id} className={r.person}>
              <span className={r.joined}>
                {f.name} joined{f.ready ? " · car chosen" : ""}
              </span>
              <button type="button" className={r.link} onClick={() => f.link.close()}>
                Remove
              </button>
            </div>
          ) : (
            <div key={`w${i}`} className={r.person}>
              <span className={r.note}>Waiting for friend {i + 1}…</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** What a friend sees: type the room code, connect, then (optionally) a screen of the game's own while waiting. */
export function JoinFlow<M extends Wire>({
  build,
  isStart,
  onStart,
  onBack,
  connected,
  dark,
}: {
  build(link: Link): GuestNet<M>;
  isStart(m: M): boolean;
  onStart(net: GuestNet<M>, start: M): void;
  onBack(): void;
  /** Shown once connected, in place of the waiting message. Gets the name this guest typed. */
  connected?(net: GuestNet<M>, name: string): React.ReactNode;
  dark?: boolean;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("Guest");
  const [step, setStep] = useState<"form" | "working" | "joined" | "failed">("form");
  const [error, setError] = useState("");
  const netRef = useRef<GuestNet<M> | null>(null);
  const started = useRef(false);

  useEffect(
    () => () => {
      if (!started.current) netRef.current?.close();
    },
    [],
  );

  async function join() {
    setStep("working");
    setError("");
    try {
      const link = await joinRoom(code);
      const net = build(link);
      netRef.current = net;
      net.onLeave(() => {
        if (started.current) return;
        setError("The host left before the game started.");
        setStep("failed");
      });
      const off = net.subscribe((m) => {
        if (isStart(m) && !started.current) {
          started.current = true;
          off();
          onStart(net, m);
        }
      });
      link.send({ t: "hello", name: name.trim().slice(0, 14) || "Guest" });
      setStep("joined");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
      setStep("form");
    }
  }

  const cls = `${r.panel} ${dark ? r.dark : ""}`;
  if (step === "joined" && connected && netRef.current) return <section className={cls}>{connected(netRef.current, name.trim().slice(0, 14) || "Guest")}</section>;

  return (
    <section className={cls}>
      {(step === "form" || step === "working") && (
        <>
          <label className={r.field}>
            <span className={r.label}>ROOM CODE</span>
            <input
              className={`${r.input} ${r.codeInput}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123 456"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && code.replace(/\D/g, "").length === 6 && void join()}
              disabled={step === "working"}
            />
          </label>
          <label className={r.field}>
            <span className={r.label}>YOUR NAME</span>
            <input className={r.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} disabled={step === "working"} />
          </label>
          {error && <p className={r.error}>{error}</p>}
          <div className={r.row}>
            <button type="button" className={r.btn} disabled={step === "working" || code.replace(/\D/g, "").length !== 6} onClick={() => void join()}>
              {step === "working" ? "Connecting…" : "Join"}
            </button>
            <button type="button" className={r.link} onClick={onBack}>
              Cancel
            </button>
          </div>
        </>
      )}
      {step === "joined" && <p className={r.note}>Connected. Waiting for the host to start the game…</p>}
      {step === "failed" && (
        <>
          <p className={r.note}>{error}</p>
          <button type="button" className={r.btn} onClick={onBack}>
            Back
          </button>
        </>
      )}
    </section>
  );
}
