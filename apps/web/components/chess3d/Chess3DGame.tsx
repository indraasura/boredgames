"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { BOARD_NAMES, apply, chooseMove, colorOf, legalMoves, moveName, newGame, sameMove, status, type Color, type Move, type TridState } from "@boredgames/tridchess";
import { ChessScene } from "@/lib/chess3d/scene";
import { GuestNet, HostNet, type Net } from "@/lib/chess3d/net";
import { webrtcSupported } from "@/lib/p2p";
import { FriendSlots, JoinFlow, type SlotsHandle } from "../shared/Invite";
import a from "../shared/arcade.module.css";
import c from "./chess3d.module.css";

type Mode = "bot" | "local" | "online";
interface Cfg {
  mode: Mode;
  me: Color;
  level: BotLevel;
  net?: Net;
}
type Screen = { k: "menu" } | { k: "host" } | { k: "join" } | { k: "play"; cfg: Cfg };

const LEVEL_NAME = ["Level 1", "Level 2", "Level 3"];
const SIDE = ["White", "Black"];

export default function Chess3DGame() {
  const [screen, setScreen] = useState<Screen>({ k: "menu" });
  const [level, setLevel] = useState<BotLevel>("medium");
  const [side, setSide] = useState<"white" | "black" | "random">("white");
  const [joined, setJoined] = useState(0);
  const slots = useRef<SlotsHandle>(null);

  const startBot = () => {
    const me: Color = side === "random" ? (Math.random() < 0.5 ? 0 : 1) : side === "white" ? 0 : 1;
    setScreen({ k: "play", cfg: { mode: "bot", me, level } });
  };

  if (screen.k === "play") return <Play cfg={screen.cfg} onExit={() => setScreen({ k: "menu" })} />;

  return (
    <main className={`${a.stage} arcade`}>
      <header className={a.top}>
        <Link href="/" className={a.back}>
          <span aria-hidden>←</span> All games
        </Link>
      </header>

      {screen.k === "menu" && (
        <div className={a.menu}>
          <div className={a.menuInner}>
            <div>
              <h1 className={a.h1}>
                Tri-D <span style={{ color: "var(--grape)" }}>Chess</span>
              </h1>
              <p className={a.lead}>Three boards stacked in space, four attack boards you can slide between levels. The game Sheldon will not let you win.</p>
            </div>

            <div className={a.panel}>
              <p className={a.label}>Computer strength</p>
              <div className={a.row}>
                {(["easy", "medium", "hard"] as const).map((l) => (
                  <button key={l} className={`${a.chip} ${level === l ? a.on : ""}`} onClick={() => setLevel(l)}>
                    {l[0]!.toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
              <p className={a.label} style={{ marginTop: 16 }}>
                You play
              </p>
              <div className={a.row}>
                {(["white", "black", "random"] as const).map((s) => (
                  <button key={s} className={`${a.chip} ${side === s ? a.on : ""}`} onClick={() => setSide(s)}>
                    {s[0]!.toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={a.modes}>
              <button className={a.mode} style={{ "--tile": "var(--grape)" } as React.CSSProperties} onClick={startBot}>
                <strong>Play the computer</strong>
                <span>Solo, any time. Pick a strength above.</span>
              </button>
              <button className={a.mode} style={{ "--tile": "var(--lemon)" } as React.CSSProperties} onClick={() => setScreen({ k: "play", cfg: { mode: "local", me: 0, level } })}>
                <strong>Two players, one screen</strong>
                <span>Pass the device back and forth.</span>
              </button>
              <button className={a.mode} style={{ "--tile": "var(--mint)" } as React.CSSProperties} disabled={!webrtcSupported()} onClick={() => setScreen({ k: "host" })}>
                <strong>Host a friend</strong>
                <span>Get a 6 digit code. They type it, you play.</span>
              </button>
              <button className={a.mode} style={{ "--tile": "var(--sky)" } as React.CSSProperties} disabled={!webrtcSupported()} onClick={() => setScreen({ k: "join" })}>
                <strong>Join with a code</strong>
                <span>Your friend gave you six digits.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {screen.k === "host" && (
        <div className={a.center}>
          <div className={a.card}>
            <h2>Host a friend</h2>
            <FriendSlots ref={slots} max={1} onJoined={setJoined} />
            <div className={a.row}>
              <button
                className={`${a.key} ${a.mint}`}
                disabled={joined < 1}
                onClick={() => {
                  const taken = slots.current?.take();
                  const friend = taken?.friends[0];
                  if (!taken || !friend) return;
                  const me: Color = Math.random() < 0.5 ? 0 : 1;
                  const net = new HostNet([{ id: "p1", name: friend.name, link: friend.link }], taken.room ?? undefined);
                  net.send({ t: "start", you: (1 - me) as Color });
                  setScreen({ k: "play", cfg: { mode: "online", me, level, net } });
                }}
              >
                Start game
              </button>
              <button className={`${a.key} ${a.ghost}`} onClick={() => setScreen({ k: "menu" })}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {screen.k === "join" && (
        <div className={a.center}>
          <div className={a.card} style={{ padding: 0, border: 0, background: "none", boxShadow: "none" }}>
            <JoinFlow<import("@/lib/chess3d/net").Msg>
              dark
              build={(link) => new GuestNet(link)}
              isStart={(m) => m.t === "start"}
              onStart={(net, m) => m.t === "start" && setScreen({ k: "play", cfg: { mode: "online", me: m.you, level, net } })}
              onBack={() => setScreen({ k: "menu" })}
            />
          </div>
        </div>
      )}
    </main>
  );
}

// ------------------------------------------------------------------- play

function Play({ cfg, onExit }: { cfg: Cfg; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ChessScene | null>(null);
  const [state, setState] = useState<TridState>(() => newGame());
  const stateRef = useRef(state);
  const [sel, setSel] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [resigned, setResigned] = useState<Color | null>(null); // the colour that resigned
  const [left, setLeft] = useState(false);
  const [help, setHelp] = useState(false);
  const logEnd = useRef<HTMLOListElement>(null);

  const st = useMemo(() => status(state), [state]);
  const legal = useMemo(() => legalMoves(state), [state]);
  const over = st.over || resigned !== null || left;
  const myTurn = cfg.mode === "local" || state.turn === cfg.me;
  const canMove = !over && myTurn && !thinking;

  const doMove = useCallback(
    (m: Move, remote = false) => {
      const prev = stateRef.current;
      const label = moveName(prev, m);
      const next = apply(prev, m);
      stateRef.current = next;
      setState(next);
      setLog((l) => [...l, label]);
      setSel(null);
      scene.current?.setState(next, m);
      if (!remote) cfg.net?.send({ t: "move", m });
    },
    [cfg.net],
  );

  // The scene.
  const pick = useRef<(sq: number | null) => void>(() => {});
  useEffect(() => {
    if (!canvas.current) return;
    const s = new ChessScene(canvas.current, (sq) => pick.current(sq));
    scene.current = s;
    s.setState(stateRef.current);
    s.setView(cfg.mode === "local" ? 0 : cfg.me, true);
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, [cfg.me, cfg.mode]);

  // Tap handling.
  pick.current = (sq) => {
    if (!canMove || sq === null) return setSel(null);
    const s = stateRef.current;
    if (sel !== null) {
      const m = legal.find((x) => x.t === "m" && x.from === sel && x.to === sq);
      if (m) return doMove(m);
    }
    const cell = s.cells[sq]!;
    if (cell && colorOf(cell) === s.turn && legal.some((x) => x.t === "m" && x.from === sq)) setSel(sq === sel ? null : sq);
    else setSel(null);
  };

  const targets = useMemo(() => (sel === null ? [] : legal.flatMap((m) => (m.t === "m" && m.from === sel ? [{ sq: m.to, capture: !!state.cells[m.to] }] : []))), [sel, legal, state]);
  useEffect(() => {
    scene.current?.setMarks({ selected: sel, targets, last: state.last, check: st.over ? null : st.check ? state.kings[state.turn] : null });
  }, [sel, targets, state, st]);

  // The computer's turn.
  useEffect(() => {
    if (cfg.mode !== "bot" || over || state.turn === cfg.me) return;
    setThinking(true);
    const t = setTimeout(() => {
      const m = chooseMove(stateRef.current, cfg.level);
      setThinking(false);
      doMove(m, true);
    }, 450);
    return () => {
      clearTimeout(t);
      setThinking(false);
    };
  }, [state, over, cfg.mode, cfg.me, cfg.level, doMove]);

  // The friend.
  useEffect(() => {
    const net = cfg.net;
    if (!net) return;
    const off = net.subscribe((m) => {
      if (m.t === "move") {
        if (legalMoves(stateRef.current).some((x) => sameMove(x, m.m))) doMove(m.m, true);
      } else if (m.t === "resign") setResigned((1 - cfg.me) as Color);
    });
    net.onLeave(() => setLeft(true));
    return () => {
      off();
      net.close();
    };
  }, [cfg.net, cfg.me, doMove]);

  useEffect(() => {
    logEnd.current?.scrollTo({ top: logEnd.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  function again() {
    const fresh = newGame();
    stateRef.current = fresh;
    setState(fresh);
    setLog([]);
    setSel(null);
    setResigned(null);
    scene.current?.setState(fresh);
  }

  const resign = () => {
    cfg.net?.send({ t: "resign" });
    setResigned(cfg.mode === "local" ? state.turn : cfg.me);
  };

  let headline = "";
  if (st.over) headline = st.winner === null ? `Draw (${st.reason})` : `${SIDE[st.winner]} wins by checkmate`;
  else if (resigned !== null) headline = `${SIDE[1 - resigned]} wins, ${SIDE[resigned]!.toLowerCase()} resigned`;
  else if (left) headline = "Your friend left the game";
  const youWon = st.over ? st.winner === cfg.me : resigned !== null ? resigned !== cfg.me : false;

  const turnText = over
    ? "Game over"
    : thinking
      ? "Computer is thinking…"
      : cfg.mode === "local"
        ? `${SIDE[state.turn]} to move`
        : myTurn
          ? "Your move"
          : cfg.mode === "online"
            ? "Waiting for your friend…"
            : "…";

  return (
    <main className={`${a.stage} arcade`}>
      <div className={c.canvasWrap}>
        <canvas ref={canvas} className={c.canvas} />
      </div>

      <header className={a.top}>
        <button className={a.back} onClick={onExit}>
          <span aria-hidden>←</span> Menu
        </button>
        <h1 className={a.title}>Tri-D Chess</h1>
        <span className={a.spacer} />
        <button className={`${a.key} ${a.small} ${a.ghost}`} onClick={() => setHelp(true)}>
          How it works
        </button>
      </header>

      <section className={c.hud}>
        <div className={`${a.panel} ${c.turn}`}>
          <span className={c.dot} style={{ background: state.turn === 0 ? "#f4ebd3" : "#2c2547", borderColor: state.turn === 0 ? "#fff" : "#9b7bff" }} />
          <div>
            <strong>{turnText}</strong>
            {!over && st.check && <em className={c.check}>Check!</em>}
          </div>
        </div>

        <div className={`${a.panel} ${c.boards}`}>
          <p className={a.label}>Attack boards</p>
          {BOARD_NAMES.map((name, b) => {
            const z = state.boards[b]!;
            const up = canMove ? legal.find((m) => m.t === "b" && m.board === b && m.z === z + 1) : undefined;
            const down = canMove ? legal.find((m) => m.t === "b" && m.board === b && m.z === z - 1) : undefined;
            return (
              <div key={name} className={c.boardRow}>
                <span>
                  {name}
                  <small>{LEVEL_NAME[z]}</small>
                </span>
                <button className={`${a.key} ${a.small} ${a.sky}`} disabled={!up} aria-label={`Raise ${name} board`} onClick={() => up && doMove(up)}>
                  ▲
                </button>
                <button className={`${a.key} ${a.small} ${a.sky}`} disabled={!down} aria-label={`Lower ${name} board`} onClick={() => down && doMove(down)}>
                  ▼
                </button>
              </div>
            );
          })}
        </div>

        <div className={`${a.panel} ${c.logPanel}`}>
          <p className={a.label}>Moves</p>
          <ol ref={logEnd} className={c.log}>
            {log.length === 0 && <li className={c.empty}>Tap a piece, then a glowing spot. Drag to look around.</li>}
            {log.map((m, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                {m}
              </li>
            ))}
          </ol>
        </div>

        <div className={c.actions}>
          <button className={`${a.key} ${a.small} ${a.ghost}`} onClick={() => scene.current?.setView(scene.current.facing === 0 ? 1 : 0)}>
            Flip view
          </button>
          {!over && (
            <button className={`${a.key} ${a.small} ${a.ghost}`} onClick={resign}>
              Resign
            </button>
          )}
        </div>
      </section>

      {over && (
        <div className={a.center}>
          <div className={a.card}>
            <h2>{cfg.mode === "local" || (st.over && st.winner === null) ? "Game over" : left ? "Friend left" : youWon ? "You win!" : "You lose"}</h2>
            <p>{headline}.</p>
            <div className={a.row}>
              {cfg.mode !== "online" && (
                <button className={`${a.key} ${a.grape}`} onClick={again}>
                  Play again
                </button>
              )}
              <button className={`${a.key} ${a.ghost}`} onClick={onExit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className={a.center} onClick={() => setHelp(false)}>
          <div className={a.card} onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
            <h2>How it works</h2>
            <ul className={c.rules}>
              <li>
                <b>Three 4×4 boards</b> are stacked (levels 1–3) with <b>four small attack boards</b> on the ends. White starts low, black high.
              </li>
              <li>
                Pieces move as in chess, in three dimensions. <b>Rooks</b> go along any of the three axes, <b>bishops</b> diagonally in any plane, <b>knights</b> two squares one way and one another, the <b>queen</b> does both and the <b>king</b> steps to any touching square.
              </li>
              <li>
                <b>Pawns</b> step forward one rank <i>or up one level</i> toward the enemy, and capture diagonally forward. Reach the far rank to become a queen.
              </li>
              <li>
                <b>Attack boards</b> can slide one level up or down as your whole move, pieces and all, if only your pieces are on them (or it is empty and yours).
              </li>
              <li>Checkmate wins. Drag to orbit, pinch or scroll to zoom. Board squares you can reach glow green; captures glow orange.</li>
            </ul>
            <p style={{ fontSize: 13, opacity: 0.7 }}>These are house rules, simplified from the Star Trek game. Close enough to annoy a physicist.</p>
            <button className={`${a.key} ${a.grape}`} onClick={() => setHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
