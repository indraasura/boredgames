"use client";

import { useEffect, useState } from "react";
import { CROWNS, CROWNS_ALLIANCE, CROWNS_SOLO, HOUSES, PROVINCES, current, provinceByName } from "@boredgames/banners";
import type { View } from "@/lib/banners/controller";
import { audio } from "@/lib/banners/audio";
import s from "./banners.module.css";

/** The tutorial war: House Varn against two timid lords, on a map where the first attack goes well. */
export const TUTORIAL_SEED = 2026;
const TARGET = provinceByName("Greywater").id;
const DONE_KEY = "banners.tutored";

export function tutored(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}
function markTutored() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Private windows may refuse; the tutorial simply shows again next time.
  }
}

interface Ctx {
  view: View;
  selected: number | null;
  /** Marches made before this step began. */
  marchesAtStart: number;
}

interface Step {
  title: string;
  text: (c: Ctx) => React.ReactNode;
  /** Province to ring on the map. */
  at?: (c: Ctx) => number | null;
  pulse?: "raise" | "end" | "march";
  /** Moves on by itself when this holds; otherwise a button moves on. */
  done?: (c: Ctx) => boolean;
  button?: string;
}

const me = (c: Ctx) => c.view.game.players.find((p) => p.id === c.view.localId)!;
const cap = (c: Ctx) => me(c).capital;
const myTurn = (c: Ctx) => c.view.game.phase === "play" && current(c.view.game).id === c.view.localId && !c.view.busy;

const STEPS: Step[] = [
  {
    title: "Welcome, my lord",
    text: (c) => (
      <>
        You lead <b>{HOUSES[me(c).house].name}</b>, from your seat at {PROVINCES[cap(c)]!.name}. Win by holding <b>{CROWNS_SOLO} of the {CROWNS.length} crown cities</b> ♛. Let me show you how. It takes two minutes.
      </>
    ),
    button: "Show me",
  },
  {
    title: "Your capital",
    text: (c) => (
      <>
        Click <b>{PROVINCES[cap(c)]!.name}</b>, your capital. It is a stronghold: castles and crown cities are where new troops are raised.
      </>
    ),
    at: cap,
    done: (c) => c.selected === cap(c),
  },
  {
    title: "Raise troops",
    text: () => (
      <>
        Gold comes in every turn, and you have some to spend. Press <b>Raise</b> next to Footmen in your panel. <b>×3</b> raises several at once.
      </>
    ),
    at: cap,
    pulse: "raise",
    done: (c) => c.view.game.mustered.some((n) => n > 0),
  },
  {
    title: "Fresh troops rest",
    text: () => (
      <>
        New troops stand guard this turn and can march from the next one. Your veterans are ready <i>now</i>, so let&apos;s use them.
      </>
    ),
    button: "Got it",
  },
  {
    title: "To war!",
    text: (c) =>
      c.selected === cap(c) ? (
        <>
          All your ready troops are picked to march. Now click <b>{PROVINCES[TARGET]!.name}</b>, ringed in gold. The badge shows your chance to win. Green is good.
        </>
      ) : (
        <>
          Click <b>{PROVINCES[cap(c)]!.name}</b> again to pick its troops.
        </>
      ),
    at: (c) => (c.selected === cap(c) ? TARGET : cap(c)),
    pulse: "march",
    done: (c) => c.view.myMarches > c.marchesAtStart && !c.view.busy,
  },
  {
    title: "",
    text: (c) => {
      const won = c.view.game.provinces[TARGET]!.owner === c.view.localId;
      const d = me(c).decree;
      return won ? (
        <>
          <b>{PROVINCES[TARGET]!.name} is yours!</b> Every ● under a name is gold each turn. {d?.done ? <>The crown&apos;s <b>royal decree</b> (📜 in your panel) just paid you <b>+{d.reward} gold</b>. A new one comes every season.</> : <>Watch the <b>royal decree</b> 📜 in your panel: complete it for quick gold.</>}
        </>
      ) : (
        <>
          The dice went against you this time. That happens. Bigger armies, knights and good odds win wars. Watch the <b>royal decree</b> 📜 in your panel: complete it for quick gold.
        </>
      );
    },
    button: "Next",
  },
  {
    title: "Friends and foes",
    text: () => (
      <>
        Under <b>Diplomacy</b> you can send envoys. Allies cannot attack each other, they help each other defend, and they win together with {CROWNS_ALLIANCE} crowns. You can betray an ally, but it costs you.
      </>
    ),
    button: "Next",
  },
  {
    title: "End your turn",
    text: () => (
      <>
        You can keep raising and marching. When you are done, press <b>End turn</b>.
      </>
    ),
    pulse: "end",
    done: (c) => current(c.view.game).id !== c.view.localId,
  },
  {
    title: "Your rivals move",
    text: () => <>The other houses take their turns now. Watch the map and the chronicle in the corner. Every battle is fought with dice.</>,
    done: myTurn,
  },
  {
    title: "The war is yours",
    text: () => (
      <>
        Now take the crowns ♛. <b>Knights</b> hit hardest and ride two provinces. <b>Autumn</b> pays more gold, and in <b>winter</b> attacks are harder. Click <b>Rules</b> at the top any time. Good hunting!
      </>
    ),
    button: "To war!",
  },
];

/** A squire at your side who walks you through the first turn. */
export function Coach({ view, selected, onFocus }: { view: View; selected: number | null; onFocus(f: { at: number | null; pulse: Step["pulse"] | null }): void }) {
  const [step, setStep] = useState(0);
  const [gone, setGone] = useState(false);
  const [marchesAtStart, setMarchesAtStart] = useState(0);
  const ctx: Ctx = { view, selected, marchesAtStart };
  const st = STEPS[step];
  const busyShow = !!view.battle || !!view.announce;

  const advance = () => {
    audio.sfx("click");
    if (step + 1 >= STEPS.length) {
      markTutored();
      setGone(true);
      return;
    }
    setMarchesAtStart(view.myMarches);
    setStep(step + 1);
  };

  const finished = !gone && st?.done?.(ctx);
  useEffect(() => {
    if (!finished) return;
    audio.sfx("turn");
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const at = !gone && st?.at ? st.at(ctx) : null;
  const pulse = !gone ? (st?.pulse ?? null) : null;
  useEffect(() => {
    onFocus({ at: busyShow ? null : at, pulse });
  }, [at, pulse, busyShow, onFocus]);

  if (gone || !st || busyShow) return null;
  return (
    <div className={s.coach} role="dialog" aria-label="Tutorial">
      <div className={s.coachFace} aria-hidden>
        ⚜
      </div>
      <div>
        <div className={s.coachStep}>
          Squire Aldo · {step + 1} of {STEPS.length}
        </div>
        {st.title && <div className={s.coachTitle}>{st.title}</div>}
        <p className={s.coachText}>{st.text(ctx)}</p>
        <div className={s.coachRow}>
          <button
            type="button"
            className={s.coachSkip}
            onClick={() => {
              markTutored();
              setGone(true);
            }}
          >
            Skip tutorial
          </button>
          {st.button && (
            <button type="button" className={`${s.btn} ${s.btnDark}`} onClick={advance}>
              {st.button}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

