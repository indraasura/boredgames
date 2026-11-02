import Link from "next/link";
import { Shelf } from "@/components/home/Shelf";
import s from "./home.module.css";

function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="2" y="2" width="30" height="30" rx="9" fill="var(--lemon)" stroke="var(--hink)" strokeWidth="3" />
      <circle cx="11" cy="11" r="2.8" fill="var(--hink)" />
      <circle cx="17" cy="17" r="2.8" fill="var(--hink)" />
      <circle cx="23" cy="23" r="2.8" fill="var(--hink)" />
    </svg>
  );
}

const PROMISES = [
  { k: "No account", v: "Nothing to sign up for. Open a game and play.", c: "var(--lemon)" },
  { k: "Nothing saved", v: "No levels, no streaks, no history. Close the tab and it is gone.", c: "var(--mint)" },
  { k: "No server", v: "Static files only. Friends connect browser to browser with six digits.", c: "var(--pink)" },
  { k: "Free", v: "No ads, no tracking, nothing to buy.", c: "var(--sky)" },
];

export default function Home() {
  return (
    <div className={s.page}>
      <header className={s.nav}>
        <Link href="/" className={s.brand} aria-label="idleminds, home">
          <Mark />
          idleminds
        </Link>
        <nav className={s.links} aria-label="Main">
          <a href="#games">Games</a>
          <a href="#promise">The deal</a>
        </nav>
      </header>

      <main>
        <section className={s.hero}>
          <p className={s.kicker}>A pile of games for the browser</p>
          <h1 className={s.display}>
            <span className={s.bored}>Bored?</span>
            <span className={s.pick}>Pick one.</span>
          </h1>
          <p className={s.lead}>
            Open a game and you are playing. Alone against the computer, two of you on one screen, or with a friend over a six digit code. No account, no download, nothing saved.
          </p>
        </section>

        <section className={s.shelf} aria-label="Games">
          <Shelf />
        </section>

        <section id="promise" className={s.promise}>
          <h2 className={s.h2}>The deal</h2>
          <ul className={s.stickers}>
            {PROMISES.map((p, i) => (
              <li key={p.k} className={s.sticker} style={{ "--bg": p.c, "--r": `${[-2, 1.5, -1, 2][i]}deg` } as React.CSSProperties}>
                <strong>{p.k}</strong>
                <span>{p.v}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className={s.footer}>
        <span className={s.giant} aria-hidden="true">
          idleminds
        </span>
        <div className={s.footRow}>
          <span>© {new Date().getFullYear()} idleminds</span>
          <span>Free. No account, no tracking.</span>
        </div>
      </footer>
    </div>
  );
}
