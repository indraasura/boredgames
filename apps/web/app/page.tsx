import Link from "next/link";
import s from "./home.module.css";

const ROAD: { x: number; y: number; c: string; big?: boolean }[] = [
  { x: 30, y: 44, c: "#F5D061" },
  { x: 35, y: 49, c: "#7BC47F" },
  { x: 40.5, y: 52, c: "#F5D061" },
  { x: 46, y: 51, c: "#E2665C", big: true },
  { x: 51.5, y: 48, c: "#F29BB8" },
  { x: 57, y: 47, c: "#F5D061" },
  { x: 62, y: 50, c: "#7BC47F" },
  { x: 65, y: 56, c: "#6FA8DC", big: true },
  { x: 60, y: 61, c: "#F5D061" },
  { x: 54, y: 63, c: "#F29BB8" },
  { x: 48, y: 62, c: "#E8B04B", big: true },
];

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="#0A0A0A" />
      <circle cx="9" cy="9" r="2.4" fill="#F7F7F5" />
      <circle cx="14" cy="14" r="2.4" fill="#F7F7F5" />
      <circle cx="19" cy="19" r="2.4" fill="#F7F7F5" />
    </svg>
  );
}

function Workshop({ title, font, color, art, players, blurb, tags, note }: {
  title: string;
  font: string;
  color: string;
  art: React.ReactNode;
  players: string;
  blurb: string;
  tags: string[];
  note: string;
}) {
  return (
    <article className={s.card}>
      <div className={s.art} aria-hidden="true">{art}</div>
      <div className={s.cardBody}>
        <div className={s.cardTitle}>
          <h3 style={{ fontFamily: font, color }}>{title}</h3>
          <span className="mono">{players}</span>
        </div>
        <p className={s.desc}>{blurb}</p>
        <div className={s.tags}>
          {tags.map((t) => (
            <span key={t} className={s.tag}>{t}</span>
          ))}
        </div>
        <div className={s.soon}>
          <span>Coming soon</span>
          <span className="mono" style={{ textTransform: "none" }}>{note}</span>
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  return (
    <>
      <header className={s.header}>
        <nav className={s.nav} aria-label="Main">
          <Link href="/" className={s.brand}>
            <Logo />
            boredgames
          </Link>
          <div className={s.links}>
            <a href="#shelf" className={s.link}>Games</a>
            <a href="#how" className={s.link}>About</a>
          </div>
          <div className={s.actions}>
            <Link href="/games/milestones" className={s.pill}>Play Milestones</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className={s.hero}>
          <div className="mono">Board games for when you&apos;re bored</div>
          <h1 className={s.h1}>Pick a game.</h1>
          <div className={s.heroRow}>
            <p className={s.lede}>
              Board games that run in your browser. No account, no sign-up, nothing saved. Open one and play.
            </p>
          </div>
        </section>

        <section id="shelf" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Games</h2>
            <span className="mono">1 playable, 3 coming</span>
          </div>

          <div className={s.shelf}>
            <article className={`${s.card} ${s.featured}`}>
              <div className={`${s.art} ${s.sky}`} aria-hidden="true">
                <div className={s.sea} />
                <div className={s.land} />
                {ROAD.map((d, i) => (
                  <span
                    key={i}
                    className={s.dot}
                    style={{ left: `${d.x}%`, top: `${d.y}%`, background: d.c, width: d.big ? 22 : 16, height: d.big ? 12 : 9 }}
                  />
                ))}
                <span className={s.tree} style={{ left: "33%", top: "38%", background: "#5FA35A" }} />
                <span className={s.tree} style={{ left: "69%", top: "42%", background: "#7BBF6A" }} />
                <span className={s.tree} style={{ left: "43%", top: "58%", background: "#6DB36B" }} />
                <span style={{ position: "absolute", left: "47.5%", top: "41%", width: 18, height: 12, borderRadius: 4, background: "#E86F51", boxShadow: "0 3px 0 #B9503A" }} />
                <span className={`mono ${s.badge}`}>3D</span>
              </div>
              <div className={s.cardBody}>
                <div className={s.cardTitle}>
                  <h3 style={{ fontFamily: "var(--font-fredoka)", fontWeight: 700, fontSize: 40, color: "#23303B" }}>Milestones</h3>
                  <span className="mono">1–4 players</span>
                </div>
                <p className={s.desc} style={{ fontSize: 16, lineHeight: 1.55 }}>
                  Spin, drive across the map and live a whole life: pick a job, buy a home, start a family, invest. Whoever retires with the most money wins. Four maps, solo or with friends.
                </p>
                <div className={s.tags}>
                  <span className={s.tag}>vs Computer</span>
                  <span className={s.tag}>Friends by invite link</span>
                  <span className={s.tag}>About 20 minutes</span>
                </div>
                <Link href="/games/milestones" className={s.cta}>
                  <span>Play</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>

            <Workshop
              title="Mancala"
              font="var(--font-inter-tight)"
              color="#4E3122"
              players="2 players"
              blurb="Sow seeds around the board. Land in your store to go again, land in an empty pit to capture."
              tags={["vs Computer"]}
              note=""
              art={
                <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, #F8F0E1, #E6D7BE 75%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 14, borderRadius: 60, background: "linear-gradient(170deg,#7A4E33,#4E3122)", boxShadow: "0 16px 30px -12px rgba(60,30,10,.6)" }}>
                    <div style={{ width: 30, height: 90, borderRadius: 16, background: "#3A2317" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} style={{ width: 32, height: 32, borderRadius: "50%", background: "#3A2317" }} />
                      ))}
                    </div>
                    <div style={{ width: 30, height: 90, borderRadius: 16, background: "#3A2317" }} />
                  </div>
                </div>
              }
            />
            <Workshop
              title="Pachisi"
              font="serif"
              color="#1F3B73"
              players="2–4 players"
              blurb="Roll, race your pieces home, and send rivals back to the start."
              tags={["vs Computer"]}
              note=""
              art={<div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle,#27498C,#142850 80%)" }} />}
            />
            <Workshop
              title="Depth Charge"
              font="monospace"
              color="#0B5A35"
              players="2 players"
              blurb="Hide your fleet, then find theirs with sonar pings."
              tags={["vs Computer"]}
              note=""
              art={<div style={{ position: "absolute", inset: 0, background: "#03110D" }} />}
            />
          </div>
        </section>

        <section id="how" className={s.section}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>About</h2>
          </div>
          <div className={s.steps}>
            <div className={s.step}>
              <h3>No account</h3>
              <p>There is nothing to sign up for and no server to talk to. The site is just files.</p>
            </div>
            <div className={s.step}>
              <h3>Nothing saved</h3>
              <p>No levels, scores or history. Close the tab and the game is gone. Start a new one any time.</p>
            </div>
            <div className={s.step}>
              <h3>Play anyone</h3>
              <p>Games run in your browser against computer players, so they start straight away. Friends join by invite link, directly browser to browser.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerIn}>
          <span className={s.brand} style={{ fontSize: 16 }}>boredgames</span>
          <span>Free. No account, no tracking.</span>
        </div>
      </footer>
    </>
  );
}
