"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMAIL_DOMAIN, firstNameFromEmail, isValidEmail, normalizeEmail } from "@/lib/identity";

type Question = { day: string; questionId: string; prompt: string };
type MyAnswer = { raw: string; category: string; count: number; points: number; onBoard: boolean };
type Results = {
  top: { category: string; count: number; points: number }[];
  players: number;
  mine: { name: string; answers: MyAnswer[] } | null;
};
type Stage = "loading" | "name" | "play" | "reveal" | "results" | "history" | "past";
type PastDay = {
  day: string;
  questionId: string;
  prompt: string;
  players: number;
  top: { category: string; points: number } | null;
};
type PastBoard = Results & { day: string; questionId: string; prompt: string };

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
  const [returnTo, setReturnTo] = useState<Stage>("name");
  const [pastDays, setPastDays] = useState<PastDay[] | null>(null);
  const [pastBoard, setPastBoard] = useState<PastBoard | null>(null);
  const [historyError, setHistoryError] = useState("");

  async function openHistory() {
    if (stage !== "history" && stage !== "past") setReturnTo(stage === "reveal" ? "play" : stage);
    setStage("history");
    setHistoryError("");
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setPastDays((await res.json()).days);
    } catch {
      setHistoryError("Past boards didn't load. Try again in a moment.");
    }
  }

  async function openPastBoard(d: PastDay) {
    setPastBoard(null);
    setStage("past");
    setHistoryError("");
    try {
      const qs = new URLSearchParams({ day: d.day, questionId: d.questionId });
      if (player) qs.set("email", player);
      const res = await fetch(`/api/history/board?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setPastBoard(await res.json());
    } catch {
      setHistoryError("That board didn't load. Try again in a moment.");
    }
  }

  const fetchResults = useCallback(async (who: string): Promise<Results> => {
    const res = await fetch(`/api/results?email=${encodeURIComponent(who)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("results");
    const data: Results = await res.json();
    setResults(data);
    return data;
  }, []);

  // Load today's question. Returning players on this device skip the email screen.
  useEffect(() => {
    let saved = "";
    try {
      saved = localStorage.getItem(EMAIL_KEY) ?? "";
    } catch {}
    if (saved) setEmail(saved);

    fetch("/api/question", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("question");
        return r.json();
      })
      .then((q: Question) => {
        setQuestion(q);
        if (isValidEmail(saved)) signIn(normalizeEmail(saved));
        else setStage("name");
      })
      .catch(() => {
        setError("Today's question didn't load. Refresh the page to try again.");
        setStage("name");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function start() {
    const who = normalizeEmail(email);
    if (!isValidEmail(who)) return setError(`Enter your @${EMAIL_DOMAIN} email address.`);
    setError("");
    signIn(who);
  }

  async function signIn(who: string) {
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
        <h1 className="brand">
          <img className="logo" src="/logo.png" alt="Survey Says" />
        </h1>
        <nav className="nav">
          {stage !== "loading" && stage !== "history" && stage !== "past" && (
            <button className="nav-btn" onClick={openHistory}>
              Past boards
            </button>
          )}
          {player && stage !== "name" && (
          <span className="player">
            Playing as <strong>{firstNameFromEmail(player)}</strong>{" "}
            <button
              className="link"
              onClick={() => {
                try {
                  localStorage.removeItem(EMAIL_KEY);
                } catch {}
                setEmail("");
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
        </nav>
      </header>

      {stage === "loading" && <p className="sub">Loading today&rsquo;s question…</p>}

      {stage === "name" && (
        <>
          <h2 className="intro">A new survey question every&nbsp;day. Give your top three answers.</h2>
          <p className="sub">Then see how the rest of the team answered. We&rsquo;ll remember you on this device, so next time you&rsquo;ll go straight to the question.</p>
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

      {stage === "history" && (
        <section className="history">
          <button className="back" onClick={() => setStage(returnTo)}>
            ← Back to today&rsquo;s question
          </button>
          <h2 className="section-title">Past boards</h2>
          <p className="sub left">See how each question ended up once the day was over.</p>
          {historyError && <p className="error">{historyError}</p>}
          {!pastDays && !historyError && <p className="hint left">Loading…</p>}
          {pastDays?.length === 0 && (
            <p className="empty">No finished boards yet. Check back tomorrow to see how today&rsquo;s question ends up.</p>
          )}
          {pastDays && pastDays.length > 0 && (
            <ul className="history-list">
              {pastDays.map((d) => (
                <li key={`${d.day}|${d.questionId}`}>
                  <button className="history-item" onClick={() => openPastBoard(d)}>
                    <span className="h-date">{formatDay(d.day)}</span>
                    <span className="h-prompt">{d.prompt}</span>
                    <span className="h-meta">
                      {d.top ? (
                        <>
                          Top answer: <strong>{d.top.category}</strong> ({d.top.points})
                          {" · "}
                        </>
                      ) : null}
                      {d.players} {d.players === 1 ? "player" : "players"}
                    </span>
                    <span className="h-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {stage === "past" && (
        <>
          <div className="back-row">
            <button className="back" onClick={() => setStage("history")}>
              ← All past boards
            </button>
            <button className="back" onClick={() => setStage(returnTo)}>
              Today&rsquo;s question →
            </button>
          </div>
          {historyError && <p className="error">{historyError}</p>}
          {!pastBoard && !historyError && <p className="hint">Loading…</p>}
          {pastBoard && (
            <>
              <p className="board-date">Final board · {formatDay(pastBoard.day)}</p>
              <Board prompt={pastBoard.prompt} results={pastBoard} />
              <p className="meta">
                {pastBoard.players} {pastBoard.players === 1 ? "player" : "players"} answered. Points are the percentage
                of players who gave each answer.
              </p>
              {pastBoard.mine ? (
                <YourAnswers results={pastBoard} final />
              ) : player ? (
                <p className="empty">You didn&rsquo;t play this day.</p>
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}

function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function scoreOf(results: Results) {
  if (!results.mine) return 0;
  const onBoard = results.mine.answers.filter((a) => a.onBoard).map((a) => [a.category, a.points] as const);
  return [...new Map(onBoard).values()].reduce((s, n) => s + n, 0);
}

function Board({ prompt, results }: { prompt: string; results: Results }) {
  const myGroups = new Set(results.mine?.answers.map((a) => a.category));
  const slots = Array.from({ length: BOARD_SLOTS }, (_, i) => results.top[i] ?? null);
  return (
    <section className="board" aria-label="Top answers">
      <h2 className="prompt">{prompt}</h2>
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
              <span
                className="count"
                aria-label={`${slot.points} points: ${slot.count} of ${results.players} players`}
                title={`${slot.count} of ${results.players} players`}
              >
                {slot.points}
              </span>
            </div>
          ) : (
            <div key={i} className="tile empty" aria-hidden />
          )
        )}
      </div>
    </section>
  );
}

function YourAnswers({ results, final = false }: { results: Results; final?: boolean }) {
  const mine = results.mine;
  if (!mine) return null;
  return (
    <section className="yours-panel">
      <h2>Your answers, {mine.name}</h2>
      {mine.answers.map((a, i) => {
        const dupe = mine.answers.findIndex((b) => b.category === a.category) !== i;
        return (
          <div className="your-row" key={i}>
            <span className="your-raw">{a.raw}</span>
            <span className={`pts ${a.onBoard ? "" : "miss"}`}>{dupe ? "—" : a.onBoard ? `+${a.points}` : "✕"}</span>
            <span className="your-group">
              {dupe
                ? `Same group as another answer (${a.category}), counted once`
                : a.onBoard
                  ? `Counted as “${a.category}” · ${a.count} of ${results.players} ${results.players === 1 ? "player" : "players"}`
                  : `Counted as “${a.category}”, ${final ? "didn’t make the board" : "not on the board yet"}`}
            </span>
          </div>
        );
      })}
      <div className="score-line">
        <span>{final ? "Final score" : "Your score"}</span>
        <span>{scoreOf(results)}</span>
      </div>
    </section>
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
  return (
    <>
      <Board prompt={question.prompt} results={results} />
      <p className="meta">
        {results.players} {results.players === 1 ? "player has" : "players have"} answered today. Points are the percentage of
        players who gave each answer, so they&rsquo;re fair no matter when you play.{" "}
        <button className="link" onClick={onRefresh}>
          Refresh now
        </button>
      </p>
      <YourAnswers results={results} />
    </>
  );
}
