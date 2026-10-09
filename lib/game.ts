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
    pinned: `${base}:pinned`, // normalized answer -> group, set by hand with the admin move tool (always wins)
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
  const sub = parseJSON<Submission>(rawMine);

  const mine = sub
    ? {
        name: sub.name,
        answers: sub.answers.map((a) => {
          const g = board.byKey.get(groupKey(a.category));
          return {
            ...a,
            category: g?.category ?? a.category, // same spelling as the board
            count: g?.count ?? 0,
            points: g?.points ?? 0,
            onBoard: (g?.rank ?? Infinity) < BOARD_SIZE,
          };
        }),
      }
    : null;

  return { top: counts.slice(0, BOARD_SIZE), players, mine };
}

/** "Good Weather", "good weather " and "Good weather" are the same group. */
export function groupKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The one scoring rule, used by today's results, past boards and the leaderboard.
 * Points = % of that day's players who gave the answer ("we surveyed 100 people"),
 * so scores don't grow just because more people played.
 */
export function rankBoard(rawCounts: Record<string, unknown>, players: number) {
  const pct = (n: number) => (players > 0 ? Math.round((n / players) * 100) : 0);
  // Fold together names that differ only in capitalization/spacing; show the most-used spelling
  const merged = new Map<string, { category: string; count: number; best: number }>();
  for (const [category, raw] of Object.entries(rawCounts)) {
    const n = Number(raw);
    if (!(n > 0)) continue;
    const k = groupKey(category);
    const cur = merged.get(k);
    if (!cur) merged.set(k, { category, count: n, best: n });
    else {
      cur.count += n;
      if (n > cur.best) Object.assign(cur, { category, best: n });
    }
  }
  const list = [...merged.values()]
    .map(({ category, count }) => ({ category, count: Math.min(count, players || count), points: pct(Math.min(count, players || count)) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  const onBoard = new Map(list.slice(0, BOARD_SIZE).map((c) => [groupKey(c.category), c.points]));
  const byKey = new Map(list.map((c, i) => [groupKey(c.category), { ...c, rank: i }]));
  return { list, onBoard, byKey };
}

/** A player's score for a day: points for each distinct group of theirs that made the board. */
export function scoreSubmission(sub: Submission, onBoard: Map<string, number>) {
  return [...new Set(sub.answers.map((a) => groupKey(a.category)))].reduce((sum, k) => sum + (onBoard.get(k) ?? 0), 0);
}

/** Recompute group counts from submissions (used after an admin merge). */
export async function rebuildCounts(store: Store, keys: GameKeys) {
  const subs = await store.hgetall(keys.subs);
  const counts: Record<string, number> = {};
  for (const v of Object.values(subs)) {
    const s = parseJSON<Submission>(v);
    if (!s) continue;
    // once per player per group, however it's capitalized
    const seen = new Set<string>();
    for (const a of s.answers) {
      if (seen.has(groupKey(a.category))) continue;
      seen.add(groupKey(a.category));
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    }
  }
  await store.del(keys.counts);
  await store.hset(keys.counts, counts);
}
