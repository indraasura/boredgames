"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { Look } from "@boredgames/quickdraw";
import { Gunslinger, type Pose } from "./Figures";
import s from "./quickdraw.module.css";

export const W = 1600;
export const H = 900;
const GROUND = 690;
export const LEFT_X = 380;
export const RIGHT_X = 1220;
const FEET = 815;

/** The town, the desert and the sky: drawn once. */
const Backdrop = memo(function Backdrop() {
  const stars = useMemo(() => {
    let seed = 11;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 40 }, () => ({ x: r() * W, y: r() * 220, r: 0.6 + r() * 1.3, o: 0.2 + r() * 0.5 }));
  }, []);
  const pebbles = useMemo(() => {
    let seed = 5;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 70 }, () => {
      const y = GROUND + 10 + r() ** 1.6 * (H - GROUND);
      return { x: r() * W, y, w: 2 + ((y - GROUND) / (H - GROUND)) * 9 * r() };
    });
  }, []);
  return (
    <>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1236" />
          <stop offset="0.32" stopColor="#5a2147" />
          <stop offset="0.55" stopColor="#c2433c" />
          <stop offset="0.72" stopColor="#f08a3e" />
          <stop offset="0.8" stopColor="#ffc56a" />
        </linearGradient>
        <radialGradient id="sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.55" stopColor="#ffd77a" />
          <stop offset="1" stopColor="#ff9a3c" />
        </radialGradient>
        <radialGradient id="glow" cx="50%" cy="62%" r="55%">
          <stop offset="0" stopColor="#ffd27a" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffd27a" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d08a4e" />
          <stop offset="0.35" stopColor="#b56d3b" />
          <stop offset="1" stopColor="#6e3a1f" />
        </linearGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb866" stopOpacity={0.5} />
          <stop offset="1" stopColor="#ffb866" stopOpacity={0} />
        </linearGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={4} />
          <feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.13  0 0 0 0 0.05  0 0 0 0.22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      {stars.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff" opacity={st.o} />
      ))}
      <rect width={W} height={H} fill="url(#glow)" />
      {/* the sun, setting behind the clock tower */}
      <circle cx={800} cy={540} r={175} fill="url(#sun)" className={s.sun} />
      {[470, 500, 526, 548, 566].map((y, i) => (
        <rect key={y} x={600} y={y + 40} width={400} height={3 + i * 1.6} fill="#f08a3e" opacity={0.85} />
      ))}
      {/* streaks of cloud */}
      <g opacity={0.55} className={s.clouds}>
        <path d="M120 300 h360 q20 0 0 8 h-360 q-20 0 0 -8z" fill="#7a2c4a" />
        <path d="M980 250 h420 q24 0 0 10 h-420 q-24 0 0 -10z" fill="#7a2c4a" />
        <path d="M1100 340 h260 q18 0 0 7 h-260 q-18 0 0 -7z" fill="#a8394a" />
        <path d="M260 380 h220 q16 0 0 6 h-220 q-16 0 0 -6z" fill="#a8394a" />
      </g>
      {/* mesas, far then near */}
      <path d="M0 600 L60 600 L80 540 L250 536 L270 600 L520 604 L560 560 L640 556 L660 604 L960 606 L990 520 L1180 514 L1210 604 L1440 600 L1470 560 L1560 556 L1600 600 V700 H0Z" fill="#8c3348" opacity={0.75} />
      <path d="M0 640 L140 640 L170 590 L330 586 L350 640 L1120 642 L1150 600 L1290 596 L1320 642 L1600 640 V700 H0Z" fill="#5e2340" />
      {/* the town */}
      <g fill="#2b1426">
        {/* left side: saloon, bank, store */}
        <path d="M60 690 V560 h40 v-20 h120 v20 h40 v130z" />
        <path d="M270 690 V590 h150 v100z" />
        <path d="M270 590 l75 -32 l75 32z" />
        <path d="M440 690 V570 h20 v-24 h120 v24 h20 v120z" />
        {/* clock tower */}
        <path d="M740 690 V470 h120 V690z" />
        <path d="M730 470 h140 l-70 -70z" />
        <path d="M795 400 v-30 h10 v30z" />
        {/* right side: sheriff, hotel, water tower */}
        <path d="M1000 690 V575 h20 v-22 h130 v22 h20 v115z" />
        <path d="M1190 690 V540 h170 V690z" />
        <path d="M1190 540 h170 v-18 h-170z" />
        <path d="M1400 690 V600 h4 V560 h86 v40 h4 V690z" />
        <path d="M1420 560 q25 -40 50 0z" />
      </g>
      {/* lit windows and signs */}
      <g fill="#ffcf73" opacity={0.85}>
        {[[80, 600], [120, 600], [200, 600], [300, 620], [370, 620], [470, 600], [560, 600], [1030, 600], [1110, 600], [1210, 570], [1250, 570], [1300, 570], [1210, 620], [1300, 620]].map(([x, y]) => (
          <rect key={`${x}${y}`} x={x} y={y} width={18} height={22} rx={2} className={s.window} style={{ animationDelay: `${(x! % 7) * 0.6}s` }} />
        ))}
      </g>
      <text x={160} y={556} textAnchor="middle" className={s.sign}>
        SALOON
      </text>
      <text x={520} y={562} textAnchor="middle" className={s.sign} style={{ fontSize: 15 }}>
        GENERAL
      </text>
      <text x={1085} y={570} textAnchor="middle" className={s.sign}>
        SHERIFF
      </text>
      <text x={1275} y={536} textAnchor="middle" className={s.sign} style={{ fontSize: 15 }}>
        HOTEL
      </text>
      {/* the clock: high noon */}
      <circle cx={800} cy={520} r={34} fill="#f6e3b4" stroke="#2b1426" strokeWidth={5} />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M800 490 v6" stroke="#2b1426" strokeWidth={3} transform={`rotate(${i * 30} 800 520)`} />
      ))}
      <path d="M800 520 V494" stroke="#2b1426" strokeWidth={4} strokeLinecap="round" />
      <path d="M800 520 V500" stroke="#2b1426" strokeWidth={6} strokeLinecap="round" className={s.minute} />
      {/* the street */}
      <path d={`M0 ${GROUND} H${W} V${H} H0Z`} fill="url(#dirt)" />
      <rect x={0} y={GROUND} width={W} height={60} fill="url(#haze)" />
      <path d={`M0 ${GROUND + 70} C 500 ${GROUND + 60}, 1100 ${GROUND + 80}, 1600 ${GROUND + 66}`} stroke="#8a4a26" strokeWidth={3} fill="none" opacity={0.5} />
      <path d={`M0 ${GROUND + 150} C 400 ${GROUND + 140}, 1200 ${GROUND + 165}, 1600 ${GROUND + 150}`} stroke="#6a361c" strokeWidth={4} fill="none" opacity={0.45} />
      {pebbles.map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.w} ry={p.w * 0.45} fill="#5a2e16" opacity={0.45} />
      ))}
      {/* fence and a bottle on a post, middle distance */}
      <g fill="#3b1e14">
        <rect x={640} y={GROUND + 4} width={8} height={56} />
        <rect x={760} y={GROUND + 8} width={8} height={52} />
        <rect x={880} y={GROUND + 4} width={8} height={56} />
        <rect x={620} y={GROUND + 18} width={290} height={6} />
        <rect x={620} y={GROUND + 38} width={290} height={5} />
      </g>
      {/* foreground cactus and a skull */}
      <g fill="#1d2a1a">
        <path d="M70 900 V700 q0 -24 22 -24 q22 0 22 24 V900z" />
        <path d="M70 790 h-30 q-14 0 -14 -14 v-50 q0 -12 11 -12 q11 0 11 12 v38 h22z" />
        <path d="M114 760 h26 v-44 q0 -12 11 -12 q11 0 11 12 v56 q0 14 -14 14 h-34z" />
        <path d="M1500 900 V740 q0 -20 18 -20 q18 0 18 20 V900z" />
        <path d="M1536 800 h24 v-36 q0 -10 9 -10 q9 0 9 10 v46 q0 12 -12 12 h-30z" />
      </g>
      <g transform="translate(1380 860)" fill="#efe2c4">
        <ellipse rx={20} ry={14} />
        <ellipse cx={-26} cy={-6} rx={24} ry={4} transform="rotate(-14)" />
        <ellipse cx={26} cy={-6} rx={24} ry={4} transform="rotate(14)" />
        <circle cx={-6} cy={-2} r={4} fill="#2b1426" />
        <circle cx={6} cy={-2} r={4} fill="#2b1426" />
      </g>
    </>
  );
});

export interface SceneProps {
  looks: [Look, Look];
  poses: [Pose, Pose];
  flashes: [boolean, boolean];
  /** A shot fired from this side flies across the street. */
  tracer: 0 | 1 | null;
  crow: number | null;
  bottle: number | null;
  /** Bumps when a round starts, to send a tumbleweed across. */
  weed: number;
}

/** On a tall screen, frame just the street between the two of them, and let the sky fill the rest. */
function usePortrait() {
  const [tall, setTall] = useState(() => window.matchMedia("(max-aspect-ratio: 6/5)").matches);
  useEffect(() => {
    const m = window.matchMedia("(max-aspect-ratio: 6/5)");
    const on = () => setTall(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return tall;
}

export function Scene({ looks, poses, flashes, tracer, crow, bottle, weed }: SceneProps) {
  const tall = usePortrait();
  // Closer together on a tall screen, so they stay big.
  const lx = tall ? 570 : LEFT_X;
  const rx = tall ? 1030 : RIGHT_X;
  return (
    <svg className={s.scene} viewBox={tall ? `400 0 800 ${H}` : `0 0 ${W} ${H}`} preserveAspectRatio={tall ? "xMidYMax meet" : "xMidYMax slice"} aria-hidden>
      <Backdrop />
      {/* the bottle */}
      <g transform={`translate(764 ${GROUND - 2})`}>
        {bottle === null ? (
          <g>
            <path d="M-6 0 v-22 q0 -6 4 -8 v-8 h4 v8 q4 2 4 8 v22z" fill="#3e7a4a" stroke="#1d3a22" strokeWidth={1.2} />
            <rect x={-3} y={-14} width={6} height={6} fill="#e9d9a8" opacity={0.8} />
          </g>
        ) : (
          <g key={bottle} className={s.shards}>
            {Array.from({ length: 9 }, (_, i) => (
              <path key={i} d="M0 0 l5 -3 l-2 6z" fill="#5fa86e" style={{ ["--dx" as string]: `${(i - 4) * 14}px`, ["--dy" as string]: `${-30 - (i % 3) * 16}px` }} />
            ))}
          </g>
        )}
      </g>
      {/* tumbleweed */}
      <g key={`w${weed}`} className={s.weedPath}>
        <g className={s.weedBounce}>
          <g className={s.weed}>
            <circle r={30} fill="none" stroke="#8a6234" strokeWidth={3} strokeDasharray="14 8" />
            <circle r={22} fill="none" stroke="#a37a44" strokeWidth={2.5} strokeDasharray="9 7" />
            <path d="M-26 -8 Q0 -30 24 -6 M-22 12 Q2 -10 26 14 M-10 -26 Q8 0 -8 26 M8 -28 Q-12 0 12 26" stroke="#7a542c" strokeWidth={2} fill="none" />
          </g>
        </g>
      </g>
      {/* the crow */}
      {crow !== null && (
        <g key={crow} className={s.crow}>
          <g className={s.flap}>
            <path d="M0 0 q-20 -18 -42 -10 q20 4 30 14 q-12 6 -6 10 q14 -2 18 -10 q8 6 24 4 q-10 -6 -14 -12 q14 -14 28 -30 q-24 4 -38 34z" fill="#111" />
          </g>
        </g>
      )}
      {/* the two of them */}
      <g transform={`translate(${lx} ${FEET})`}>
        <Gunslinger look={looks[0]} pose={poses[0]} flash={flashes[0]} />
      </g>
      <g transform={`translate(${rx} ${FEET}) scale(-1 1)`}>
        <Gunslinger look={looks[1]} pose={poses[1]} flash={flashes[1]} />
      </g>
      {tracer !== null && (
        <path
          key={`t${tracer}`}
          d={tracer === 0 ? `M${lx + 150} ${FEET - 212} L${rx - 10} ${FEET - 200}` : `M${rx - 150} ${FEET - 212} L${lx + 10} ${FEET - 200}`}
          className={s.tracer}
        />
      )}
      <rect width={W} height={H} fill="#000" filter="url(#grain)" pointerEvents="none" />
    </svg>
  );
}
