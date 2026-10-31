"use client";

import { useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { webrtcSupported } from "@/lib/p2p";
import { FriendSlots, type Friend, type SlotsHandle } from "../shared/Invite";
import r from "../shared/invite.module.css";
import { Icon } from "./Icon";
import { Seg, Shell } from "./Lobby";
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
      <Shell back={{ label: "Maps", onClick: onBack }}>
        <main className={l.narrow}>
          <p className={r.note}>This browser can&rsquo;t connect to other players.</p>
        </main>
      </Shell>
    );
  }

  return (
    <Shell back={{ label: "Maps", onClick: onBack }}>
      <main className={l.narrow}>
        <section className={l.intro}>
          <span className={l.eyebrow}>{mapName}</span>
          <h1 className={l.title}>
            Play with <em>friends</em>
          </h1>
          <p className={l.lead}>Share the room code. Friends open Milestones, choose &ldquo;Join with a code&rdquo; and type it. The game runs between your browsers, so keep this tab open.</p>
          <div className={l.setup}>
            <Seg label="Computer players" value={botCount} options={[0, 1, 2, 3].map((n) => ({ id: n, label: String(n) }))} onChange={setBots} disabled={(n) => n > maxBots} />
            {botCount > 0 && (
              <Seg
                label="Computer"
                value={level}
                options={(["easy", "medium", "hard"] as const).map((v) => ({ id: v, label: v[0]!.toUpperCase() + v.slice(1) }))}
                onChange={setLevel}
              />
            )}
          </div>
          <div className={l.actions}>
            <button
              type="button"
              className={l.play}
              disabled={!canStart}
              onClick={() => {
                const taken = slots.current?.take();
                onStart({ name: name.trim().slice(0, 14) || "Host", guests: taken?.friends ?? [], room: taken?.room ?? null, bots: botCount, level });
              }}
            >
              <span>{joined ? `Start with ${joined} ${joined === 1 ? "friend" : "friends"}` : canStart ? "Start with the computer" : "Waiting for friends"}</span>
              <span className={l.playArrow}>
                <Icon name="arrow" size={20} />
              </span>
            </button>
          </div>
        </section>
        <section className={r.panel}>
          <label className={r.field}>
            <span className={r.label}>Your name</span>
            <input className={r.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
          </label>
          <FriendSlots ref={slots} onJoined={setJoined} />
        </section>
      </main>
    </Shell>
  );
}
