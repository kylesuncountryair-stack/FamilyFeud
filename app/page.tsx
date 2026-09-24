"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMAIL_DOMAIN, firstNameFromEmail, isValidEmail, normalizeEmail } from "@/lib/identity";

type Question = { day: string; questionId: string; prompt: string; label?: string };
type Schedule = {
  status: "daily" | "before" | "live" | "catchup" | "over";
  today: string;
  event: { start: string; end: string; catchUp: string } | null;
  open: Question[];
};
const gameKey = (q: Question) => `${q.day}|${q.questionId}`;
type MyAnswer = { raw: string; category: string; count: number; points: number; onBoard: boolean };
type Results = {
  top: { category: string; count: number; points: number }[];
  players: number;
  mine: { name: string; answers: MyAnswer[] } | null;
};
type Stage = "loading" | "name" | "pick" | "closed" | "play" | "reveal" | "results" | "history" | "past" | "leaderboard";
type Leader = { rank: number; name: string; total: number; days: number; isMe: boolean };
type Leaderboard = {
  event?: boolean;
  week: { start: string; end: string };
  daysInWeek: number;
  leaders: Leader[];
  me: Leader | null;
};
const SIDE_STAGES: Stage[] = ["history", "past", "leaderboard"];
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
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [played, setPlayed] = useState<Record<string, Results>>({});
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
  const [weekTotal, setWeekTotal] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [lbWeek, setLbWeek] = useState(0);
  const [lbError, setLbError] = useState("");

  const refreshWeekTotal = useCallback(async (who: string) => {
    if (!who) return;
    try {
      const res = await fetch(`/api/leaderboard?week=0&email=${encodeURIComponent(who)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: Leaderboard = await res.json();
      setWeekTotal(data.me?.total ?? 0);
    } catch {}
  }, []);

  function rememberReturn() {
    if (!SIDE_STAGES.includes(stage)) setReturnTo(stage === "reveal" ? "play" : stage);
  }

  async function openLeaderboard(week = lbWeek) {
    rememberReturn();
    setStage("leaderboard");
    setLbWeek(week);
    setLbError("");
    setLeaderboard(null);
    try {
      const qs = new URLSearchParams({ week: String(week) });
      if (player) qs.set("email", player);
      const res = await fetch(`/api/leaderboard?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data: Leaderboard = await res.json();
      setLeaderboard(data);
      if (week === 0 && player) setWeekTotal(data.me?.total ?? 0);
    } catch {
      setLbError("The leaderboard didn't load. Try again in a moment.");
    }
  }

  async function openHistory() {
    rememberReturn();
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

  const fetchResults = useCallback(async (who: string, q: Question, show = true): Promise<Results> => {
    const qs = new URLSearchParams({ day: q.day, questionId: q.questionId });
    if (who) qs.set("email", who);
    const res = await fetch(`/api/results?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error("results");
    const data: Results = await res.json();
    if (show) setResults(data);
    setPlayed((prev) => ({ ...prev, [gameKey(q)]: data }));
    return data;
  }, []);

  /** Open one of today's questions: its results if already played, otherwise the answer board. */
  function openGame(q: Question) {
    setQuestion(q);
    setError("");
    setAnswers(["", "", ""]);
    const r = played[gameKey(q)];
    if (r?.mine) {
      setResults(r);
      setStage("results");
    } else {
      setStage("play");
    }
  }

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
      .then((s: Schedule) => {
        setSchedule(s);
        const who = isValidEmail(saved) ? normalizeEmail(saved) : "";
        if (!s.open.length) {
          // Before the event starts, or after it ends
          if (who) {
            setPlayer(who);
            refreshWeekTotal(who);
          }
          setStage("closed");
          return;
        }
        setQuestion(s.open[0]);
        if (who) signIn(who, s);
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
    const id = setInterval(() => {
      if (question) fetchResults(player, question).catch(() => {});
      refreshWeekTotal(player);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [stage, player, question, fetchResults, refreshWeekTotal]);

  function start() {
    const who = normalizeEmail(email);
    if (!isValidEmail(who)) return setError(`Enter your @${EMAIL_DOMAIN} email address.`);
    setError("");
    signIn(who);
  }

  async function signIn(who: string, s: Schedule | null = schedule) {
    setBusy(true);
    refreshWeekTotal(who);
    setPlayer(who);
    try {
      localStorage.setItem(EMAIL_KEY, who);
    } catch {}
    const open = s?.open ?? [];
    try {
      if (open.length > 1) {
        // Catch-up day: show the weekend questions with what they've already played
        await Promise.all(open.map((q) => fetchResults(who, q, false).catch(() => null)));
        setStage("pick");
      } else if (open[0]) {
        setQuestion(open[0]);
        const r = await fetchResults(who, open[0]);
        setStage(r.mine ? "results" : "play");
      }
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
    if (!canLock || !question) return;
    setError("");
    setBusy(true);
    setStage("reveal");
    const minWait = new Promise((r) => setTimeout(r, 1400)); // let "Survey says…" breathe
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: player, answers: trimmed, day: question?.day, questionId: question?.questionId }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(data.error || "Your answers didn't save.");
      await minWait;
      setResults(data);
      if (question) setPlayed((prev) => ({ ...prev, [gameKey(question)]: data }));
      setStage("results");
      refreshWeekTotal(player);
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
          {stage !== "loading" && stage !== "leaderboard" && (schedule?.status !== "before" || player) && (
            <button className="nav-btn" onClick={() => openLeaderboard(0)}>
              Leaderboard
            </button>
          )}
          {stage !== "loading" && stage !== "history" && stage !== "past" && schedule?.status !== "before" && (
            <button className="nav-btn" onClick={openHistory}>
              Past boards
            </button>
          )}
          {player && stage !== "name" && (
          <span className="player">
            Playing as <strong>{firstNameFromEmail(player)}</strong>
            {weekTotal !== null && (
              <button
                className="week-pill"
                onClick={() => openLeaderboard(0)}
                title="Your points this week. Click to see the leaderboard."
              >
                {weekTotal} pts this week
              </button>
            )}{" "}
            <button
              className="link"
              onClick={() => {
                try {
                  localStorage.removeItem(EMAIL_KEY);
                } catch {}
                setEmail("");
                setPlayer("");
                setWeekTotal(null);
                setResults(null);
                setAnswers(["", "", ""]);
                setPlayed({});
                setStage(schedule && !schedule.open.length ? "closed" : "name");
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
          <h2 className="intro">
            {schedule?.status === "catchup"
              ? "Catch-up day: answer the weekend questions you missed."
              : <>A new survey question every&nbsp;day. Give your top three answers.</>}
          </h2>
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
          {schedule && schedule.open.length > 1 && (
            <div className="back-row">
              <button className="back" onClick={() => setStage("pick")}>
                ← Weekend questions
              </button>
              <p className="board-date">{question.label}</p>
            </div>
          )}
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
        <>
          {schedule && schedule.open.length > 1 && <p className="board-date">{question.label}</p>}
          <ResultsView question={question} results={results} onRefresh={() => fetchResults(player, question)} />
          {schedule && schedule.open.length > 1 && (
            <div className="next-row">
              {(() => {
                const next = schedule.open.find((q) => q.day !== question.day && !played[gameKey(q)]?.mine);
                return next ? (
                  <button className="btn" onClick={() => openGame(next)}>
                    Play {next.label} →
                  </button>
                ) : (
                  <p className="hint">You&rsquo;re all caught up. Nice work!</p>
                );
              })()}
              <button className="back" onClick={() => setStage("pick")}>
                ← Weekend questions
              </button>
            </div>
          )}
        </>
      )}

      {stage === "pick" && schedule && (
        <section className="history">
          <h2 className="section-title">Catch-up day</h2>
          <p className="sub left">
            Don&rsquo;t work weekends? Answer Saturday&rsquo;s and Sunday&rsquo;s questions today. Your points count
            toward the week, just like everyone else&rsquo;s.
          </p>
          <ul className="history-list">
            {schedule.open.map((q) => {
              const r = played[gameKey(q)];
              return (
                <li key={gameKey(q)}>
                  <button className="history-item" onClick={() => openGame(q)}>
                    <span className="h-date">{q.label}</span>
                    <span className="h-prompt">{q.prompt}</span>
                    <span className="h-meta">
                      {r?.mine ? (
                        <>
                          Done · <strong>{scoreOf(r)} pts</strong> · see results
                        </>
                      ) : (
                        "Not played yet"
                      )}
                    </span>
                    <span className="h-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {stage === "closed" && schedule && (
        <section className="closed">
          {schedule.status === "before" && schedule.event ? (
            <>
              <h2 className="intro">The game starts {formatDay(schedule.event.start)}.</h2>
              <p className="sub">
                A new survey question every day for a week. Give your top three answers, then see how the team
                answered. Come back then!
              </p>
            </>
          ) : (
            <>
              <h2 className="intro">That&rsquo;s a wrap!</h2>
              <p className="sub">Thanks for playing. See how everyone finished, or look back at every day&rsquo;s board.</p>
              <div className="closed-actions">
                <button className="btn" onClick={() => openLeaderboard(0)}>
                  See final standings
                </button>
                <button className="back" onClick={openHistory}>
                  Past boards →
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {stage === "leaderboard" && (
        <section className="history">
          <button className="back" onClick={() => setStage(returnTo)}>
            ← Back
          </button>
          <div className="lb-head">
            <h2 className="section-title">Leaderboard</h2>
            {!leaderboard?.event && (
            <div className="tabs" role="tablist" aria-label="Week">
              {["This week", "Last week"].map((label, w) => (
                <button
                  key={label}
                  role="tab"
                  aria-selected={lbWeek === w}
                  className={`tab ${lbWeek === w ? "active" : ""}`}
                  onClick={() => openLeaderboard(w)}
                >
                  {label}
                </button>
              ))}
            </div>
            )}
          </div>
          {leaderboard && (
            <p className="sub left">
              {leaderboard.event && schedule?.status === "over" ? "Final standings · " : ""}
              {formatShort(leaderboard.week.start)} – {formatShort(leaderboard.week.end)}. Points for each day come from
              that day&rsquo;s latest board, so everyone who gave the same answers gets the same points, whenever they
              played.
              {schedule?.status === "catchup"
                ? " Weekend points can still shift today while people catch up."
                : schedule?.status === "over"
                  ? ""
                  : lbWeek === 0
                    ? " Today\u2019s points can still shift until midnight."
                    : ""}
            </p>
          )}
          {lbError && <p className="error">{lbError}</p>}
          {!leaderboard && !lbError && <p className="hint left">Loading…</p>}
          {leaderboard && leaderboard.leaders.length === 0 && (
            <p className="empty">
              {lbWeek === 0 ? "No one has played yet this week. Be the first!" : "No one played last week."}
            </p>
          )}
          {leaderboard && leaderboard.leaders.length > 0 && (
            <div className="lb-table" role="table" aria-label="Leaderboard">
              <div className="lb-row lb-header" role="row">
                <span role="columnheader">#</span>
                <span role="columnheader">Player</span>
                <span role="columnheader" className="num">Days</span>
                <span role="columnheader" className="num">Points</span>
              </div>
              {leaderboard.leaders.map((l) => (
                <LeaderRow key={`${l.rank}-${l.name}`} l={l} />
              ))}
              {leaderboard.me && !leaderboard.leaders.some((l) => l.isMe) && (
                <>
                  <div className="lb-gap" aria-hidden>
                    ⋯
                  </div>
                  <LeaderRow l={leaderboard.me} />
                </>
              )}
            </div>
          )}
          {leaderboard && player && !leaderboard.me && leaderboard.leaders.length > 0 && (
            <p className="hint left">You haven&rsquo;t played {lbWeek === 0 ? "yet this week" : "last week"}.</p>
          )}
        </section>
      )}

      {stage === "history" && (
        <section className="history">
          <button className="back" onClick={() => setStage(returnTo)}>
            ← Back
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
              Back to the game →
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

function formatShort(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function LeaderRow({ l }: { l: Leader }) {
  return (
    <div className={`lb-row ${l.isMe ? "me" : ""} ${l.rank <= 3 ? `top top-${l.rank}` : ""}`} role="row">
      <span className="lb-rank" role="cell">
        {l.rank}
      </span>
      <span className="lb-name" role="cell">
        {l.name}
        {l.isMe && <span className="you-tag">You</span>}
      </span>
      <span className="num lb-days" role="cell">
        {l.days}
      </span>
      <span className="num lb-total" role="cell">
        {l.total}
      </span>
    </div>
  );
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
        {results.players} {results.players === 1 ? "player has" : "players have"} answered{" "}
        {question.label && question.label !== "Today’s question" ? "this question" : "today"}. Points are the percentage of
        players who gave each answer, so they&rsquo;re fair no matter when you play.{" "}
        <button className="link" onClick={onRefresh}>
          Refresh now
        </button>
      </p>
      <YourAnswers results={results} />
    </>
  );
}
