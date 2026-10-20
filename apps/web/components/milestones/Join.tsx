"use client";

import { useEffect, useRef, useState } from "react";
import { GuestNet, answerInvite, type Msg } from "@/lib/milestones/net";
import l from "./lobby.module.css";
import r from "./room.module.css";

type StartMsg = Extract<Msg, { t: "start" }>;

export default function Join({ invite, onStart, onBack }: { invite: string; onStart(net: GuestNet, start: StartMsg): void; onBack(): void }) {
  const [name, setName] = useState("Guest");
  const [step, setStep] = useState<"name" | "working" | "reply" | "failed">("name");
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const netRef = useRef<GuestNet | null>(null);
  const started = useRef(false);

  useEffect(
    () => () => {
      if (!started.current) netRef.current?.close();
    },
    [],
  );

  async function join() {
    setStep("working");
    try {
      const { code, link } = await answerInvite(invite);
      const net = new GuestNet(link);
      netRef.current = net;
      link.onOpen = () => link.send({ t: "hello", name: name.trim().slice(0, 14) || "Guest" });
      net.onLeave(() => {
        if (started.current) return;
        setError("The connection closed before the game started.");
        setStep("failed");
      });
      const off = net.subscribe((m) => {
        if (m.t === "start" && !started.current) {
          started.current = true;
          off();
          onStart(net, m);
        }
      });
      setReply(code);
      setStep("reply");
    } catch {
      setError("That invite link didn't work. Ask the host for a new one.");
      setStep("failed");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
    } catch {
      /* the text box is selectable instead */
    }
  }

  return (
    <div className={l.lobby}>
      <div className={l.inner}>
        <header className={l.head}>
          <button type="button" className={l.back} onClick={onBack}>
            ← Back
          </button>
          <div className={l.titles}>
            <h1 className={l.title}>Join a game</h1>
          </div>
        </header>

        <section className={r.panel}>
          {step === "name" && (
            <>
              <label className={r.field}>
                <span className={l.label}>YOUR NAME</span>
                <input className={r.input} value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
              </label>
              <button type="button" className={r.btn} onClick={join}>
                Join
              </button>
            </>
          )}
          {step === "working" && <p className={r.note}>Connecting…</p>}
          {step === "reply" && (
            <>
              <ol className={r.steps}>
                <li>Copy your reply code.</li>
                <li>Send it to the host.</li>
                <li>Keep this tab open. The game starts when the host is ready.</li>
              </ol>
              <textarea className={r.code} readOnly value={reply} rows={4} onFocus={(e) => e.currentTarget.select()} aria-label="Your reply code" />
              <button type="button" className={r.btn} onClick={copy}>
                {copied ? "Copied" : "Copy reply code"}
              </button>
            </>
          )}
          {step === "failed" && (
            <>
              <p className={r.note}>{error}</p>
              <button type="button" className={r.btn} onClick={onBack}>
                Back
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
