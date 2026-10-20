"use client";

import { useEffect } from "react";
import { RULES, TILE_INFO, getBoard, type ChoiceKind, type MilestonesState, type Option, type TileType } from "@boredgames/milestones";
import { money, type ViewState } from "@/lib/milestones/controller";
import s from "./milestones.module.css";

const KICKER: Record<ChoiceKind, string> = {
  route: "OPENING ROAD",
  branch: "CROSSROADS",
  job: "JOB",
  home: "HOME",
  invest: "GROWTH FUND",
};

const TIER_NAME = {
  degree: "degree jobs",
  trade: "trades and crafts",
  corporate: "corporate jobs",
  venture: "startup roles",
} as const;

/** Count the tiles on one road, to show what a path is made of. */
function mix(mapId: string, segment: string): { type: TileType; n: number }[] {
  const board = getBoard(mapId);
  const info = board.segments[segment];
  if (!info) return [];
  const counts = new Map<TileType, number>();
  for (let id = info.first; id <= info.last; id++) {
    const t = board.nodes[id]!.type;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts].filter(([t]) => t !== "event").map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);
}

function Mix({ mapId, segment }: { mapId: string; segment: string }) {
  const items = mix(mapId, segment);
  const total = getBoard(mapId).segments[segment]?.length ?? 0;
  return (
    <span className={s.mix} aria-label={`${total} tiles`}>
      <span className={s.mixTotal}>{total} tiles</span>
      {items.map(({ type, n }) => (
        <span key={type} className={s.mixItem} title={`${n} × ${TILE_INFO[type].name}`}>
          <span className={s.mixDot} style={{ background: TILE_INFO[type].color }} />
          {TILE_INFO[type].icon}
          {n}
        </span>
      ))}
    </span>
  );
}

interface Card {
  icon?: string;
  label: string;
  detail: string;
  meta?: string;
  color: string;
  extra?: React.ReactNode;
}

function describe(o: Option, g: MilestonesState): Card {
  const p = g.players[g.turn]!;
  switch (o.type) {
    case "route": {
      const bits = [];
      if (o.path.loan) bits.push(`LOAN ${money(o.path.loan)}`);
      if (o.path.cash) bits.push(`+${money(o.path.cash)} CASH`);
      return {
        icon: o.path.icon,
        label: o.path.name,
        detail: `${o.path.blurb} Leads to ${TIER_NAME[o.path.tier]}.`,
        meta: bits.join(" · ") || undefined,
        color: o.path.loan ? "#8E7CC3" : "#7BC47F",
        extra: <Mix mapId={g.map} segment={o.path.segment} />,
      };
    }
    case "branch": {
      const road = getBoard(g.map).nodes[o.node]!.segment;
      return {
        icon: o.vibe === "risky" ? "📈" : "💰",
        label: o.name,
        detail: o.blurb,
        meta: o.vibe === "risky" ? "MORE MARKET STOPS" : "MORE PAYDAYS",
        color: o.vibe === "risky" ? "#00A6A6" : "#2FBF71",
        extra: <Mix mapId={g.map} segment={road} />,
      };
    }
    case "job":
      return {
        label: o.title,
        detail: o.perk ? `Includes a ${money(o.perk)} bonus in your Growth Fund.` : "Steady work.",
        meta: `${money(o.salary)} PER PAYDAY`,
        color: "#7BC47F",
        icon: "💼",
      };
    case "home": {
      const borrow = Math.max(0, o.home.price - p.cash);
      return {
        icon: "🏠",
        label: o.home.name,
        detail: `Gains value every round (${o.home.growth >= 1.2 ? "fast" : o.home.growth >= 0.9 ? "steady" : "slow"}). Sold when you retire.`,
        meta: `PRICE ${money(o.home.price)}${borrow ? ` · BORROWS ${money(Math.ceil(borrow / RULES.loanChunk) * RULES.loanChunk)}` : ""}`,
        color: "#1E88E5",
      };
    }
    case "rent":
      return { icon: "🧳", label: "Skip", detail: "Keep your cash.", meta: "$0", color: "#8A94A6" };
    case "invest":
      return {
        icon: "📈",
        label: `Invest ${money(o.amount)}`,
        detail: `Grows 4% a round. About ${money(o.amount * Math.pow(1 + RULES.fundRate, 10))} after 10 rounds.`,
        meta: "PAID OUT AT THE END",
        color: "#00A6A6",
      };
    case "skip":
      return { icon: "✋", label: o.label, detail: o.detail, color: "#C9CFD4" };
  }
}

export function ChoiceSheet({ view, onPick }: { view: ViewState; onPick(index: number): void }) {
  const { game } = view;
  const choice = game.choice;
  const mine = game.phase === "choice" && !!choice && view.seats[game.turn]!.id === view.localId && !view.busy;

  // Number keys pick the matching card.
  useEffect(() => {
    if (!mine || !choice) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= choice.options.length) onPick(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mine, choice, onPick]);

  if (!mine || !choice) return null;
  const p = game.players[game.turn]!;

  return (
    <div className={s.scrim}>
      <div role="dialog" aria-modal="true" aria-labelledby="choice-title" className={`${s.sheet} ${s.glass}`}>
        <div>
          <span className={s.toastKicker}>{KICKER[choice.kind]}</span>
          <h2 id="choice-title" className={s.sheetTitle}>
            {choice.title}
          </h2>
          <p className={s.sheetSub}>{choice.text}</p>
        </div>

        {choice.kind === "invest" && (
          <div className={s.investBar}>
            <span className={s.chip}>Cash {money(p.cash)}</span>
            <span className={s.chip}>Fund {money(Math.round(p.fund))}</span>
          </div>
        )}

        <div className={s.options}>
          {choice.options.map((o, i) => {
            const c = describe(o, game);
            return (
              <button key={i} type="button" className={s.opt} onClick={() => onPick(i)} style={{ ["--accent" as string]: c.color }}>
                <span className={s.optBar} style={{ background: c.color }} />
                <span className={s.optTop}>
                  {c.icon && <span className={s.optIcon}>{c.icon}</span>}
                  <span className={s.optLabel}>{c.label}</span>
                  <span className={s.optKey} aria-hidden="true">
                    {i + 1}
                  </span>
                </span>
                <span className={s.optDetail}>{c.detail}</span>
                {c.extra}
                {c.meta && <span className={s.optMeta}>{c.meta}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ results

export function ResultsDialog({ view, onAgain, onMenu }: { view: ViewState; onAgain?: () => void; onMenu(): void }) {
  const results = view.results;
  if (!results) return null;
  const winner = results[0]!;
  const tie = results[1] && results[1].net === winner.net;
  const title = tie ? "It’s a tie." : winner.seat.id === view.localId ? "You win." : `${winner.seat.name} wins.`;

  return (
    <div className={s.scrim} style={{ background: "rgba(35,48,59,.28)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="results-title" className={s.results}>
        <span className={s.toastKicker}>GAME OVER</span>
        <h2 id="results-title" className={s.resultsTitle}>
          {title}
        </h2>
        {results.map(({ seat, player, net, rank, portfolio }) => {
          const parts = [`cash ${money(player.cash)}`];
          if (player.homeSale) parts.push(`home ${money(player.homeSale)}`);
          if (portfolio) parts.push(`Growth Fund ${money(portfolio)}`);
          if (player.kids) parts.push(`kids +${money(player.kids * RULES.kidValue)}`);
          if (player.retiredFirst) parts.push(`first to retire +${money(RULES.retireFirstBonus)}`);
          if (player.loans) parts.push(`loans −${money(Math.round(player.loans * RULES.loanInterest))}`);
          return (
            <div key={seat.id} className={s.resultRow}>
              <div>
                <span className={s.resultName}>
                  <span className={s.rank}>{rank}</span>
                  <span className={s.swatch} style={{ background: seat.color }} />
                  {seat.id === view.localId ? "You" : seat.name}
                </span>
                <span className={s.resultLines}>{parts.join(" · ")}</span>
              </div>
              <span className={s.resultNet}>{money(net)}</span>
            </div>
          );
        })}

        <div className={s.resultActions}>
          {onAgain ? (
            <button type="button" className={s.spinBtn} onClick={onAgain}>
              Play again
            </button>
          ) : (
            <span className={s.resultLines}>The host can start another game.</span>
          )}
          <button type="button" className={`${s.pillBtn} ${s.outline}`} onClick={onMenu}>
            Change map
          </button>
        </div>
      </div>
    </div>
  );
}
