"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BotLevel } from "@boredgames/engine";
import { randomDesign, type Design } from "@boredgames/botbrawl";
import { GuestNet, HostNet, type Msg, type Net } from "@/lib/botbrawl/net";
import { webrtcSupported } from "@/lib/p2p";
import { FriendSlots, JoinFlow, type SlotsHandle } from "../shared/Invite";
import a from "../shared/arcade.module.css";
import b from "./brawl.module.css";
import { Battle, COLORS, type FightMode } from "./Battle";
import { Builder } from "./Builder";

interface Cfg {
  mode: FightMode;
  level: BotLevel;
  seconds: number;
  net?: Net;
}
type Phase =
  | { k: "menu" }
  | { k: "host" }
  | { k: "join" }
  | { k: "build"; cfg: Cfg; who: 0 | 1; first?: Design; id: number }
  | { k: "wait"; cfg: Cfg; mine: Design }
  | { k: "fight"; cfg: Cfg; designs: [Design, Design]; id: number };

export default function BotBrawlGame() {
  const [phase, setPhase] = useState<Phase>({ k: "menu" });
  const [level, setLevel] = useState<BotLevel>("medium");
  const [seconds, setSeconds] = useState(60);
  const [joined, setJoined] = useState(0);
  const slots = useRef<SlotsHandle>(null);
  const seq = useRef(0);
  const guestDesign = useRef<Design | null>(null);
  const [tick, setTick] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const net = "cfg" in phase ? phase.cfg.net : undefined;

  // Messages that can arrive in any phase: the guest's design (host), and fight / rebuild orders (guest).
  useEffect(() => {
    if (!net) return;
    const off = net.subscribe((m: Msg) => {
      const cfg = (phaseRef.current as { cfg?: Cfg }).cfg;
      if (!cfg) return;
      if (m.t === "design") {
        guestDesign.current = m.d;
        setTick((n) => n + 1);
      } else if (m.t === "fight" && cfg.mode === "guest") setPhase({ k: "fight", cfg, designs: m.designs, id: ++seq.current });
      else if (m.t === "rebuild" && cfg.mode === "guest") setPhase({ k: "build", cfg: { ...cfg, seconds: m.seconds }, who: 0, id: ++seq.current });
    });
    net.onLeave(() => {
      if (phaseRef.current.k !== "menu") exit("Your friend left.");
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  const [notice, setNotice] = useState("");
  function exit(msg = "") {
    const n = (phaseRef.current as { cfg?: Cfg }).cfg?.net;
    n?.close();
    guestDesign.current = null;
    setNotice(msg);
    setPhase({ k: "menu" });
  }

  // The host starts the fight as soon as both robots are built.
  useEffect(() => {
    if (phase.k !== "wait" || phase.cfg.mode !== "host") return;
    const go = (theirs: Design) => {
      const designs: [Design, Design] = [phase.mine, theirs];
      phase.cfg.net?.send({ t: "fight", designs });
      setPhase({ k: "fight", cfg: phase.cfg, designs, id: ++seq.current });
    };
    if (guestDesign.current) {
      go(guestDesign.current);
      guestDesign.current = null;
      return;
    }
    const t = setTimeout(() => go(randomDesign()), 12000);
    return () => clearTimeout(t);
  }, [phase, tick]);

  const start = (mode: FightMode, cfg?: Partial<Cfg>) => {
    setNotice("");
    setPhase({ k: "build", cfg: { mode, level, seconds, ...cfg }, who: 0, id: ++seq.current });
  };

  // ------------------------------------------------------------------ screens

  if (phase.k === "build") {
    const { cfg, who } = phase;
    const color = COLORS[who]!;
    const title = cfg.mode === "local" ? `Player ${who + 1}: build your robot` : "Build your robot";
    return (
      <main className={`${a.stage} arcade`}>
        <header className={a.top}>
          <button className={a.back} onClick={() => exit()}>
            <span aria-hidden>←</span> Leave
          </button>
          <h1 className={a.title}>Bot Brawl</h1>
        </header>
        <div className={b.benchWrap}>
          <Builder
            key={`${phase.id}-${who}`}
            seconds={cfg.seconds}
            title={title}
            color={color}
            onSubmit={(d) => {
              if (cfg.mode === "bot") {
                setPhase({ k: "fight", cfg, designs: [d, randomDesign()], id: ++seq.current });
              } else if (cfg.mode === "local") {
                if (who === 0) setPhase({ ...phase, who: 1, first: d, id: ++seq.current });
                else setPhase({ k: "fight", cfg, designs: [phase.first!, d], id: ++seq.current });
              } else if (cfg.mode === "host") setPhase({ k: "wait", cfg, mine: d });
              else {
                cfg.net?.send({ t: "design", d });
                setPhase({ k: "wait", cfg, mine: d });
              }
            }}
          />
        </div>
      </main>
    );
  }

  if (phase.k === "wait") {
    return (
      <main className={`${a.stage} arcade`}>
        <div className={a.center}>
          <div className={a.card}>
            <h2>Robot ready</h2>
            <p>Waiting for the other builder to finish…</p>
          </div>
        </div>
      </main>
    );
  }

  if (phase.k === "fight") {
    const { cfg, designs } = phase;
    return (
      <main className={`${a.stage} arcade`}>
        <Battle
          key={phase.id}
          designs={designs}
          mode={cfg.mode}
          level={cfg.level}
          net={cfg.net}
          onDone={(action) => {
            if (action === "menu") return exit();
            if (action === "rematch") {
              if (cfg.mode === "host") cfg.net?.send({ t: "fight", designs });
              setPhase({ k: "fight", cfg, designs, id: ++seq.current });
            } else if (cfg.mode === "host") {
              cfg.net?.send({ t: "rebuild", seconds: cfg.seconds });
              setPhase({ k: "build", cfg, who: 0, id: ++seq.current });
            } else setPhase({ k: "build", cfg, who: 0, id: ++seq.current });
          }}
        />
        <header className={a.top}>
          <button className={a.back} onClick={() => exit()}>
            <span aria-hidden>←</span> Leave
          </button>
        </header>
      </main>
    );
  }

  return (
    <main className={`${a.stage} arcade`}>
      <header className={a.top}>
        <Link href="/" className={a.back}>
          <span aria-hidden>←</span> All games
        </Link>
      </header>

      {phase.k === "menu" && (
        <div className={a.menu}>
          <div className={a.menuInner}>
            <div>
              <h1 className={a.h1}>
                Bot <span style={{ color: "var(--mint)" }}>Brawl</span>
              </h1>
              <p className={a.lead}>Build a fighting robot from blocks before the clock runs out. Then drive it into a steel cage and break the other one. Imagination is the only rule.</p>
            </div>
            {notice && <p className={b.notice}>{notice}</p>}

            <div className={a.panel}>
              <p className={a.label}>Time to build</p>
              <div className={a.row}>
                {[30, 60, 90].map((s) => (
                  <button key={s} className={`${a.chip} ${seconds === s ? a.on : ""}`} onClick={() => setSeconds(s)}>
                    {s} sec
                  </button>
                ))}
              </div>
              <p className={a.label} style={{ marginTop: 16 }}>
                Computer opponent
              </p>
              <div className={a.row}>
                {(["easy", "medium", "hard"] as const).map((l) => (
                  <button key={l} className={`${a.chip} ${level === l ? a.on : ""}`} onClick={() => setLevel(l)}>
                    {l[0]!.toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={a.modes}>
              <button className={a.mode} style={{ "--tile": "var(--mint)" } as React.CSSProperties} onClick={() => start("bot")}>
                <strong>Fight the computer</strong>
                <span>Build, then battle a robot it built.</span>
              </button>
              <button className={a.mode} style={{ "--tile": "var(--lemon)" } as React.CSSProperties} onClick={() => start("local")}>
                <strong>Two players, one keyboard</strong>
                <span>Each builds in turn. Then WASD against arrow keys.</span>
              </button>
              <button className={a.mode} style={{ "--tile": "var(--pink)" } as React.CSSProperties} disabled={!webrtcSupported()} onClick={() => setPhase({ k: "host" })}>
                <strong>Host a friend</strong>
                <span>Get a 6 digit code. Both build at once.</span>
              </button>
              <button className={a.mode} style={{ "--tile": "var(--sky)" } as React.CSSProperties} disabled={!webrtcSupported()} onClick={() => setPhase({ k: "join" })}>
                <strong>Join with a code</strong>
                <span>Your friend gave you six digits.</span>
              </button>
            </div>

            <div className={`${a.panel} ${b.how}`}>
              <p className={a.label}>How it works</p>
              <ul>
                <li>You get {90} points of budget. Every part costs some. Parts must touch the core to count.</li>
                <li>Wheels drive. Put them on both sides to steer. Spinners and spikes hurt on contact; hammers and flippers need Fire; boosters need Boost.</li>
                <li>Break the other core to win, or leave them without wheels for 8 seconds. After 90 seconds the judges pick whoever is healthier. Watch out for the flame vents in the corners.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {phase.k === "host" && (
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
                  const n = new HostNet([{ id: "p1", name: friend.name, link: friend.link }], taken.room ?? undefined);
                  n.send({ t: "build", seconds });
                  start("host", { net: n });
                }}
              >
                Start building
              </button>
              <button className={`${a.key} ${a.ghost}`} onClick={() => setPhase({ k: "menu" })}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {phase.k === "join" && (
        <div className={a.center}>
          <div className={a.card} style={{ padding: 0, border: 0, background: "none", boxShadow: "none" }}>
            <JoinFlow<Msg>
              dark
              build={(link) => new GuestNet(link)}
              isStart={(m) => m.t === "build"}
              onStart={(n, m) => m.t === "build" && start("guest", { net: n, seconds: m.seconds })}
              onBack={() => setPhase({ k: "menu" })}
            />
          </div>
        </div>
      )}
    </main>
  );
}
