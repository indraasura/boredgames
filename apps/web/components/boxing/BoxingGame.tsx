"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { ROUNDS, ROUND_TIME, aiControls, createFight, downNeeded, noControls, step, type Controls, type Fight, type Punch } from "@boredgames/boxing";
import { BoxingScene } from "@/lib/boxing/scene";
import { BoxingSfx } from "@/lib/boxing/audio";
import a from "../shared/arcade.module.css";
import x from "./boxing.module.css";

interface Hud {
  phase: Fight["phase"];
  round: number;
  clock: number;
  hp: [number, number];
  stamina: number;
  down: [number | null, number | null];
  presses: number;
  need: number;
  count: number;
  banner: string;
}

const initial: Hud = { phase: "ready", round: 1, clock: 3, hp: [100, 100], stamina: 100, down: [null, null], presses: 0, need: 7, count: 0, banner: "" };

export default function BoxingGame() {
  const [level, setLevel] = useState<BotLevel | null>(null);
  if (!level)
    return (
      <main className={`${a.stage} arcade`}>
        <header className={a.top}>
          <Link href="/" className={a.back}>
            <span aria-hidden>←</span> All games
          </Link>
        </header>
        <div className={a.menu}>
          <div className={a.menuInner}>
            <div>
              <h1 className={a.h1}>
                Last <span style={{ color: "var(--tomato)" }}>Round</span>
              </h1>
              <p className={a.lead}>First-person boxing. Three rounds, one opponent, your own two fists. Slip, block, counter, and do not stay down for ten.</p>
            </div>
            <div className={a.modes}>
              {(
                [
                  ["easy", "Sparring partner", "Slow hands, forgiving. Learn the controls.", "var(--mint)"],
                  ["medium", "Club fighter", "Blocks, counters and keeps the pressure on.", "var(--lemon)"],
                  ["hard", "Contender", "Fast, reads your punches, punishes mistakes.", "var(--tomato)"],
                ] as const
              ).map(([l, name, blurb, tile]) => (
                <button key={l} className={a.mode} style={{ "--tile": tile } as React.CSSProperties} onClick={() => setLevel(l)}>
                  <strong>{name}</strong>
                  <span>{blurb}</span>
                </button>
              ))}
            </div>
            <div className={`${a.panel} ${x.how}`}>
              <p className={a.label}>Controls</p>
              <ul>
                <li>
                  <b>Left click</b> jab · <b>Right click</b> cross (big) · <b>Q</b> hook · <b>E</b> uppercut
                </li>
                <li>
                  <b>Hold Space</b> to guard · <b>← →</b> to slip straight punches · <b>↓</b> or <b>C</b> to duck hooks
                </li>
                <li>
                  <b>W S</b> step in and out · <b>A D</b> circle. Punches cost stamina. When you are down, tap Space fast to get up.
                </li>
                <li>Three rounds of a minute. Win by knockout, or on the judges' cards.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    );
  return <Match level={level} onExit={() => setLevel(null)} />;
}

function Match({ level, onExit }: { level: BotLevel; onExit(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState<Hud>(initial);
  const [fight, setFight] = useState<Fight | null>(null);
  const [hurt, setHurt] = useState(0);
  const [touch, setTouch] = useState(false);
  const [round, setRound] = useState(0); // bump to restart
  const want = useRef({ punch: null as Punch | null, lean: 0 as -1 | 0 | 1, getUp: false });
  const keys = useRef(new Set<string>());

  useEffect(() => setTouch(matchMedia("(pointer: coarse)").matches), []);

  useEffect(() => {
    if (!canvas.current) return;
    const el = canvas.current;
    const f = createFight(level);
    setFight(null);
    const scene = new BoxingScene(el);
    const sfx = new BoxingSfx();
    scene.onSound((k, p) => sfx.play(k, p));
    scene.onHurt((d) => setHurt((h) => Math.min(1, h + d / 20)));

    const w = want.current;
    const k = keys.current;
    const pressPunch = (p: Punch) => {
      w.punch = p;
      sfx.crowd();
    };
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      k.add(e.code);
      sfx.crowd();
      if (e.code === "KeyQ") pressPunch("hook");
      else if (e.code === "KeyE") pressPunch("upper");
      else if (e.code === "ArrowLeft") w.lean = -1;
      else if (e.code === "ArrowRight") w.lean = 1;
      else if (e.code === "Space") w.getUp = true;
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => k.delete(e.code);
    const md = (e: MouseEvent) => {
      if (e.button === 0) {
        pressPunch("jab");
        w.getUp = true;
      } else if (e.button === 2) {
        pressPunch("cross");
        w.getUp = true;
      }
    };
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("mousedown", md);
    el.addEventListener("contextmenu", noMenu);

    const rng = Math.random;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    let beat = 0;
    let bannerT = 0;
    let banner = "";
    const say = (t: string, secs = 1.6) => {
      banner = t;
      bannerT = secs;
    };
    say("Round 1", 2.8);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        const c: Controls = {
          ...noControls(),
          move: (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0),
          strafe: (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0),
          guard: k.has("Space") || k.has("ShiftLeft") || k.has("ShiftRight"),
          duck: k.has("ArrowDown") || k.has("KeyC"),
          punch: w.punch,
          lean: w.lean,
          getUp: w.getUp,
        };
        w.punch = null;
        w.lean = 0;
        w.getUp = false;
        step(f, 1 / 60, [c, aiControls(f, rng)], rng);
        for (const e of f.events) {
          if (e.type === "bell" && e.kind === "start" && f.phase === "fight") say(f.round === 1 && f.clock > ROUND_TIME - 0.5 ? "Fight!" : `Round ${f.round}  Fight!`, 1.6);
          if (e.type === "bell" && e.kind === "end") say(f.phase === "over" ? "" : "Time!", 2.2);
          if (e.type === "down") say(e.who === 0 ? "You're down!" : "Knockdown!", 2.2);
          if (e.type === "up") say(e.who === 0 ? "Up!" : "", 1);
        }
        scene.fx(f.events);
        f.events.length = 0;
      }
      scene.frame(f, dt);

      bannerT -= dt;
      const me = f.f[0];
      if (me.hp < 28 && me.down === null && f.phase === "fight") {
        beat -= dt;
        if (beat <= 0) {
          beat = 0.9;
          sfx.heartbeat();
        }
      }
      hudAt += dt;
      if (hudAt > 0.066) {
        hudAt = 0;
        setHurt((h) => Math.max(0, h - 0.2));
        setHud({
          phase: f.phase,
          round: f.round,
          clock: f.clock,
          hp: [f.f[0].hp, f.f[1].hp],
          stamina: f.f[0].stamina,
          down: [f.f[0].down, f.f[1].down],
          presses: f.f[0].presses,
          need: downNeeded(f.f[0]),
          count: f.lastCount,
          banner: f.phase === "rest" ? `Rest. Round ${f.round + 1} in ${Math.ceil(f.clock)}` : f.phase === "ready" && f.round === 1 ? "Round 1" : bannerT > 0 ? banner : "",
        });
        if (f.phase === "over") setFight((prev) => prev ?? f);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      el.removeEventListener("mousedown", md);
      el.removeEventListener("contextmenu", noMenu);
      scene.dispose();
      sfx.close();
    };
  }, [level, round]);

  const hold = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    },
    onPointerUp: () => window.dispatchEvent(new KeyboardEvent("keyup", { code })),
    onPointerLeave: () => window.dispatchEvent(new KeyboardEvent("keyup", { code })),
    onPointerCancel: () => window.dispatchEvent(new KeyboardEvent("keyup", { code })),
  });
  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });
  const w = want.current;

  const over = fight?.phase === "over" ? fight : null;
  let headline = "";
  let sub = "";
  if (over?.result) {
    const r = over.result;
    headline = r.winner === 0 ? "You win!" : r.winner === 1 ? "You lose" : "Draw";
    sub = { ko: "By knockout", tko: "By technical knockout", decision: "On the judges' cards", draw: "Level on the cards" }[r.how];
  }
  const meDown = hud.down[0] !== null;

  return (
    <main className={`${a.stage} arcade`}>
      <div className={x.view}>
        <canvas ref={canvas} className={x.canvas} />
        <div className={x.vignette} style={{ opacity: Math.min(1, hurt * 0.9 + Math.max(0, (30 - hud.hp[0]) / 40)) }} />
      </div>

      <header className={a.top}>
        <button className={a.back} onClick={onExit}>
          <span aria-hidden>←</span> Leave
        </button>
      </header>

      <div className={x.hud}>
        <div className={x.side}>
          <span>You</span>
          <i className={x.bar}>
            <u style={{ width: `${Math.max(0, hud.hp[0])}%`, background: hud.hp[0] < 30 ? "var(--tomato)" : "var(--sky)" }} />
          </i>
          <i className={`${x.bar} ${x.stam}`}>
            <u style={{ width: `${hud.stamina}%` }} />
          </i>
        </div>
        <div className={x.clock}>
          <small>
            Round {Math.min(hud.round, ROUNDS)} / {ROUNDS}
          </small>
          <strong>{hud.phase === "fight" ? `${Math.floor(Math.ceil(hud.clock) / 60)}:${String(Math.ceil(hud.clock) % 60).padStart(2, "0")}` : "–:––"}</strong>
        </div>
        <div className={`${x.side} ${x.right}`}>
          <span>Opponent</span>
          <i className={x.bar}>
            <u style={{ width: `${Math.max(0, hud.hp[1])}%`, background: "var(--tomato)", marginLeft: "auto" }} />
          </i>
        </div>
      </div>

      {hud.banner && !over && <div className={x.banner}>{hud.banner}</div>}

      {(meDown || hud.down[1] !== null) && !over && (
        <div className={x.count}>
          <strong>{hud.count}</strong>
          {meDown && (
            <>
              <span>Tap Space or click to get up!</span>
              <i className={x.mash}>
                <u style={{ width: `${Math.min(100, (hud.presses / hud.need) * 100)}%` }} />
              </i>
            </>
          )}
        </div>
      )}

      {!touch && hud.phase === "fight" && !meDown && <div className={x.hint}>Click jab · Right-click cross · Q hook · E upper · Space guard · ← → slip · ↓ duck · WASD move</div>}

      {touch && !over && (
        <div className={x.pad}>
          <div className={x.dpad}>
            <button className={x.up} {...hold("KeyW")}>▲</button>
            <button className={x.lt} {...hold("KeyA")}>◀</button>
            <button className={x.dn} {...hold("KeyS")}>▼</button>
            <button className={x.rt} {...hold("KeyD")}>▶</button>
          </div>
          <div className={x.actions}>
            <button className={`${a.key} ${a.sky}`} {...tap(() => ((w.punch = "jab"), (w.getUp = true)))}>Jab</button>
            <button className={`${a.key} ${a.tomato}`} {...tap(() => ((w.punch = "cross"), (w.getUp = true)))}>Cross</button>
            <button className={`${a.key} ${a.lemon}`} {...tap(() => (w.punch = "hook"))}>Hook</button>
            <button className={`${a.key} ${a.pink}`} {...tap(() => (w.punch = "upper"))}>Upper</button>
            <button className={`${a.key} ${a.mint}`} {...hold("Space")}>Guard</button>
            <button className={`${a.key} ${a.ghost}`} {...tap(() => (w.lean = -1))}>Slip ◀</button>
            <button className={`${a.key} ${a.ghost}`} {...tap(() => (w.lean = 1))}>Slip ▶</button>
            <button className={`${a.key} ${a.ghost}`} {...hold("KeyC")}>Duck</button>
          </div>
        </div>
      )}

      {over && (
        <div className={a.center}>
          <div className={a.card}>
            <h2>{headline}</h2>
            <p>{sub}.</p>
            {over.cards.length > 0 && (
              <table className={x.cards}>
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>You</th>
                    <th>Them</th>
                  </tr>
                </thead>
                <tbody>
                  {over.cards.map((c, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{c.you}</td>
                      <td>{c.them}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={a.row}>
              <button className={`${a.key} ${a.tomato}`} onClick={() => setRound((n) => n + 1)}>
                Rematch
              </button>
              <button className={`${a.key} ${a.ghost}`} onClick={onExit}>
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
