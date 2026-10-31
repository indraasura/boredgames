# idleminds

Games for idle minds: board games that run in your browser. No account, no backend, no database, nothing saved:
open a game and play. The site builds to static files (`output: "export"`).

| Game | State |
|---|---|
| **Milestones** (3D life-path game) | Play against 1-3 computers, or invite up to 3 friends. 4 maps, sound and music |

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # rules tests
pnpm typecheck
pnpm build        # static site in apps/web/out
```

URL options on the game page (when `map` is set the lobby is skipped):
`?map=alpine-valley`, `&bots=2&skill=medium`, `&seed=123` (same shuffle), `&fast=1` (skip most animation waits, for tests).

## Milestones

- Spin, drive, and make about nine choices a game: your road, your job, crossroads, your home, and whether to put cash in the **Growth Fund** (grows 4% every round, paid out at the end). Paydays, cards, bills, babies and the wedding happen on their own.
- About 100-125 tiles to retirement, roughly 20 turns each. Most money at the end wins.
- Four maps, all open: Sunny Isle, Alpine Valley, Neon Metropolis, Dune Kingdom.
- Every tile type has its own colour and icon. Hover a tile, or open the tile guide, to see what it does.
- **Friends:** "Host friends" opens a room with a 6 digit code. Friends choose "Join with code" and type it. The browsers then talk directly to each other (WebRTC). Computers can fill the other seats. If a friend leaves, the computer takes their seat; if the host leaves, the game ends.
- Sound is synthesised in the browser (Web Audio). Sound settings last until you close the tab.

## Design

- **Site:** editorial. Instrument Serif for display type, Inter Tight for interface text, warm paper (`#f3f0e8`) and ink (`#161512`) with one accent (`#e4572e`). Tokens live in `apps/web/app/globals.css`.
- **Milestones:** the same tokens. One line-icon set (`apps/web/lib/milestones/icons.ts`) draws both the interface and the icons on the board's tiles and signs, so there is no emoji anywhere in the game.
- Map artwork in `apps/web/public/media` is captured from the game itself.

## Layout

```
apps/web                  Next.js app (home page, game pages, 3D scene)
packages/engine           game contract + seeded RNG (pure TypeScript)
packages/milestones       rules, maps, content, bots, tests (pure TypeScript)
```

Rules are pure functions with no UI or I/O. Each game is a `GameDefinition` in `packages/engine`.
