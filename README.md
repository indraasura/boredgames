# boredgames

Board games that run in your browser. No account, no backend, no database, nothing saved:
open a game and play. The site builds to static files (`output: "export"`).

| Game | State |
|---|---|
| **Milestones** (3D life-path game) | Play against 1-3 computers, or invite up to 3 friends. 4 maps, sound and music |
| **Grand Prix** (F1-style racing) | 40 real circuits, car physics, tyres, setup, weather. Free ride, vs computers, or friends |
| **Banners** (medieval strategy) | 2-4 houses build armies, forge and break alliances, and fight for 7 crowns. vs computers or friends |
| Mancala, Pachisi, Depth Charge | Not built yet |

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

## Grand Prix

- **Circuits:** 40, from real centre-line data (MIT, github.com/bacinger/f1-circuits), smoothed and scaled to the official lap length. Elevation is not modelled.
- **Physics** (`packages/f1`): four-wheel car with load transfer, downforce, tyre grip that depends on load, temperature, wear and wetness, a friction circle at each tyre, an 8-speed gearbox, hybrid boost, DRS and fuel weight, stepped at 120 Hz. 0-100 km/h in about 2.2 s, about 330 km/h top speed, 5 g cornering at 250 km/h.
- **Choose:** circuit, car (ten made-up teams), tyres (soft, medium, hard, intermediate, wet), nine setup sliders, weather (sunny to storm, or changing), laps and computer skill. Every choice has a random button.
- **Computer drivers** follow a computed racing line and a speed plan from the same physics, make room in traffic, and pit for tyres when it rains or they wear out.
- **Friends:** same room-code flow as Milestones. Each browser simulates its own car and sends it 30 times a second; the host drives the computer cars.
- URL options: `/games/f1?track=it-1922&mode=race&laps=3&ai=9&weather=rain` (`mode=free` for free ride, `fast=1` for tests).

## Banners

- **The realm:** 26 provinces on one continent (Voronoi cells clipped to a hand-drawn coast, built by `packages/banners/scripts/gen-map.mjs`). Seven are crown cities: four capitals and three in the heartland.
- **A turn:** collect gold (provinces plus a royal levy; autumn pays half again), raise troops at castles and crown cities (at most 3 a turn), march. Footmen 2g, archers 3g (+1 defending), knights 4g (+1 attacking, ride two provinces). Castles cost 6g: a third defence die, and a place to raise troops.
- **Battle:** Risk-style dice, fought out automatically; ties go to the defender; hills and an allied army next door help defenders; an attack falls back after losing two thirds.
- **Diplomacy:** envoys, one ally at a time, gifts of gold, and betrayal (costs prestige, and the other house will not trust you for 3 rounds).
- **Winning:** 4 crowns alone or 5 with an ally at the end of a round; otherwise the best score after 8, 12 or 16 rounds.
- **Tidings each round:** harvests, sellswords, storms that close a province, plague.
- Computer lords plan converging attacks, defend threatened strongholds, and court, keep and betray allies. Balance is checked by bot-only wars in the tests.
- URL options: `/games/banners?houses=4&skill=hard` (add `watch=1` to let the computer play your house, `fast=1` to hurry).

## Layout

```
apps/web                  Next.js app (home page, game pages, 3D scene)
packages/engine           game contract + seeded RNG (pure TypeScript)
packages/milestones       rules, maps, content, bots, tests (pure TypeScript)
packages/f1               circuits, car physics, racing line, computer drivers, race rules (pure TypeScript)
packages/banners          realm map, war rules, computer lords, tests (pure TypeScript)
```

Rules are pure functions with no UI or I/O. Each game is a `GameDefinition` in `packages/engine`.
