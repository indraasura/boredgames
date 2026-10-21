# boredgames: plan

## Principle

Play games when you are bored. No accounts, no server, no database, no saved progress. Everything runs in the
browser and the site is static files that any file host can serve.

Consequences:
- No levels, XP, unlocks, ratings, leaderboards or match history. Every game starts fresh.
- Opponents are computers, or friends connected browser to browser over WebRTC. There are no hosted rooms, matchmaking or accounts.
- Nothing is written to localStorage or cookies. Settings such as sound last for the tab.
- A game that needs a shareable setup uses the URL (for example `?map=&seed=`), not stored data.

## Architecture

- `packages/engine`: `GameDefinition` contract (setup, legalMoves, validate, apply, view, outcome, botMove) and a seeded RNG. Pure and deterministic.
- `packages/<game>`: one package of pure rules per game, with tests.
- `apps/web`: Next.js, statically exported. Each game is a route that loads its renderer on demand (three.js for Milestones).

## Playing with friends

The host opens a room and gets a 6 digit code; friends type it to join. Game data goes browser to browser over WebRTC. We run no server, but two free public services help: the PeerJS broker (introduces the two browsers by room code, never sees game traffic) and a public STUN server (Google, for finding a route through home routers). If either is down, rooms cannot be opened. Connections that need a relay (strict corporate networks) will fail. Code: `apps/web/lib/p2p.ts`; per-game messages in `lib/milestones/net.ts` and `lib/f1/net.ts`.

Milestones: the host runs the computer players and relays moves; every browser applies the same moves to the same seeded game. Grand Prix: every browser simulates its own car and streams it; the host runs the computer cars.

## Games

- **Milestones** (done): spin, drive a 3D map, a few choices, retire richest. 4 maps, 3 bot skill levels, synthesised sound.
- **Grand Prix** (done): real-time racing on 40 circuits; physics and race rules in `packages/f1`, 3D in `apps/web/lib/f1`. Friends connect browser to browser; each browser simulates its own car and streams it, the host runs the computer cars.
- **Banners** (done): medieval strategy for 2-4 houses; pure rules in `packages/banners`, an SVG war map in `apps/web/components/banners`. Same move-relay networking as Milestones.
- **Mancala**, **Pachisi**, **Depth Charge**: not started. Each is a new `packages/<game>` plus a route.
