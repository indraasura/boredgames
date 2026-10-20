"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { BotLevel } from "@boredgames/engine";
import { MAP_LIST, getBoard, type MapDef } from "@boredgames/milestones";
import { audio } from "@/lib/milestones/audio";
import { THEMES } from "@/lib/milestones/scene/themes";
import s from "./lobby.module.css";

export interface Session {
  map: string;
  /** Computer opponents (1 to 3). */
  bots: number;
  level: BotLevel;
  seed: number;
  fast: boolean;
}

const LEVELS: { id: BotLevel; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Picks at random" },
  { id: "medium", label: "Medium", hint: "Thinks, but not too hard" },
  { id: "hard", label: "Hard", hint: "Weighs every decision" },
];

function mapFacts(map: MapDef) {
  const board = getBoard(map.id);
  const forks = board.nodes.filter((n) => n.type === "fork").length;
  return { tiles: board.distToEnd[board.start] ?? 0, forks };
}

export default function Lobby({
  initialMap,
  initialBots,
  initialLevel,
  onStart,
  onFriends,
  onJoin,
}: {
  initialMap: string;
  initialBots: number;
  initialLevel: BotLevel;
  onStart(config: Omit<Session, "seed" | "fast">): void;
  onFriends(map: string): void;
  onJoin(): void;
}) {
  const prefs = useSyncExternalStore(audio.subscribe, audio.getPrefs, audio.getPrefs);
  const [map, setMap] = useState(initialMap);
  const [bots, setBots] = useState(initialBots);
  const [bot, setBot] = useState<BotLevel>(initialLevel);
  const selected = MAP_LIST.find((m) => m.id === map) ?? MAP_LIST[0]!;

  // Browsers only let sound start after a click, so the menu music begins on the first one.
  useEffect(() => {
    const first = () => {
      audio.unlock();
      audio.startMusic("menu");
    };
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    audio.startMusic("menu");
    return () => {
      window.removeEventListener("pointerdown", first);
      window.removeEventListener("keydown", first);
    };
  }, []);

  return (
    <div className={s.lobby}>
      <div className={s.inner}>
        <header className={s.head}>
          <Link href="/" className={s.back}>
            ← boredgames
          </Link>
          <div className={s.titles}>
            <h1 className={s.title}>Milestones</h1>
            <p className={s.tag}>LIVE A WHOLE LIFE, ONE SPIN AT A TIME</p>
          </div>
          <div className={s.sound}>
            <button type="button" className={s.soundBtn} aria-pressed={prefs.sfx} onClick={() => audio.setPrefs({ sfx: !prefs.sfx })}>
              <span className={prefs.sfx ? "" : s.off}>🔊</span> Effects
            </button>
            <button type="button" className={s.soundBtn} aria-pressed={prefs.music} onClick={() => audio.setPrefs({ music: !prefs.music })}>
              <span className={prefs.music ? "" : s.off}>🎵</span> Music
            </button>
          </div>
        </header>

        <h2 className={s.h2}>Map</h2>
        <div className={s.maps} role="radiogroup" aria-label="Maps">
          {MAP_LIST.map((m) => {
            const th = THEMES[m.theme];
            const facts = mapFacts(m);
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={map === m.id}
                className={`${s.map} ${map === m.id ? s.mapOn : ""}`}
                style={{ ["--accent" as string]: th.accent }}
                onClick={() => {
                  audio.unlock();
                  audio.sfx("click");
                  setMap(m.id);
                }}
              >
                <span className={s.mapArt} style={{ background: th.sky }}>
                  <span className={s.mapEmoji}>{th.emoji}</span>
                </span>
                <span className={s.mapName}>{m.name}</span>
                <span className={s.mapTag}>{m.tagline}</span>
                <span className={s.mapBlurb}>{m.blurb}</span>
                <span className={s.mapFacts}>
                  <span>{m.paths.length} opening roads</span>
                  <span>{facts.forks ? `${facts.forks} crossroads` : "no crossroads"}</span>
                  <span>~{facts.tiles} tiles</span>
                </span>
                <span className={s.paths}>
                  {m.paths.map((p) => (
                    <span key={p.id} className={s.pathChip} title={p.blurb}>
                      {p.icon} {p.name}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <section className={s.setup} aria-label="Game setup">
          <div className={s.field}>
            <span className={s.label}>OPPONENTS</span>
            <div className={s.seg} role="radiogroup" aria-label="Opponents">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={bots === n} className={bots === n ? s.segOn : ""} onClick={() => setBots(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <span className={s.label}>COMPUTER SKILL</span>
            <div className={s.seg} role="radiogroup" aria-label="Computer skill">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={bot === l.id} title={l.hint} className={bot === l.id ? s.segOn : ""} onClick={() => setBot(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={s.friends}
            onClick={() => {
              audio.unlock();
              audio.sfx("click");
              onFriends(selected.id);
            }}
          >
            Host friends
          </button>
          <button type="button" className={s.friends} style={{ marginLeft: 0 }} onClick={onJoin}>
            Join with code
          </button>
          <button
            type="button"
            className={s.start}
            onClick={() => {
              audio.unlock();
              audio.sfx("pick");
              onStart({ map: selected.id, bots, level: bot });
            }}
          >
            Play {selected.name}
          </button>
        </section>

        <p className={s.tips}>Spin and your car drives that many tiles. Hover any tile to see what it does.</p>
      </div>
    </div>
  );
}
