"use client";

import { useEffect } from "react";
import { TILE_INFO, getBoard, getMap, netWorth, type PlayerState, type TileType } from "@boredgames/milestones";
import { audio, type AudioPrefs } from "@/lib/milestones/audio";
import { money, pegColors, type Seat, type ViewState } from "@/lib/milestones/controller";
import { TILE_ICON, type IconName } from "@/lib/milestones/icons";
import { Icon } from "./Icon";
import s from "./milestones.module.css";

// ------------------------------------------------------------------ top left

export function TitleBlock({ mapName, onMenu }: { mapName: string; onMenu(): void }) {
  return (
    <div className={s.topLeft}>
      <button type="button" className={`${s.round} ${s.surface}`} onClick={onMenu} aria-label="Back to maps" title="Back to maps">
        <Icon name="back" />
      </button>
      <div className={s.mapTitle}>
        <span className={s.kicker}>Milestones</span>
        <h1>{mapName}</h1>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- toolbar

export function Toolbar({
  overview,
  legend,
  prefs,
  onOverview,
  onLegend,
  onRestart,
}: {
  overview: boolean;
  legend: boolean;
  prefs: AudioPrefs;
  onOverview(): void;
  onLegend(): void;
  onRestart?: () => void;
}) {
  const tools: { icon: IconName; label: string; on?: boolean; run(): void }[] = [
    { icon: overview ? "target" : "map", label: overview ? "Follow the car" : "See the whole map", on: overview, run: onOverview },
    { icon: "info", label: "Tile guide", on: legend, run: onLegend },
    ...(onRestart ? [{ icon: "restart" as const, label: "New game", run: onRestart }] : []),
    { icon: prefs.sfx ? "sound" : "mute", label: prefs.sfx ? "Sound effects on" : "Sound effects off", run: () => audio.setPrefs({ sfx: !prefs.sfx }) },
    { icon: "music", label: prefs.music ? "Music on" : "Music off", on: prefs.music, run: () => audio.setPrefs({ music: !prefs.music }) },
  ];
  return (
    <div className={`${s.toolbar} ${s.surface}`} role="toolbar" aria-label="Game controls">
      {tools.map((t) => (
        <button key={t.label} type="button" className={`${s.tool} ${t.on ? s.toolOn : ""}`} onClick={t.run} title={t.label} aria-label={t.label} aria-pressed={t.on}>
          <Icon name={t.icon} size={19} />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tile guide

const ORDER: TileType[] = ["payday", "event", "bills", "invest", "baby", "graduate", "wedding", "house", "fork", "retire"];

export function TileDot({ type, size = 34 }: { type: TileType; size?: number }) {
  const info = TILE_INFO[type];
  return (
    <span className={s.tileDot} style={{ width: size, height: size, background: info.color === "#FFFFFF" ? "var(--ink)" : info.color }}>
      <Icon name={TILE_ICON[type]} size={size * 0.56} weight={2} />
    </span>
  );
}

export function TileGuide({ mapId, onClose }: { mapId: string; onClose(): void }) {
  const board = getBoard(mapId);
  const present = new Set<TileType>(board.nodes.map((n) => n.type));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className={`${s.legend} ${s.surface}`} role="dialog" aria-label="Tile guide">
      <div className={s.legendHead}>
        <span className={s.kicker}>Tile guide</span>
        <button type="button" className={s.tool} onClick={onClose} aria-label="Close">
          <Icon name="close" size={17} />
        </button>
      </div>
      <ul className={s.legendList}>
        {ORDER.filter((t) => present.has(t)).map((t) => {
          const info = TILE_INFO[t];
          return (
            <li key={t}>
              <TileDot type={t} size={30} />
              <span>
                <b>{info.name}</b>
                <span>{info.short}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className={s.legendHint}>Drag to look around. Scroll to zoom. Hover a tile to read it.</p>
    </div>
  );
}

// --------------------------------------------------------------- standings

const MARKET: Record<ViewState["game"]["market"], { icon: IconName; label: string; tone: string }> = {
  boom: { icon: "trend", label: "Boom · +10%", tone: "var(--leaf)" },
  steady: { icon: "flat", label: "Steady · +4%", tone: "var(--muted)" },
  slump: { icon: "trendDown", label: "Slump · −8%", tone: "var(--accent)" },
};

function Row({ seat, p, active, you }: { seat: Seat; p: PlayerState; active: boolean; you: boolean }) {
  const pegs = pegColors(seat, p);
  const role = p.career ? `${p.career} · ${money(p.salary)}` : p.route ? "Studying" : "Choosing a road";
  return (
    <li className={`${s.row} ${active ? s.rowOn : ""} ${p.retired ? s.rowDone : ""}`} style={{ ["--car" as string]: seat.color }}>
      <span className={s.rowCar} aria-hidden="true" />
      <div className={s.rowMain}>
        <div className={s.rowTop}>
          <span className={s.rowName}>{you ? "You" : seat.name}</span>
          <span className={s.pegs} role="img" aria-label={`${pegs.length} in the car`}>
            {pegs.map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </span>
          <span className={s.rowCash}>{money(p.cash)}</span>
        </div>
        <div className={s.rowSub}>
          <span>{p.retired ? "Retired" : role}</span>
          <span title="Cash, home, Growth Fund and family, minus loans">worth {money(netWorth(p))}</span>
        </div>
        {(p.home || p.fund > 0 || p.insured || p.unpaid > 0 || p.loans > 0) && (
          <div className={s.badges}>
            {p.home && (
              <span>
                <Icon name="house" size={13} /> {p.home.name}
              </span>
            )}
            {p.fund > 0 && (
              <span title="Growth Fund: moves with the market every round">
                <Icon name="trend" size={13} /> {money(p.fund)}
              </span>
            )}
            {p.insured && (
              <span title="Blocks the next lawsuit, layoff, audit or disaster">
                <Icon name="shield" size={13} /> Insured
              </span>
            )}
            {p.loans > 0 && (
              <span className={s.badgeBad}>
                <Icon name="receipt" size={13} /> Owes {money(p.loans)}
              </span>
            )}
            {p.unpaid > 0 && (
              <span className={s.badgeBad} title="The next paydays pay nothing">
                <Icon name="alert" size={13} /> Laid off · {p.unpaid}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function Players({ view }: { view: ViewState }) {
  const m = MARKET[view.game.market];
  return (
    <section className={`${s.standings} ${s.surface}`} aria-label="Standings">
      <header className={s.standHead}>
        <span className={s.kicker}>Standings</span>
        <span className={s.market} style={{ color: m.tone }} title="The market moves every Growth Fund and home value each round">
          <Icon name={m.icon} size={15} weight={2} />
          Market {m.label}
        </span>
      </header>
      <ol className={s.rows}>
        {view.game.players.map((p, i) => (
          <Row key={p.id} seat={view.seats[i]!} p={p} you={view.seats[i]!.id === view.localId} active={view.game.turn === i && view.game.phase !== "over" && !p.retired} />
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ console

const WEDGES = ["#F2C14E", "#F7E3B0", "#4F9D69", "#CFE5C9", "#EF9FB4", "#F8D9E1", "#3F7CC6", "#CCDCF1", "#E4572E", "#F6CDBF"];

function Wheel({ deg, value }: { deg: number; value: string }) {
  const r = 50;
  const wedge = (i: number) => {
    const a0 = ((i * 36 - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * 36 - 90) * Math.PI) / 180;
    return `M50 50 L${50 + r * Math.cos(a0)} ${50 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${50 + r * Math.cos(a1)} ${50 + r * Math.sin(a1)} Z`;
  };
  return (
    <div className={s.wheel}>
      <svg viewBox="0 0 100 100" style={{ transform: `rotate(${deg}deg)` }} aria-hidden="true">
        {WEDGES.map((c, i) => (
          <path key={i} d={wedge(i)} fill={c} stroke="#fbfaf6" strokeWidth={0.8} />
        ))}
        {Array.from({ length: 10 }, (_, i) => {
          const a = (((i + 0.5) * 36 - 90) * Math.PI) / 180;
          return (
            <text key={i} x={50 + 37 * Math.cos(a)} y={50 + 37 * Math.sin(a)} transform={`rotate(${(i + 0.5) * 36} ${50 + 37 * Math.cos(a)} ${50 + 37 * Math.sin(a)})`} className={s.wheelNum}>
              {i + 1}
            </text>
          );
        })}
      </svg>
      <span className={s.hub} aria-live="polite">
        {value}
      </span>
      <svg className={s.pointer} width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
        <path d="M9 13L1.5 1h15z" fill="var(--ink)" stroke="#fbfaf6" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Console({ view, canSpin, onSpin }: { view: ViewState; canSpin: boolean; onSpin(): void }) {
  return (
    <div className={`${s.console} ${s.surface}`}>
      <p className={s.status} aria-live="polite">
        {view.message}
      </p>
      <Wheel deg={view.wheelDeg} value={view.wheelValue} />
      <button type="button" className={s.spin} disabled={!canSpin} onClick={onSpin}>
        <span>Spin</span>
        <kbd>Space</kbd>
      </button>
    </div>
  );
}

// -------------------------------------------------------------------- toast

export function ToastView({ toast }: { toast: ViewState["toast"] }) {
  if (!toast) return null;
  const { amount } = toast;
  return (
    <div className={s.toastWrap}>
      <div key={toast.id} className={`${s.toast} ${s.surface} ${s[`tone_${toast.tone}`]}`}>
        <div className={s.toastText}>
          <span className={s.toastKicker}>{toast.kicker.charAt(0) + toast.kicker.slice(1).toLowerCase()}</span>
          <span className={s.toastBody}>{toast.text}</span>
        </div>
        {amount !== null && (
          <span className={`${s.toastAmt} ${amount < 0 ? s.neg : s.pos}`}>
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
    <div className={`${s.tip} ${s.surface}`} style={{ left: x + 18, top: y + 18 }} role="tooltip">
      <div className={s.tipHead}>
        <TileDot type={n.type} size={32} />
        <span>
          <b>{n.label ?? info.name}</b>
          <span>{road ? `${road} · tile ${n.index + 1}` : "Start"}</span>
        </span>
      </div>
      <p>{info.long}</p>
      {info.stop && <span className={s.tipStop}>Everyone stops here</span>}
    </div>
  );
}
