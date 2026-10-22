"use client";

import type { Look } from "@boredgames/quickdraw";
import s from "./quickdraw.module.css";

export type Pose = "idle" | "tense" | "fire" | "foul" | "fall" | "win";

/**
 * A gunslinger seen from the side, facing right, standing with their boots at (0, 0). The right-hand one is
 * mirrored by the scene. Poses are CSS classes: the arm turns at the shoulder, the body falls about the boots.
 */
export function Gunslinger({ look, pose, flash }: { look: Look; pose: Pose; flash: boolean }) {
  const drawn = pose === "fire" || pose === "win" || pose === "foul";
  const dark = shade(look.coat, -0.35);
  return (
    <g className={`${s.slinger} ${s[`pose_${pose}`]}`}>
      <ellipse cx={0} cy={2} rx={70} ry={10} fill="#000" opacity={0.28} className={s.shadow} />
      <g className={s.body}>
        {/* back leg and arm */}
        <path d="M-6 -140 L-34 -6 L-14 -4 L6 -110 Z" fill={shade(look.coat, -0.5)} />
        <path d="M-40 -8 h34 v8 h-40 z" fill="#2a1a10" />
        <g transform="translate(-14 -226)">
          <g className={s.backArm}>
            <path d="M-8 0 L-14 70 L-2 72 L8 4 Z" fill={shade(look.shirt, -0.35)} />
            <circle cx={-8} cy={76} r={7} fill={shade(look.skin, -0.2)} />
          </g>
        </g>
        {/* coat behind the body */}
        {look.cut === "duster" && <path className={s.coatTail} d="M-30 -228 C-44 -170 -58 -110 -66 -52 L-6 -58 L14 -150 Z" fill={dark} />}
        {/* front leg */}
        <path d="M2 -140 L26 -6 L44 -6 L22 -140 Z" fill={shade(look.coat, -0.45)} />
        <path d="M22 -10 h30 q6 0 6 8 h-40 z" fill="#3a2414" />
        <path d="M18 -34 h26 v10 h-26 z" fill="#2a1a10" />
        {/* spur */}
        <circle cx={14} cy={-6} r={4} fill="none" stroke="#c9b27a" strokeWidth={1.6} />
        {/* torso */}
        <path d="M-26 -232 C-30 -200 -28 -160 -22 -138 L28 -138 C32 -170 32 -205 26 -232 Z" fill={look.shirt} />
        {look.cut === "vest" && <path d="M-26 -230 C-30 -200 -28 -160 -22 -140 L-2 -140 L4 -228 Z M26 -230 C30 -200 30 -168 28 -140 L14 -140 L12 -226 Z" fill={look.coat} />}
        {look.cut === "duster" && <path d="M-28 -234 C-34 -196 -34 -150 -30 -100 L-8 -100 L0 -226 Z M28 -234 C34 -200 34 -160 30 -120 L16 -120 L14 -228 Z" fill={look.coat} />}
        {look.cut === "poncho" && (
          <path className={s.poncho} d="M-34 -236 L36 -236 L56 -168 L-48 -164 Z" fill={look.coat} stroke={shade(look.coat, -0.3)} strokeWidth={2} />
        )}
        {look.cut === "poncho" && <path d="M-44 -176 L52 -180" stroke={look.scarf} strokeWidth={5} opacity={0.8} />}
        {/* belt, holster and the gun in it */}
        <path d="M-26 -146 h56 v10 h-56 z" fill="#3a2414" />
        <rect x={-2} y={-146} width={10} height={10} fill="#d8b860" />
        <g className={s.holster}>
          <path d="M20 -140 h18 l-4 46 h-12 z" fill="#5a3418" stroke="#2a1608" strokeWidth={1.5} />
          {!drawn && <path d="M24 -140 l-2 -16 q4 -6 12 -2 l2 18 z" fill="#3b2a1e" />}
        </g>
        {/* head */}
        <rect x={-8} y={-246} width={16} height={16} fill={shade(look.skin, -0.15)} />
        <path d="M-16 -244 Q2 -230 22 -244 L20 -236 Q2 -224 -14 -236 Z" fill={look.scarf} />
        <ellipse cx={4} cy={-266} rx={20} ry={23} fill={look.skin} />
        <path d="M22 -270 l7 8 l-7 2 z" fill={shade(look.skin, -0.1)} />
        {look.beard && <path d="M-6 -262 Q10 -240 24 -258 Q22 -246 6 -244 Q-6 -248 -6 -262Z" fill={shade(look.hat, 0.1)} />}
        <path d="M10 -272 h9" stroke="#1a1008" strokeWidth={3} strokeLinecap="round" className={s.eye} />
        <path d="M8 -279 l12 1" stroke={shade(look.hat, -0.2)} strokeWidth={2.5} strokeLinecap="round" />
        {/* hat (it flies off when they fall) */}
        <g className={s.hat}>
          <ellipse cx={4} cy={-284} rx={46} ry={7} fill={look.hat} stroke={shade(look.hat, -0.35)} strokeWidth={2} />
          <path d="M-18 -285 C-20 -312 -10 -318 0 -310 C8 -318 26 -314 24 -285 Z" fill={look.hat} stroke={shade(look.hat, -0.35)} strokeWidth={2} />
          <path d="M-18 -292 L24 -292" stroke={shade(look.hat, -0.45)} strokeWidth={4} />
        </g>
        {/* gun arm, turning at the shoulder */}
        <g transform="translate(14 -226)">
          <g className={s.gunArm}>
            <path d="M-9 0 L-6 74 L8 74 L10 0 Z" fill={look.cut === "poncho" ? look.shirt : look.cut === "duster" ? look.coat : look.shirt} />
            <circle cx={1} cy={80} r={8} fill={look.skin} />
            {drawn && (
              <g transform="translate(0 80)">
                {/* revolver along the forearm's line, barrel pointing down the arm */}
                <path d="M-5 -4 h10 v10 h-10 z" fill="#3b2a1e" />
                <path d="M-4 4 h8 v14 h-8 z" fill="#4a4a4e" />
                <circle cx={0} cy={11} r={6} fill="#5c5c62" stroke="#2a2a2e" strokeWidth={1.5} />
                <path d="M-2.5 16 h5 v30 h-5 z" fill="#55555b" />
                {flash && (
                  <g transform="translate(0 50)" className={s.muzzle}>
                    <path d="M0 0 L-16 34 L-4 26 L0 58 L4 26 L16 34 Z" fill="#ffe28a" />
                    <circle r={12} fill="#fff6d0" />
                  </g>
                )}
              </g>
            )}
          </g>
        </g>
      </g>
    </g>
  );
}

/** Close-up of a pair of narrowed eyes under a hat brim, for the standoff. */
export function Eyes({ look, flip }: { look: Look; flip?: boolean }) {
  return (
    <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" className={s.eyesSvg} style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <rect width={400} height={120} fill={look.skin} />
      <rect width={400} height={120} fill="url(#eyeShade)" />
      <defs>
        <linearGradient id="eyeShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={0.55} />
          <stop offset="0.45" stopColor="#000" stopOpacity={0.05} />
          <stop offset="1" stopColor="#000" stopOpacity={0.25} />
        </linearGradient>
      </defs>
      <path d="M0 0 H400 V22 Q200 34 0 22 Z" fill={look.hat} />
      {[110, 290].map((x, i) => (
        <g key={x} transform={`translate(${x} 66)`}>
          <path d={`M-60 ${-18 + i * 2} Q0 ${-34 - i * 3} 60 ${-16 - i}`} stroke={shade(look.hat, -0.2)} strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d="M-48 0 Q0 -20 48 0 Q0 14 -48 0 Z" fill="#f2ebe0" />
          <g className={s.pupil}>
            <circle cx={12} cy={-2} r={11} fill="#3b2a1e" />
            <circle cx={12} cy={-2} r={5} fill="#0b0705" />
            <circle cx={15} cy={-5} r={2} fill="#fff" />
          </g>
          <path d="M-50 0 Q0 -22 50 0" stroke="#2a1a10" strokeWidth={4} fill="none" className={s.lid} />
          <path d="M-46 6 Q0 18 46 6" stroke={shade(look.skin, -0.3)} strokeWidth={2} fill="none" />
        </g>
      ))}
    </svg>
  );
}

/** Lighten (amt > 0) or darken a #rrggbb colour. */
export function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
