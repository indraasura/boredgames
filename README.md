# boredgames

Board games that run in your browser. No account, no backend, no database, nothing saved:
open a game and play. The site builds to static files (`output: "export"`).

| Game | State |
|---|---|
| **Milestones** (3D life-path game) | Play against 1-3 computers, or invite up to 3 friends. 4 maps, sound and music |
| **Grand Prix** (F1-style racing) | 40 real circuits, car physics, tyres, setup, weather. Free ride, vs computers, or friends |
| **Quick Draw** (wild west duel) | Wait for the call, ignore the fake-outs, shoot first. vs 5 outlaws, same keyboard, or a friend |
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

## Quick Draw

- **A duel:** two gunslingers face each other down a sunset street. After a wait, **DRAW!** appears: the first to press Space (or tap) wins the round. Pressing before the call, or within 100 ms of it (a guess), loses the round. First to 3.
- **Rounds vary:** plain, hair trigger (a short wait), the long wait, fake-outs (false calls like DRAT!, a crow, a breaking bottle, a bell), and a showdown at 2-2. Plans come from the seed, so both browsers in an online duel see the same tricks.
- **Opponents:** five outlaws from Dusty Pete (about 520 ms) to The Stranger (about 245 ms), each with a bounty; weaker ones flinch at fake-outs. Two players on one keyboard (A and L, or tap your half of the screen), or a friend by room code.
- **Online fairness:** each browser times its own player from the moment the call appears on its own screen, so lag does not decide who was faster. The host judges each round.
- Sound is synthesised (wind, a whistled theme, gunshots with a canyon echo). Bounty and best time last until the tab closes.
- URL options: `/games/quickdraw?outlaw=bart` (straight into a duel), `?local=1` (same keyboard).

## Layout

```
apps/web                  Next.js app (home page, game pages, 3D scene)
packages/engine           game contract + seeded RNG (pure TypeScript)
packages/milestones       rules, maps, content, bots, tests (pure TypeScript)
packages/f1               circuits, car physics, racing line, computer drivers, race rules (pure TypeScript)
packages/quickdraw        round plans, shot judging, outlaws, tests (pure TypeScript)
```

Rules are pure functions with no UI or I/O. Each game is a `GameDefinition` in `packages/engine`.
