import Link from "next/link";
import { MAP_LIST } from "@boredgames/milestones";
import { HeroWheel } from "@/components/home/HeroWheel";
import { Reveal } from "@/components/home/Reveal";
import s from "./home.module.css";

function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="currentColor" />
      <circle cx="9" cy="9" r="2.4" fill="var(--paper)" />
      <circle cx="14" cy="14" r="2.4" fill="var(--paper)" />
      <circle cx="19" cy="19" r="2.4" fill="var(--paper)" />
    </svg>
  );
}

function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Star() {
  return (
    <svg className={s.star} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="currentColor" />
    </svg>
  );
}

const TICKER = ["Spin the wheel", "Get a job", "Buy a home", "Start a family", "Ride the market", "Dodge the lawsuit", "Retire richest"];

const STEPS = [
  { n: "01", title: "Spin", text: "The wheel says how far you drive. Paydays, bills and surprises line the road." },
  { n: "02", title: "Choose", text: "A handful of real decisions: which road, which job, which home, how much to invest." },
  { n: "03", title: "Retire", text: "The first to retire gets a bonus. When everyone is done, the richest life wins." },
];

const PRINCIPLES = [
  { k: "No account", v: "Nothing to sign up for. Open a game and play." },
  { k: "Nothing saved", v: "No levels, no streaks, no history. Close the tab and it is gone." },
  { k: "No server", v: "The whole site is static files. Friends connect browser to browser." },
  { k: "Free", v: "No ads, no tracking, no in-game anything." },
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
          <a href="#milestones">Milestones</a>
          <a href="#how">How it plays</a>
          <a href="#about">About</a>
        </nav>
        <Link href="/games/milestones" className={s.navCta}>
          Play now
          <Arrow size={16} />
        </Link>
      </header>

      <main>
        {/* ---------------------------------------------------------------- hero */}
        <section className={s.hero}>
          <div className={s.heroMeta}>
            <span>(Index)</span>
            <span>A tiny arcade for the browser</span>
            <span>No account · No download · Nothing saved</span>
          </div>
          <h1 className={s.display}>
            <span className={s.line}>
              <span>Games for</span>
            </span>
            <span className={s.line}>
              <span>
                <em>idle</em> minds.
              </span>
            </span>
          </h1>
          <div className={s.heroFoot}>
            <p className={s.lead}>
              Board games you can start in a second and finish before you are bored again. Our first is <b>Milestones</b>: a whole life, one spin at a time.
            </p>
            <HeroWheel />
            <div className={s.heroCta}>
              <Link href="/games/milestones" className={s.cta}>
                <span>Play Milestones</span>
                <span className={s.ctaDot}>
                  <Arrow />
                </span>
              </Link>
              <span className={s.small}>Free · 1–4 players · about 20 minutes</span>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- ticker */}
        <div className={s.ticker} aria-hidden="true">
          <div className={s.track}>
            {[0, 1].map((k) => (
              <span key={k} className={s.run}>
                {TICKER.map((t) => (
                  <span key={t} className={s.tick}>
                    {t}
                    <Star />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* ---------------------------------------------------------- milestones */}
        <section id="milestones" className={s.section}>
          <Reveal className={s.sectionHead}>
            <span className={s.index}>(01)</span>
            <h2 className={s.h2}>
              Now playing: <em>Milestones</em>
            </h2>
            <p className={s.sectionLead}>Drive a toy car across a 3D map and live a whole life on the way. Pick a job, buy a home, start a family, invest. Whoever retires with the most money wins.</p>
          </Reveal>

          <Reveal className={s.feature}>
            <Link href="/games/milestones" className={s.featureMedia} aria-label="Play Milestones">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/media/sunny-isle.jpg" alt="The Sunny Isle board: a road of coloured tiles winding across a green island" />
              <span className={s.featureBadge}>
                Play <Arrow size={16} />
              </span>
            </Link>
            <dl className={s.facts}>
              <div>
                <dt>Players</dt>
                <dd>1–4</dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>~20 min</dd>
              </div>
              <div>
                <dt>Maps</dt>
                <dd>{MAP_LIST.length}</dd>
              </div>
              <div>
                <dt>Opponents</dt>
                <dd>
                  Computer
                  <br />
                  or friends
                </dd>
              </div>
            </dl>
          </Reveal>

          <div className={s.maps}>
            {MAP_LIST.map((m, i) => (
              <Reveal key={m.id} className={s.mapCard} delay={i * 80}>
                <Link href={`/games/milestones?pick=${m.id}`} className={s.mapLink}>
                  <span className={s.mapImg}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/media/${m.id}.jpg`} alt="" loading="lazy" />
                  </span>
                  <span className={s.mapRow}>
                    <span className={s.mapNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={s.mapName}>{m.name}</span>
                    <Arrow />
                  </span>
                  <span className={s.mapTag}>{m.tagline}</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- how */}
        <section id="how" className={s.section}>
          <Reveal className={s.sectionHead}>
            <span className={s.index}>(02)</span>
            <h2 className={s.h2}>
              How a life <em>plays out</em>
            </h2>
          </Reveal>
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <Reveal key={st.n} as="li" className={s.step} delay={i * 90}>
                <span className={s.stepNum}>{st.n}</span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------------------ friends */}
        <section className={s.dark}>
          <div className={s.darkInner}>
            <Reveal className={s.darkCopy}>
              <span className={s.index}>(03)</span>
              <h2 className={s.h2}>
                Bring friends.
                <br />
                <em>Skip the accounts.</em>
              </h2>
              <p>Host a game and share six digits. Friends type them in and you are playing, browser to browser. Empty seats go to the computer.</p>
              <Link href="/games/milestones" className={`${s.cta} ${s.ctaLight}`}>
                <span>Host a game</span>
                <span className={s.ctaDot}>
                  <Arrow />
                </span>
              </Link>
            </Reveal>
            <Reveal className={s.code} delay={120}>
              <span className={s.codeLabel}>Room code</span>
              <span className={s.digits}>
                {"482913".split("").map((d, i) => (
                  <span key={i} style={{ animationDelay: `${i * 90}ms` }}>
                    {d}
                  </span>
                ))}
              </span>
              <span className={s.codeNote}>Rooms close when the host leaves. Nothing is kept.</span>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------- about */}
        <section id="about" className={s.section}>
          <Reveal className={s.sectionHead}>
            <span className={s.index}>(04)</span>
            <h2 className={s.h2}>
              Made to be <em>forgotten</em>
            </h2>
            <p className={s.sectionLead}>Play when you are bored, then get on with your day. No progress to protect, nothing to come back for.</p>
          </Reveal>
          <ul className={s.principles}>
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.k} as="li" className={s.principle} delay={i * 60}>
                <span className={s.pNum}>{String(i + 1).padStart(2, "0")}</span>
                <span className={s.pKey}>{p.k}</span>
                <span className={s.pVal}>{p.v}</span>
              </Reveal>
            ))}
          </ul>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footTop}>
          <p className={s.footLine}>
            Bored? <Link href="/games/milestones">Spin a life</Link>.
          </p>
          <div className={s.footLinks}>
            <a href="#milestones">Milestones</a>
            <a href="#how">How it plays</a>
            <a href="#about">About</a>
          </div>
        </div>
        <div className={s.giant} aria-hidden="true">
          idleminds
        </div>
        <div className={s.footBottom}>
          <span>© {new Date().getFullYear()} idleminds</span>
          <span>Free. No account, no tracking.</span>
        </div>
      </footer>
    </div>
  );
}
