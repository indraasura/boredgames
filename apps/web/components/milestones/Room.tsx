"use client";

import { useEffect, useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { createInvite, webrtcSupported, type Link } from "@/lib/milestones/net";
import l from "./lobby.module.css";
import r from "./room.module.css";

export interface Guest {
  name: string;
  link: Link;
}

interface Slot {
  state: "empty" | "invite" | "joined";
  code?: string;
  link?: Link;
  accept?: (reply: string) => Promise<void>;
  name?: string;
  note?: string;
}

const EMPTY: Slot = { state: "empty" };

export default function Room({
  mapName,
  onStart,
  onBack,
}: {
  mapName: string;
  onStart(cfg: { name: string; guests: Guest[]; bots: number; level: BotLevel }): void;
  onBack(): void;
}) {
  const [slots, setSlots] = useState<Slot[]>([EMPTY, EMPTY, EMPTY]);
  const [replies, setReplies] = useState<string[]>(["", "", ""]);
  const [name, setName] = useState("Host");
  const [bots, setBots] = useState(0);
  const [level, setLevel] = useState<BotLevel>("medium");
  const [copied, setCopied] = useState(-1);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const handedOff = useRef(false);

  useEffect(
    () => () => {
      if (!handedOff.current) slotsRef.current.forEach((s) => s.link?.close());
    },
    [],
  );

  const patch = (i: number, p: Slot) => setSlots((all) => all.map((s, j) => (j === i ? p : s)));
  const joined = slots.filter((s) => s.state === "joined");
  const maxBots = 3 - joined.length;
  const botCount = Math.min(bots, maxBots);
  const canStart = joined.length + botCount >= 1;

  async function invite(i: number) {
    patch(i, { state: "invite", note: "Making your link…" });
    try {
      const made = await createInvite();
      const mine = (s: Slot, j: number) => j === i && s.link === made.link;
      made.link.onMessage = (m) => {
        if (m.t === "hello") setSlots((all) => all.map((s, j) => (mine(s, j) ? { ...s, name: m.name.slice(0, 14) } : s)));
      };
      made.link.onOpen = () => setSlots((all) => all.map((s, j) => (mine(s, j) ? { ...s, state: "joined", name: s.name ?? "Friend", note: undefined } : s)));
      made.link.onClose = () => setSlots((all) => all.map((s, j) => (mine(s, j) ? EMPTY : s)));
      patch(i, { state: "invite", code: made.code, link: made.link, accept: made.accept });
    } catch {
      patch(i, EMPTY);
    }
  }

  async function connect(i: number) {
    const s = slots[i]!;
    try {
      await s.accept!(replies[i]!);
      patch(i, { ...s, note: "Connecting…" });
    } catch {
      patch(i, { ...s, note: "That reply code didn't work. Check that you copied all of it." });
    }
  }

  function remove(i: number) {
    slots[i]?.link?.close();
    patch(i, EMPTY);
    setReplies((all) => all.map((v, j) => (j === i ? "" : v)));
  }

  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
    } catch {
      /* the text box is selectable instead */
    }
  }

  const url = (code: string) => `${window.location.origin}${window.location.pathname}#join=${code}`;

  if (!webrtcSupported()) {
    return (
      <div className={l.lobby}>
        <div className={l.inner}>
          <p className={r.note}>This browser can&rsquo;t connect to other players.</p>
          <button type="button" className={r.btn} onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={l.lobby}>
      <div className={l.inner}>
        <header className={l.head}>
          <button type="button" className={l.back} onClick={onBack}>
            ← Back
          </button>
          <div className={l.titles}>
            <h1 className={l.title}>Play with friends</h1>
            <p className={l.tag}>{mapName.toUpperCase()}</p>
          </div>
        </header>

        <p className={l.tips}>
          For each friend: make a link, send it to them, then paste the reply code they send back. The game runs directly between your browsers, with no server, so keep this tab open while you play.
        </p>

        <section className={r.panel}>
          <label className={r.field}>
            <span className={l.label}>YOUR NAME</span>
            <input className={r.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
          </label>

          {slots.map((s, i) => (
            <div key={i} className={r.slot}>
              <span className={l.label}>FRIEND {i + 1}</span>
              {s.state === "empty" && (
                <button type="button" className={r.btn} onClick={() => invite(i)}>
                  Make invite link
                </button>
              )}
              {s.state === "invite" && !s.code && <p className={r.note}>{s.note}</p>}
              {s.state === "invite" && s.code && (
                <>
                  <div className={r.row}>
                    <input className={r.input} readOnly value={url(s.code)} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
                    <button type="button" className={r.btn} onClick={() => copy(i, url(s.code!))}>
                      {copied === i ? "Copied" : "Copy link"}
                    </button>
                  </div>
                  <div className={r.row}>
                    <textarea
                      className={r.code}
                      rows={2}
                      placeholder="Paste their reply code here"
                      value={replies[i]}
                      onChange={(e) => setReplies((all) => all.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                    <button type="button" className={r.btn} disabled={replies[i]!.trim().length < 20} onClick={() => connect(i)}>
                      Connect
                    </button>
                  </div>
                  {s.note && <p className={r.note}>{s.note}</p>}
                  <button type="button" className={r.link} onClick={() => remove(i)}>
                    Cancel
                  </button>
                </>
              )}
              {s.state === "joined" && (
                <div className={r.row}>
                  <span className={r.joined}>{s.name} joined</span>
                  <button type="button" className={r.link} onClick={() => remove(i)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className={l.setup} aria-label="Computer players">
          <div className={l.field}>
            <span className={l.label}>COMPUTER PLAYERS</span>
            <div className={l.seg} role="radiogroup" aria-label="Computer players">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={botCount === n} disabled={n > maxBots} className={botCount === n ? l.segOn : ""} onClick={() => setBots(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {botCount > 0 && (
            <div className={l.field}>
              <span className={l.label}>COMPUTER SKILL</span>
              <div className={l.seg} role="radiogroup" aria-label="Computer skill">
                {(["easy", "medium", "hard"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={level === v} className={level === v ? l.segOn : ""} onClick={() => setLevel(v)}>
                    {v[0]!.toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            className={l.start}
            disabled={!canStart}
            onClick={() => {
              handedOff.current = true;
              slots.filter((s) => s.state !== "joined").forEach((s) => s.link?.close());
              onStart({ name: name.trim().slice(0, 14) || "Host", guests: joined.map((s) => ({ name: s.name ?? "Friend", link: s.link! })), bots: botCount, level });
            }}
          >
            Start game
          </button>
        </section>
      </div>
    </div>
  );
}
