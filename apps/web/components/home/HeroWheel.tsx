"use client";

import { useRef, useState } from "react";
import s from "@/app/home.module.css";

const WEDGES = ["#F2C14E", "#F7E3B0", "#4F9D69", "#CFE5C9", "#EF9FB4", "#F8D9E1", "#3F7CC6", "#CCDCF1", "#E4572E", "#F6CDBF"];

/** What a spin might do to a life: a taste of Milestones before you open it. */
const LIVES = [
  "You took the scenic road and found a job at the aquarium.",
  "Twins. The car is getting full.",
  "The market boomed. Your Growth Fund says thank you.",
  "You bought a beach house you could not quite afford.",
  "Lawsuit. You fought it in court, and won.",
  "Payday. Then another one.",
  "You quit the corporate ladder for a garage startup.",
  "A wedding, and $20k in envelopes.",
  "Laid off. Two paydays of nothing.",
  "First to retire, with a bonus for being early.",
];

export function HeroWheel() {
  const [deg, setDeg] = useState(-18);
  const [n, setN] = useState<number | null>(null);
  const busy = useRef(false);

  const spin = () => {
    if (busy.current) return;
    busy.current = true;
    const pick = Math.floor(Math.random() * 10);
    // Land wedge `pick` under the pointer at the top, after a few full turns.
    const target = 360 * 5 - (pick * 36 + 18);
    const next = deg - (((deg % 360) + 360) % 360) + target;
    setDeg(next);
    setN(null);
    window.setTimeout(() => {
      setN(pick);
      busy.current = false;
    }, 2300);
  };

  const r = 50;
  // Rounded so the server and the browser write identical SVG.
  const f = (v: number) => Math.round(v * 1000) / 1000;
  const wedge = (i: number) => {
    const a0 = ((i * 36 - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * 36 - 90) * Math.PI) / 180;
    return `M50 50 L${f(50 + r * Math.cos(a0))} ${f(50 + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${f(50 + r * Math.cos(a1))} ${f(50 + r * Math.sin(a1))} Z`;
  };

  return (
    <div className={s.wheelBlock}>
      <button type="button" className={s.wheel} onClick={spin} aria-label="Spin the wheel">
        <svg viewBox="0 0 100 100" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true">
          {WEDGES.map((c, i) => (
            <path key={i} d={wedge(i)} fill={c} stroke="var(--paper)" strokeWidth={0.6} />
          ))}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (((i + 0.5) * 36 - 90) * Math.PI) / 180;
            const x = f(50 + 38 * Math.cos(a));
            const y = f(50 + 38 * Math.sin(a));
            return (
              <text key={i} x={x} y={y} transform={`rotate(${(i + 0.5) * 36} ${x} ${y})`} className={s.wheelNum}>
                {i + 1}
              </text>
            );
          })}
        </svg>
        <span className={s.hub}>{n === null ? "Spin" : n + 1}</span>
        <svg className={s.pointer} width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
          <path d="M11 17L1.5 1.5h19z" fill="var(--ink)" stroke="var(--paper)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
      <p className={s.life} aria-live="polite">
        {n === null ? <span className={s.lifeHint}>Give it a spin. Every number is a life event.</span> : <span key={n}>{LIVES[n]}</span>}
      </p>
    </div>
  );
}
