"use client";

import { useState } from "react";
import { TILE_INFO, getBoard, getMap, netWorth, type PlayerState, type TileType } from "@boredgames/milestones";
import { audio, type AudioPrefs } from "@/lib/milestones/audio";
import { money, pegColors, type Seat, type ViewState } from "@/lib/milestones/controller";
import s from "./milestones.module.css";

const WHEEL_COLORS = ["#F5D061", "#7BC47F", "#F29BB8", "#6FA8DC", "#E8B04B", "#E86F51", "#9AD39A", "#B9A3E3", "#7FB7E6", "#F2A65A"];
const WHEEL_BG = `conic-gradient(from 0deg, ${WHEEL_COLORS.map((c, i) => `${c} ${i * 36}deg ${(i + 1) * 36}deg`).join(", ")})`;

// ------------------------------------------------------------------ top left

export function TitleBlock({
  mapName,
  overview,
  prefs,
  onToggle,
  onRestart,
  onMenu,
}: {
  mapName: string;
  overview: boolean;
  prefs: AudioPrefs;
  onToggle(): void;
  onRestart?: () => void;
  onMenu(): void;
}) {
  return (
    <div className={s.topLeft}>
      <button type="button" className={`${s.back} ${s.glass}`} onClick={onMenu}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Maps
      </button>
      <div>
        <h1 className={s.title}>Milestones</h1>
        <span className={s.tagline}>{mapName.toUpperCase()}</span>
      </div>
      <div className={s.tools}>
        <button type="button" className={`${s.pillBtn} ${s.glass}`} onClick={onToggle}>
          {overview ? "Follow car" : "Overview"}
        </button>
        {onRestart && (
          <button type="button" className={`${s.pillBtn} ${s.glass}`} onClick={onRestart}>
            New game
          </button>
        )}
        <button
          type="button"
          className={`${s.pillBtn} ${s.iconBtn} ${s.glass}`}
          aria-pressed={prefs.sfx}
          aria-label={prefs.sfx ? "Sound effects on" : "Sound effects off"}
          title="Sound effects"
          onClick={() => audio.setPrefs({ sfx: !prefs.sfx })}
        >
          <span className={prefs.sfx ? "" : s.off}>🔊</span>
        </button>
        <button
          type="button"
          className={`${s.pillBtn} ${s.iconBtn} ${s.glass}`}
          aria-pressed={prefs.music}
          aria-label={prefs.music ? "Music on" : "Music off"}
          title="Music"
          onClick={() => audio.setPrefs({ music: !prefs.music })}
        >
          <span className={prefs.music ? "" : s.off}>🎵</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tile guide

export function TileGuide({ mapId }: { mapId: string }) {
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.innerHeight >= 760 && window.innerWidth > 900);
  const board = getBoard(mapId);
  const present = new Set<TileType>(board.nodes.map((n) => n.type));
  const order: TileType[] = ["payday", "event", "bills", "invest", "baby", "graduate", "wedding", "house", "fork", "retire"];
  return (
    <div className={`${s.legend} ${s.glass}`}>
      <button type="button" className={s.legendHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={s.status}>TILE GUIDE</span>
        <span className={s.legendCaret}>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className={s.legendList}>
          {order
            .filter((t) => present.has(t))
            .map((t) => {
              const info = TILE_INFO[t];
              return (
                <div key={t} className={s.legendRow}>
                  <span className={s.legendDot} style={{ background: info.color }}>
                    {info.icon}
                  </span>
                  <span>
                    <b>{info.name}</b>
                    <span className={s.legendText}>{info.short}</span>
                  </span>
                </div>
              );
            })}
          <span className={s.hint}>Drag to look around, scroll to zoom, hover a tile for details.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- players

const MARKET_LOOK = {
  boom: { icon: "🚀", label: "Boom (+10%)", color: "#2FBF71" },
  steady: { icon: "➖", label: "Steady (+4%)", color: "#8A94A6" },
  slump: { icon: "📉", label: "Slump (−8%)", color: "#E5383B" },
} as const;

function PlayerCard({ seat, p, active, compact, you }: { seat: Seat; p: PlayerState; active: boolean; compact: boolean; you: boolean }) {
  const pegs = pegColors(seat, p);
  return (
    <div
      className={`${s.card} ${compact ? s.cardCompact : ""} ${s.glass}`}
      style={active ? { boxShadow: `0 0 0 3px ${seat.color}, 0 14px 34px -16px rgba(30,60,80,.45)` } : undefined}
    >
      <div className={s.cardTop}>
        <span className={s.pname}>
          <span className={s.swatch} style={{ background: seat.color }} />
          {you ? "You" : seat.name}
        </span>
        <span className={s.status}>{p.retired ? "RETIRED" : active ? "PLAYING" : ""}</span>
      </div>
      <div className={s.cashRow}>
        <span className={s.cash}>{money(p.cash)}</span>
        <span className={s.loans}>{p.loans ? `Loans ${money(p.loans)}` : ""}</span>
      </div>
      <div className={s.chips}>
        <span className={s.chip}>{p.career ? `${p.career} · ${money(p.salary)}` : p.route ? "Studying" : "Picking a road"}</span>
        <span className={s.chip}>{p.home ? p.home.name : "No home yet"}</span>
        {p.fund > 0 && (
          <span className={`${s.chip} ${s.chipInvest}`} title="Growth Fund: moves with the market every round">
            📈 Fund {money(p.fund)}
          </span>
        )}
        {p.insured && (
          <span className={s.chip} title="Blocks your next lawsuit, layoff, audit or disaster">
            🛡️ Insured
          </span>
        )}
        {p.unpaid > 0 && (
          <span className={s.chip} title="Your next paydays pay nothing">
            ⚠️ Laid off · {p.unpaid} paydays unpaid
          </span>
        )}
      </div>
      <div className={s.statRow}>
        <span className={s.status} title="Cash, home, Growth Fund and family, minus loans">
          WORTH {money(netWorth(p))}
        </span>
      </div>
      <div className={s.pegs} role="img" aria-label={`${pegs.length} ${pegs.length === 1 ? "person" : "people"} in the car`}>
        {pegs.map((c, i) => (
          <span key={i} className={s.peg} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

export function Players({ view }: { view: ViewState }) {
  const compact = view.game.players.length > 2;
  return (
    <div className={s.players}>
      <div
        className={`${s.card} ${s.cardCompact} ${s.glass}`}
        title="The market moves every Growth Fund and home value each round"
        style={{ borderLeft: `4px solid ${MARKET_LOOK[view.game.market].color}` }}
      >
        <span className={s.pname}>
          {MARKET_LOOK[view.game.market].icon} Market: {MARKET_LOOK[view.game.market].label}
        </span>
      </div>
      {view.game.players.map((p, i) => (
        <PlayerCard
          key={p.id}
          seat={view.seats[i]!}
          p={p}
          compact={compact}
          you={view.seats[i]!.id === view.localId}
          active={view.game.turn === i && view.game.phase !== "over" && !p.retired}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- bottom

export function StatusLine({ text }: { text: string }) {
  return (
    <div className={s.statusWrap}>
      <p className={`${s.statusLine} ${s.glass}`} aria-live="polite">
        {text}
      </p>
    </div>
  );
}

export function Spinner({ view, canSpin, onSpin }: { view: ViewState; canSpin: boolean; onSpin(): void }) {
  return (
    <div className={`${s.spinner} ${s.glass}`}>
      <div className={s.wheelHolder}>
        <div className={s.wheelBox}>
          <div className={s.wheel} style={{ background: WHEEL_BG, transform: `rotate(${view.wheelDeg}deg)` }} aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={s.wheelNum} style={{ transform: `rotate(${(i + 0.5) * 36}deg) translateY(-60px)` }}>
                {i + 1}
              </span>
            ))}
          </div>
          <div className={s.hub} aria-live="polite">
            {view.wheelValue}
          </div>
          <svg className={s.needle} width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">
            <path d="M14 22L3 3h22z" fill="#23303B" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div className={s.spinSide}>
        <button type="button" className={s.spinBtn} disabled={!canSpin} onClick={onSpin}>
          Spin
        </button>
        <span className={s.aimLabel}>
          <span className={s.status}>OR PRESS SPACE</span>
        </span>
      </div>
    </div>
  );
}

export function ToastView({ toast }: { toast: ViewState["toast"] }) {
  if (!toast) return null;
  const { amount } = toast;
  return (
    <div className={s.toastWrap}>
      <div key={toast.id} className={`${s.toast} ${s.glass} ${s[`toast_${toast.tone}`]}`}>
        <div className={s.toastText}>
          <span className={s.toastKicker}>{toast.kicker}</span>
          <span className={s.toastBody}>{toast.text}</span>
        </div>
        {amount !== null && (
          <span className={s.toastAmt} style={{ color: amount < 0 ? "#b23a2f" : "#1f6b45" }}>
            {amount >= 0 ? "+" : "−"}${Math.abs(Math.round(amount)).toLocaleString("en-US")}k
          </span>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- tooltip

export function TileTip({ mapId, node, x, y }: { mapId: string; node: number; x: number; y: number }) {
  const n = getBoard(mapId).nodes[node]!;
  const info = TILE_INFO[n.type];
  const def = getMap(mapId);
  const seg = getBoard(mapId).segments[n.segment];
  const branch = def.branches[n.segment];
  const road = n.type === "start" ? "" : (branch?.name ?? seg?.name ?? "");
  return (
    <div className={`${s.tip} ${s.glass}`} style={{ left: x + 16, top: y + 16, ["--tile" as string]: info.color }} role="tooltip">
      <div className={s.tipHead}>
        <span className={s.tipIcon}>{info.icon}</span>
        <span>
          <b className={s.tipName}>{n.label ?? info.name}</b>
          <span className={s.tipRoad}>{road ? `${road} · tile ${n.index + 1}` : "Start"}</span>
        </span>
      </div>
      <p className={s.tipBody}>{info.long}</p>
      {info.stop && <span className={s.tipStop}>YOU MUST STOP HERE</span>}
    </div>
  );
}
