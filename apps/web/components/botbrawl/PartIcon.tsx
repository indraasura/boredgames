import type { PartKind } from "@boredgames/botbrawl";

/** A flat icon for each part. Drawn facing up; `dir` turns it in quarter turns. */
export function PartIcon({ kind, dir = 0, color = "#4cc9f0", size = 40 }: { kind: PartKind; dir?: number; color?: string; size?: number }) {
  const dark = "#17142a";
  const steel = "#c9c6e2";
  let body: React.ReactNode;
  switch (kind) {
    case "core":
      body = (
        <>
          <rect x="5" y="5" width="22" height="22" rx="5" fill={color} stroke={dark} strokeWidth="2.5" />
          <circle cx="16" cy="16" r="5" fill="#fff" stroke={dark} strokeWidth="2" />
        </>
      );
      break;
    case "hull":
      body = <rect x="4" y="4" width="24" height="24" rx="4" fill={color} stroke={dark} strokeWidth="2.5" />;
      break;
    case "armor":
      body = (
        <>
          <rect x="3" y="3" width="26" height="26" rx="3" fill={color} stroke={dark} strokeWidth="2.5" />
          <path d="M8 12h16M8 20h16" stroke={dark} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
      break;
    case "wheel":
      body = (
        <>
          <rect x="9" y="2" width="14" height="28" rx="4" fill={dark} />
          <path d="M9 9h14M9 16h14M9 23h14" stroke={steel} strokeWidth="2" />
          <rect x="13" y="12" width="6" height="8" rx="2" fill={color} />
        </>
      );
      break;
    case "spinner":
      body = (
        <>
          <path d="M16 2l3 7 7-3-3 7 7 3-7 3 3 7-7-3-3 7-3-7-7 3 3-7-7-3 7-3-3-7 7 3z" fill={steel} stroke={dark} strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="16" cy="16" r="4" fill={color} stroke={dark} strokeWidth="2" />
        </>
      );
      break;
    case "spike":
      body = (
        <>
          <rect x="8" y="18" width="16" height="11" rx="3" fill={color} stroke={dark} strokeWidth="2.5" />
          <path d="M16 2l7 17H9z" fill={steel} stroke={dark} strokeWidth="2.5" strokeLinejoin="round" />
        </>
      );
      break;
    case "hammer":
      body = (
        <>
          <rect x="8" y="20" width="16" height="9" rx="3" fill={color} stroke={dark} strokeWidth="2.5" />
          <rect x="14" y="8" width="4" height="13" fill={steel} stroke={dark} strokeWidth="2" />
          <rect x="6" y="2" width="20" height="9" rx="2" fill={dark} />
        </>
      );
      break;
    case "flipper":
      body = (
        <>
          <rect x="8" y="20" width="16" height="9" rx="3" fill={color} stroke={dark} strokeWidth="2.5" />
          <path d="M4 18L16 3l12 15z" fill={steel} stroke={dark} strokeWidth="2.5" strokeLinejoin="round" />
        </>
      );
      break;
    case "booster":
      body = (
        <>
          <path d="M10 4h12l-2 16H12z" fill={steel} stroke={dark} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M12 22h8l-4 8z" fill="#ff9a3d" stroke={dark} strokeWidth="2" strokeLinejoin="round" />
          <rect x="11" y="4" width="10" height="4" fill={color} />
        </>
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ transform: `rotate(${dir * 90}deg)`, display: "block" }}>
      {body}
    </svg>
  );
}
