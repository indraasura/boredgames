"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FROZE_MS, OUTLAWS, PLAYER_LOOK, RIVAL_LOOK, ROUND_INFO, WINS_NEEDED, quickBonus, rating, type Outlaw, type Seat, type Shot } from "@boredgames/quickdraw";
import { audio } from "@/lib/quickdraw/audio";
import { Duel, session, type Gunslinger as Side, type Mode } from "@/lib/quickdraw/duel";
import { GuestNet, HostNet, webrtcSupported, type Msg, type Net } from "@/lib/quickdraw/net";
import { FriendSlots, JoinFlow, type SlotsHandle } from "../shared/Invite";
import invite from "../shared/invite.module.css";
import { Eyes, Gunslinger, type Pose } from "./Figures";
import { Scene } from "./Scene";
import s from "./quickdraw.module.css";

interface Match {
  mode: Mode;
  sides: [Side, Side];
  seed: number;
  outlaw?: Outlaw;
  net?: Net;
  nonce: number;
}

type Screen = { k: "lobby" } | { k: "join" } | { k: "duel"; match: Match };

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
const you = (name = "You"): Side => ({ name, look: PLAYER_LOOK });

export default function QuickDraw() {
  const [screen, setScreen] = useState<Screen>(() => {
    // ?outlaw=bart jumps straight into a duel, for demos and tests.
    const q = new URLSearchParams(window.location.search);
    const o = OUTLAWS.find((x) => x.id === q.get("outlaw"));
    if (o) return { k: "duel", match: { mode: "outlaw", sides: [you(), { name: o.name, look: o.look }], seed: Number(q.get("seed")) || newSeed(), outlaw: o, nonce: 1 } };
    if (q.get("local") === "1") return { k: "duel", match: { mode: "local", sides: [{ name: "Player 1", look: PLAYER_LOOK }, { name: "Player 2", look: RIVAL_LOOK }], seed: newSeed(), nonce: 1 } };
    return { k: "lobby" };
  });
  const nonce = useRef(1);
  const play = useCallback((m: Omit<Match, "nonce">) => setScreen({ k: "duel", match: { ...m, nonce: ++nonce.current } }), []);
  const toLobby = useCallback(() => setScreen({ k: "lobby" }), []);

  useEffect(() => {
    const first = () => audio.unlock();
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    return () => {
      window.removeEventListener("pointerdown", first);
      window.removeEventListener("keydown", first);
    };
  }, []);

  if (screen.k === "lobby") return <Lobby onPlay={play} onJoin={() => setScreen({ k: "join" })} />;
  if (screen.k === "join") {
    return (
      <div className={s.page}>
        <div className={s.poster}>
          <button type="button" className={s.back} onClick={toLobby}>
            ← Back
          </button>
          <h1 className={s.title} style={{ fontSize: "clamp(40px, 8vw, 72px)" }}>
            Answer the call
          </h1>
          <p className={s.tagline}>Type the room code your friend gave you.</p>
          <JoinFlow<Msg>
            build={(link) => new GuestNet(link)}
            isStart={(m) => m.t === "start"}
            onBack={toLobby}
            onStart={(net, m) => {
              if (m.t !== "start") return;
              play({ mode: "online", sides: [{ name: m.names[0], look: RIVAL_LOOK }, { name: m.names[1], look: PLAYER_LOOK }], seed: m.seed, net });
            }}
          />
        </div>
      </div>
    );
  }
  const m = screen.match;
  return (
    <Showdown
      key={m.nonce}
      match={m}
      onLeave={() => {
        m.net?.close();
        toLobby();
      }}
      onNext={(o) => play({ mode: "outlaw", sides: [you(), { name: o.name, look: o.look }], seed: newSeed(), outlaw: o })}
    />
  );
}

// ------------------------------------------------------------------ lobby

function Lobby({ onPlay, onJoin }: { onPlay(m: Omit<Match, "nonce">): void; onJoin(): void }) {
  const [hosting, setHosting] = useState(false);
  const [joined, setJoined] = useState(0);
  const [name, setName] = useState("Host");
  const slots = useRef<SlotsHandle>(null);

  const duel = (o: Outlaw) => {
    audio.unlock();
    audio.sfx("spurs");
    onPlay({ mode: "outlaw", sides: [you(), { name: o.name, look: o.look }], seed: newSeed(), outlaw: o });
  };
  const hostStart = () => {
    const taken = slots.current?.take();
    const f = taken?.friends[0];
    if (!f) return;
    audio.unlock();
    const seed = newSeed();
    const names: [string, string] = [name.trim() || "Host", f.name];
    const net = new HostNet({ id: "p1", name: f.name, link: f.link }, taken?.room ?? undefined);
    net.send({ t: "start", seed, names });
    onPlay({ mode: "online", sides: [{ name: names[0], look: PLAYER_LOOK }, { name: names[1], look: RIVAL_LOOK }], seed, net });
  };

  return (
    <div className={s.page}>
      <div className={s.poster}>
        <Link href="/" className={s.back}>
          ← boredgames
        </Link>
        <h1 className={s.title}>Quick Draw</h1>
        <p className={s.tagline}>One street. Two guns. Wait for the call.</p>

        <div className={s.howto}>
          <div>
            <b>1</b>Stand still. Fake calls, crows and bells will try to make you flinch.
          </div>
          <div>
            <b>2</b>When <span className={s.drawWord}>DRAW!</span> appears, hit <kbd>Space</kbd> or tap.
          </div>
          <div>
            <b>3</b>Fastest gun takes the round. Shoot early and you lose it. First to {WINS_NEEDED}.
          </div>
        </div>

        <h2 className={s.h2}>Wanted</h2>
        <div className={s.wanted}>
          {OUTLAWS.map((o, i) => (
            <button key={o.id} type="button" className={s.wantedCard} onClick={() => duel(o)}>
              <span className={s.wantedHead}>WANTED</span>
              <svg viewBox="-80 -335 170 200" className={s.mug} aria-hidden>
                <rect x={-80} y={-335} width={170} height={200} fill="#e9d6a6" />
                <Gunslinger look={o.look} pose="idle" flash={false} />
              </svg>
              <span className={s.wantedName}>{o.name}</span>
              <span className={s.wantedAlias}>{o.alias}</span>
              <span className={s.reward}>${o.bounty.toLocaleString("en-US")}</span>
              <span className={s.speed} aria-label={`Speed ${i + 1} of 5`}>
                {Array.from({ length: 5 }, (_, k) => (
                  <i key={k} className={k <= i ? s.on : ""} />
                ))}
              </span>
              {session.claimed.has(o.id) && <span className={s.claimedStamp}>CLAIMED</span>}
            </button>
          ))}
        </div>
        {session.bounty > 0 && (
          <p className={s.session}>
            Bounty collected this visit: <b>${session.bounty.toLocaleString("en-US")}</b>
            {session.best !== null && <> · Fastest draw: <b>{session.best} ms</b></>}
          </p>
        )}

        <h2 className={s.h2}>Two gunslingers</h2>
        {hosting && (
          <div className={`${invite.panel} ${s.friendBox}`}>
            <label className={invite.field}>
              <span className={invite.label}>YOUR NAME</span>
              <input className={invite.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
            </label>
            <FriendSlots ref={slots} max={1} onJoined={setJoined} />
            <button type="button" className={s.btnBig} disabled={!joined} onClick={hostStart}>
              {joined ? "Start the duel" : "Waiting for your friend…"}
            </button>
          </div>
        )}
        <div className={s.modes}>
          <button
            type="button"
            className={s.btn}
            onClick={() => {
              audio.unlock();
              onPlay({ mode: "local", sides: [{ name: "Player 1", look: PLAYER_LOOK }, { name: "Player 2", look: RIVAL_LOOK }], seed: newSeed() });
            }}
          >
            Same keyboard
            <small>
              <kbd>A</kbd> vs <kbd>L</kbd>, or tap your half
            </small>
          </button>
          {webrtcSupported() && !hosting && (
            <button type="button" className={s.btn} onClick={() => setHosting(true)}>
              Host a friend
              <small>Get a room code</small>
            </button>
          )}
          {webrtcSupported() && (
            <button type="button" className={s.btn} onClick={onJoin}>
              Join with code
              <small>Your friend hosts</small>
            </button>
          )}
        </div>
        <p className={s.note}>A duel takes about a minute. Nothing is saved.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ duel

const timeLabel = (sh: Shot | null) => {
  if (!sh) return "—";
  if (sh.kind === "foul") return "Too early!";
  if (sh.ms >= FROZE_MS) return "Froze";
  return `${sh.ms} ms`;
};

function Showdown({ match, onLeave, onNext }: { match: Match; onLeave(): void; onNext(o: Outlaw): void }) {
  const [duel] = useState(() => new Duel(match.mode, match.sides, match.seed, { outlaw: match.outlaw, net: match.net }));
  const v = useSyncExternalStore(duel.subscribe, duel.getSnapshot, duel.getSnapshot);
  const [music, setMusic] = useState(audio.musicOn);
  const [sfx, setSfx] = useState(audio.sfxOn);
  // The few hundred milliseconds after a verdict: the foul, the reply, the fall.
  const [beat, setBeat] = useState(0);
  const [crow, setCrow] = useState<number | null>(null);
  const [bottle, setBottle] = useState<number | null>(null);
  const local = duel.local;

  useEffect(() => {
    duel.start();
    return () => duel.dispose();
  }, [duel]);

  useEffect(() => {
    if (!v.result) {
      setBeat(0);
      return;
    }
    setBeat(0);
    const foul = v.result.reason === "foul";
    const a = setTimeout(() => setBeat(1), foul ? 380 : 0);
    const b = setTimeout(() => setBeat(2), foul ? 900 : 650);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [v.result]);

  useEffect(() => {
    if (v.fake?.fake.kind === "crow") setCrow(v.fake.id);
    if (v.fake?.fake.kind === "bottle") setBottle(v.fake.id);
  }, [v.fake]);
  useEffect(() => {
    if (v.phase === "intro") setBottle(null);
  }, [v.phase, v.round]);

  // Triggers: the keyboard and the screen.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" || e.key === "Tab") return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (match.mode === "local") {
        if (e.code === "KeyA") duel.pull(0, e.timeStamp);
        else if (e.code === "KeyL") duel.pull(1, e.timeStamp);
        else return;
      } else {
        if (e.code === "Space" || e.code === "Enter") e.preventDefault();
        duel.pull(local[0]!, e.timeStamp);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [duel, local, match.mode]);

  const tap = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    if (match.mode === "local") duel.pull(e.clientX < window.innerWidth / 2 ? 0 : 1, e.timeStamp);
    else duel.pull(local[0]!, e.timeStamp);
  };

  const r = v.result;
  const winner = v.phase === "over" ? v.champion : r?.winner ?? null;
  const poseOf = (seat: Seat): Pose => {
    const shot = v.shots[seat];
    if (v.phase === "over") return seat === v.champion ? "win" : "fall";
    if (v.phase === "result" && r) {
      if (r.winner === null) return shot ? "win" : "tense";
      if (seat === r.winner) return beat === 0 ? (r.reason === "foul" ? "tense" : "fire") : beat === 1 ? "fire" : "win";
      if (r.reason === "foul") return beat === 0 ? "foul" : "fall";
      return beat >= 1 ? "fall" : shot ? "fire" : "tense";
    }
    if (shot) return shot.kind === "foul" ? "foul" : "fire";
    return v.phase === "standoff" || v.phase === "called" ? "tense" : "idle";
  };
  const poses: [Pose, Pose] = [poseOf(0), poseOf(1)];
  const flashes: [boolean, boolean] = [poses[0] === "fire" || poses[0] === "foul", poses[1] === "fire" || poses[1] === "foul"];
  const tracer = v.phase === "result" && r?.winner != null && beat >= (r.reason === "foul" ? 1 : 0) ? r.winner : null;

  const plan = v.plan;
  const info = plan ? ROUND_INFO[plan.kind] : null;
  const mineWon = winner !== null && (match.mode === "local" || local.includes(winner));
  const nameOf = (seat: Seat) => (match.mode !== "local" && local.includes(seat) ? "You" : match.sides[seat].name);
  const nextOutlaw = match.outlaw ? OUTLAWS[OUTLAWS.findIndex((o) => o.id === match.outlaw!.id) + 1] : undefined;

  let verdict = "";
  if (r && v.phase === "result") {
    if (r.winner === null) verdict = "Dead heat! Again.";
    else if (r.reason === "foul") verdict = `${nameOf(r.winner === 0 ? 1 : 0)} drew too early!`;
    else verdict = match.mode === "local" ? `${nameOf(r.winner)} wins the round` : mineWon ? "You win the round" : `${nameOf(r.winner)} was faster`;
  }

  return (
    <div className={`${s.stage} ${v.phase === "standoff" ? s.tension : ""}`} onPointerDown={tap}>
      <div
        key={`cam${v.round}-${v.phase === "result" ? "r" : ""}`}
        className={`${s.cam} ${v.phase === "standoff" ? s.zoom : ""} ${v.phase === "result" && beat >= 1 ? s.shake : ""}`}
        style={v.phase === "standoff" && plan ? { animationDuration: `${plan.delay}ms` } : undefined}
      >
        <Scene looks={[match.sides[0].look, match.sides[1].look]} poses={poses} flashes={flashes} tracer={tracer} crow={crow} bottle={bottle} weed={v.round} />
      </div>
      {v.phase === "result" && beat === 1 && <div key={`f${v.round}`} className={s.whiteout} />}
      <div className={`${s.bar} ${s.barTop}`} />
      <div className={`${s.bar} ${s.barBottom}`} />

      {/* top: who, and how many rounds each has */}
      <header className={s.hud}>
        <div className={s.plate}>
          <span className={s.plateName}>{nameOf(0)}</span>
          <Chambers n={v.score[0]} />
        </div>
        <div className={s.roundTag}>{v.round > 0 && info ? `Round ${v.round} · ${info.title}` : ""}</div>
        <div className={`${s.plate} ${s.plateRight}`}>
          <Chambers n={v.score[1]} />
          <span className={s.plateName}>{nameOf(1)}</span>
        </div>
      </header>
      <div className={s.tools}>
        <button type="button" onClick={onLeave} aria-label="Leave">
          ←
        </button>
        <button type="button" onClick={() => (audio.setMusic(!music), setMusic(!music))} aria-pressed={music} title="Music">
          {music ? "♫" : "♫̸"}
        </button>
        <button type="button" onClick={() => (audio.setSfx(!sfx), setSfx(!sfx))} aria-pressed={sfx} title="Sound">
          {sfx ? "🔊" : "🔈"}
        </button>
      </div>

      {v.phase === "intro" && info && (
        <div key={`i${v.round}`} className={s.intro}>
          <span className={s.introRound}>{plan!.kind === "showdown" ? "Final round" : `Round ${v.round}`}</span>
          <span className={s.introTitle}>{info.title}</span>
          <span className={s.introHint}>{info.hint}</span>
        </div>
      )}

      {v.eyes && (
        <div className={s.eyes}>
          <Eyes look={match.sides[0].look} />
          <Eyes look={match.sides[1].look} flip />
        </div>
      )}

      {v.fake?.fake.kind === "word" && (
        <div key={v.fake.id} className={s.call}>
          {v.fake.fake.word}
        </div>
      )}
      {v.fake?.fake.kind === "bell" && <div key={v.fake.id} className={s.bellRing} />}
      {(v.phase === "called" || (v.phase === "result" && beat === 0 && r?.reason !== "foul")) && <div className={`${s.call} ${s.real}`}>DRAW!</div>}

      {v.phase === "standoff" && <div className={s.wait}>Steady…</div>}

      {/* times under each gunslinger */}
      {(v.phase === "result" || v.phase === "over") && r && (
        <>
          {([0, 1] as Seat[]).map((seat) => {
            const sh = r.shots[seat];
            if (!sh) return null;
            const rt = sh?.kind === "hit" && sh.ms < FROZE_MS ? rating(sh.ms) : null;
            return (
              <div key={seat} className={`${s.time} ${seat === 0 ? s.timeLeft : s.timeRight} ${r.winner === seat ? s.timeWin : ""} ${sh?.kind === "foul" ? s.timeFoul : ""}`}>
                <b>{timeLabel(sh)}</b>
                {rt && <span className={s[`tier${rt.tier}`]}>{rt.title}</span>}
              </div>
            );
          })}
        </>
      )}
      {v.phase === "result" && verdict && beat >= 1 && (
        <div key={`v${v.round}`} className={`${s.verdict} ${mineWon || match.mode === "local" ? s.good : s.bad}`}>
          {verdict}
          {match.mode === "outlaw" && r?.winner === 0 && r.shots[0]?.kind === "hit" && quickBonus(r.shots[0].ms) > 0 && <small>+${quickBonus(r.shots[0].ms)} quick-draw bonus</small>}
        </div>
      )}

      <footer className={s.controls}>
        {match.mode === "local" ? (
          <>
            <span>
              <kbd>A</kbd> or tap left
            </span>
            <span>
              <kbd>L</kbd> or tap right
            </span>
          </>
        ) : (
          <span>
            <kbd>Space</kbd> or tap anywhere to shoot
          </span>
        )}
      </footer>

      {v.phase === "over" && v.champion !== null && (
        <div className={s.overlay}>
          <div className={s.wantedBig}>
            {match.mode === "outlaw" ? (
              <>
                <span className={s.wantedHead}>WANTED</span>
                <span className={s.deadOrAlive}>DEAD OR ALIVE</span>
                <svg viewBox="-80 -335 170 200" className={s.mugBig} aria-hidden>
                  <rect x={-80} y={-335} width={170} height={200} fill="#e9d6a6" />
                  <Gunslinger look={match.outlaw!.look} pose="idle" flash={false} />
                </svg>
                <span className={s.wantedName}>{match.outlaw!.name}</span>
                <span className={s.reward}>${match.outlaw!.bounty.toLocaleString("en-US")}</span>
                {v.champion === 0 ? (
                  <>
                    <span className={s.stamp}>CLAIMED</span>
                    <p className={s.overText}>
                      You collect <b>${(v.bounty!.reward + v.bounty!.bonus).toLocaleString("en-US")}</b>
                      {v.bounty!.bonus ? ` (including $${v.bounty!.bonus} for quick draws)` : ""}.
                    </p>
                  </>
                ) : (
                  <>
                    <span className={`${s.stamp} ${s.stampLost}`}>STILL AT LARGE</span>
                    <p className={s.overText}>“{match.outlaw!.line}”</p>
                  </>
                )}
              </>
            ) : (
              <>
                <span className={s.wantedHead}>{match.mode === "local" ? "THE WINNER" : mineWon ? "VICTORY" : "DEFEAT"}</span>
                <span className={s.wantedName} style={{ fontSize: 40, margin: "18px 0" }}>
                  {match.mode === "local" ? match.sides[v.champion].name : mineWon ? "You won the duel" : `${match.sides[v.champion].name} won`}
                </span>
                <p className={s.overText}>
                  {v.score[0]} – {v.score[1]}
                </p>
              </>
            )}
            <Fastest v={v} local={match.mode === "local" ? [0, 1] : local} names={[nameOf(0), nameOf(1)]} />
            <div className={s.overBtns}>
              {match.mode === "outlaw" && v.champion === 0 && nextOutlaw && (
                <button type="button" className={s.btnBig} onClick={() => onNext(nextOutlaw)}>
                  Next: {nextOutlaw.name} →
                </button>
              )}
              {match.mode === "online" && v.rematchAsked && <p className={s.overText}>Your friend wants a rematch.</p>}
              <button type="button" className={match.mode === "outlaw" && v.champion === 0 && nextOutlaw ? s.btn : s.btnBig} onClick={() => duel.again()}>
                {match.mode === "online" && match.net?.role === "guest" ? "Ask for a rematch" : v.champion === 0 || match.mode !== "outlaw" ? "Rematch" : "Try again"}
              </button>
              <button type="button" className={s.btn} onClick={onLeave}>
                Leave town
              </button>
            </div>
          </div>
        </div>
      )}

      {v.gone && (
        <div className={s.overlay}>
          <div className={s.wantedBig}>
            <span className={s.wantedHead}>GONE</span>
            <p className={s.overText}>Your friend rode off into the sunset.</p>
            <div className={s.overBtns}>
              <button type="button" className={s.btnBig} onClick={onLeave}>
                Leave town
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chambers({ n }: { n: number }) {
  return (
    <span className={s.chambers} aria-label={`${n} of ${WINS_NEEDED} rounds`}>
      {Array.from({ length: WINS_NEEDED }, (_, i) => (
        <i key={i} className={i < n ? s.full : ""} />
      ))}
    </span>
  );
}

function Fastest({ v, local, names }: { v: ReturnType<Duel["getSnapshot"]>; local: Seat[]; names: [string, string] }) {
  const best = local
    .map((seat) => {
      const times = v.history.map((r) => r.shots[seat]).filter((x): x is Extract<Shot, { kind: "hit" }> => x?.kind === "hit" && x.ms < FROZE_MS).map((x) => x.ms);
      return times.length ? { seat, ms: Math.min(...times) } : null;
    })
    .filter((x): x is { seat: Seat; ms: number } => !!x);
  if (!best.length) return null;
  return (
    <p className={s.fastest}>
      {best.map((b) => (
        <span key={b.seat}>
          {local.length > 1 ? `${names[b.seat]}: ` : "Your fastest draw: "}
          <b>{b.ms} ms</b> · {rating(b.ms).title}
        </span>
      ))}
    </p>
  );
}
