"use client";

import { useEffect, useRef, useState } from "react";
import {
  CASTLE_COST,
  CROWNS,
  CROWNS_ALLIANCE,
  CROWNS_SOLO,
  HOUSES,
  MUSTER_CAP,
  PROVINCES,
  SEASON_INFO,
  TIDING_INFO,
  UNIT_INFO,
  crownsOf,
  current,
  income,
  isStronghold,
  provincesOf,
  ranking,
  score,
  seasonOf,
  size,
  strength,
  unitCost,
  type Army,
  type BannersState,
  type Unit,
} from "@boredgames/banners";
import type { BannersController, BattleShow, View } from "@/lib/banners/controller";
import { describeArmy } from "@/lib/banners/controller";
import { Shield } from "./Heraldry";
import s from "./banners.module.css";

const houseOf = (v: View, id: string | null | undefined) => v.seats.find((x) => x.id === id)?.house ?? null;
const UNITS_ORDER: Unit[] = ["foot", "archers", "knights"];

export function TopBar({ view, music, sfx, onMusic, onSfx, onRules, onLeave }: { view: View; music: boolean; sfx: boolean; onMusic(): void; onSfx(): void; onRules(): void; onLeave(): void }) {
  const g = view.game;
  const season = seasonOf(g.round);
  return (
    <header className={s.topbar}>
      <button type="button" className={s.iconBtn} onClick={onLeave} aria-label="Leave the war">
        ←
      </button>
      <span className={s.brand}>BANNERS</span>
      <div className={s.season}>
        <b>
          {SEASON_INFO[season].name}, year {Math.ceil(g.round / 4)}
        </b>
        <span>
          Round {g.round} of {g.rounds} · {TIDING_INFO[g.tiding].name}
        </span>
      </div>
      <nav className={s.order} aria-label="Order of play">
        {g.players.map((p, i) => (
          <span key={p.id} className={`${s.orderItem} ${i === g.turn && g.phase === "play" ? s.orderNow : ""} ${p.alive ? "" : s.orderOut}`} title={`${HOUSES[p.house].name}${p.id === view.localId ? " (you)" : ""}`}>
            <Shield house={p.house} size={20} />
            <span className={s.orderName}>{p.id === view.localId ? "You" : p.name}</span>
          </span>
        ))}
      </nav>
      <button type="button" className={s.iconBtn} onClick={onRules}>
        Rules
      </button>
      <button type="button" className={s.iconBtn} onClick={onMusic} aria-pressed={music} title="Music">
        {music ? "♫" : "♫̸"}
      </button>
      <button type="button" className={s.iconBtn} onClick={onSfx} aria-pressed={sfx} title="Sound">
        {sfx ? "🔊" : "🔈"}
      </button>
    </header>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange(v: number): void; label: string }) {
  return (
    <span className={s.stepper} aria-label={label}>
      <button type="button" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        −
      </button>
      <span style={{ minWidth: 20, textAlign: "center", fontFamily: "var(--f-title)", fontWeight: 700 }}>{value}</span>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
        +
      </button>
    </span>
  );
}

export function SidePanel({
  view,
  ctl,
  selected,
  army,
  setArmy,
  error,
  setError,
  onEnd,
}: {
  view: View;
  ctl: BannersController;
  selected: number | null;
  army: Army;
  setArmy(a: Army): void;
  error: string | null;
  setError(e: string | null): void;
  onEnd(): void;
}) {
  const g = view.game;
  const me = g.players.find((p) => p.id === view.localId)!;
  const myTurn = g.phase === "play" && current(g).id === view.localId && !view.busy;
  const turnHouse = houseOf(view, current(g).id);
  const act = (m: Parameters<BannersController["play"]>[0]) => setError(ctl.play(m));
  const prov = selected !== null ? g.provinces[selected]! : null;
  const def = selected !== null ? PROVINCES[selected]! : null;
  const mineSel = prov && prov.owner === view.localId;

  return (
    <aside className={s.side}>
      <section className={s.panel}>
        <div className={s.panelHead}>
          <Shield house={me.house} size={46} />
          <div>
            <div className={s.panelTitle}>{HOUSES[me.house].name}</div>
            <div className={s.panelSub}>“{HOUSES[me.house].motto}”</div>
          </div>
        </div>
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <span className={s.gold}>
            <span className={s.coin} />
            {me.gold}
          </span>
          <span className={s.panelSub}>+{income(g, me.id)} a turn</span>
          <span className={s.panelSub}>
            Crowns {crownsOf(g, me.id)}/{CROWNS.length}
          </span>
        </div>
        {!me.alive && <p className={s.err}>Your house has fallen. Watch how the war ends.</p>}
      </section>

      {g.phase === "play" && !myTurn && current(g).id !== view.localId && (
        <p className={s.waiting}>
          {turnHouse ? `${HOUSES[turnHouse].name} is deciding…` : "…"}
        </p>
      )}

      {prov && def && (
        <section className={s.panel}>
          <div className={s.panelHead}>
            <Shield house={houseOf(view, prov.owner)} size={34} />
            <div>
              <div className={s.panelTitle}>
                {def.name}
                {def.crown ? " ♛" : ""}
              </div>
              <div className={s.panelSub}>
                {prov.owner ? HOUSES[houseOf(view, prov.owner)!].name : "Held by local lords"} · {def.terrain} · {"●".repeat(def.income)} gold
                {prov.castle ? " · castle" : ""}
              </div>
            </div>
          </div>
          <div className={s.troops}>
            {UNITS_ORDER.map((u) => (
              <div key={u} className={s.troop}>
                <span className={s.troopCount}>{prov.army[u] + prov.tired[u]}</span>
                <span className={s.troopName}>{UNIT_INFO[u].plural}</span>
                {prov.tired[u] > 0 && mineSel && <span className={s.tiredNote}>{prov.tired[u]} resting</span>}
              </div>
            ))}
          </div>
          {def.terrain === "hills" && <p className={s.hint}>Hills: defenders add +1 to their best die.</p>}
          {def.terrain === "forest" && <p className={s.hint}>Forest: knights lose their charge here.</p>}

          {mineSel && myTurn && size(prov.army) > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className={s.h2} style={{ marginBottom: 6 }}>
                March
              </div>
              <div className={s.marchGrid}>
                {UNITS_ORDER.map((u) =>
                  prov.army[u] > 0 ? (
                    <Row key={u} label={UNIT_INFO[u].plural}>
                      <Stepper value={army[u]} max={prov.army[u]} onChange={(v) => setArmy({ ...army, [u]: v })} label={UNIT_INFO[u].plural} />
                    </Row>
                  ) : null,
                )}
              </div>
              <p className={s.hint}>
                {size(army) === 0
                  ? "Choose who marches."
                  : `Click a province marked in red to march ${describeArmy(army)} there.${army.foot + army.archers === 0 && seasonOf(g.round) !== "winter" ? " Knights alone can ride two provinces." : ""}`}
              </p>
            </div>
          )}

          {mineSel && myTurn && isStronghold(g, selected!) && (
            <div style={{ marginTop: 12 }}>
              <div className={s.h2} style={{ marginBottom: 6 }}>
                Raise troops <span style={{ textTransform: "none", letterSpacing: 0 }}>({MUSTER_CAP - g.mustered[selected!]!} left this turn)</span>
              </div>
              <div className={s.recruit}>
                {UNITS_ORDER.map((u) => (
                  <Row key={u} label={UNIT_INFO[u].plural} sub={UNIT_INFO[u].blurb}>
                    <span className={s.price}>{unitCost(g, u)}g</span>
                    <button type="button" className={s.btn} disabled={me.gold < unitCost(g, u) || g.mustered[selected!]! >= MUSTER_CAP} onClick={() => act({ type: "recruit", at: selected!, unit: u })}>
                      Raise
                    </button>
                  </Row>
                ))}
              </div>
            </div>
          )}
          {mineSel && myTurn && !prov.castle && (
            <div className={s.row} style={{ marginTop: 10 }}>
              <button type="button" className={s.btn} disabled={me.gold < CASTLE_COST} onClick={() => act({ type: "castle", at: selected! })}>
                Build a castle · {CASTLE_COST}g
              </button>
              <span className={s.panelSub} style={{ fontSize: 13.5 }}>
                A castle gives defenders a third die and lets you raise troops here.
              </span>
            </div>
          )}
        </section>
      )}
      {!prov && myTurn && <p className={s.hint}>Click one of your provinces to raise troops or march. Strongholds (castles and crown cities) raise troops.</p>}
      {error && <p className={s.err}>{error}</p>}

      <Diplomacy view={view} act={act} myTurn={myTurn} />

      <section className={s.panel}>
        <div className={s.h2}>The crowns</div>
        <p className={s.hint} style={{ marginTop: 0 }}>
          Hold {CROWNS_SOLO} of the {CROWNS.length} crown cities at the end of a round to win alone, or {CROWNS_ALLIANCE} together with an ally. Otherwise the realm is judged after round {g.rounds}.
        </p>
      </section>

      {g.phase === "play" && me.alive && (
        <div className={s.endBar}>
          <button type="button" className={s.seal} disabled={!myTurn} onClick={onEnd}>
            {myTurn ? "End turn" : "Waiting"}
          </button>
        </div>
      )}
    </aside>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <>
      <span title={sub}>{label}</span>
      {children}
    </>
  );
}

function Diplomacy({ view, act, myTurn }: { view: View; act(m: Parameters<BannersController["play"]>[0]): void; myTurn: boolean }) {
  const g = view.game;
  const me = g.players.find((p) => p.id === view.localId)!;
  const [confirmBreak, setConfirmBreak] = useState(false);
  if (g.players.length < 3) return null;
  return (
    <section className={s.panel}>
      <div className={s.h2}>Diplomacy</div>
      <div className={s.diplo}>
        {g.players
          .filter((p) => p.id !== me.id)
          .map((p) => {
            const ally = me.ally === p.id;
            const grudge = me.grudges.find((x) => x.id === p.id) ?? p.grudges.find((x) => x.id === me.id);
            const sent = g.proposals.some((x) => x.from === me.id && x.to === p.id);
            return (
              <div key={p.id} className={s.realm}>
                <Shield house={p.house} size={30} />
                <div>
                  <div className={s.realmName}>
                    {HOUSES[p.house].name} {!p.alive && "†"}
                  </div>
                  <div className={s.realmMeta}>
                    ♛ {crownsOf(g, p.id)} · {provincesOf(g, p.id).length} lands · {strength(g, p.id)} troops · {p.gold}g
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  {ally && <span className={`${s.badge} ${s.ally}`}>Ally</span>}
                  {grudge && !ally && <span className={`${s.badge} ${s.grudge}`}>Bad blood</span>}
                  {p.ally && !ally && <span className={s.badge}>Allied</span>}
                </div>
                {p.alive && myTurn && (
                  <div className={s.row} style={{ gridColumn: "1 / -1" }}>
                    {!me.ally && !p.ally && !grudge && (
                      <button type="button" className={s.btn} disabled={sent} onClick={() => act({ type: "propose", to: p.id })}>
                        {sent ? "Envoy on the road" : "Send an envoy"}
                      </button>
                    )}
                    {ally &&
                      (confirmBreak ? (
                        <>
                          <button type="button" className={`${s.btn} ${s.btnWax}`} onClick={() => (setConfirmBreak(false), act({ type: "break" }))}>
                            Break the oath
                          </button>
                          <button type="button" className={s.btn} onClick={() => setConfirmBreak(false)}>
                            Keep faith
                          </button>
                        </>
                      ) : (
                        <button type="button" className={s.btn} onClick={() => setConfirmBreak(true)}>
                          Betray…
                        </button>
                      ))}
                    <button type="button" className={s.btn} disabled={me.gold < 3} onClick={() => act({ type: "tribute", to: p.id, gold: 3 })}>
                      Gift 3g
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {me.ally && <p className={s.hint}>Allies cannot attack each other. Knights may ride through allied land, and an allied army next door helps you defend (+1).</p>}
    </section>
  );
}

export function Chronicle({ view }: { view: View }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [view.chronicle.length]);
  return (
    <div className={s.chronicle} ref={ref} aria-live="polite">
      <h3>The chronicle</h3>
      {view.chronicle.slice(-30).map((e) => (
        <div key={e.id} className={`${s.entry} ${s[`e_${e.tone}`]}`}>
          <span className={s.dot} style={{ background: e.house ? HOUSES[e.house].color : undefined }} />
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Herald({ view, onClick }: { view: View; onClick(): void }) {
  const a = view.announce;
  if (!a) return null;
  return (
    <div className={s.herald} onClick={onClick} role="status">
      {(a.house || a.other) && (
        <div className={s.row} style={{ justifyContent: "center", gap: 14, marginBottom: 6 }}>
          {a.house && <Shield house={a.house} size={44} />}
          {a.other && <Shield house={a.other} size={44} />}
        </div>
      )}
      <div className={s.heraldTitle}>{a.title}</div>
      <div className={s.heraldText}>{a.text}</div>
    </div>
  );
}

export function BattleCard({ battle, onClick }: { battle: BattleShow | null; onClick(): void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!battle) return;
    setShown(0);
    const per = battle.mine ? 360 : 140;
    let k = 0;
    const h = setInterval(() => {
      k++;
      setShown(k);
      if (k >= battle.rounds.length) clearInterval(h);
    }, per);
    return () => clearInterval(h);
  }, [battle]);
  if (!battle) return null;
  const done = shown >= battle.rounds.length;
  const rows = battle.rounds.slice(Math.max(0, shown - 6), shown);
  const a = HOUSES[battle.attacker];
  return (
    <div className={s.overlay} onClick={onClick}>
      <div className={`${s.card} ${s.battle}`} role="dialog" aria-label="Battle">
        <div className={s.h2}>Battle for {PROVINCES[battle.at]!.name}</div>
        <div className={s.sides}>
          <div className={s.side1}>
            <Shield house={battle.attacker} size={52} />
            <b style={{ fontFamily: "var(--f-title)" }}>{a.name}</b>
            <span className={s.armyLine}>{describeArmy(done ? battle.aEnd : battle.aStart)}</span>
          </div>
          <span className={s.vs}>⚔</span>
          <div className={s.side1}>
            <Shield house={battle.defender} size={52} />
            <b style={{ fontFamily: "var(--f-title)" }}>{battle.defender ? HOUSES[battle.defender].name : "Local lords"}</b>
            <span className={s.armyLine}>{describeArmy(done ? battle.dEnd : battle.dStart)}</span>
          </div>
        </div>
        <div className={s.diceRows}>
          {rows.map((r, i) => (
            <div key={`${shown}-${i}`} className={s.diceRow}>
              <div className={`${s.dice} ${s.diceA}`}>
                {r.a.map((d, k) => (
                  <span key={k} className={`${s.die} ${s.dieA} ${r.d[k] !== undefined && d > r.d[k]! ? s.dieWin : ""}`}>
                    {d}
                  </span>
                ))}
              </div>
              <span className={s.losses}>
                {r.aLoss ? `−${r.aLoss}` : ""} / {r.dLoss ? `−${r.dLoss}` : ""}
              </span>
              <div className={s.dice}>
                {r.d.map((d, k) => (
                  <span key={k} className={`${s.die} ${r.a[k] !== undefined && d >= r.a[k]! ? s.dieWin : ""}`}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {done && <div className={s.verdict} style={{ color: battle.won ? a.color : "#2b1d12" }}>{battle.won ? `${PROVINCES[battle.at]!.name} falls!` : "The attack is thrown back"}</div>}
      </div>
    </div>
  );
}

/** A sealed letter from another house's envoy. */
export function Letter({ view, ctl }: { view: View; ctl: BannersController }) {
  const g = view.game;
  const myTurn = g.phase === "play" && current(g).id === view.localId && !view.busy;
  const pr = g.proposals.find((p) => p.to === view.localId);
  if (!pr || !myTurn) return null;
  const from = g.players.find((p) => p.id === pr.from)!;
  const h = HOUSES[from.house];
  return (
    <div className={s.overlay}>
      <div className={`${s.card} ${s.letter}`} role="dialog" aria-label="A letter">
        <div className={s.row} style={{ gap: 14 }}>
          <Shield house={from.house} size={54} />
          <div>
            <div className={s.h2} style={{ margin: 0 }}>
              A rider bears a sealed letter
            </div>
            <div className={s.cardTitle} style={{ margin: 0, fontSize: 24 }}>
              From {h.name}
            </div>
          </div>
        </div>
        <p className={s.letterBody}>
          “To our neighbour, greetings. Let our banners fly together: we will not raise our swords against you, our knights may ride through your lands and ours, and when the crowns are counted we will count them as one. — {from.name}, for {h.name}.”
        </p>
        <p className={s.hint}>Together you need {CROWNS_ALLIANCE} crowns to win. Breaking an oath later costs prestige, and they will not trust you again for a while.</p>
        <div className={s.row} style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className={s.btn} onClick={() => ctl.play({ type: "answer", proposal: pr.id, accept: false })}>
            Send the rider home
          </button>
          <button type="button" className={`${s.btn} ${s.btnDark}`} onClick={() => ctl.play({ type: "answer", proposal: pr.id, accept: true })}>
            Swear the oath
          </button>
        </div>
      </div>
    </div>
  );
}

export function Victory({ view, onAgain, onLeave }: { view: View; onAgain?: () => void; onLeave(): void }) {
  const g = view.game;
  if (g.phase !== "over") return null;
  const order = ranking(g).flat();
  const won = g.winners?.includes(view.localId);
  return (
    <div className={s.overlay}>
      <div className={s.card} role="dialog" aria-label="The war is over">
        <div className={s.h2}>The war is over</div>
        <h2 className={s.cardTitle}>{won ? (g.winners!.length > 1 ? "Victory, shared" : "Victory!") : "Defeat"}</h2>
        <p className={s.cardText}>{g.winReason}</p>
        <div className={s.ranking}>
          {order.map((id, i) => {
            const p = g.players.find((x) => x.id === id)!;
            return (
              <div key={id} className={`${s.rank} ${g.winners?.includes(id) ? s.rankWin : ""}`}>
                <span className={s.rankNum}>{i + 1}</span>
                <Shield house={p.house} size={36} />
                <span>
                  <b style={{ fontFamily: "var(--f-title)" }}>{HOUSES[p.house].name}</b>
                  <br />
                  <span className={s.realmMeta}>
                    {p.id === view.localId ? "You" : p.name} · ♛ {crownsOf(g, id)} · {provincesOf(g, id).length} lands{p.prestige ? ` · −${p.prestige} for broken oaths` : ""}
                  </span>
                </span>
                <b style={{ fontFamily: "var(--f-title)", fontSize: 20 }}>{score(g, id)}</b>
              </div>
            );
          })}
        </div>
        <div className={s.row} style={{ justifyContent: "center", marginTop: 16 }}>
          {onAgain && (
            <button type="button" className={s.seal} onClick={onAgain}>
              Another war
            </button>
          )}
          <button type="button" className={s.plain} onClick={onLeave}>
            Leave
          </button>
        </div>
        <p className={s.hint}>Score: 3 per crown, 1 per province, 2 per castle, 1 per 10 gold, minus broken oaths.</p>
      </div>
    </div>
  );
}

export function Rules({ onClose }: { onClose(): void }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.card} style={{ textAlign: "left", width: "min(680px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <h2 className={s.cardTitle} style={{ textAlign: "center" }}>
          The rules of war
        </h2>
        <div className={s.howto} style={{ marginTop: 10 }}>
          <div>
            <b>Your turn</b>
            Collect gold from your lands. Raise troops at your strongholds. March: each band of troops moves once a turn.
          </div>
          <div>
            <b>Troops</b>
            Footmen 2g. Archers 3g, +1 on defence. Knights 4g, +1 in attack, and they ride two provinces.
          </div>
          <div>
            <b>Battle</b>
            Attackers roll up to 3 dice, defenders 2 (3 behind castle walls). Highest against highest; ties go to the defender. An attack falls back after losing two thirds.
          </div>
          <div>
            <b>Seasons</b>
            Autumn: half as much gold again. Winter: attackers roll two dice and knights ride one province.
          </div>
          <div>
            <b>Alliances</b>
            Send an envoy; they answer on their turn. Allies cannot attack each other and help each other defend. Breaking an oath costs you.
          </div>
          <div>
            <b>Victory</b>
            {CROWNS_SOLO} crowns alone or {CROWNS_ALLIANCE} with an ally at the end of a round. Otherwise the best score after the last round.
          </div>
        </div>
        <div className={s.row} style={{ justifyContent: "center", marginTop: 18 }}>
          <button type="button" className={s.btn} onClick={onClose}>
            To war
          </button>
        </div>
      </div>
    </div>
  );
}

export type { BannersState };
