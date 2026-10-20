"use client";

import { useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { webrtcSupported } from "@/lib/p2p";
import { FriendSlots, type Friend, type SlotsHandle } from "../shared/Invite";
import r from "../shared/invite.module.css";
import l from "./lobby.module.css";

export type Guest = Friend;

export default function Room({
  mapName,
  onStart,
  onBack,
}: {
  mapName: string;
  onStart(cfg: { name: string; guests: Guest[]; room: { close(): void } | null; bots: number; level: BotLevel }): void;
  onBack(): void;
}) {
  const slots = useRef<SlotsHandle>(null);
  const [joined, setJoined] = useState(0);
  const [name, setName] = useState("Host");
  const [bots, setBots] = useState(0);
  const [level, setLevel] = useState<BotLevel>("medium");

  const maxBots = 3 - joined;
  const botCount = Math.min(bots, maxBots);
  const canStart = joined + botCount >= 1;

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
          Friends join with the room code. The game runs directly between your browsers, so keep this tab open while you play.
        </p>

        <section className={r.panel}>
          <label className={r.field}>
            <span className={r.label}>YOUR NAME</span>
            <input className={r.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
          </label>
          <FriendSlots ref={slots} onJoined={setJoined} />
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
              const taken = slots.current?.take();
              onStart({ name: name.trim().slice(0, 14) || "Host", guests: taken?.friends ?? [], room: taken?.room ?? null, bots: botCount, level });
            }}
          >
            Start game
          </button>
        </section>
      </div>
    </div>
  );
}
