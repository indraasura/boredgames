"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { BotLevel } from "@boredgames/engine";
import { CROWNS_ALLIANCE, CROWNS_SOLO, HOUSES, PROVINCES, SEATING, allied, banners, current, emptyArmy, seasonOf, size, type Army, type HouseId } from "@boredgames/banners";
import { audio } from "@/lib/banners/audio";
import { BannersController, type Seat } from "@/lib/banners/controller";
import { GuestNet, HostNet, webrtcSupported, type Msg, type Net, type SeatInfo } from "@/lib/banners/net";
import { FriendSlots, JoinFlow, type SlotsHandle } from "../shared/Invite";
import invite from "../shared/invite.module.css";
import { Shield } from "./Heraldry";
import { BattleCard, Chronicle, Herald, Letter, Rules, SidePanel, TopBar, Victory } from "./Panels";
import { WarMap } from "./WarMap";
import s from "./banners.module.css";

const NAMES = ["Lord Edric", "Lady Maren", "Lord Osric", "Lady Isolde"];

interface Match {
  seats: Seat[];
  seed: number;
  rounds: number;
  net: Net | null;
  localId: string;
  nonce: number;
  fast: boolean;
}

type Screen = { k: "lobby" } | { k: "join" } | { k: "play"; match: Match };

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

export default function BannersGame() {
  const [screen, setScreen] = useState<Screen>(() => {
    // ?houses=4&skill=hard&fast=1 jumps straight into a war against the computer, for demos and tests.
    const q = new URLSearchParams(window.location.search);
    if (q.has("houses")) {
      const n = Math.max(2, Math.min(4, Number(q.get("houses")) || 3));
      const skill = (q.get("skill") as BotLevel) || "medium";
      const seats = SEATING[n]!.map((h, i) => ({ id: `p${i}`, name: i === 0 ? "You" : NAMES[i]!, house: h, bot: i === 0 && q.get("watch") !== "1" ? undefined : skill }));
      return { k: "play", match: { seats, seed: Number(q.get("seed")) || newSeed(), rounds: Number(q.get("rounds")) || 12, net: null, localId: "p0", nonce: 1, fast: q.get("fast") === "1" } };
    }
    return { k: "lobby" };
  });
  const nonce = useRef(1);
  const play = useCallback((m: Omit<Match, "nonce">) => setScreen({ k: "play", match: { ...m, nonce: ++nonce.current } }), []);
  const toLobby = useCallback(() => setScreen({ k: "lobby" }), []);

  if (screen.k === "lobby") return <Lobby onPlay={play} onJoin={() => setScreen({ k: "join" })} />;
  if (screen.k === "join") {
    return (
      <div className={s.page}>
        <div className={s.scrollWrap}>
          <div className={s.scroll}>
            <button type="button" className={s.back} onClick={toLobby}>
              ← Back
            </button>
            <div className={s.titleBlock}>
              <h1 className={s.title} style={{ fontSize: 52 }}>
                Answer the summons
              </h1>
              <p className={s.subtitle}>Enter the room code a friend gave you.</p>
            </div>
            <JoinFlow<Msg>
              build={(link) => new GuestNet(link)}
              isStart={(m) => m.t === "start"}
              onBack={toLobby}
              onStart={(net, m) => {
                if (m.t === "start") play({ seats: m.seats.map((x) => ({ ...x })), seed: m.seed, rounds: m.rounds, net, localId: m.you, fast: false });
              }}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <War
      key={screen.match.nonce}
      match={screen.match}
      onLeave={() => {
        screen.match.net?.close();
        toLobby();
      }}
      onAgain={
        screen.match.net
          ? undefined
          : () => play({ ...screen.match, seed: newSeed() })
      }
    />
  );
}

// ------------------------------------------------------------------ lobby

function Lobby({ onPlay, onJoin }: { onPlay(m: Omit<Match, "nonce">): void; onJoin(): void }) {
  const [count, setCount] = useState(4);
  const [mine, setMine] = useState<HouseId>("varn");
  const [skill, setSkill] = useState<BotLevel>("medium");
  const [rounds, setRounds] = useState(12);
  const [hosting, setHosting] = useState(false);
  const [joined, setJoined] = useState(0);
  const [name, setName] = useState("You");
  const slots = useRef<SlotsHandle>(null);
  const houses = SEATING[count]!;
  const myHouse = houses.includes(mine) ? mine : houses[0]!;

  useEffect(() => {
    const first = () => audio.unlock();
    window.addEventListener("pointerdown", first, { once: true });
    return () => window.removeEventListener("pointerdown", first);
  }, []);

  const start = () => {
    audio.unlock();
    audio.sfx("fanfare");
    const taken = hosting ? slots.current?.take() : undefined;
    const friends = taken?.friends ?? [];
    let f = 0;
    let b = 1;
    const seats: Seat[] = houses.map((h, i) => {
      if (h === myHouse) return { id: `p${i}`, name: name.trim() || "You", house: h };
      const friend = friends[f];
      if (friend) {
        f++;
        return { id: `p${i}`, name: friend.name, house: h };
      }
      return { id: `p${i}`, name: NAMES[b++ % NAMES.length]!, house: h, bot: skill };
    });
    const me = seats.find((x) => x.house === myHouse)!;
    const seed = newSeed();
    let net: Net | null = null;
    if (friends.length) {
      const humanSeats = seats.filter((x) => !x.bot && x.id !== me.id);
      const host = new HostNet(humanSeats.map((x, i) => ({ id: x.id, name: x.name, link: friends[i]!.link })), taken?.room ?? undefined);
      const info: SeatInfo[] = seats.map((x) => ({ ...x }));
      humanSeats.forEach((x, i) => friends[i]!.link.send({ t: "start", seats: info, seed, you: x.id, rounds }));
      net = host;
    }
    // Online, the host is always seat one of the conversation; seat ids follow the table.
    onPlay({ seats, seed, rounds, net, localId: me.id, fast: false });
  };

  return (
    <div className={s.page}>
      <div className={s.scrollWrap}>
        <div className={s.scroll}>
          <Link href="/" className={s.back}>
            ← boredgames
          </Link>
          <div className={s.titleBlock}>
            <h1 className={s.title}>
              BANN<span>E</span>RS
            </h1>
            <p className={s.subtitle}>Raise an army. Swear oaths, and break them. Take the crowns of the realm.</p>
          </div>
          <div className={s.rule} />

          <div className={s.options}>
            <div className={s.field}>
              <span className={s.h2}>Houses at war</span>
              <div className={s.choices} role="radiogroup" aria-label="Houses">
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={count === n} className={count === n ? s.on : ""} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.field}>
              <span className={s.h2}>Length</span>
              <div className={s.choices} role="radiogroup" aria-label="Length">
                {[
                  [8, "Short"],
                  [12, "Standard"],
                  [16, "Long"],
                ].map(([r, l]) => (
                  <button key={r} type="button" role="radio" aria-checked={rounds === r} className={rounds === r ? s.on : ""} onClick={() => setRounds(r as number)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.field}>
              <span className={s.h2}>Rival lords</span>
              <div className={s.choices} role="radiogroup" aria-label="Computer skill">
                {(["easy", "medium", "hard"] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={skill === l} className={skill === l ? s.on : ""} onClick={() => setSkill(l)}>
                    {l === "easy" ? "Timid" : l === "medium" ? "Shrewd" : "Ruthless"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={s.rule} />
          <h2 className={s.h2} style={{ textAlign: "center" }}>
            Choose your house
          </h2>
          <div className={s.houses} role="radiogroup" aria-label="Your house">
            {houses.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={myHouse === h} className={`${s.house} ${myHouse === h ? s.houseOn : ""}`} onClick={() => (audio.unlock(), audio.sfx("click"), setMine(h))}>
                <span className={s.seatTag}>{HOUSES[h].capital.toUpperCase()}</span>
                <Shield house={h} size={64} />
                <span className={s.houseName}>{HOUSES[h].name}</span>
                <span className={s.motto}>“{HOUSES[h].motto}”</span>
              </button>
            ))}
          </div>

          {hosting && (
            <div className={`${invite.panel} ${s.friendsBox}`}>
              <label className={invite.field}>
                <span className={invite.label}>YOUR NAME</span>
                <input className={invite.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
              </label>
              <FriendSlots ref={slots} max={count - 1} onJoined={setJoined} />
              <p className={invite.note}>Empty seats are taken by computer lords.</p>
            </div>
          )}

          <div className={s.actions}>
            <button type="button" className={s.seal} onClick={start}>
              {hosting ? (joined ? `March with ${joined} ${joined === 1 ? "friend" : "friends"}` : "Start without friends") : "To war"}
            </button>
            {webrtcSupported() && !hosting && (
              <button type="button" className={s.plain} onClick={() => setHosting(true)}>
                Host friends
              </button>
            )}
            {webrtcSupported() && (
              <button type="button" className={s.plain} onClick={onJoin}>
                Join with code
              </button>
            )}
          </div>

          <div className={s.howto}>
            <div>
              <b>Muster</b>Gold from your lands raises footmen, archers and knights at your castles and crown cities.
            </div>
            <div>
              <b>March</b>Move into a neighbour and the dice decide. Knights strike hardest; archers and castle walls hold.
            </div>
            <div>
              <b>Swear oaths</b>Send envoys to forge an alliance. Allies defend each other, and may win together.
            </div>
            <div>
              <b>Take the crowns</b>Hold {CROWNS_SOLO} of the 7 crowns alone, or {CROWNS_ALLIANCE} with an ally, and the realm is yours.
            </div>
          </div>
          <p className={s.note}>About 20–40 minutes. Two to four houses, against the computer or friends.</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the war

function War({ match, onLeave, onAgain }: { match: Match; onLeave(): void; onAgain?: () => void }) {
  const [ctl] = useState(
    () =>
      new BannersController(match.seats.map((x) => ({ ...x })), match.seed, match.rounds, {
        localId: match.localId,
        guest: match.net?.role === "guest",
        send: match.net ? (m) => match.net!.send(m) : undefined,
        fast: match.fast,
      }),
  );
  const view = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  const [selected, setSelected] = useState<number | null>(null);
  const [army, setArmy] = useState<Army>(emptyArmy());
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [music, setMusic] = useState(audio.music);
  const [sfx, setSfx] = useState(audio.sfxOn);
  const [lost, setLost] = useState(false);
  const g = view.game;
  const myTurn = g.phase === "play" && current(g).id === view.localId && !view.busy;

  useEffect(() => {
    ctl.start();
    audio.unlock();
    audio.startMusic();
    return () => {
      ctl.dispose();
      audio.stopMusic();
    };
  }, [ctl]);

  useEffect(() => {
    const net = match.net;
    if (!net) return;
    net.onLeave((id) => {
      if (id === "p0" && net.role === "guest") setLost(true);
      else ctl.takeOver(id);
    });
    return net.subscribe((m) => {
      if (m.t === "move") ctl.receive(m.id, m.move);
    });
  }, [match.net, ctl]);

  // A new turn clears the selection.
  useEffect(() => {
    setSelected(null);
    setArmy(emptyArmy());
    setError(null);
  }, [g.turn, g.round]);

  // Where the selected troops can go, and through which province for a knights' ride.
  const { targets, vias } = useMemo(() => {
    const t = new Set<number>();
    const v = new Map<number, number>();
    if (!myTurn || selected === null || size(army) === 0) return { targets: t, vias: v };
    const me = view.localId;
    for (const j of PROVINCES[selected]!.adj) if (banners.validate(g, me, { type: "march", from: selected, to: j, army }).ok) t.add(j);
    if (army.foot + army.archers === 0 && seasonOf(g.round) !== "winter") {
      for (const via of PROVINCES[selected]!.adj) {
        const o = g.provinces[via]!.owner;
        if (o !== me && !allied(g, o, me)) continue;
        for (const j of PROVINCES[via]!.adj) {
          if (j === selected || t.has(j)) continue;
          if (banners.validate(g, me, { type: "march", from: selected, to: j, army, via }).ok) {
            t.add(j);
            v.set(j, via);
          }
        }
      }
    }
    return { targets: t, vias: v };
  }, [myTurn, selected, army, g, view.localId]);

  const pick = useCallback(
    (i: number) => {
      audio.sfx("click");
      setError(null);
      if (selected !== null && targets.has(i)) {
        const err = ctl.play({ type: "march", from: selected, to: i, army, via: vias.get(i) });
        if (err) setError(err);
        setSelected(null);
        setArmy(emptyArmy());
        return;
      }
      setSelected(i);
      const p = g.provinces[i]!;
      setArmy(p.owner === view.localId ? { ...p.army } : emptyArmy());
    },
    [selected, targets, vias, army, ctl, g, view.localId],
  );

  // Keep the chosen march sensible as troops come and go.
  useEffect(() => {
    if (selected === null) return;
    const p = g.provinces[selected]!;
    if (p.owner !== view.localId) return;
    setArmy((a) => ({ foot: Math.min(a.foot, p.army.foot), archers: Math.min(a.archers, p.army.archers), knights: Math.min(a.knights, p.army.knights) }));
  }, [g, selected, view.localId]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setArmy(emptyArmy());
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div className={s.page}>
      <div className={s.table}>
        <TopBar
          view={view}
          music={music}
          sfx={sfx}
          onMusic={() => (audio.setMusic(!music), setMusic(!music))}
          onSfx={() => (audio.setSfx(!sfx), setSfx(!sfx))}
          onRules={() => setRules(true)}
          onLeave={onLeave}
        />
        <div className={s.mapArea}>
          <WarMap game={g} seats={view.seats} selected={selected} targets={targets} march={view.march} flash={view.flash} battleAt={view.battle?.at ?? null} onPick={pick} />
          <Chronicle view={view} />
          <Herald view={view} onClick={() => ctl.hurry()} />
          <BattleCard battle={view.battle} onClick={() => ctl.hurry()} />
        </div>
        <SidePanel
          view={view}
          ctl={ctl}
          selected={selected}
          army={army}
          setArmy={setArmy}
          error={error}
          setError={setError}
          onEnd={() => {
            audio.sfx("seal");
            setError(ctl.play({ type: "end" }));
          }}
        />
        <Letter view={view} ctl={ctl} />
        <Victory view={view} onAgain={onAgain} onLeave={onLeave} />
        {rules && <Rules onClose={() => setRules(false)} />}
        {lost && (
          <div className={s.overlay}>
            <div className={s.card}>
              <h2 className={s.cardTitle}>The host has left</h2>
              <p className={s.cardText}>The war cannot go on without them.</p>
              <div className={s.row} style={{ justifyContent: "center", marginTop: 16 }}>
                <button type="button" className={s.seal} onClick={onLeave}>
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type { Seat };
