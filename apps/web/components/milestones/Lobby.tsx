"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { BotLevel } from "@boredgames/engine";
import { MAP_LIST, getBoard, type MapDef } from "@boredgames/milestones";
import { audio } from "@/lib/milestones/audio";
import { iconFor } from "@/lib/milestones/icons";
import { Icon } from "./Icon";
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

/** The idleminds mark and name, linking home. */
export function Brand() {
  return (
    <Link href="/" className={s.brand} aria-label="idleminds, home">
      <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="7" fill="currentColor" />
        <circle cx="9" cy="9" r="2.4" fill="var(--paper)" />
        <circle cx="14" cy="14" r="2.4" fill="var(--paper)" />
        <circle cx="19" cy="19" r="2.4" fill="var(--paper)" />
      </svg>
      idleminds
    </Link>
  );
}

function SoundToggles() {
  const prefs = useSyncExternalStore(audio.subscribe, audio.getPrefs, audio.getPrefs);
  return (
    <div className={s.sound}>
      <button type="button" className={s.iconBtn} aria-pressed={prefs.sfx} title={prefs.sfx ? "Sound effects on" : "Sound effects off"} onClick={() => audio.setPrefs({ sfx: !prefs.sfx })}>
        <Icon name={prefs.sfx ? "sound" : "mute"} size={18} />
      </button>
      <button type="button" className={`${s.iconBtn} ${prefs.music ? "" : s.dim}`} aria-pressed={prefs.music} title={prefs.music ? "Music on" : "Music off"} onClick={() => audio.setPrefs({ music: !prefs.music })}>
        <Icon name="music" size={18} />
      </button>
    </div>
  );
}

/** The frame every pre-game screen shares. */
export function Shell({ children, back }: { children: React.ReactNode; back?: { label: string; onClick(): void } }) {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Brand />
        {back ? (
          <button type="button" className={s.navLink} onClick={back.onClick}>
            <Icon name="back" size={16} /> {back.label}
          </button>
        ) : (
          <span className={s.navLabel}>Milestones</span>
        )}
        <SoundToggles />
      </header>
      {children}
    </div>
  );
}

export function Seg<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { id: NoInfer<T>; label: string; hint?: string }[]; onChange(v: NoInfer<T>): void; disabled?: (v: NoInfer<T>) => boolean }) {
  return (
    <div className={s.field}>
      <span className={s.label}>{label}</span>
      <div className={s.seg} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} title={o.hint} disabled={disabled?.(o.id)} className={value === o.id ? s.segOn : ""} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
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
  const [map, setMap] = useState(initialMap);
  const [bots, setBots] = useState(initialBots);
  const [bot, setBot] = useState<BotLevel>(initialLevel);
  const selected = MAP_LIST.find((m) => m.id === map) ?? MAP_LIST[0]!;
  const index = MAP_LIST.indexOf(selected);

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

  const pick = (id: string) => {
    audio.unlock();
    audio.sfx("click");
    setMap(id);
  };

  return (
    <Shell>
      <main className={s.grid}>
        <section className={s.intro}>
          <span className={s.eyebrow}>A board game for 1–4 players · about 20 minutes</span>
          <h1 className={s.title}>
            Mile<em>stones</em>
          </h1>
          <p className={s.lead}>Spin, drive, and live a whole life. Pick a job, buy a home, start a family, invest. Whoever retires with the most money wins.</p>

          <div className={s.setup}>
            <Seg label="Opponents" value={bots} options={[1, 2, 3].map((n) => ({ id: n, label: String(n) }))} onChange={setBots} />
            <Seg label="Computer" value={bot} options={LEVELS} onChange={setBot} />
          </div>

          <div className={s.actions}>
            <button
              type="button"
              className={s.play}
              onClick={() => {
                audio.unlock();
                audio.sfx("pick");
                onStart({ map: selected.id, bots, level: bot });
              }}
            >
              <span>Play {selected.name}</span>
              <span className={s.playArrow}>
                <Icon name="arrow" size={20} />
              </span>
            </button>
            <div className={s.alt}>
              <button
                type="button"
                onClick={() => {
                  audio.unlock();
                  audio.sfx("click");
                  onFriends(selected.id);
                }}
              >
                <Icon name="people" size={17} /> Host friends
              </button>
              <button type="button" onClick={onJoin}>
                <Icon name="link" size={17} /> Join with a code
              </button>
            </div>
          </div>
        </section>

        <section className={s.maps} aria-label="Maps">
          <div className={s.preview} style={{ ["--accent-map" as string]: "var(--accent)" }}>
            {MAP_LIST.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={`/media/${m.id}.jpg`} alt="" className={m.id === selected.id ? s.shown : ""} />
            ))}
            <span className={s.counter}>
              {String(index + 1).padStart(2, "0")} / {String(MAP_LIST.length).padStart(2, "0")}
            </span>
            <span className={s.caption}>
              <b>{selected.tagline}</b>
              {selected.blurb}
            </span>
          </div>

          <ol className={s.mapList} role="radiogroup" aria-label="Choose a map">
            {MAP_LIST.map((m, i) => {
              const f = mapFacts(m);
              const on = m.id === selected.id;
              return (
                <li key={m.id}>
                  <button type="button" role="radio" aria-checked={on} className={`${s.mapRow} ${on ? s.mapOn : ""}`} onClick={() => pick(m.id)}>
                    <span className={s.mapNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={s.mapName}>{m.name}</span>
                    <span className={s.mapMeta}>
                      {f.tiles} tiles · {f.forks ? `${f.forks} crossroads` : "one road"}
                    </span>
                    <span className={s.mapGo}>
                      <Icon name="arrow" size={18} />
                    </span>
                  </button>
                  {on && (
                    <div className={s.roads}>
                      <span className={s.label}>Opening roads</span>
                      {m.paths.map((p) => (
                        <span key={p.id} className={s.road} title={p.blurb}>
                          <Icon name={iconFor(p.icon)} size={15} /> {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </main>
      <p className={s.foot}>Spin and your car drives that many tiles. Hover any tile on the board to see what it does.</p>
    </Shell>
  );
}
