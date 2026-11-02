"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUDGET, GRID, PARTS, PART_ORDER, TEMPLATES, autoFix, check, stats, type Design, type DesignPart, type Dir, type PartKind } from "@boredgames/botbrawl";
import a from "../shared/arcade.module.css";
import b from "./brawl.module.css";
import { PartIcon } from "./PartIcon";

const key = (c: number, r: number) => r * GRID + c;

/** The build bench: a grid, a parts bin, and a clock. */
export function Builder({
  seconds,
  title,
  color,
  initial,
  onSubmit,
}: {
  seconds: number;
  title: string;
  color: string;
  initial?: Design | null;
  onSubmit(design: Design): void;
}) {
  const [cells, setCells] = useState<Map<number, DesignPart>>(() => new Map((initial?.parts ?? []).map((p) => [key(p.c, p.r), p])));
  const [tool, setTool] = useState<PartKind | "erase">("hull");
  const [dir, setDir] = useState<Dir>(0);
  const [name, setName] = useState(initial?.name ?? "Scrapper");
  const [left, setLeft] = useState(seconds);
  const [flash, setFlash] = useState("");
  const deadline = useRef(Date.now() + seconds * 1000);
  const done = useRef(false);

  const design: Design = useMemo(() => ({ name, parts: [...cells.values()] }), [cells, name]);
  const res = useMemo(() => check(design), [design]);
  const st = useMemo(() => stats(res.kept), [res]);
  const dropped = cells.size - res.kept.length;

  const submit = useCallback(
    (d: Design) => {
      if (done.current) return;
      done.current = true;
      onSubmit(autoFix(d));
    },
    [onSubmit],
  );
  const latest = useRef(design);
  latest.current = design;

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) submit(latest.current);
    }, 200);
    return () => clearInterval(t);
  }, [submit]);

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash((f) => (f === m ? "" : f)), 1400);
  };

  const place = useCallback(
    (c: number, r: number, erase: boolean) => {
      setCells((prev) => {
        const next = new Map(prev);
        const k = key(c, r);
        if (erase || tool === "erase") {
          next.delete(k);
          return next;
        }
        const old = next.get(k);
        if (old && old.kind === tool && old.dir === (PARTS[tool].directional ? dir : 0)) return prev;
        if (tool === "core") for (const [kk, p] of next) if (p.kind === "core") next.delete(kk);
        next.set(k, { c, r, kind: tool, dir: PARTS[tool].directional ? dir : 0 });
        // Count everything placed, connected or not: the budget is about what you grab.
        const spent = [...next.values()].reduce((n, p) => n + PARTS[p.kind].cost, 0);
        if (spent > BUDGET) {
          queueMicrotask(() => say(`Over budget by ${spent - BUDGET}`));
          return prev;
        }
        return next;
      });
    },
    [tool, dir],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "r") setDir((d) => (((d + 1) % 4) as Dir));
      else if (k === "e" || k === "delete" || k === "backspace") setTool("erase");
      else if (k >= "1" && k <= "9") setTool(PART_ORDER[Number(k) - 1]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const spent = [...cells.values()].reduce((n, p) => n + PARTS[p.kind].cost, 0);
  const urgent = left <= 10;

  return (
    <div className={b.bench}>
      <div className={b.benchTop}>
        <div>
          <p className={a.label}>{title}</p>
          <input className={b.nameInput} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} aria-label="Robot name" />
        </div>
        <div className={`${b.clock} ${urgent ? b.urgent : ""}`} role="timer">
          <strong>{left}</strong>
          <span>sec</span>
          <i style={{ width: `${(left / seconds) * 100}%` }} />
        </div>
      </div>

      <div className={b.benchBody}>
        <div className={b.gridWrap}>
          <div className={b.frontLabel}>▲ FRONT</div>
          <div className={b.grid} onContextMenu={(e) => e.preventDefault()} style={{ "--cols": GRID } as React.CSSProperties}>
            {Array.from({ length: GRID * GRID }, (_, i) => {
              const c = i % GRID;
              const r = Math.floor(i / GRID);
              const p = cells.get(i);
              const connected = !p || res.kept.some((k) => k.c === c && k.r === r);
              return (
                <button
                  key={i}
                  type="button"
                  className={`${b.cell} ${p ? b.filled : ""} ${p && !connected ? b.loose : ""}`}
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                    place(c, r, e.button === 2);
                  }}
                  onPointerEnter={(e) => e.buttons === 1 && place(c, r, false)}
                  aria-label={p ? `${PARTS[p.kind].label} at column ${c + 1}, row ${r + 1}` : `Empty at column ${c + 1}, row ${r + 1}`}
                >
                  {p && <PartIcon kind={p.kind} dir={p.dir} color={color} size={34} />}
                </button>
              );
            })}
          </div>
          {dropped > 0 && <p className={b.warn}>{dropped} part{dropped > 1 ? "s are" : " is"} not connected to the core and will be left out.</p>}
          <p className={b.hint}>Click or drag to place. Right-click erases. R rotates. Keys 1–9 pick parts.</p>
        </div>

        <div className={b.side}>
          <div className={b.palette}>
            {PART_ORDER.map((k, i) => (
              <button key={k} type="button" className={`${b.part} ${tool === k ? b.on : ""}`} onClick={() => setTool(k)} title={PARTS[k].blurb}>
                <PartIcon kind={k} dir={PARTS[k].directional ? dir : 0} color={color} size={30} />
                <span>
                  {PARTS[k].label}
                  <small>
                    {i + 1} · {PARTS[k].cost} pts
                  </small>
                </span>
              </button>
            ))}
            <button type="button" className={`${b.part} ${tool === "erase" ? b.on : ""}`} onClick={() => setTool("erase")}>
              <span className={b.eraser}>✕</span>
              <span>
                Erase<small>E</small>
              </span>
            </button>
          </div>
          <p className={b.blurb}>{tool === "erase" ? "Click a part to remove it." : PARTS[tool].blurb}</p>
          <div className={a.row}>
            <button type="button" className={`${a.key} ${a.small} ${a.sky}`} onClick={() => setDir((d) => (((d + 1) % 4) as Dir))} disabled={tool === "erase" || !PARTS[tool].directional}>
              Rotate (R)
            </button>
            <button type="button" className={`${a.key} ${a.small} ${a.ghost}`} onClick={() => setCells(new Map())}>
              Clear
            </button>
            <button
              type="button"
              className={`${a.key} ${a.small} ${a.ghost}`}
              onClick={() => {
                const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]!;
                setCells(new Map(t.parts.map((p) => [key(p.c, p.r), { ...p }])));
                setName(t.name);
              }}
            >
              Surprise me
            </button>
          </div>

          <div className={b.stats}>
            <div className={b.budget}>
              <span>
                Budget <b className={spent > BUDGET ? b.bad : ""}>{spent}</b> / {BUDGET}
              </span>
              <i>
                <u style={{ width: `${Math.min(100, (spent / BUDGET) * 100)}%` }} />
              </i>
            </div>
            <dl>
              <div>
                <dt>Health</dt>
                <dd>{Math.round(st.hp)}</dd>
              </div>
              <div>
                <dt>Weight</dt>
                <dd>{st.mass.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Wheels</dt>
                <dd>{st.wheels}</dd>
              </div>
              <div>
                <dt>Weapons</dt>
                <dd>{st.weapons}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{st.wheels ? "▮".repeat(Math.max(1, Math.round(st.speed * 5))) : "none"}</dd>
              </div>
            </dl>
          </div>

          <button type="button" className={`${a.key} ${a.mint}`} disabled={!res.ok} onClick={() => submit(design)}>
            {res.ok ? "Ready to fight" : (res.error ?? "Not ready")}
          </button>
          {flash && <div className={a.toast}>{flash}</div>}
        </div>
      </div>
    </div>
  );
}
