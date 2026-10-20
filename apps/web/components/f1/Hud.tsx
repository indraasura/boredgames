"use client";

import { useEffect, useRef } from "react";
import { COMPOUND_LIST, COMPOUNDS, type Compound } from "@boredgames/f1";
import { fmtTime, type F1Controller, type Hud, type ResultRow } from "@/lib/f1/controller";
import s from "./f1.module.css";

const tempColor = (t: number, c: Compound) => {
  const d = COMPOUNDS[c];
  const x = (t - d.optTemp) / d.tempWindow;
  if (x < -0.9) return "#3b82f6";
  if (x < -0.35) return "#38bdf8";
  if (x < 0.45) return "#22c55e";
  if (x < 0.85) return "#f59e0b";
  return "#ef4444";
};

const gapText = (v: number) => (v <= 0 ? "" : v < 100 ? `+${v.toFixed(1)}` : `+${Math.round(v)}`);

export function Tower({ hud }: { hud: Hud }) {
  const rows = hud.standings;
  const me = rows.findIndex((r) => r.me);
  // Show the top ten, and the driver's own row if they are further down.
  const shown = rows.slice(0, 10);
  if (me >= 10) shown.push(rows[me]!);
  if (hud.mode === "free") return null;
  return (
    <div className={`${s.tower} ${s.glass}`} aria-label="Standings">
      {shown.map((r) => (
        <div key={r.id} className={`${s.row} ${r.me ? s.rowMe : ""}`}>
          <span className={s.pos}>{r.position}</span>
          <span className={s.bar4} style={{ background: r.color }} />
          <span className={s.nm}>{r.name}</span>
          <span className={s.gap}>
            {r.pit !== "none" ? "PIT" : r.finished ? "FIN" : r.position === 1 ? "" : gapText(r.interval)}
            <span className={s.tyreDot} style={{ background: COMPOUNDS[r.compound].color }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function TopBar({ hud }: { hud: Hud }) {
  return (
    <div className={s.top}>
      {hud.mode === "race" && (
        <>
          <div className={`${s.pill} ${s.glass}`}>
            <span className={s.pillBig}>
              P{hud.position}
              <span style={{ opacity: 0.55, fontSize: 14 }}>/{hud.total}</span>
            </span>
            <span className={s.pillSmall}>POSITION</span>
          </div>
          <div className={`${s.pill} ${s.glass}`}>
            <span className={s.pillBig}>
              {hud.lap}
              <span style={{ opacity: 0.55, fontSize: 14 }}>/{hud.laps}</span>
            </span>
            <span className={s.pillSmall}>LAP</span>
          </div>
        </>
      )}
      {hud.mode === "free" && (
        <div className={`${s.pill} ${s.glass}`}>
          <span className={s.pillBig}>{fmtTime(hud.lapTime)}</span>
          <span className={s.pillSmall}>{hud.lapValid ? "LAP TIME" : "LAP DELETED"}</span>
        </div>
      )}
    </div>
  );
}

export function Lights({ hud }: { hud: Hud }) {
  if (hud.phase !== "lights" && hud.phase !== "grid") return null;
  return (
    <div className={`${s.lights} ${s.glass}`} aria-label="Start lights">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`${s.light} ${hud.phase === "lights" && i <= hud.lights ? s.lightOn : ""}`} />
      ))}
    </div>
  );
}

export function Messages({ hud }: { hud: Hud }) {
  return (
    <div className={s.messages} aria-live="polite">
      {hud.messages.map((m) => (
        <div key={m.id} className={`${s.msg} ${m.tone === "good" ? s.msg_good : m.tone === "bad" ? s.msg_bad : ""}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}

export function Dash({ hud }: { hud: Hud }) {
  const leds = 15;
  const lit = Math.round(Math.max(0, Math.min(1, (hud.rpm - 6000) / 6000)) * leds);
  const colorFor = (i: number) => (i < 5 ? "#22c55e" : i < 10 ? "#ef4444" : "#60a5fa");
  return (
    <div className={`${s.dash} ${s.glass}`}>
      <div className={s.rpm} aria-hidden="true">
        {Array.from({ length: leds }, (_, i) => (
          <span key={i} className={s.led} style={i < lit ? { background: colorFor(i), boxShadow: `0 0 6px ${colorFor(i)}` } : undefined} />
        ))}
      </div>
      <div className={s.speedRow}>
        <div className={s.pedals} aria-hidden="true">
          <span className={s.pedal}>
            <span style={{ height: `${hud.brake * 100}%`, background: "#ef4444" }} />
          </span>
          <span className={s.pedal}>
            <span style={{ height: `${hud.throttle * 100}%`, background: "#22c55e" }} />
          </span>
        </div>
        <div>
          <div className={s.speed}>{Math.round(hud.speed)}</div>
          <div className={s.unit} style={{ textAlign: "right" }}>
            KM/H
          </div>
        </div>
        <div>
          <div className={s.gear}>{hud.speed < 3 && hud.throttle < 0.05 ? "N" : hud.gear}</div>
          <div className={s.unit} style={{ textAlign: "center" }}>
            GEAR
          </div>
        </div>
      </div>
      <div className={s.chipRow}>
        <span className={`${s.flag} ${hud.drsOpen ? s.flagOn : hud.drsAvailable ? s.flagAmber : ""}`}>DRS</span>
        <span className={s.ersBar} title="Battery">
          <span style={{ width: `${hud.ers * 100}%` }} />
        </span>
        <span>ERS</span>
        {hud.offTrack && <span className={`${s.flag} ${s.flagBad}`}>OFF TRACK</span>}
        {hud.pit !== "none" && <span className={`${s.flag} ${s.flagAmber}`}>PIT LIMITER</span>}
      </div>
    </div>
  );
}

export function CarPanel({ hud, ctl }: { hud: Hud; ctl: F1Controller }) {
  const avg = hud.wear.reduce((a, b) => a + b, 0) / 4;
  return (
    <div className={`${s.car} ${s.glass}`}>
      <div className={s.carRow}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span className={s.tyreDot} style={{ background: COMPOUNDS[hud.compound].color, width: 12, height: 12 }} />
          <b>{COMPOUNDS[hud.compound].name}</b>
        </span>
        <span>{Math.round(avg * 100)}% worn</span>
      </div>
      <div className={s.tyreGrid}>
        {hud.temp.map((t, i) => (
          <div key={i} className={s.tyreCell} style={{ background: tempColor(t, hud.compound) }} title={`${Math.round(t)}°C, ${Math.round(hud.wear[i]! * 100)}% worn`}>
            <span style={{ height: `${hud.wear[i]! * 100}%` }} />
            <span className={s.tyreTemp} style={{ background: "none", position: "absolute" }}>
              {Math.round(t)}°
            </span>
          </div>
        ))}
      </div>
      <div className={s.carRow}>
        <span>Fuel {hud.fuel.toFixed(1)} kg</span>
        <span>
          {hud.weather.icon} {Math.round(hud.weather.wetness * 100)}% wet
        </span>
      </div>
      <div className={s.btns}>
        <button type="button" className={`${s.hudBtn} ${hud.pitRequested || hud.pit !== "none" ? s.hudBtnOn : ""}`} onClick={() => ctl.togglePit()} title="P">
          {hud.pit !== "none" ? "In pit lane" : hud.pitRequested ? "Pitting" : "Pit stop"}
        </button>
        <button
          type="button"
          className={s.hudBtn}
          onClick={() => ctl.setPitCompound(COMPOUND_LIST[(COMPOUND_LIST.indexOf(hud.pitCompound) + 1) % COMPOUND_LIST.length]!)}
          title="T"
          style={{ borderColor: COMPOUNDS[hud.pitCompound].color }}
        >
          Next: {COMPOUNDS[hud.pitCompound].name}
        </button>
      </div>
    </div>
  );
}

export function Times({ hud, ctl }: { hud: Hud; ctl: F1Controller }) {
  return (
    <div className={`${s.times} ${s.glass}`}>
      <div className={s.timeRow}>
        <span>Lap</span>
        <b style={hud.lapValid ? undefined : { color: "#ef4444" }}>{fmtTime(hud.lapTime)}</b>
      </div>
      <div className={s.timeRow}>
        <span>Last</span>
        <b>{hud.lastLap ? fmtTime(hud.lastLap) : "–"}</b>
      </div>
      <div className={s.timeRow}>
        <span>Best</span>
        <b style={{ color: "#c084fc" }}>{hud.bestLap ? fmtTime(hud.bestLap) : "–"}</b>
      </div>
      <div className={s.btns}>
        <button type="button" className={s.hudBtn} onClick={() => ctl.cycleCamera()} title="C">
          Camera
        </button>
        <button type="button" className={s.hudBtn} onClick={() => ctl.toggleMenu()} title="Esc">
          Menu
        </button>
      </div>
    </div>
  );
}

export function WeatherChip({ hud }: { hud: Hud }) {
  const w = hud.weather;
  return (
    <div className={`${s.weather} ${s.glass}`}>
      <span style={{ fontSize: 20 }}>{w.icon}</span>
      <span>
        {w.name}
        <br />
        <span style={{ opacity: 0.65, fontSize: 11 }}>
          Track {Math.round(w.track)}° · Air {Math.round(w.air)}°
        </span>
      </span>
    </div>
  );
}

/** The circuit from above, with every car. Drawn straight from the simulation each frame. */
export function Minimap({ ctl }: { ctl: F1Controller }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d")!;
    const t = ctl.track;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const { minX, maxX, minY, maxY } = t.bbox;
      const k = Math.min((w - 14) / (maxX - minX), (h - 14) / (maxY - minY));
      const ox = (w - (maxX - minX) * k) / 2;
      const oy = (h - (maxY - minY) * k) / 2;
      const X = (x: number) => (x - minX) * k + ox;
      const Y = (y: number) => (maxY - y) * k + oy;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i < t.n; i += 3) g[i ? "lineTo" : "moveTo"](X(t.x[i]!), Y(t.y[i]!));
      g.closePath();
      g.strokeStyle = "rgba(255,255,255,0.75)";
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = "#ff3b30";
      g.fillRect(X(t.x[0]!) - 3, Y(t.y[0]!) - 3, 6, 6);
      const cars = ctl.race.cars;
      for (const c of cars) {
        if (c.id === ctl.me?.id) continue;
        g.beginPath();
        g.arc(X(c.state.x), Y(c.state.y), 3, 0, 6.283);
        g.fillStyle = c.entry.team.color;
        g.fill();
      }
      const me = ctl.me;
      if (me) {
        g.beginPath();
        g.arc(X(me.state.x), Y(me.state.y), 5, 0, 6.283);
        g.fillStyle = "#fff";
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = me.entry.team.color;
        g.stroke();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [ctl]);
  return (
    <div className={`${s.minimap} ${s.glass}`}>
      <canvas ref={ref} />
    </div>
  );
}

export function TouchControls({ ctl }: { ctl: F1Controller }) {
  const bind = (k: "left" | "right" | "throttle" | "brake" | "drs") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      ctl.setTouch(k, true);
    },
    onPointerUp: () => ctl.setTouch(k, false),
    onPointerCancel: () => ctl.setTouch(k, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <div className={s.touch}>
      <div className={s.touchGroup}>
        <button type="button" className={s.touchBtn} aria-label="Steer left" {...bind("left")}>
          ◀
        </button>
        <button type="button" className={s.touchBtn} aria-label="Steer right" {...bind("right")}>
          ▶
        </button>
      </div>
      <div className={s.touchGroup}>
        <button type="button" className={s.touchBtn} aria-label="DRS" {...bind("drs")} style={{ width: 60, height: 60, alignSelf: "end", fontSize: 13 }}>
          DRS
        </button>
        <button type="button" className={s.touchBtn} aria-label="Brake" {...bind("brake")}>
          ■
        </button>
        <button type="button" className={s.touchBtn} aria-label="Accelerate" {...bind("throttle")}>
          ▲
        </button>
      </div>
    </div>
  );
}

export function PauseCard({ hud, ctl, online, onQuit }: { hud: Hud; ctl: F1Controller; online: boolean; onQuit(): void }) {
  if (!hud.menu || hud.results) return null;
  return (
    <div className={s.overlay}>
      <div className={s.card} role="dialog" aria-modal="true" aria-label="Menu">
        <h2 className={s.cardTitle}>{online ? "Menu" : "Paused"}</h2>
        {online && <p style={{ margin: 0, color: "#9aa3b2", fontSize: 14 }}>The race carries on while this is open.</p>}
        <div className={s.keys}>
          <kbd>W / ↑</kbd>
          <span>Accelerate</span>
          <kbd>S / ↓</kbd>
          <span>Brake</span>
          <kbd>A D / ← →</kbd>
          <span>Steer</span>
          <kbd>Space</kbd>
          <span>DRS, on the marked straights (race: within a second of the car ahead)</span>
          <kbd>P</kbd>
          <span>Call a pit stop. T picks the tyres you will fit</span>
          <kbd>C</kbd>
          <span>Change camera</span>
          <kbd>R</kbd>
          <span>Put the car back on the track</span>
          <kbd>M</kbd>
          <span>Mute</span>
          <kbd>Esc</kbd>
          <span>This menu</span>
        </div>
        <p style={{ margin: 0, color: "#9aa3b2", fontSize: 13 }}>Gamepads work too: left stick steers, right trigger accelerates, left trigger brakes, A is DRS.</p>
        <div className={s.actions}>
          <button type="button" className={s.start} style={{ height: 46, fontSize: 16 }} onClick={() => ctl.toggleMenu()}>
            Resume
          </button>
          {hud.mode === "free" && (
            <button type="button" className={s.ghostBtn} style={{ height: 46 }} onClick={() => ctl.endSession()}>
              Finish session
            </button>
          )}
          <button type="button" className={s.ghostBtn} style={{ height: 46 }} onClick={() => ctl.toggleMute()}>
            {hud.muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" className={s.ghostBtn} style={{ height: 46 }} onClick={onQuit}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultsCard({ hud, onAgain, onQuit }: { hud: Hud; onAgain?: () => void; onQuit(): void }) {
  const rows: ResultRow[] | null = hud.results;
  if (!rows) return null;
  const me = rows.find((r) => r.me);
  const free = hud.mode === "free";
  return (
    <div className={s.overlay}>
      <div className={s.card} role="dialog" aria-modal="true" aria-label="Results">
        <h2 className={s.cardTitle}>{free ? "Session over" : me ? (me.position === 1 ? "You won" : `You finished P${me.position}`) : "Race over"}</h2>
        {free ? (
          <div className={s.keys} style={{ gridTemplateColumns: "1fr auto" }}>
            <span>Best lap</span>
            <b className={s.mono}>{me?.bestLap ? fmtTime(me.bestLap) : "no valid lap"}</b>
            <span>Laps driven</span>
            <b className={s.mono}>{me?.laps ?? 0}</b>
          </div>
        ) : (
          <div>
            {rows.map((r) => (
              <div key={r.id} className={`${s.result} ${r.me ? s.resultMe : ""}`}>
                <span className={s.pos}>{r.position}</span>
                <span className={s.bar4} style={{ background: r.color }} />
                <span className={s.nm}>{r.name}</span>
                <span className={s.mono}>{r.finished ? (r.position === 1 ? fmtTime(r.time) : `+${r.gap.toFixed(3)}`) : "DNF"}</span>
                <span className={s.mono} style={{ opacity: 0.65 }}>
                  {r.bestLap ? fmtTime(r.bestLap) : "–"}
                </span>
              </div>
            ))}
            <p style={{ margin: "8px 0 0", color: "#9aa3b2", fontSize: 12 }}>Right column: best lap. Cars that did not take the flag are classed by distance.</p>
          </div>
        )}
        <div className={s.actions}>
          {onAgain && (
            <button type="button" className={s.start} style={{ height: 46, fontSize: 16 }} onClick={onAgain}>
              Race again
            </button>
          )}
          {!onAgain && !free && <span style={{ color: "#9aa3b2", fontSize: 14, alignSelf: "center" }}>The host can start another race.</span>}
          <button type="button" className={s.ghostBtn} style={{ height: 46 }} onClick={onQuit}>
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
