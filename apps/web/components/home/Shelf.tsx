"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FILTERS, GAMES, SOON, matches, type Filter } from "@/lib/games";
import { Art } from "./Art";
import s from "./shelf.module.css";

function Arrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** The filters, the shuffle button and the games themselves. */
export function Shelf() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => GAMES.filter((g) => matches(g, filter)), [filter]);

  function shuffle() {
    const pool = shown.length ? shown : GAMES;
    router.push(pool[Math.floor(Math.random() * pool.length)]!.href);
  }

  return (
    <>
      <div className={s.controls}>
        <button type="button" className={s.shuffle} onClick={shuffle}>
          <span className={s.dice} aria-hidden="true">
            <i /> <i /> <i />
          </span>
          Surprise me
        </button>
        <div className={s.chips} role="group" aria-label="Filter games">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`${s.chip} ${filter === f.id ? s.on : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              <b>{GAMES.filter((g) => matches(g, f.id)).length}</b>
            </button>
          ))}
        </div>
      </div>

      <ul className={s.grid} id="games">
        {shown.map((g, i) => (
          <li key={g.id} className={s.cell} style={{ "--tile": g.color, "--tilt": `${i % 2 ? 0.9 : -1.1}deg` } as React.CSSProperties}>
            <Link href={g.href} className={s.card}>
              <span className={`${s.art} ${s[`art_${g.art}`]}`}>
                <Art id={g.art} />
                <span className={s.go}>
                  Play <Arrow />
                </span>
              </span>
              <span className={s.body}>
                <span className={s.name}>{g.name}</span>
                <span className={s.tag}>{g.tagline}</span>
                <span className={s.meta}>
                  <span>{g.players} {g.players === "1" ? "player" : "players"}</span>
                  <span>{g.minutes}</span>
                  {g.solo && <span>solo</span>}
                  {g.sameScreen && <span>same screen</span>}
                  {g.online && <span>online</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className={s.empty}>Nothing fits that yet.</li>}
      </ul>

      <div className={s.soon}>
        <span className={s.soonLabel}>On the shelf next</span>
        <ul>
          {SOON.map((n, i) => (
            <li key={n} style={{ "--r": `${(i % 3) - 1}deg` } as React.CSSProperties}>
              {n}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
