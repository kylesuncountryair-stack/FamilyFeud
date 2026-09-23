"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMAIL_DOMAIN, firstNameFromEmail, isValidEmail, normalizeEmail } from "@/lib/identity";

type Question = { day: string; questionId: string; prompt: string };
type MyAnswer = { raw: string; category: string; count: number; onBoard: boolean };
type Results = {
  top: { category: string; count: number }[];
  players: number;
  mine: { name: string; answers: MyAnswer[] } | null;
};
type Stage = "loading" | "name" | "play" | "reveal" | "results";

const EMAIL_KEY = "survey-says:email";
const BOARD_SLOTS = 8;
const POLL_MS = 15_000;

export default function Home() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [player, setPlayer] = useState(""); // signed-in email
  const [answers, setAnswers] = useState(["", "", ""]);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  const fetchResults = useCallback(async (who: string): Promise<Results> => {
    const res = await fetch(`/api/results?email=${encodeURIComponent(who)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("results");
    const data: Results = await res.json();
    setResults(data);
    return data;
  }, []);

  // Load today's question + remembered name
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {}
    fetch("/api/question", { cache: "no-store" })
      .then((r) => r.json())
      .then((q: Question) => {
        setQuestion(q);
        setStage("name");
      })
      .catch(() => {
        setError("Today's question didn't load. Refresh the page to try again.");
        setStage("name");
      });
  }, []);

  useEffect(() => {
    if (stage === "play") firstInput.current?.focus();
  }, [stage]);

  // Keep the board fresh while people are still playing
  useEffect(() => {
    if (stage !== "results") return;
    const id = setInterval(() => fetchResults(player).catch(() => {}), POLL_MS);
    return () => clearInterval(id);
  }, [stage, player, fetchResults]);

  async function start() {
    const who = normalizeEmail(email);
    if (!isValidEmail(who)) return setError(`Enter your @${EMAIL_DOMAIN} email address.`);
    setError("");
    setBusy(true);
    setPlayer(who);
    try {
      localStorage.setItem(EMAIL_KEY, who);
    } catch {}
    try {
      const r = await fetchResults(who);
      setStage(r.mine ? "results" : "play");
    } catch {
      setStage("play");
    } finally {
      setBusy(false);
    }
  }

  const trimmed = answers.map((a) => a.trim());
  const allFilled = trimmed.every(Boolean);
  const hasDupes = new Set(trimmed.map((a) => a.toLowerCase())).size !== 3;
  const canLock = allFilled && !hasDupes && !busy;

  async function lockIn() {
    if (!canLock) return;
    setError("");
    setBusy(true);
    setStage("reveal");
    const minWait = new Promise((r) => setTimeout(r, 1400)); // let "Survey says…" breathe
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: player, answers: trimmed }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(data.error || "Your answers didn't save.");
      await minWait;
      setResults(data);
      setStage("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your answers didn't save. Try locking in again.");
      setStage("play");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stage">
      <header className="masthead">
        <h1 className="wordmark">Survey Says</h1>
        {player && stage !== "name" && (
          <span className="player">
            Playing as <strong>{firstNameFromEmail(player)}</strong>{" "}
            <button
              className="link"
              onClick={() => {
                setPlayer("");
                setResults(null);
                setAnswers(["", "", ""]);
                setStage("name");
              }}
            >
              Not you?
            </button>
          </span>
        )}
      </header>

      {stage === "loading" && <p className="sub">Loading today&rsquo;s question…</p>}

      {stage === "name" && (
        <>
          <h2 className="intro">One survey question a day. Give your top three answers.</h2>
          <p className="sub">Then see how the rest of the team answered.</p>
          <form
            className="name-card"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <label htmlFor="email">Your Sun Country email</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              placeholder={`firstname.lastname@${EMAIL_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={80}
              autoComplete="email"
              autoFocus
            />
            <button className="btn" type="submit" disabled={busy || !question}>
              Start
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        </>
      )}

      {(stage === "play" || stage === "reveal") && question && (
        <>
          <section className="board" aria-label="Game board">
            <h2 className="prompt">{question.prompt}</h2>
            <div className="tiles">
              {answers.map((val, i) => (
                <div key={i} className={`tile ${stage === "reveal" ? "locked" : ""}`}>
                  <span className="badge" aria-hidden>
                    {i + 1}
                  </span>
                  <input
                    ref={i === 0 ? firstInput : undefined}
                    aria-label={`Answer ${i + 1}`}
                    placeholder="Your answer"
                    value={val}
                    maxLength={60}
                    readOnly={stage === "reveal"}
                    onChange={(e) =>
                      setAnswers((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") lockIn();
                    }}
                  />
                </div>
              ))}
            </div>
          </section>

          {stage === "play" ? (
            <>
              <button className="btn" onClick={lockIn} disabled={!canLock}>
                Lock in answers
              </button>
              {error ? (
                <p className="error">{error}</p>
              ) : allFilled && hasDupes ? (
                <p className="hint">Each answer needs to be different.</p>
              ) : (
                <p className="hint">Answers are final once locked in.</p>
              )}
            </>
          ) : (
            <p className="survey-says" role="status">
              Survey says…
            </p>
          )}
        </>
      )}

      {stage === "results" && results && question && (
        <ResultsView question={question} results={results} onRefresh={() => fetchResults(player)} />
      )}
    </main>
  );
}

function ResultsView({
  question,
  results,
  onRefresh,
}: {
  question: Question;
  results: Results;
  onRefresh: () => void;
}) {
  const myGroups = new Set(results.mine?.answers.map((a) => a.category));
  const slots = Array.from({ length: BOARD_SLOTS }, (_, i) => results.top[i] ?? null);
  const score = results.mine
    ? [...new Map(results.mine.answers.filter((a) => a.onBoard).map((a) => [a.category, a.count])).values()].reduce(
        (s, n) => s + n,
        0
      )
    : 0;

  return (
    <>
      <section className="board" aria-label="Today's top answers">
        <h2 className="prompt">{question.prompt}</h2>
        <div className="tiles two-col flip">
          {slots.map((slot, i) =>
            slot ? (
              <div
                key={i}
                className={`tile ${myGroups.has(slot.category) ? "yours" : ""}`}
                style={{ animationDelay: `${i * 180}ms` }}
              >
                <span className="badge" aria-hidden>
                  {i + 1}
                </span>
                <span className="answer">{slot.category}</span>
                <span className="count" aria-label={`${slot.count} players`}>
                  {slot.count}
                </span>
              </div>
            ) : (
              <div key={i} className="tile empty" aria-hidden />
            )
          )}
        </div>
      </section>

      <p className="meta">
        {results.players} {results.players === 1 ? "player has" : "players have"} answered today. The board updates
        as more people play.{" "}
        <button className="link" onClick={onRefresh}>
          Refresh now
        </button>
      </p>

      {results.mine && (
        <section className="yours-panel">
          <h2>Your answers, {results.mine.name}</h2>
          {results.mine.answers.map((a, i) => {
            const dupe = results.mine!.answers.findIndex((b) => b.category === a.category) !== i;
            return (
              <div className="your-row" key={i}>
                <span className="your-raw">{a.raw}</span>
                <span className={`pts ${a.onBoard ? "" : "miss"}`}>
                  {dupe ? "—" : a.onBoard ? `+${a.count}` : "✕"}
                </span>
                <span className="your-group">
                  {dupe
                    ? `Same group as another answer (${a.category}), counted once`
                    : a.onBoard
                      ? `Counted as “${a.category}”`
                      : `Counted as “${a.category}”, not on the board yet`}
                </span>
              </div>
            );
          })}
          <div className="score-line">
            <span>Your score</span>
            <span>{score}</span>
          </div>
        </section>
      )}
    </>
  );
}
