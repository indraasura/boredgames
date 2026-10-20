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

No signalling server: the invite link carries the WebRTC offer (compressed, in the URL hash) and the friend sends back an answer code. The host runs the computer players and relays moves; every browser applies the same moves to the same seeded game, so state stays identical. The only outside service is a public STUN server (Google) so browsers behind home routers can find each other. Connections that need a relay (strict corporate networks) will fail. Code: `apps/web/lib/milestones/net.ts`.

## Games

- **Milestones** (done): spin, drive a 3D map, a few choices, retire richest. 4 maps, 3 bot skill levels, synthesised sound.
- **Mancala**, **Pachisi**, **Depth Charge**: not started. Each is a new `packages/<game>` plus a route.
