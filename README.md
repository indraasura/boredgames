# idleminds

Games for idle minds: board games that run in your browser. No account, no backend, no database, nothing saved:
open a game and play. The site builds to static files (`output: "export"`).

| Game | State |
|---|---|
| **Milestones** (3D life-path game) | Play against 1-3 computers, or invite up to 3 friends. 4 maps, sound and music |
| **Tri-D Chess** (Star Trek 3D chess) | Three stacked boards plus four sliding attack boards. Computer (3 levels), same screen, or a friend by room code |
| **Bot Brawl** (build a robot, then fight) | 90-point parts budget and a build timer, then a steel-cage fight. Computer, same keyboard, or a friend by room code (the host runs the fight) |
| **Last Round** (first-person boxing) | Three rounds against the computer: jab, cross, hook, uppercut, guard, slip, duck, knockdowns |

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

## New games

- **Tri-D Chess** (`packages/tridchess`): house rules inspired by the Star Trek game, not the official tournament rules. 4 files x 8 ranks x 3 levels; rooks, bishops, knights and kings move in 3D; pawns step forward a rank or up a level; an attack board can slide one level, with its pieces, as your whole move.
- **Bot Brawl** (`packages/botbrawl`): the fight is a small 2D rigid-body simulation of circular parts. Disconnected parts fall off, the core dying is a knockout, 90 s then the judges decide. Online play is host-authoritative: the guest sends controls and receives snapshots.
- **Last Round** (`packages/boxing`): fixed-step fight rules with rounds, stamina, blocks, slips, knockdowns and a computer boxer with three levels. The 3D opponent is built from primitives with two-bone IK arms.

## Design

- **Site (current):** a cobalt "lobby" with flat colour, thick ink outlines and hard shadows; Bricolage Grotesque for type. Tokens (`--night`, `--cobalt`, `--lemon`, ...) and the `.arcade` scope are in `apps/web/app/globals.css`. Games are listed in `apps/web/lib/games.ts`, which feeds the shelf and its filters. Play pages share `components/shared/arcade.module.css`.
- **Milestones keeps its earlier paper-and-ink look** (below) and has not been restyled.

- **Site:** editorial. Instrument Serif for display type, Inter Tight for interface text, warm paper (`#f3f0e8`) and ink (`#161512`) with one accent (`#e4572e`). Tokens live in `apps/web/app/globals.css`.
- **Milestones:** the same tokens. One line-icon set (`apps/web/lib/milestones/icons.ts`) draws both the interface and the icons on the board's tiles and signs, so there is no emoji anywhere in the game.
- Map artwork in `apps/web/public/media` is captured from the game itself.

## Layout

```
apps/web                  Next.js app (home page, game pages, 3D scene)
packages/engine           game contract + seeded RNG (pure TypeScript)
packages/milestones       rules, maps, content, bots, tests (pure TypeScript)
packages/tridchess        3D chess rules, computer player, tests
packages/botbrawl         robot parts, build rules, fight simulation, computer driver, tests
packages/boxing           boxing rules, computer boxer, tests
```

Rules are pure functions with no UI or I/O. Each game is a `GameDefinition` in `packages/engine`.
