"use client";

import { useEffect, useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { TIME_LIMIT, applySnapshot, botInput, createSim, hpFrac, noInput, snapshot, step, wheelsLeft, type Design, type Input, type Outcome, type Sim, type SimEvent } from "@boredgames/botbrawl";
import { BrawlScene } from "@/lib/botbrawl/scene";
import { Sfx } from "@/lib/botbrawl/audio";
import type { Net } from "@/lib/botbrawl/net";
import a from "../shared/arcade.module.css";
import b from "./brawl.module.css";

export type FightMode = "bot" | "local" | "host" | "guest";

export const COLORS: [string, string] = ["#4cc9f0", "#ff5a36"];
const HEX = (s: string) => parseInt(s.slice(1), 16);

/** Reads the keyboard and the on-screen pad into controls. */
function useControls() {
  const down = useRef(new Set<string>());
  useEffect(() => {
    const d = down.current;
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      d.add(e.code);
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => d.delete(e.code);
    const blur = () => d.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, []);

  /** Player 0 uses WASD (and arrows when alone); player 1 uses arrows in a two-player game. */
  return (who: 0 | 1, shared: boolean): Input => {
    const k = down.current;
    const keys = shared ? (who === 0 ? { u: "KeyW", d: "KeyS", l: "KeyA", r: "KeyD", f: ["KeyF"], bo: ["KeyG"] } : { u: "ArrowUp", d: "ArrowDown", l: "ArrowLeft", r: "ArrowRight", f: ["KeyK"], bo: ["KeyL"] }) : null;
    const has = (...codes: string[]) => codes.some((c) => k.has(c));
    const up = keys ? has(keys.u) : has("KeyW", "ArrowUp");
    const dn = keys ? has(keys.d) : has("KeyS", "ArrowDown");
    const lf = keys ? has(keys.l) : has("KeyA", "ArrowLeft");
    const rt = keys ? has(keys.r) : has("KeyD", "ArrowRight");
    return {
      throttle: (up ? 1 : 0) - (dn ? 1 : 0),
      turn: (rt ? 1 : 0) - (lf ? 1 : 0),
      fire: keys ? has(...keys.f) : has("Space", "KeyF", "KeyK"),
      boost: keys ? has(...keys.bo) : has("ShiftLeft", "ShiftRight", "KeyG", "KeyL"),
    };
  };
}

export function Battle({
  designs,
  mode,
  level,
  net,
  onDone,
}: {
  designs: [Design, Design];
  mode: FightMode;
  level: BotLevel;
  net?: Net;
  onDone(action: "rematch" | "rebuild" | "menu"): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useControls();
  const [hud, setHud] = useState({ t: TIME_LIMIT, hp: [1, 1], wheels: [1, 1], label: "" });
  const [over, setOver] = useState<Outcome | null>(null);
  const [touch, setTouch] = useState(false);
  const guest = mode === "guest";
  const you = guest ? 1 : 0;

  useEffect(() => {
    setTouch(matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    const sim: Sim = createSim(designs);
    const scene = new BrawlScene(canvas.current);
    const sfx = new Sfx();
    scene.onSound((k, p) => sfx.play(k, p));
    scene.setup(sim, [HEX(COLORS[0]), HEX(COLORS[1])]);

    const rng = Math.random;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let count = 3.2; // seconds before the fight starts
    let lastBeep = 4;
    let hudAt = 0;
    let snapAt = 0;
    let inputAt = 0;
    let lastIn = "";
    let finished = false;
    let remoteIn: Input = noInput();
    let pending: SimEvent[] = []; // for the scene, cleared every frame
    let outbox: SimEvent[] = []; // for the guest, cleared when a snapshot is sent
    let gotSnap = false;

    const off = net?.subscribe((m) => {
      if (m.t === "in" && !guest) remoteIn = m.i;
      else if (m.t === "snap" && guest) {
        applySnapshot(sim, m.s);
        pending.push(...sim.events);
        sim.events.length = 0;
        gotSnap = true;
      }
    });

    const finish = (o: Outcome) => {
      if (finished) return;
      finished = true;
      sfx.play("bell");
      setOver(o);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (guest) {
        // Between snapshots, carry on along the last known velocity.
        for (const r of sim.robots) {
          if (!r.alive) continue;
          r.x += r.vx * dt;
          r.y += r.vy * dt;
          r.th += r.w * dt;
        }
        sim.t += sim.over ? 0 : dt;
        inputAt += dt;
        const i = controls(0, false);
        const sig = JSON.stringify(i);
        if (sig !== lastIn || inputAt > 0.1) {
          lastIn = sig;
          inputAt = 0;
          net?.send({ t: "in", i }, true);
        }
        if (sim.over) finish(sim.over);
      } else {
        if (count > 0) {
          count -= dt;
          const n = Math.ceil(count);
          if (n < lastBeep && n >= 1) sfx.play("beep");
          if (n < lastBeep) lastBeep = n;
          if (count <= 0) sfx.play("go");
        } else {
          acc += dt;
          while (acc >= 1 / 60) {
            acc -= 1 / 60;
            if (mode === "bot") {
              sim.robots[0]!.input = controls(0, false);
              sim.robots[1]!.input = botInput(sim, 1, level, rng);
            } else if (mode === "local") {
              sim.robots[0]!.input = controls(0, true);
              sim.robots[1]!.input = controls(1, true);
            } else {
              sim.robots[0]!.input = controls(0, false);
              sim.robots[1]!.input = remoteIn;
            }
            step(sim, 1 / 60);
            pending.push(...sim.events);
            outbox.push(...sim.events);
            sim.events.length = 0;
          }
          if (mode === "host") {
            snapAt += dt;
            if (snapAt >= 1 / 20 || sim.over) {
              snapAt = 0;
              const s = snapshot(sim);
              s.ev = outbox.slice(-40);
              outbox = [];
              net?.send({ t: "snap", s }, true);
            }
          }
          if (sim.over) finish(sim.over);
        }
      }

      scene.fx(pending);
      pending = [];
      scene.frame(sim, dt);

      hudAt += dt;
      if (hudAt > 0.1) {
        hudAt = 0;
        setHud({
          t: Math.max(0, TIME_LIMIT - sim.t),
          hp: sim.robots.map(hpFrac),
          wheels: sim.robots.map(wheelsLeft),
          label: guest ? (!gotSnap ? "Get ready…" : sim.t < 0.8 ? "Fight!" : "") : count > 0 ? String(Math.ceil(count)) : sim.t < 0.8 ? "Fight!" : "",
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      off?.();
      scene.dispose();
      sfx.close();
    };
    // The fight is built once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On-screen pad: feeds the same key set the keyboard uses.
  const hold = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    },
    onPointerUp: () => window.dispatchEvent(new KeyboardEvent("keyup", { code })),
    onPointerLeave: () => window.dispatchEvent(new KeyboardEvent("keyup", { code })),
    onPointerCancel: () => window.dispatchEvent(new KeyboardEvent("keyup", { code })),
  });

  const names = designs.map((d) => d.name || "Robot");
  let headline = "";
  if (over) {
    if (over.winner < 0) headline = "Draw!";
    else if (mode === "local") headline = `${names[over.winner]} wins!`;
    else headline = over.winner === you ? "You win!" : "You lose";
  }
  const why = over ? { ko: "Knockout", immobilized: "Immobilized for too long", judges: "Judges' decision", draw: "Nobody could finish it" }[over.reason] : "";

  return (
    <div className={b.arena}>
      <canvas ref={canvas} className={b.canvas} />

      <div className={b.scoreboard}>
        {[0].map((i) => (
          <div key={i} className={`${b.fighter} ${i === 1 ? b.right : ""}`}>
            <span className={b.fname} style={{ color: COLORS[i] }}>
              {names[i]}
              {mode !== "local" && i === you ? " (you)" : ""}
            </span>
            <i className={b.bar}>
              <u style={{ width: `${Math.max(0, hud.hp[i]! * 100)}%`, background: COLORS[i] }} />
            </i>
            {hud.wheels[i] === 0 && <em className={b.stuck}>No wheels</em>}
          </div>
        ))}
        <div className={b.timer}>{Math.ceil(hud.t)}</div>
        {[1].map((i) => (
          <div key={i} className={`${b.fighter} ${i === 1 ? b.right : ""}`}>
            <span className={b.fname} style={{ color: COLORS[i] }}>
              {names[i]}
              {mode !== "local" && i === you ? " (you)" : ""}
            </span>
            <i className={b.bar}>
              <u style={{ width: `${Math.max(0, hud.hp[i]! * 100)}%`, background: COLORS[i] }} />
            </i>
            {hud.wheels[i] === 0 && <em className={b.stuck}>No wheels</em>}
          </div>
        ))}
      </div>

      {hud.label && !over && <div className={b.count}>{hud.label}</div>}

      {touch && !over && (
        <div className={b.pad}>
          <div className={b.dpad}>
            <button className={b.padUp} {...hold("KeyW")} aria-label="Forward">▲</button>
            <button className={b.padLeft} {...hold("KeyA")} aria-label="Turn left">◀</button>
            <button className={b.padRight} {...hold("KeyD")} aria-label="Turn right">▶</button>
            <button className={b.padDown} {...hold("KeyS")} aria-label="Back">▼</button>
          </div>
          <div className={b.acts}>
            <button className={`${a.key} ${a.tomato}`} {...hold("KeyF")}>Fire</button>
            <button className={`${a.key} ${a.lemon}`} {...hold("KeyG")}>Boost</button>
          </div>
        </div>
      )}

      {!touch && !over && hud.label !== "" && (
        <div className={b.keys}>
          {mode === "local" ? (
            <>
              <span>
                <b style={{ color: COLORS[0] }}>P1</b> W A S D · F fire · G boost
              </span>
              <span>
                <b style={{ color: COLORS[1] }}>P2</b> arrows · K fire · L boost
              </span>
            </>
          ) : (
            <span>W A S D or arrows to drive · Space to fire hammers and flippers · Shift to boost</span>
          )}
        </div>
      )}

      {over && (
        <div className={a.center}>
          <div className={a.card}>
            <h2>{headline}</h2>
            <p>{why}.</p>
            <div className={a.row}>
              {mode !== "guest" && (
                <>
                  <button className={`${a.key} ${a.mint}`} onClick={() => onDone("rematch")}>
                    Rematch
                  </button>
                  <button className={`${a.key} ${a.sky}`} onClick={() => onDone("rebuild")}>
                    Rebuild
                  </button>
                </>
              )}
              <button className={`${a.key} ${a.ghost}`} onClick={() => onDone("menu")}>
                Leave
              </button>
            </div>
            {mode === "guest" && <p style={{ fontSize: 13 }}>The host picks what happens next.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
