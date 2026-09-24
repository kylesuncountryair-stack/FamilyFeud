import { QUESTIONS, type Question } from "./questions";
import { parseJSON, type Store } from "./store";

export const BOARD_SIZE = 8;

export type Submission = {
  email: string;
  name: string; // first name, for display
  answers: { raw: string; category: string }[];
  at: number;
};

const TZ_ALIASES: Record<string, string> = {
  central: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago", ct: "America/Chicago",
  eastern: "America/New_York", est: "America/New_York", edt: "America/New_York", et: "America/New_York",
  mountain: "America/Denver", mst: "America/Denver", mdt: "America/Denver", mt: "America/Denver",
  arizona: "America/Phoenix",
  pacific: "America/Los_Angeles", pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pt: "America/Los_Angeles",
};

/** Accepts "America/Chicago", or friendly names like "Central". Never throws. */
export function resolveTimeZone(value?: string) {
  const raw = (value ?? "").trim();
  const candidate = TZ_ALIASES[raw.toLowerCase().replace(/\s*(standard|daylight)?\s*time$/, "")] ?? raw;
  try {
    if (candidate) {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate });
      return candidate;
    }
  } catch {
    console.error(`[survey-says] GAME_TIMEZONE "${raw}" isn't a valid zone; using America/Chicago.`);
  }
  return "America/Chicago";
}

export function getToday(): { day: string; question: Question } {
  const tz = resolveTimeZone(process.env.GAME_TIMEZONE);
  // en-CA formats as YYYY-MM-DD
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return { day, question: questionForDay(day) };
}

/** Which question a given YYYY-MM-DD day uses (honours QUESTION_ID if pinned). */
export function questionForDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  // Set QUESTION_ID to pin a specific question (handy for testing or a special day)
  const pinned = QUESTIONS.find((q) => q.id === process.env.QUESTION_ID);
  return pinned ?? QUESTIONS[dayNumber % QUESTIONS.length];
}

export function gameKeys(day: string, questionId: string) {
  const base = `feud:${day}:${questionId}`;
  return {
    counts: `${base}:counts`, // group -> number of players who said it
    subs: `${base}:subs`, // lowercased name -> Submission JSON
    map: `${base}:map`, // normalized answer -> group (grouping cache)
  };
}
export type GameKeys = ReturnType<typeof gameKeys>;

export function playerKey(email: string) {
  return email.trim().toLowerCase();
}

export async function buildResults(store: Store, keys: GameKeys, forEmail?: string) {
  const [rawCounts, players, rawMine] = await Promise.all([
    store.hgetall(keys.counts),
    store.hlen(keys.subs),
    forEmail ? store.hget(keys.subs, playerKey(forEmail)) : Promise.resolve(null),
  ]);

  const board = rankBoard(rawCounts, players);
  const counts = board.list;
  const countOf = new Map(counts.map((c) => [c.category, c.count]));
  const pointsOf = new Map(counts.map((c) => [c.category, c.points]));
  const rank = new Map(counts.map((c, i) => [c.category, i]));
  const sub = parseJSON<Submission>(rawMine);

  const mine = sub
    ? {
        name: sub.name,
        answers: sub.answers.map((a) => ({
          ...a,
          count: countOf.get(a.category) ?? 0,
          points: pointsOf.get(a.category) ?? 0,
          onBoard: (rank.get(a.category) ?? Infinity) < BOARD_SIZE,
        })),
      }
    : null;

  return { top: counts.slice(0, BOARD_SIZE), players, mine };
}

/**
 * The one scoring rule, used by today's results, past boards and the leaderboard.
 * Points = % of that day's players who gave the answer ("we surveyed 100 people"),
 * so scores don't grow just because more people played.
 */
export function rankBoard(rawCounts: Record<string, unknown>, players: number) {
  const pct = (n: number) => (players > 0 ? Math.round((n / players) * 100) : 0);
  const list = Object.entries(rawCounts)
    .map(([category, n]) => ({ category, count: Number(n), points: pct(Number(n)) }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  const onBoard = new Map(list.slice(0, BOARD_SIZE).map((c) => [c.category, c.points]));
  return { list, onBoard };
}

/** A player's score for a day: points for each distinct group of theirs that made the board. */
export function scoreSubmission(sub: Submission, onBoard: Map<string, number>) {
  return [...new Set(sub.answers.map((a) => a.category))].reduce((sum, g) => sum + (onBoard.get(g) ?? 0), 0);
}

/** Recompute group counts from submissions (used after an admin merge). */
export async function rebuildCounts(store: Store, keys: GameKeys) {
  const subs = await store.hgetall(keys.subs);
  const counts: Record<string, number> = {};
  for (const v of Object.values(subs)) {
    const s = parseJSON<Submission>(v);
    if (!s) continue;
    for (const c of new Set(s.answers.map((a) => a.category))) counts[c] = (counts[c] ?? 0) + 1;
  }
  await store.del(keys.counts);
  await store.hset(keys.counts, counts);
}
