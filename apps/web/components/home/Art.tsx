import type { ArtId } from "@/lib/games";

const INK = "#0e0c1f";

/** Little flat illustrations for each game's tile. They move a bit when the tile is hovered. */
export function Art({ id }: { id: ArtId }) {
  switch (id) {
    case "milestones":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/media/sunny-isle.jpg" alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      );
    case "chess":
      return (
        <svg viewBox="0 0 320 200" width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="200" fill="#6a4ff0" />
          <g stroke={INK} strokeWidth="4" strokeLinejoin="round">
            <g className="lvl3">
              <path d="M160 18 L252 62 L160 106 L68 62Z" fill="#c9bcff" />
              <path d="M160 62 L206 40 L252 62 L206 84Z M114 40 L160 18 L206 40 L160 62Z M68 62 L114 40 L160 62 L114 84Z" fill="#ffffff" opacity="0.55" />
            </g>
            <g className="lvl2">
              <path d="M160 60 L252 104 L160 148 L68 104Z" fill="#7fd6ff" />
              <path d="M160 104 L206 82 L252 104 L206 126Z M114 82 L160 60 L206 82 L160 104Z M68 104 L114 82 L160 104 L114 126Z" fill="#ffffff" opacity="0.4" />
            </g>
            <g className="lvl1">
              <path d="M160 102 L252 146 L160 190 L68 146Z" fill="#ffd23f" />
              <path d="M160 146 L206 124 L252 146 L206 168Z M114 124 L160 102 L206 124 L160 146Z M68 146 L114 124 L160 146 L114 168Z" fill="#ffffff" opacity="0.5" />
            </g>
            <g className="piece">
              <ellipse cx="160" cy="52" rx="16" ry="6" fill={INK} stroke="none" opacity="0.25" />
              <path d="M146 54 Q148 40 154 36 Q148 32 160 24 Q172 32 166 36 Q172 40 174 54Z" fill="#fff" />
              <circle cx="160" cy="22" r="8" fill="#fff" />
            </g>
          </g>
        </svg>
      );
    case "brawl":
      return (
        <svg viewBox="0 0 320 200" width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="200" fill="#1fb97e" />
          <g stroke={INK} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
            <rect x="14" y="14" width="292" height="172" rx="14" fill="#2b2745" />
            <path d="M14 14 L306 186 M306 14 L14 186" stroke="#ffffff" strokeOpacity="0.07" />
            {[44, 84, 124, 164, 204, 244, 284].map((x) => (
              <path key={x} d={`M${x} 14 V186`} stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" />
            ))}
            <g className="bot1">
              <rect x="52" y="74" width="68" height="52" rx="8" fill="#4cc9f0" />
              <rect x="64" y="64" width="16" height="12" rx="3" fill={INK} />
              <rect x="64" y="124" width="16" height="12" rx="3" fill={INK} />
              <rect x="94" y="64" width="16" height="12" rx="3" fill={INK} />
              <rect x="94" y="124" width="16" height="12" rx="3" fill={INK} />
              <circle cx="84" cy="100" r="9" fill="#fff" />
              <g className="gear" style={{ transformOrigin: "136px 100px" }}>
                <circle cx="136" cy="100" r="19" fill="#d9d6ef" />
                <path d="M136 76 L141 90 L156 86 L148 100 L156 114 L141 110 L136 124 L131 110 L116 114 L124 100 L116 86 L131 90Z" fill="#fff" />
                <circle cx="136" cy="100" r="5" fill={INK} />
              </g>
            </g>
            <g className="bot2">
              <rect x="206" y="82" width="58" height="44" rx="8" fill="#ff5a36" />
              <rect x="216" y="74" width="14" height="10" rx="3" fill={INK} />
              <rect x="216" y="124" width="14" height="10" rx="3" fill={INK} />
              <path d="M206 94 L186 100 L206 108Z" fill="#d9d6ef" />
              <circle cx="238" cy="104" r="8" fill="#ffd23f" />
            </g>
            <g className="sparks" stroke="#ffd23f" strokeWidth="4">
              <path d="M176 70 l-8 -12 M186 72 l2 -14 M180 134 l-10 10 M192 132 l4 14" />
            </g>
          </g>
        </svg>
      );
    case "boxing":
      return (
        <svg viewBox="0 0 320 200" width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="200" fill="#ff5a36" />
          <g stroke={INK} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
            {[18, 56, 96, 134, 172].map((y) => (
              <path key={y} d={`M-10 ${y} H330`} stroke="#ffffff" strokeOpacity="0.18" strokeWidth="10" />
            ))}
            <g className="glove">
              <g transform="rotate(-14 170 100)">
                <path d="M96 68 H214 Q256 68 258 108 Q258 146 214 146 H96Z" fill="#2f6fe0" />
                <path d="M120 120 Q150 138 200 130" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="6" />
                <path d="M196 62 Q226 30 252 56 Q262 76 236 84" fill="#2f6fe0" />
                <rect x="40" y="64" width="62" height="86" rx="10" fill="#f7f0de" />
                <path d="M62 64 V150 M82 64 V150" stroke={INK} strokeOpacity="0.25" strokeWidth="3" />
              </g>
            </g>
            <g className="lines" stroke="#fff" strokeWidth="5">
              <path d="M262 60 H300 M270 100 H312 M262 140 H300" />
            </g>
          </g>
        </svg>
      );
  }
}
