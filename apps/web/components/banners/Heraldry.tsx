import { HOUSES, type HouseId } from "@boredgames/banners";

/** Each house bears a simple, old-fashioned arms: one bold ordinary on a coloured field. */
const ORDINARY: Record<HouseId, (c: string) => React.ReactNode> = {
  // a chevron
  varn: (c) => <path d="M-30 18 L0 -14 L30 18 L30 30 L0 -2 L-30 30 Z" fill={c} />,
  // a bend, top-left to bottom-right
  aldmoor: (c) => <path d="M-40 -34 L-24 -40 L40 30 L40 44 L24 48 L-40 -18 Z" fill={c} />,
  // a cross
  brennic: (c) => <path d="M-7 -40 H7 V-10 H40 V4 H7 V50 H-7 V4 H-40 V-10 H-7 Z" fill={c} />,
  // a saltire
  corvain: (c) => <path d="M-40 -32 L-30 -40 L0 -10 L30 -40 L40 -32 L10 -2 L40 30 L30 40 L0 8 L-30 40 L-40 30 L-10 -2 Z" fill={c} />,
};

const SHIELD = "M-36 -40 H36 V0 C36 26 18 40 0 48 C-18 40 -36 26 -36 0 Z";

export function ShieldArt({ house, neutral }: { house: HouseId | null; neutral?: boolean }) {
  const id = `sh-${house ?? "n"}`;
  if (!house || neutral) {
    return (
      <g>
        <path d={SHIELD} fill="#9c9483" stroke="#2b1d12" strokeWidth={3} />
        <path d="M-36 -10 H36" stroke="#6f6758" strokeWidth={6} />
      </g>
    );
  }
  const h = HOUSES[house];
  return (
    <g>
      <clipPath id={id}>
        <path d={SHIELD} />
      </clipPath>
      <path d={SHIELD} fill={h.color} />
      <g clipPath={`url(#${id})`}>{ORDINARY[house](h.charge)}</g>
      <path d={SHIELD} fill="none" stroke="#2b1d12" strokeWidth={3.5} />
      <path d="M-30 -34 H30 V0 C30 21 15 33 0 40" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
    </g>
  );
}

export function Shield({ house, size = 44, title }: { house: HouseId | null; size?: number; title?: string }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="-42 -46 84 98" role="img" aria-label={title ?? (house ? HOUSES[house].name : "Unclaimed")}>
      <ShieldArt house={house} />
    </svg>
  );
}
