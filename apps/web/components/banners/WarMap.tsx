"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { COAST, HOUSES, MAP_H, MAP_W, PROVINCES, seasonOf, size, type BannersState, type HouseId } from "@boredgames/banners";
import type { Float, MarchShow, Seat } from "@/lib/banners/controller";
import { ShieldArt } from "./Heraldry";
import s from "./banners.module.css";

const pts = (flat: readonly number[]) => {
  let out = "";
  for (let i = 0; i < flat.length; i += 2) out += `${flat[i]},${flat[i + 1]} `;
  return out;
};

function inside(poly: readonly number[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]!, yi = poly[i + 1]!, xj = poly[j]!, yj = poly[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Little drawings of trees, hills and fields scattered through each province, away from its name and banner. */
function terrainMarks() {
  let seed = 42;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return PROVINCES.map((p) => {
    const marks: { x: number; y: number; k: number }[] = [];
    let xs = Infinity, ys = Infinity, xe = -Infinity, ye = -Infinity;
    for (let i = 0; i < p.poly.length; i += 2) {
      xs = Math.min(xs, p.poly[i]!);
      xe = Math.max(xe, p.poly[i]!);
      ys = Math.min(ys, p.poly[i + 1]!);
      ye = Math.max(ye, p.poly[i + 1]!);
    }
    const want = p.terrain === "forest" ? 9 : p.terrain === "hills" ? 6 : 5;
    for (let k = 0; k < 200 && marks.length < want; k++) {
      const x = xs + r() * (xe - xs);
      const y = ys + r() * (ye - ys);
      if (!inside(p.poly, x, y)) continue;
      if (Math.hypot(x - p.x, (y - p.y) * 1.4) < 62) continue;
      if (marks.some((m) => Math.hypot(m.x - x, m.y - y) < 26)) continue;
      marks.push({ x, y, k: r() });
    }
    return marks;
  });
}

const Tree = ({ x, y, k }: { x: number; y: number; k: number }) => (
  <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(0.8 + k * 0.45).toFixed(2)})`}>
    <path d="M0 -14 C-7 -10 -10 -2 -7 3 C-10 4 -9 9 -3 9 L3 9 C9 9 10 4 7 3 C10 -2 7 -10 0 -14 Z" fill="#6f7a4e" fillOpacity={0.55} stroke="#2b1d12" strokeWidth={1.1} />
    <path d="M0 9 V14" stroke="#2b1d12" strokeWidth={1.2} />
  </g>
);
const Hill = ({ x, y, k }: { x: number; y: number; k: number }) => (
  <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(0.9 + k * 0.5).toFixed(2)})`}>
    <path d="M-16 6 Q-6 -12 2 -2 Q8 -10 16 6" fill="#b49a6a" fillOpacity={0.35} stroke="#2b1d12" strokeWidth={1.2} />
    <path d="M-4 -2 L-1 5 M5 -1 L8 5" stroke="#2b1d12" strokeWidth={0.8} />
  </g>
);
const Field = ({ x, y, k }: { x: number; y: number; k: number }) => (
  <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(k * 40 - 20).toFixed(0)})`} stroke="#5a4632" strokeWidth={0.9} strokeOpacity={0.55}>
    <path d="M-10 -4 H10 M-12 0 H12 M-10 4 H10" />
  </g>
);

function Crown({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-13 6 L-15 -7 L-7 -1 L0 -10 L7 -1 L15 -7 L13 6 Z" fill="#e2bd62" stroke="#5a3d10" strokeWidth={1.6} />
      <circle cx={0} cy={-11} r={2.2} fill="#e2bd62" stroke="#5a3d10" strokeWidth={1} />
    </g>
  );
}

function Tower({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-9 8 V-6 H-6 V-10 H-3 V-6 H3 V-10 H6 V-6 H9 V8 Z" fill="#d8c8a3" stroke="#2b1d12" strokeWidth={1.4} />
      <path d="M-2 8 V2 A2 2 0 0 1 2 2 V8" fill="#2b1d12" />
    </g>
  );
}

/** A war banner on a pole: the house colours, and how many troops stand there. */
function Banner({ x, y, house, count, tired, neutral }: { x: number; y: number; house: HouseId | null; count: number; tired: boolean; neutral: boolean }) {
  if (neutral || !house) {
    return (
      <g transform={`translate(${x} ${y})`} className={s.token}>
        <g transform="scale(0.32)">
          <ShieldArt house={null} neutral />
        </g>
        <text y={6} textAnchor="middle" fontSize={15} fontFamily="var(--f-title)" fontWeight={700} fill="#f3ecd8">
          {count}
        </text>
      </g>
    );
  }
  const h = HOUSES[house];
  return (
    <g transform={`translate(${x} ${y})`} className={s.token} opacity={tired ? 0.86 : 1}>
      <path d="M-16 -34 V14" stroke="#2b1d12" strokeWidth={2.4} />
      <circle cx={-16} cy={-35} r={2.6} fill="#e2bd62" stroke="#2b1d12" strokeWidth={1} />
      <path d="M-15 -32 H20 L13 -21 L20 -10 H-15 Z" fill={h.color} stroke="#2b1d12" strokeWidth={1.6} />
      <path d="M-15 -24 H16 M-15 -18 H16" stroke={h.charge} strokeWidth={1.6} opacity={0.85} />
      <circle cx={2} cy={-1} r={13} fill="#f3ecd8" stroke={h.color} strokeWidth={3} />
      <text y={5} x={2} textAnchor="middle" fontSize={15} fontFamily="var(--f-title)" fontWeight={700} fill="#2b1d12">
        {count}
      </text>
    </g>
  );
}

function MarchToken({ m }: { m: MarchShow }) {
  const ref = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    ref.current?.beginElement();
  }, [m.id]);
  const a = PROVINCES[m.from]!;
  const b = PROVINCES[m.to]!;
  const v = m.via !== null ? PROVINCES[m.via]! : null;
  const path = v ? `M0 0 L${v.x - a.x} ${v.y - a.y} L${b.x - a.x} ${b.y - a.y}` : `M0 0 L${b.x - a.x} ${b.y - a.y}`;
  const h = HOUSES[m.house];
  return (
    <g transform={`translate(${a.x} ${a.y - 8})`} className={s.marching}>
      <path d={path} fill="none" stroke={h.color} strokeWidth={4} strokeDasharray="2 10" strokeLinecap="round" opacity={0.8} />
      <g>
        <animateMotion ref={ref} dur={v ? "0.85s" : "0.6s"} fill="freeze" begin="indefinite" path={path} calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.25 1" />
        <Banner x={0} y={0} house={m.house} count={m.count} tired={false} neutral={false} />
      </g>
    </g>
  );
}

export interface MapProps {
  game: BannersState;
  seats: Seat[];
  selected: number | null;
  targets: Set<number>;
  march: MarchShow | null;
  flash: { at: number; id: number } | null;
  battleAt: number | null;
  /** Chance to win, for each province the selected troops can attack. */
  odds: Map<number, number>;
  floats: Float[];
  /** The tutorial points here. */
  coachAt: number | null;
  onPick(i: number): void;
}

const houseOf = (seats: Seat[], id: string | null) => seats.find((x) => x.id === id)?.house ?? null;

function WarMapInner({ game, seats, selected, targets, march, flash, battleAt, odds, floats, coachAt, onPick }: MapProps) {
  const marks = useMemo(terrainMarks, []);
  const polys = useMemo(() => PROVINCES.map((p) => pts(p.poly)), []);
  const coast = useMemo(() => pts(COAST), []);
  const winter = seasonOf(game.round) === "winter";
  return (
    <svg className={s.map} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of the realm">
      <defs>
        <filter id="paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={3} seed={3} />
          <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.18  0 0 0 0.11 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="stain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves={3} seed={9} />
          <feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.28  0 0 0 0 0.12  0 0 0 0.22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={5} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={4} />
        </filter>
        <filter id="wash" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={3} seed={2} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={9} result="d" />
          <feGaussianBlur in="d" stdDeviation={1.6} />
        </filter>
        <pattern id="sea" width="64" height="22" patternUnits="userSpaceOnUse">
          <path d="M0 11 Q8 5 16 11 T32 11 T48 11 T64 11" fill="none" stroke="#5f6b67" strokeOpacity={0.35} strokeWidth={1.1} />
        </pattern>
        <pattern id="storm" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <path d="M0 0 V12" stroke="#2c4a6b" strokeWidth={3} strokeOpacity={0.45} />
        </pattern>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#2b1d12" stopOpacity={0.45} />
        </radialGradient>
      </defs>

      {/* the sea */}
      <rect width={MAP_W} height={MAP_H} fill="#b9b8a0" />
      <rect width={MAP_W} height={MAP_H} fill="url(#sea)" />
      <rect width={MAP_W} height={MAP_H} fill="#000" filter="url(#stain)" />
      {[26, 16, 8].map((w, i) => (
        <polygon key={w} points={coast} fill="none" stroke="#3d4a46" strokeOpacity={0.12 + i * 0.06} strokeWidth={w} strokeLinejoin="round" />
      ))}

      {/* the land */}
      <polygon points={coast} fill={winter ? "#ece6d6" : "#ecdfbd"} />
      <polygon points={coast} fill="#000" filter="url(#paper)" />
      {PROVINCES.map((p, i) => {
        const owner = houseOf(seats, game.provinces[i]!.owner);
        const fill = owner ? HOUSES[owner].color : "transparent";
        return <polygon key={`w${p.id}`} points={polys[i]} fill={fill} fillOpacity={owner ? 0.4 : 0} filter="url(#wash)" style={{ mixBlendMode: "multiply" }} />;
      })}

      {/* a river through the heartland */}
      <path d="M800 170 C 780 260, 840 320, 805 400 S 760 560, 815 640 S 790 760, 812 905" fill="none" stroke="#4c6a78" strokeWidth={3.2} strokeOpacity={0.7} filter="url(#ink)" />

      {/* terrain */}
      {PROVINCES.map((p, i) => (
        <g key={`t${p.id}`} pointerEvents="none">
          {marks[i]!.map((m, k) => (p.terrain === "forest" ? <Tree key={k} {...m} /> : p.terrain === "hills" ? <Hill key={k} {...m} /> : <Field key={k} {...m} />))}
        </g>
      ))}

      {/* borders and hit areas */}
      {PROVINCES.map((p, i) => {
        const isT = targets.has(i);
        const isSel = selected === i;
        return (
          <polygon
            key={`b${p.id}`}
            points={polys[i]}
            className={`${s.prov} ${isT ? s.target : ""}`}
            fill={isSel ? "#e2bd62" : isT ? "#8e1b1b" : "#000"}
            fillOpacity={isSel ? 0.28 : isT ? 0.16 : 0}
            stroke={isSel ? "#b0852f" : isT ? "#8e1b1b" : "#2b1d12"}
            strokeWidth={isSel ? 5 : isT ? 4 : 1.4}
            strokeDasharray={isSel || isT ? undefined : "6 4"}
            strokeOpacity={isSel || isT ? 1 : 0.7}
            onClick={() => onPick(i)}
            aria-label={p.name}
          />
        );
      })}
      <polygon points={coast} fill="none" stroke="#2b1d12" strokeWidth={3} strokeLinejoin="round" filter="url(#ink)" pointerEvents="none" />

      {/* tidings on the map */}
      {game.tidingAt !== null && game.tiding === "storms" && <polygon points={polys[game.tidingAt]} fill="url(#storm)" pointerEvents="none" />}

      {/* names, crowns, castles */}
      {PROVINCES.map((p, i) => {
        const pr = game.provinces[i]!;
        return (
          <g key={`n${p.id}`} pointerEvents="none">
            {p.crown && <Crown x={p.x + 30} y={p.y - 38} />}
            {pr.castle && <Tower x={p.x - 34} y={p.y - 30} />}
            <text x={p.x} y={p.y + 38} textAnchor="middle" fontSize={p.crown ? 19 : 17} className={`${s.label} ${p.crown ? s.crownLabel : ""}`}>
              {p.crown ? p.name.toUpperCase() : p.name}
            </text>
            <text x={p.x} y={p.y + 56} textAnchor="middle" fontSize={12.5} className={s.label} fill="#6b4a12" style={{ fill: "#6b4a12" }}>
              {"●".repeat(p.income)}
            </text>
          </g>
        );
      })}

      {/* armies */}
      {PROVINCES.map((p, i) => {
        const pr = game.provinces[i]!;
        const ready = size(pr.army);
        const tired = size(pr.tired);
        const total = ready + tired;
        if (total === 0) return null;
        return <Banner key={`a${p.id}`} x={p.x} y={p.y - 2} house={houseOf(seats, pr.owner)} count={total} tired={ready === 0} neutral={!pr.owner} />;
      })}

      {/* the odds of each attack */}
      {[...odds].map(([i, p]) => {
        const pr = PROVINCES[i]!;
        const pct = Math.round(p * 100);
        const col = p >= 0.75 ? "#3d6b2e" : p >= 0.5 ? "#9a6a12" : "#8e1b1b";
        return (
          <g key={`o${i}`} transform={`translate(${pr.x + 34} ${pr.y + 6})`} pointerEvents="none" className={s.odds}>
            <rect x={-27} y={-14} width={54} height={26} rx={13} fill="#f3ecd8" stroke={col} strokeWidth={2.5} />
            <text y={5} textAnchor="middle" fontSize={15} fontFamily="var(--f-title)" fontWeight={700} fill={col}>
              {pct >= 100 ? "sure" : `${pct}%`}
            </text>
          </g>
        );
      })}

      {coachAt !== null && (
        <g transform={`translate(${PROVINCES[coachAt]!.x} ${PROVINCES[coachAt]!.y})`} pointerEvents="none">
          <circle r={58} className={s.coachRing} />
          <circle r={58} className={s.coachRing} style={{ animationDelay: "0.7s" }} />
        </g>
      )}

      {march && <MarchToken key={march.id} m={march} />}

      {/* battle and capture */}
      {battleAt !== null && (
        <g transform={`translate(${PROVINCES[battleAt]!.x} ${PROVINCES[battleAt]!.y})`} pointerEvents="none">
          <circle r={46} fill="none" stroke="#8e1b1b" strokeWidth={4} strokeDasharray="4 6">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite" />
          </circle>
          <path d="M-22 -22 L22 22 M22 -22 L-22 22" stroke="#2b1d12" strokeWidth={5} strokeLinecap="round" opacity={0.75} />
        </g>
      )}
      {floats.map((f, k) => (
        <text key={f.id} x={PROVINCES[f.at]!.x} y={PROVINCES[f.at]!.y - 40 - (k % 2) * 16} textAnchor="middle" className={`${s.float} ${s[`float_${f.tone}`]}`} pointerEvents="none">
          {f.text}
        </text>
      ))}
      {flash && (
        <circle key={flash.id} cx={PROVINCES[flash.at]!.x} cy={PROVINCES[flash.at]!.y} r={60} fill="none" stroke="#e2bd62" className={s.flash} pointerEvents="none" />
      )}

      {/* cartouche and compass */}
      <g transform="translate(40 30)" pointerEvents="none">
        <path d="M0 10 Q0 0 10 0 H250 Q260 0 260 10 V58 Q260 68 250 68 H10 Q0 68 0 58 Z" fill="#ecdfbd" stroke="#2b1d12" strokeWidth={2} />
        <path d="M8 8 H252 V60 H8 Z" fill="none" stroke="#b0852f" strokeWidth={1} />
        <text x={130} y={32} textAnchor="middle" fontSize={22} fontFamily="var(--f-title)" fontWeight={700} fill="#2b1d12" letterSpacing={3}>
          THE REALM
        </text>
        <text x={130} y={52} textAnchor="middle" fontSize={14} fontStyle="italic" fontFamily="var(--f-body)" fill="#5a4632">
          {`Year ${Math.ceil(game.round / 4)} of the War of Crowns`}
        </text>
      </g>
      <g transform="translate(110 905)" pointerEvents="none" opacity={0.85}>
        <circle r={46} fill="none" stroke="#2b1d12" strokeWidth={1.5} />
        <circle r={38} fill="none" stroke="#2b1d12" strokeWidth={0.8} />
        <path d="M0 -56 L8 0 L0 56 L-8 0 Z" fill="#2b1d12" />
        <path d="M-56 0 L0 -8 L56 0 L0 8 Z" fill="#8e1b1b" />
        <text y={-62} textAnchor="middle" fontSize={16} fontFamily="var(--f-title)" fontWeight={700} fill="#2b1d12">
          N
        </text>
      </g>
      <rect width={MAP_W} height={MAP_H} fill="url(#vignette)" pointerEvents="none" />
    </svg>
  );
}

export const WarMap = memo(WarMapInner);
