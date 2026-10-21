"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_SETUP, DRIVER_NAMES, TEAMS, clampSetup, fillGrid, type AidLevel, type Entry, type RaceConfig } from "@boredgames/f1";
import { F1Controller, type Hud } from "@/lib/f1/controller";
import type { CameraMode } from "@/lib/f1/scene/F1Scene";
import { GuestNet, HostNet, fromLite, toLite, type ConfigLite, type F1Msg, type Net } from "@/lib/f1/net";
import { JoinFlow } from "../shared/Invite";
import { SetupPanel, TeamGrid, TyrePicker, suggestedCompound, type CarSel } from "./CarPicker";
import { CarPanel, Dash, Lights, Messages, Minimap, PauseCard, ResultsCard, Times, Tower, TopBar, TouchControls, WeatherChip } from "./Hud";
import Menu, { type StartConfig } from "./Menu";
import s from "./f1.module.css";

interface Run {
  config: RaceConfig;
  localId: string;
  net: Net | null;
  assist: AidLevel;
  fast: boolean;
  nonce: number;
}

type Screen = { k: "menu" } | { k: "join" } | { k: "play"; run: Run };

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

function readQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    track: q.get("track"),
    mode: q.get("mode"),
    laps: Number(q.get("laps")) || 0,
    ai: q.has("ai") ? Math.max(0, Math.min(19, Number(q.get("ai")))) : null,
    weather: q.get("weather"),
    fast: q.get("fast") === "1",
    // Attract mode, for demos and filming: the computer drives your car, with a chosen camera and no HUD.
    demo: q.get("demo") === "1",
    cam: q.get("cam"),
    hud: q.get("hud") !== "0",
    seed: q.has("seed") ? Number(q.get("seed")) >>> 0 : null,
  };
}

/** Where the people start on the grid: spread through the field, not on pole. */
function arrange(humans: Entry[], ai: Entry[], seed: number): Entry[] {
  const total = humans.length + ai.length;
  if (humans.length === 0) return ai;
  const slots = new Set<number>();
  humans.forEach((_, k) => {
    let slot = Math.min(total - 1, Math.round(total * (0.45 + (0.4 * k) / Math.max(1, humans.length))) + ((seed >> k) & 1));
    while (slots.has(slot)) slot = (slot + 1) % total;
    slots.add(slot);
  });
  const out: Entry[] = [];
  let h = 0;
  let a = 0;
  for (let i = 0; i < total; i++) out.push(slots.has(i) ? humans[h++]! : ai[a++]!);
  return out;
}

function makeRun(cfg: StartConfig, fast: boolean, net: Net | null, guests: { entry: Entry }[] = [], demo = false): Run {
  const seed = newSeed();
  const me: Entry = { id: "p0", name: cfg.name, team: cfg.car.team, setup: cfg.car.setup, compound: cfg.car.compound, human: !demo };
  const others = guests.map((g) => g.entry);
  const humans = [me, ...others];
  const grid = fillGrid(humans, humans.length + cfg.opponents, seed, cfg.weather);
  const ai = grid.slice(humans.length);
  const entries = cfg.mode === "free" ? [me] : arrange(humans, ai, seed);
  const config: RaceConfig = { mode: cfg.mode, track: cfg.track, laps: cfg.laps, weather: cfg.weather, difficulty: cfg.difficulty, entries, seed };
  return { config, localId: "p0", net, assist: cfg.assist, fast, nonce: 0 };
}

export default function F1Game() {
  const [query] = useState(readQuery);
  const nonce = useRef(0);
  const [screen, setScreen] = useState<Screen>(() => {
    if (query.track && query.mode) {
      // A direct link into a session, handy for demos and tests.
      const cfg: StartConfig = {
        mode: query.mode === "free" ? "free" : "race",
        track: query.track,
        laps: query.mode === "free" ? 0 : query.laps || 3,
        weather: (query.weather as StartConfig["weather"]) ?? "clear",
        difficulty: "medium",
        opponents: query.ai ?? 9,
        car: { team: TEAMS[0]!, compound: suggestedCompound((query.weather as StartConfig["weather"]) ?? "clear"), setup: { ...DEFAULT_SETUP } },
        name: "You",
        assist: "standard",
        friends: null,
        room: null,
      };
      return { k: "play", run: { ...makeRun(cfg, query.fast, null, [], query.demo), nonce: 1 } };
    }
    return { k: "menu" };
  });

  const toMenu = useCallback(() => {
    setScreen({ k: "menu" });
  }, []);

  const play = useCallback((run: Omit<Run, "nonce">) => setScreen({ k: "play", run: { ...run, nonce: ++nonce.current } }), []);

  const start = (cfg: StartConfig) => {
    if (cfg.friends && cfg.friends.length > 0) {
      const peers = cfg.friends.map((f, i) => ({ id: `p${i + 1}`, name: f.name, link: f.link }));
      const net = new HostNet(peers, cfg.room ?? undefined);
      const guests = cfg.friends.map((f, i) => {
        const r = f.ready as Partial<{ teamId: string; setup: CarSel["setup"]; compound: CarSel["compound"]; name: string }> | undefined;
        const team = TEAMS.find((t) => t.id === r?.teamId) ?? TEAMS[(i + 1) % TEAMS.length]!;
        const entry: Entry = {
          id: `p${i + 1}`,
          name: (r?.name ?? f.name).slice(0, 14),
          team,
          setup: clampSetup(r?.setup ?? DEFAULT_SETUP),
          compound: r?.compound ?? cfg.car.compound,
          human: false,
          remote: true,
        };
        return { entry };
      });
      const run = makeRun(cfg, query.fast, net, guests);
      sendStart(net, run.config);
      play(run);
      return;
    }
    play(makeRun(cfg, query.fast, null));
  };

  if (screen.k === "join") {
    return (
      <div className={s.page}>
        <div className={s.menu}>
          <header className={s.head}>
            <button type="button" className={s.back} onClick={toMenu}>
              ← Back
            </button>
            <div>
              <h1 className={s.title}>Join a race</h1>
            </div>
          </header>
          <JoinFlow<F1Msg>
            dark
            build={(link) => new GuestNet(link)}
            isStart={(m) => m.t === "start"}
            onBack={toMenu}
            onStart={(net, m) => {
              if (m.t === "start") play({ config: fromLite(m.cfg, m.you), localId: m.you, net, assist: "standard" as const, fast: false });
            }}
            connected={(net, name) => <GuestLobby net={net} name={name} />}
          />
        </div>
      </div>
    );
  }

  if (screen.k === "menu") return <Menu onStart={start} onJoin={() => setScreen({ k: "join" })} initial={{ track: query.track ?? undefined }} />;

  return (
    <Game
      key={screen.run.nonce}
      run={screen.run}
      onQuit={() => {
        screen.run.net?.close();
        toMenu();
      }}
      onAgain={(cfg) => {
        // The host starts a fresh race for everyone.
        const net = screen.run.net;
        if (net && net.role === "host") {
          const fresh: RaceConfig = { ...screen.run.config, seed: newSeed(), entries: screen.run.config.entries.map((e) => ({ ...e })) };
          sendStart(net, fresh);
          play({ ...screen.run, config: fresh });
        } else if (!net) {
          play({ ...screen.run, config: { ...screen.run.config, seed: newSeed(), entries: screen.run.config.entries.map((e) => ({ ...e })) } });
        }
        void cfg;
      }}
      onRestartFromHost={(msg) => {
        // A guest: the host started another race.
        if (msg.t === "start" && screen.run.net) play({ config: fromLite(msg.cfg, msg.you), localId: msg.you, net: screen.run.net, assist: screen.run.assist, fast: false });
      }}
    />
  );
}

/** Tell every guest the race is starting and which car is theirs. */
function sendStart(net: Net, config: RaceConfig) {
  if (net.role !== "host") return;
  const humansOnNet = new Set((net as HostNet).peers.map((p) => p.id));
  const cfg: ConfigLite = {
    mode: "race",
    track: config.track,
    laps: config.laps,
    weather: config.weather,
    difficulty: config.difficulty,
    seed: config.seed,
    entries: config.entries.map((e) => toLite(e, e.human || e.remote || humansOnNet.has(e.id) || e.id === "p0" ? "human" : "ai")),
  };
  for (const p of (net as HostNet).peers) (net as HostNet).sendTo(p.id, { t: "start", cfg, you: p.id });
}

/** What a friend does after connecting: choose a car and wait. */
function GuestLobby({ net, name }: { net: GuestNet; name: string }) {
  const [car, setCar] = useState<CarSel>({ team: TEAMS[Math.floor(Math.random() * TEAMS.length)]!, compound: "medium", setup: { ...DEFAULT_SETUP } });
  const [ready, setReady] = useState(false);
  const send = (c: CarSel) => net.send({ t: "ready", entry: { name, teamId: c.team.id, setup: c.setup, compound: c.compound } });
  useEffect(() => {
    send(car);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (next: CarSel) => {
    setCar(next);
    send(next);
  };
  return (
    <>
      <h2 className={s.h2}>Connected. Pick your car.</h2>
      <p className={s.note}>{ready ? "The host sees your choice and starts the race when everybody is ready." : "…"} The track and weather are the host&rsquo;s choice; the preview below uses a dry Silverstone.</p>
      <TeamGrid value={car.team} onChange={(team) => update({ ...car, team })} />
      <TyrePicker value={car.compound} onChange={(compound) => update({ ...car, compound })} weather="clear" />
      <SetupPanel car={car} onChange={(setup) => update({ ...car, setup })} trackId="gb-1948" weather="clear" />
    </>
  );
}

function Game({ run, onQuit, onAgain, onRestartFromHost }: { run: Run; onQuit(): void; onAgain(cfg: RaceConfig): void; onRestartFromHost(m: F1Msg): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctl, setCtl] = useState<F1Controller | null>(null);
  const [error, setError] = useState(false);
  const net = run.net;
  const isGuest = net?.role === "guest";
  const [showHud] = useState(() => new URLSearchParams(window.location.search).get("hud") !== "0");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let c: F1Controller | null = null;
    try {
      c = new F1Controller(run.config, {
        localId: run.localId,
        net,
        assist: run.assist,
        fast: run.fast,
        quality: window.devicePixelRatio > 2 || window.innerWidth < 700 ? "low" : "high",
        camera: (new URLSearchParams(window.location.search).get("cam") as CameraMode | null) ?? undefined,
      });
      c.attach(canvas);
      setCtl(c);
    } catch (e) {
      console.error(e);
      setError(true);
      c?.dispose();
      return;
    }
    return () => {
      c?.dispose();
    };
  }, [run, net]);

  // Friends leaving, and the host starting again.
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (!net || !ctl) return;
    net.onLeave((id) => {
      if (id === "p0") setLost(true);
      else ctl.takeOver(id);
    });
    const off = net.subscribe((m) => {
      if (m.t === "start") onRestartFromHost(m);
    });
    return off;
  }, [net, ctl, onRestartFromHost]);

  const empty = useMemo(() => ({}) as Hud, []);
  const hud = useSyncExternalStore(ctl ? ctl.subscribe : noSub, ctl ? ctl.getSnapshot : () => empty, ctl ? ctl.getSnapshot : () => empty);

  return (
    <div className={s.root}>
      <canvas ref={canvasRef} className={s.canvas} role="img" aria-label="The race, seen from behind the car" />
      {ctl && hud.standings && showHud && (
        <>
          <Tower hud={hud} />
          <TopBar hud={hud} />
          <div className={s.topRight}>
            <WeatherChip hud={hud} />
            <Minimap ctl={ctl} />
          </div>
          <Lights hud={hud} />
          <Messages hud={hud} />
          {hud.wrongWay && <div className={s.wrong}>WRONG WAY</div>}
          <Dash hud={hud} />
          <CarPanel hud={hud} ctl={ctl} />
          <Times hud={hud} ctl={ctl} />
          <TouchControls ctl={ctl} />
          <PauseCard hud={hud} ctl={ctl} online={!!net} onQuit={onQuit} />
          <ResultsCard hud={hud} onAgain={isGuest ? undefined : () => onAgain(run.config)} onQuit={onQuit} />
        </>
      )}
      {lost && (
        <div className={s.overlay}>
          <div className={s.card}>
            <h2 className={s.cardTitle}>The host left</h2>
            <p className={s.note}>The race can&rsquo;t continue without them.</p>
            <div className={s.actions}>
              <button type="button" className={s.start} style={{ height: 46, fontSize: 16 }} onClick={onQuit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}
      {!ctl && (
        <div className={s.loading}>{error ? "This browser can’t run 3D graphics (WebGL)." : "Loading…"}</div>
      )}
    </div>
  );
}

const noSub = () => () => {};
void DRIVER_NAMES;
