"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BotLevel } from "@boredgames/engine";
import { DEFAULT_MAP, getMap } from "@boredgames/milestones";
import { audio } from "@/lib/milestones/audio";
import { MilestonesController, type Seat } from "@/lib/milestones/controller";
import { GuestNet, HostNet, type Net, type SeatInfo } from "@/lib/milestones/net";
import { WorldScene, type HoverInfo } from "@/lib/milestones/scene/WorldScene";
import { THEMES } from "@/lib/milestones/scene/themes";
import { Players, Spinner, StatusLine, TileGuide, TileTip, TitleBlock, ToastView } from "./Hud";
import Lobby, { type Session } from "./Lobby";
import Room, { type Guest } from "./Room";
import { ChoiceSheet, ResultsDialog } from "./Sheets";
import { JoinFlow } from "../shared/Invite";
import r from "../shared/invite.module.css";
import l from "./lobby.module.css";
import m from "./milestones.module.css";

const CAR_COLORS = ["#E86F51", "#4F7CC3", "#3DA774", "#9B6BD6"];
const BOT_NAMES = ["Mira", "Otto", "Juno"];

interface Match {
  map: string;
  seats: Seat[];
  seed: number;
  fast: boolean;
  nonce: number;
  /** Set when friends are playing. */
  net: Net | null;
}

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

function soloSeats(bots: number, level: BotLevel): Seat[] {
  return [
    { id: "p0", name: "You", color: CAR_COLORS[0]! },
    ...Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, name: BOT_NAMES[i]!, color: CAR_COLORS[i + 1]!, bot: level })),
  ];
}

/** URL options, handy for demos and tests: ?map=&bots=&skill=&seed=&fast=1. */
function readQuery() {
  const q = new URLSearchParams(window.location.search);
  const skill = q.get("skill");
  return {
    map: q.get("map"),
    bots: Math.max(1, Math.min(3, Number(q.get("bots")) || 1)),
    skill: (skill === "easy" || skill === "medium" || skill === "hard" ? skill : "hard") as BotLevel,
    seed: q.has("seed") ? Number(q.get("seed")) >>> 0 : null,
    fast: q.get("fast") === "1",
  };
}

type Screen = { k: "lobby" } | { k: "room"; map: string } | { k: "join" } | { k: "play"; match: Match };

export default function MilestonesGame() {
  const [query] = useState(readQuery);
  const [screen, setScreen] = useState<Screen>(() => {
    if (!query.map) return { k: "lobby" };
    const def = getMap(query.map);
    return { k: "play", match: { map: def.id, seats: soloSeats(query.bots, query.skill), seed: query.seed ?? newSeed(), fast: query.fast, nonce: 1, net: null } };
  });
  const nonce = useRef(1);

  const play = useCallback((match: Omit<Match, "nonce">) => {
    setScreen({ k: "play", match: { ...match, nonce: ++nonce.current } });
  }, []);

  const toLobby = useCallback(() => {
    audio.startMusic("menu");
    setScreen({ k: "lobby" });
  }, []);

  if (screen.k === "join") {
    return (
      <div className={l.lobby}>
        <div className={l.inner}>
          <header className={l.head}>
            <button type="button" className={l.back} onClick={toLobby}>
              ← Back
            </button>
            <div className={l.titles}>
              <h1 className={l.title}>Join a game</h1>
            </div>
          </header>
          <JoinFlow
            build={(link) => new GuestNet(link)}
            isStart={(msg) => msg.t === "start"}
            onBack={toLobby}
            onStart={(net, start) => {
              if (start.t === "start") play({ map: start.map, seats: start.seats, seed: start.seed, fast: start.fast, net });
            }}
          />
        </div>
      </div>
    );
  }

  if (screen.k === "room") {
    const def = getMap(screen.map);
    return (
      <Room
        mapName={def.name}
        onBack={toLobby}
        onStart={({ name, guests, room, bots, level }: { name: string; guests: Guest[]; room: { close(): void } | null; bots: number; level: BotLevel }) => {
          const seats: Seat[] = [
            { id: "p0", name, color: CAR_COLORS[0]! },
            ...guests.map((g, i) => ({ id: `p${i + 1}`, name: g.name, color: CAR_COLORS[i + 1]! })),
            ...Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, name: BOT_NAMES[i]!, color: CAR_COLORS[guests.length + i + 1]!, bot: level })),
          ];
          const net = new HostNet(guests.map((g, i) => ({ id: `p${i + 1}`, name: g.name, link: g.link })), room ?? undefined);
          const seed = newSeed();
          const info: SeatInfo[] = seats.map((s) => ({ ...s }));
          guests.forEach((g, i) => g.link.send({ t: "start", seats: info, map: def.id, seed, you: `p${i + 1}`, fast: query.fast }));
          play({ map: def.id, seats, seed, fast: query.fast, net });
        }}
      />
    );
  }

  if (screen.k === "lobby") {
    return (
      <Lobby
        initialMap={DEFAULT_MAP}
        initialBots={1}
        initialLevel="hard"
        onFriends={(map) => setScreen({ k: "room", map })}
        onJoin={() => setScreen({ k: "join" })}
        onStart={(cfg: Omit<Session, "seed" | "fast">) => play({ map: cfg.map, seats: soloSeats(cfg.bots, cfg.level), seed: newSeed(), fast: query.fast, net: null })}
      />
    );
  }

  return (
    <Game
      key={screen.match.nonce}
      match={screen.match}
      onMenu={() => {
        screen.match.net?.close();
        toLobby();
      }}
    />
  );
}

function Game({ match, onMenu }: { match: Match; onMenu(): void }) {
  const { net } = match;
  const def = getMap(match.map);
  const theme = THEMES[def.theme];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const [seats] = useState(() => match.seats.map((s) => ({ ...s })));
  const [ctl] = useState(
    () =>
      new MilestonesController(seats, match.seed, match.map, {
        fast: match.fast,
        localId: net?.localId,
        guest: net?.role === "guest",
        send: net ? (msg) => net.send(msg) : undefined,
      }),
  );
  const view = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  const prefs = useSyncExternalStore(audio.subscribe, audio.getPrefs, audio.getPrefs);
  const [overview, setOverview] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [notice, setNotice] = useState<{ text: string; leave: boolean } | null>(null);
  const isGuest = net?.role === "guest";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: WorldScene;
    try {
      scene = new WorldScene(canvas, match.map, seats.map((x) => x.color), { fast: match.fast, onHover: setHover });
    } catch (e) {
      console.error(e);
      setStatus("error");
      return;
    }
    sceneRef.current = scene;
    ctl.attach(scene);
    setStatus("ready");
    audio.unlock();
    audio.startMusic(theme.music);
    return () => {
      ctl.dispose();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [ctl, seats, match.map, match.fast, theme.music]);

  // Moves and restarts from the other players.
  useEffect(() => {
    if (!net) return;
    net.onLeave((id) => {
      if (id === "p0") {
        setNotice({ text: "The host left the game.", leave: true });
        return;
      }
      const seat = seats.find((s) => s.id === id);
      setNotice({ text: `${seat?.name ?? "A friend"} left. The computer plays their seat now.`, leave: false });
      ctl.takeOver(id);
    });
    return net.subscribe((msg) => {
      if (msg.t === "move") ctl.receive(msg.id, msg.move);
      else if (msg.t === "restart") ctl.restart(msg.seed);
    });
  }, [net, ctl, seats]);

  const restart = useCallback(() => {
    const seed = newSeed();
    net?.send({ t: "restart", seed });
    ctl.restart(seed);
  }, [net, ctl]);

  const over = view.game.phase === "over";
  useEffect(() => {
    sceneRef.current?.setFocus(overview || over ? "overview" : view.focus);
  }, [overview, over, view.focus, status]);

  const myTurn = view.game.players[view.game.turn]!.id === view.localId;
  const canSpin = status === "ready" && myTurn && !view.busy && view.game.phase === "spin";

  // Keyboard: space or enter spins.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canSpin || e.repeat) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        ctl.spin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSpin, ctl]);

  return (
    <div className={m.root} data-night={theme.night} style={{ background: theme.sky }}>
      <canvas ref={canvasRef} className={m.canvas} role="img" aria-label={`${def.name}: a road of coloured tiles with toy cars`} />

      <TitleBlock
        mapName={def.name}
        overview={overview}
        prefs={prefs}
        onToggle={() => setOverview((o) => !o)}
        onRestart={isGuest ? undefined : restart}
        onMenu={onMenu}
      />
      <TileGuide mapId={match.map} />
      {/* On desktop the dock is transparent (display: contents); on phones it stacks these at the bottom. */}
      <div className={m.dock}>
        <Players view={view} />
        <div className={m.centerDock}>
          <StatusLine text={view.message} />
        </div>
        <Spinner view={view} canSpin={canSpin} onSpin={() => ctl.spin()} />
      </div>
      <ToastView toast={view.toast} />
      {hover && <TileTip mapId={match.map} node={hover.node} x={hover.x} y={hover.y} />}
      <ChoiceSheet view={view} onPick={(index) => ctl.play({ type: "choose", index })} />
      <ResultsDialog view={view} onAgain={isGuest ? undefined : restart} onMenu={onMenu} />

      {notice && (
        <div className={r.notice} role="status">
          {notice.text}
          <button type="button" onClick={notice.leave ? onMenu : () => setNotice(null)}>
            {notice.leave ? "Leave" : "OK"}
          </button>
        </div>
      )}

      {status !== "ready" && (
        <div className={m.loading}>
          <span className={`${m.loadingPill} ${m.glass}`}>
            {status === "error" ? "This browser can’t run 3D graphics (WebGL)." : "Loading…"}
          </span>
        </div>
      )}
    </div>
  );
}
