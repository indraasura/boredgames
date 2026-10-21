"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AID_LEVELS,
  CIRCUITS,
  DEFAULT_SETUP,
  DRIVER_NAMES,
  TEAMS,
  WEATHERS,
  WEATHER_LIST,
  airDensity,
  getTrack,
  offsetsFor,
  planFor,
  tune,
  type AidLevel,
  type Difficulty,
  type Mode,
  type WeatherChoice,
} from "@boredgames/f1";
import { fmtTime } from "@/lib/f1/controller";
import { webrtcSupported } from "@/lib/p2p";
import { FriendSlots, type Friend, type SlotsHandle } from "../shared/Invite";
import invite from "../shared/invite.module.css";
import { SetupPanel, TeamGrid, TyrePicker, randomCar, suggestedCompound, type CarSel } from "./CarPicker";
import s from "./f1.module.css";

export interface StartConfig {
  mode: Mode;
  track: string;
  laps: number;
  weather: WeatherChoice;
  difficulty: Difficulty;
  opponents: number;
  car: CarSel;
  name: string;
  assist: AidLevel;
  /** Friends who joined, when playing with friends, and the room they are in. */
  friends: Friend[] | null;
  room: { close(): void } | null;
}

type Tab = "free" | "vs" | "friends";

/** An outline of the circuit for its card. */
function Outline({ id }: { id: string }) {
  const d = useMemo(() => {
    const t = getTrack(id);
    const step = 5;
    const pts: [number, number][] = [];
    for (let i = 0; i < t.n; i += step) pts.push([t.x[i]!, -t.y[i]!]);
    const { minX, maxX, minY, maxY } = t.bbox;
    const w = maxX - minX;
    const h = maxY - minY;
    const k = Math.min(112 / w, 66 / h);
    const ox = (120 - w * k) / 2;
    const oy = (72 - h * k) / 2;
    const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${((x - minX) * k + ox).toFixed(1)} ${((y + maxY) * k + oy).toFixed(1)}`).join("");
    const [sx, sy] = pts[0]!;
    return { path: path + "Z", sx: (sx - minX) * k + ox, sy: (sy + maxY) * k + oy };
  }, [id]);
  return (
    <svg className={s.outline} viewBox="0 0 120 72" role="img" aria-label="Circuit outline">
      <path d={d.path} fill="none" stroke="#f2f4f8" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={d.sx} cy={d.sy} r="3.2" fill="#ff3b30" />
    </svg>
  );
}

export default function Menu({ onStart, onJoin, initial }: { onStart(cfg: StartConfig): void; onJoin(): void; initial?: Partial<{ track: string; tab: Tab }> }) {
  const [tab, setTab] = useState<Tab>(initial?.tab ?? "vs");
  const [track, setTrack] = useState(initial?.track ?? "gb-1948");
  const [query, setQuery] = useState("");
  const [weather, setWeather] = useState<WeatherChoice>("clear");
  const [car, setCar] = useState<CarSel>({ team: TEAMS[0]!, compound: "medium", setup: { ...DEFAULT_SETUP } });
  const [laps, setLaps] = useState(5);
  const [opponents, setOpponents] = useState(9);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [assist, setAssist] = useState<AidLevel>("standard");
  const [name, setName] = useState("You");
  const [joined, setJoined] = useState(0);
  const slots = useRef<SlotsHandle>(null);

  const circuit = CIRCUITS.find((c) => c.id === track)!;
  const list = CIRCUITS.filter((c) => {
    const q = query.trim().toLowerCase();
    return !q || `${c.name} ${c.short} ${c.country}`.toLowerCase().includes(q);
  });

  const lapEstimate = useMemo(() => {
    const t = getTrack(track);
    const plan = planFor(t, tune(car.team, car.setup), car.compound, 0, airDensity(t.altitude, 25), 30, 0.93, offsetsFor(t));
    return plan.lapTime * 1.035;
  }, [track, car]);

  const maxOpponents = tab === "friends" ? 19 - joined : 19;
  const opp = Math.min(opponents, maxOpponents);
  const minutes = Math.max(1, Math.round((laps * lapEstimate) / 60));

  const pickWeather = (w: WeatherChoice) => {
    setWeather(w);
    setCar((c) => ({ ...c, compound: suggestedCompound(w) }));
  };

  const randomiseAll = () => {
    const w = (["clear", "cloudy", "drizzle", "rain", "storm", "variable"] as const)[Math.floor(Math.random() * 6)]!;
    const c = randomCar();
    setTrack(CIRCUITS[Math.floor(Math.random() * CIRCUITS.length)]!.id);
    setWeather(w);
    setCar({ ...c, compound: w === "clear" || w === "cloudy" || w === "variable" ? c.compound : suggestedCompound(w) });
  };

  const start = () => {
    onStart({
      mode: tab === "free" ? "free" : "race",
      track,
      laps: tab === "free" ? 0 : laps,
      weather,
      difficulty,
      opponents: tab === "free" ? 0 : opp,
      car,
      name: name.trim().slice(0, 14) || "You",
      assist,
      ...(tab === "friends" ? (() => { const t = slots.current?.take(); return { friends: t?.friends ?? [], room: t?.room ?? null }; })() : { friends: null, room: null }),
    });
  };

  const canStart = tab !== "friends" || joined + opp >= 1;
  void DRIVER_NAMES;

  return (
    <div className={s.page}>
      <div className={s.menu}>
        <header className={s.head}>
          <Link href="/" className={s.back}>
            ← boredgames
          </Link>
          <div>
            <h1 className={s.title}>Grand Prix</h1>
            <p className={s.tag}>40 real circuits. Real car physics.</p>
          </div>
          <span className={s.grow} />
          <button type="button" className={s.small} onClick={onJoin}>
            Join with code
          </button>
          <div className={s.tabs} role="tablist" aria-label="Mode">
            {(
              [
                ["free", "Free ride"],
                ["vs", "Race the computer"],
                ["friends", "Race friends"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${s.tab} ${tab === id ? s.tabOn : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <p className={s.note}>
          {tab === "free" && "Drive alone with no time limit. Learn the circuit, try setups, chase your best lap."}
          {tab === "vs" && "A grid of computer drivers. Pick the tyres, the setup and the weather, and race for the flag."}
          {tab === "friends" && "Race people on other computers, connected directly. Share the room code; computers can fill the rest of the grid."}
        </p>

        {tab === "friends" && (
          <section className={s.section}>
            <h2 className={s.h2}>Friends</h2>
            {webrtcSupported() ? (
              <div className={`${invite.panel} ${invite.dark}`}>
                <label className={invite.field}>
                  <span className={invite.label}>YOUR NAME</span>
                  <input className={invite.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
                </label>
                <FriendSlots ref={slots} onJoined={setJoined} />
              </div>
            ) : (
              <p className={s.note}>This browser can&rsquo;t connect to other players.</p>
            )}
            <p className={s.note}>Friends join with the room code and pick their own car. Keep this tab open while you race.</p>
          </section>
        )}

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Circuit</h2>
            <span className={s.sub}>
              {circuit.flag} {circuit.name} · {(circuit.length / 1000).toFixed(2)} km
            </span>
            <span className={s.grow} />
            <input className={s.search} placeholder="Search circuits" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search circuits" />
            <button type="button" className={s.small} onClick={() => setTrack(CIRCUITS[Math.floor(Math.random() * CIRCUITS.length)]!.id)}>
              🎲 Random
            </button>
          </div>
          <div className={s.tracks} role="radiogroup" aria-label="Circuit">
            {list.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={track === c.id} className={`${s.track} ${track === c.id ? s.trackOn : ""}`} onClick={() => setTrack(c.id)}>
                <Outline id={c.id} />
                <span className={s.trackName}>
                  {c.flag} {c.short}
                </span>
                <span className={s.trackMeta}>
                  {c.country} · {(c.length / 1000).toFixed(2)} km
                </span>
              </button>
            ))}
            {list.length === 0 && <p className={s.note}>No circuit matches that.</p>}
          </div>
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Weather</h2>
            <button type="button" className={s.small} onClick={() => pickWeather((["clear", "cloudy", "drizzle", "rain", "storm", "variable"] as const)[Math.floor(Math.random() * 6)]!)}>
              🎲 Random
            </button>
          </div>
          <div className={s.chips} role="radiogroup" aria-label="Weather">
            {WEATHER_LIST.map((w) => (
              <button key={w} type="button" role="radio" aria-checked={weather === w} className={`${s.chip} ${weather === w ? s.chipOn : ""}`} onClick={() => pickWeather(w)}>
                <span>{WEATHERS[w].icon}</span>
                {WEATHERS[w].name}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={weather === "variable"} className={`${s.chip} ${weather === "variable" ? s.chipOn : ""}`} onClick={() => pickWeather("variable")}>
              <span>🌤️</span>
              Changing
            </button>
          </div>
          {weather === "variable" && <p className={s.note}>Starts dry. Rain arrives during the session and may clear again, so watch the sky and plan a stop.</p>}
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Car</h2>
            <button type="button" className={s.small} onClick={() => setCar((c) => ({ ...c, team: TEAMS[Math.floor(Math.random() * TEAMS.length)]! }))}>
              🎲 Random
            </button>
          </div>
          <TeamGrid value={car.team} onChange={(team) => setCar((c) => ({ ...c, team }))} />
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Tyres</h2>
            <span className={s.sub}>{tab === "free" ? "You can change them at the pit lane." : "You can change them in a pit stop during the race."}</span>
          </div>
          <TyrePicker value={car.compound} onChange={(compound) => setCar((c) => ({ ...c, compound }))} weather={weather} />
        </section>

        <section className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Setup</h2>
            <span className={s.sub}>Tune the car for this circuit.</span>
          </div>
          <SetupPanel car={car} onChange={(setup) => setCar((c) => ({ ...c, setup }))} trackId={track} weather={weather} />
        </section>

        {tab !== "free" && (
          <section className={s.section}>
            <h2 className={s.h2}>Race</h2>
            <div className={s.options}>
              <div className={s.field}>
                <span className={s.label}>Laps</span>
                <div className={s.seg} role="radiogroup" aria-label="Laps">
                  {[1, 3, 5, 10, 20].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={laps === n} className={laps === n ? s.segOn : ""} onClick={() => setLaps(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className={s.field}>
                <span className={s.label}>Computer drivers: {opp}</span>
                <input className={s.rangeWide} type="range" min={tab === "friends" ? 0 : 1} max={maxOpponents} value={opp} onChange={(e) => setOpponents(Number(e.target.value))} aria-label="Computer drivers" />
              </div>
              <div className={s.field}>
                <span className={s.label}>Computer skill</span>
                <div className={s.seg} role="radiogroup" aria-label="Computer skill">
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={difficulty === d} className={difficulty === d ? s.segOn : ""} onClick={() => setDifficulty(d)}>
                      {d[0]!.toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className={s.section}>
          <h2 className={s.h2}>Driver aids</h2>
          <div className={s.seg} role="radiogroup" aria-label="Driver aids">
            {AID_LEVELS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={assist === l.id} className={assist === l.id ? s.segOn : ""} onClick={() => setAssist(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
          <p className={s.note}>{AID_LEVELS.find((l) => l.id === assist)!.blurb}</p>
        </section>
      </div>

      <div className={s.dock}>
        <div className={s.dockIn}>
          <div className={s.summary}>
            <b>{circuit.short}</b> · {WEATHERS[weather === "variable" ? "cloudy" : weather].name.toLowerCase()}
            {weather === "variable" ? " turning wet" : ""} · {car.team.name} · {car.compound}
            {tab !== "free" && (
              <>
                {" "}
                · {laps} {laps === 1 ? "lap" : "laps"}, about {minutes} min
              </>
            )}
            {tab === "free" && <> · reference lap {fmtTime(lapEstimate)}</>}
          </div>
          <button type="button" className={s.ghostBtn} onClick={randomiseAll}>
            🎲 Randomise all
          </button>
          <button type="button" className={s.start} disabled={!canStart} onClick={start}>
            {tab === "free" ? "Start driving" : "Go racing"}
          </button>
        </div>
      </div>
    </div>
  );
}
