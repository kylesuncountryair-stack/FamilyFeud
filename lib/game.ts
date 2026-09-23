import { QUESTIONS, type Question } from "./questions";
import { parseJSON, type Store } from "./store";

export const BOARD_SIZE = 8;

export type Submission = {
  name: string;
  answers: { raw: string; category: string }[];
  at: number;
};

export function getToday(): { day: string; question: Question } {
  const tz = process.env.GAME_TIMEZONE || "America/New_York";
  // en-CA formats as YYYY-MM-DD
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = day.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  // Set QUESTION_ID to pin a specific question (handy for testing or a special day)
  const pinned = QUESTIONS.find((q) => q.id === process.env.QUESTION_ID);
  const question = pinned ?? QUESTIONS[dayNumber % QUESTIONS.length];
  return { day, question };
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

export function nameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function buildResults(store: Store, keys: GameKeys, forName?: string) {
  const [rawCounts, players, rawMine] = await Promise.all([
    store.hgetall(keys.counts),
    store.hlen(keys.subs),
    forName ? store.hget(keys.subs, nameKey(forName)) : Promise.resolve(null),
  ]);

  const counts = Object.entries(rawCounts)
    .map(([category, n]) => ({ category, count: Number(n) }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const countOf = new Map(counts.map((c) => [c.category, c.count]));
  const rank = new Map(counts.map((c, i) => [c.category, i]));
  const sub = parseJSON<Submission>(rawMine);

  const mine = sub
    ? {
        name: sub.name,
        answers: sub.answers.map((a) => ({
          ...a,
          count: countOf.get(a.category) ?? 0,
          onBoard: (rank.get(a.category) ?? Infinity) < BOARD_SIZE,
        })),
      }
    : null;

  return { top: counts.slice(0, BOARD_SIZE), players, mine };
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
