"use client";

import { useEffect } from "react";
import { RULES, TILE_INFO, getBoard, type ChoiceKind, type MilestonesState, type Option, type TileType } from "@boredgames/milestones";
import { money, type ViewState } from "@/lib/milestones/controller";
import { iconFor, type IconName } from "@/lib/milestones/icons";
import { TileDot } from "./Hud";
import { Icon } from "./Icon";
import s from "./milestones.module.css";

const KICKER: Record<ChoiceKind, string> = {
  route: "Opening road",
  branch: "Crossroads",
  job: "Job board",
  home: "Home",
  invest: "Market",
  lawsuit: "Lawsuit",
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
    <span className={s.mix}>
      <span className={s.mixTotal}>{total} tiles</span>
      {items.map(({ type, n }) => (
        <span key={type} className={s.mixItem} title={`${n} × ${TILE_INFO[type].name}`}>
          <TileDot type={type} size={18} />
          {n}
        </span>
      ))}
    </span>
  );
}

interface Card {
  icon: IconName;
  label: string;
  detail: string;
  facts?: [string, string][];
  color: string;
  extra?: React.ReactNode;
}

function describe(o: Option, g: MilestonesState): Card {
  const p = g.players[g.turn]!;
  switch (o.type) {
    case "route": {
      const facts: [string, string][] = [];
      if (o.path.loan) facts.push(["Loan", money(o.path.loan)]);
      if (o.path.cash) facts.push(["Cash", `+${money(o.path.cash)}`]);
      facts.push(["Leads to", TIER_NAME[o.path.tier]]);
      return { icon: iconFor(o.path.icon), label: o.path.name, detail: o.path.blurb, facts, color: o.path.loan ? "#7d6bd0" : "#4f9d69", extra: <Mix mapId={g.map} segment={o.path.segment} /> };
    }
    case "branch": {
      const road = getBoard(g.map).nodes[o.node]!.segment;
      return {
        icon: o.vibe === "risky" ? "bolt" : "road",
        label: o.name,
        detail: o.blurb,
        facts: [["Expect", o.vibe === "risky" ? "more market stops" : "more paydays"]],
        color: o.vibe === "risky" ? "#2a9d8f" : "#4f9d69",
        extra: <Mix mapId={g.map} segment={road} />,
      };
    }
    case "job":
      return {
        icon: "briefcase",
        label: o.title,
        detail: o.perk ? `Comes with a ${money(o.perk)} bonus in your Growth Fund.` : "Steady work.",
        facts: [["Pay", `${money(o.salary)} a payday`]],
        color: "#4f9d69",
      };
    case "home": {
      const borrow = Math.max(0, o.home.price - p.cash);
      const facts: [string, string][] = [["Price", money(o.home.price)]];
      if (borrow) facts.push(["Borrows", money(Math.ceil(borrow / RULES.loanChunk) * RULES.loanChunk)]);
      facts.push(["Value grows", o.home.growth >= 1.2 ? "fast" : o.home.growth >= 0.9 ? "steadily" : "slowly"]);
      return { icon: "house", label: o.home.name, detail: "Sold when you retire, for whatever it is worth by then.", facts, color: "#3f7cc6" };
    }
    case "rent":
      return { icon: "suitcase", label: "Skip it", detail: "Keep your cash for now.", color: "#77726a" };
    case "invest":
      return {
        icon: "trend",
        label: `Invest ${money(o.amount)}`,
        detail: "Moves with the market: +10% in a boom, −8% in a slump, about +4% on average.",
        facts: [["Paid out", "when you retire"]],
        color: "#2a9d8f",
      };
    case "insure":
      return { icon: "shield", label: "Buy insurance", detail: "Blocks your next lawsuit, layoff, tax audit or disaster. One use.", facts: [["Costs", money(o.cost)]], color: "#3f7cc6" };
    case "settle":
      return { icon: "handshake", label: "Settle", detail: "Pay up and make it go away.", facts: [["You pay", money(o.amount)]], color: "#77726a" };
    case "fight":
      return { icon: "scales", label: "Fight it in court", detail: "A coin flip. Win and you pay nothing; lose and it costs double.", facts: [["Win", "$0"], ["Lose", money(o.lose)]], color: "#e4572e" };
    case "skip":
      return { icon: "hand", label: o.label, detail: o.detail, color: "#77726a" };
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
      <div role="dialog" aria-modal="true" aria-labelledby="choice-title" className={s.sheet}>
        <header className={s.sheetHead}>
          <span className={s.kickerAccent}>{KICKER[choice.kind]}</span>
          <h2 id="choice-title">{choice.title}</h2>
          <p>{choice.text}</p>
          {choice.kind === "invest" && (
            <p className={s.sheetNums}>
              <span>
                Cash <b>{money(p.cash)}</b>
              </span>
              <span>
                Growth Fund <b>{money(Math.round(p.fund))}</b>
              </span>
            </p>
          )}
        </header>

        <div className={s.options} data-count={choice.options.length}>
          {choice.options.map((o, i) => {
            const c = describe(o, game);
            return (
              <button key={i} type="button" className={s.opt} onClick={() => onPick(i)} style={{ ["--c" as string]: c.color, animationDelay: `${i * 50}ms` }}>
                <span className={s.optTop}>
                  <span className={s.optIcon}>
                    <Icon name={c.icon} size={22} />
                  </span>
                  <kbd className={s.optKey}>{i + 1}</kbd>
                </span>
                <span className={s.optLabel}>{c.label}</span>
                <span className={s.optDetail}>{c.detail}</span>
                {c.extra}
                {c.facts && (
                  <span className={s.facts}>
                    {c.facts.map(([k, v]) => (
                      <span key={k}>
                        <span>{k}</span>
                        <b>{v}</b>
                      </span>
                    ))}
                  </span>
                )}
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
  const title = tie ? "A tie." : winner.seat.id === view.localId ? "You win." : `${winner.seat.name} wins.`;

  return (
    <div className={s.scrim}>
      <div role="dialog" aria-modal="true" aria-labelledby="results-title" className={`${s.sheet} ${s.results}`}>
        <header className={s.sheetHead}>
          <span className={s.kickerAccent}>Everyone has retired</span>
          <h2 id="results-title">{title}</h2>
          <p>Net worth at the end: cash, the home sold, the Growth Fund and family, less loans.</p>
        </header>
        <ol className={s.ranking}>
          {results.map(({ seat, player, net, rank, portfolio }) => {
            const parts = [`cash ${money(player.cash)}`];
            if (player.homeSale) parts.push(`home ${money(player.homeSale)}`);
            if (portfolio) parts.push(`fund ${money(portfolio)}`);
            if (player.kids) parts.push(`kids +${money(player.kids * RULES.kidValue)}`);
            if (player.retiredFirst) parts.push(`first to retire +${money(RULES.retireFirstBonus)}`);
            if (player.loans) parts.push(`loans −${money(Math.round(player.loans * RULES.loanInterest))}`);
            return (
              <li key={seat.id} className={rank === 1 ? s.first : ""}>
                <span className={s.rank}>{String(rank).padStart(2, "0")}</span>
                <span className={s.rankWho}>
                  <b>
                    <i style={{ background: seat.color }} />
                    {seat.id === view.localId ? "You" : seat.name}
                  </b>
                  <span>{parts.join(" · ")}</span>
                </span>
                <span className={s.rankNet}>{money(net)}</span>
              </li>
            );
          })}
        </ol>
        <div className={s.resultActions}>
          {onAgain ? (
            <button type="button" className={s.primary} onClick={onAgain}>
              Play again
              <Icon name="arrow" size={18} />
            </button>
          ) : (
            <span className={s.muted}>The host can start another game.</span>
          )}
          <button type="button" className={s.secondary} onClick={onMenu}>
            Change map
          </button>
        </div>
      </div>
    </div>
  );
}
