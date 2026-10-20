"use client";

import { useMemo } from "react";
import {
  COMPOUNDS,
  COMPOUND_LIST,
  DEFAULT_SETUP,
  SETUP_FIELDS,
  TEAMS,
  airDensity,
  getTrack,
  offsetsFor,
  planFor,
  randomSetup,
  tune,
  type Compound,
  type Setup,
  type Team,
  type WeatherChoice,
} from "@boredgames/f1";
import { fmtTime } from "@/lib/f1/controller";
import s from "./f1.module.css";

export interface CarSel {
  team: Team;
  compound: Compound;
  setup: Setup;
}

export const randomCar = (rand: () => number = Math.random): CarSel => ({
  team: TEAMS[Math.floor(rand() * TEAMS.length)]!,
  compound: (["soft", "medium", "hard"] as const)[Math.floor(rand() * 3)]!,
  setup: randomSetup(rand),
});

/** What tyre suits a weather choice. */
export function suggestedCompound(w: WeatherChoice): Compound {
  if (w === "storm" || w === "rain") return "wet";
  if (w === "drizzle") return "inter";
  return "medium";
}

export function TeamGrid({ value, onChange }: { value: Team; onChange(t: Team): void }) {
  return (
    <div className={s.teams} role="radiogroup" aria-label="Car">
      {TEAMS.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={value.id === t.id} className={`${s.team} ${value.id === t.id ? s.teamOn : ""}`} onClick={() => onChange(t)}>
          <span className={s.teamTop}>
            <span className={s.swatch} style={{ background: t.color, ["--accent" as string]: t.accent }} />
            <span className={s.teamName}>{t.name}</span>
          </span>
          <span className={s.teamBlurb}>{t.blurb}</span>
        </button>
      ))}
    </div>
  );
}

export function TyrePicker({ value, onChange, weather }: { value: Compound; onChange(c: Compound): void; weather: WeatherChoice }) {
  const suggested = suggestedCompound(weather);
  const maxMu = COMPOUNDS.soft.mu;
  return (
    <div className={s.tyres} role="radiogroup" aria-label="Tyres">
      {COMPOUND_LIST.map((id) => {
        const c = COMPOUNDS[id];
        const dry = id === "soft" || id === "medium" || id === "hard";
        const grip = (c.mu / maxMu) * (dry ? 1 : 0.8);
        const life = Math.min(1, 0.95 / c.wear / 1.45);
        return (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`${s.tyre} ${value === id ? s.tyreOn : ""}`} onClick={() => onChange(id)}>
            <span className={s.tyreRing} style={{ ["--ring" as string]: c.color }} />
            <span className={s.tyreInfo}>
              <span className={s.tyreName}>
                {c.name}
                {suggested === id && <span className={s.badge}>SUITS</span>}
              </span>
              <span className={s.bars}>
                <span>{dry ? "Dry grip" : "Wet grip"}</span>
                <span className={s.bar}>
                  <span style={{ width: `${Math.round(grip * 100)}%` }} />
                </span>
                <span>Lasts</span>
                <span className={s.bar}>
                  <span style={{ width: `${Math.round(life * 100)}%` }} />
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const WET_OF: Record<WeatherChoice, number> = { clear: 0, cloudy: 0, drizzle: 0.3, rain: 0.65, storm: 0.9, variable: 0 };

/** A reference lap and top speed for this car on this track, so setup changes show what they do. */
function preview(trackId: string, car: CarSel, weather: WeatherChoice) {
  const track = getTrack(trackId);
  const rho = airDensity(track.altitude, 25);
  const wet = WET_OF[weather];
  const off = offsetsFor(track);
  const mine = planFor(track, tune(car.team, car.setup), car.compound, wet, rho, 30, 0.93, off);
  const base = planFor(track, tune(car.team, DEFAULT_SETUP), car.compound, wet, rho, 30, 0.93, off);
  let top = 0;
  for (const v of mine.v) top = Math.max(top, v);
  const k = tune(car.team, car.setup);
  return { lap: mine.lapTime * 1.035, delta: base.lapTime - mine.lapTime, top: Math.min(top, 105) * 3.6, down: ((k.clAf + k.clAr) / 4.8) * 100 };
}

export function SetupPanel({ car, onChange, trackId, weather }: { car: CarSel; onChange(setup: Setup): void; trackId: string; weather: WeatherChoice }) {
  const p = useMemo(() => preview(trackId, car, weather), [trackId, car, weather]);
  const rand = () => Math.random();
  return (
    <div className={s.setup}>
      <div className={s.sliders}>
        {SETUP_FIELDS.map((f) => {
          const lo = f.key === "brakeBias" ? 0.5 : 0;
          const hi = f.key === "brakeBias" ? 0.68 : 1;
          const v = car.setup[f.key];
          return (
            <label key={f.key} className={s.slider}>
              <span className={s.sliderTop}>
                <span>{f.label}</span>
                <span>{f.format(v)}</span>
              </span>
              <input
                className={s.range}
                type="range"
                min={lo}
                max={hi}
                step={0.005}
                value={v}
                onChange={(e) => onChange({ ...car.setup, [f.key]: Number(e.target.value) })}
                aria-label={f.label}
              />
              <span className={s.ends}>
                <span>{f.low}</span>
                <span>{f.high}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className={s.preview}>
        <span className={s.label}>With this setup</span>
        <div className={s.stat}>
          <span className={s.statLabel}>Reference lap</span>
          <span className={s.statVal}>{fmtTime(p.lap)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Against default setup</span>
          <span className={`${s.statVal} ${p.delta > 0.02 ? s.good : p.delta < -0.02 ? s.bad : ""}`}>
            {Math.abs(p.delta) < 0.02 ? "same" : `${p.delta > 0 ? "−" : "+"}${Math.abs(p.delta).toFixed(2)} s`}
          </span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Top speed on this track</span>
          <span className={s.statVal}>{Math.round(p.top)} km/h</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Downforce</span>
          <span className={s.statVal}>{Math.round(p.down)}%</span>
        </div>
        <div className={s.chips}>
          <button type="button" className={s.small} onClick={() => onChange({ ...DEFAULT_SETUP })}>
            Reset
          </button>
          <button type="button" className={s.small} onClick={() => onChange(randomSetup(rand))}>
            Randomise
          </button>
        </div>
        <p className={s.note}>The reference lap is what a steady computer driver would do on a dry, clean track with this car. Rain, wear and traffic make it slower.</p>
      </div>
    </div>
  );
}
