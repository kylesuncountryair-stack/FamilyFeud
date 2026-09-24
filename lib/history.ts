import type { Question } from "./questions";
import { QUESTIONS } from "./questions";
import { gameKeys } from "./game";
import { questionOn } from "./schedule";
import { parseJSON, type Store } from "./store";

/** Index of every day that had players: field "YYYY-MM-DD|questionId" -> {"prompt": "..."} */
const HISTORY_KEY = "feud:history";
const BACKFILL_FLAG = "__backfilled";
const BACKFILL_DAYS = 45;
const MAX_LISTED = 60;

export async function recordDay(store: Store, day: string, question: Question) {
  await store.hset(HISTORY_KEY, { [`${day}|${question.id}`]: JSON.stringify({ prompt: question.prompt }) });
}

function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** One-time: index days played before the history feature existed. */
async function backfill(store: Store, today: string) {
  const candidates = Array.from({ length: BACKFILL_DAYS }, (_, i) => shiftDay(today, -(i + 1)));
  const found = await Promise.all(
    candidates.map(async (day) => {
      const q = questionOn(day);
      return (await store.hlen(gameKeys(day, q.id).subs)) > 0 ? { day, q } : null;
    })
  );
  const entries: Record<string, string> = { [BACKFILL_FLAG]: "1" };
  for (const f of found) if (f) entries[`${f.day}|${f.q.id}`] = JSON.stringify({ prompt: f.q.prompt });
  await store.hset(HISTORY_KEY, entries);
}

export function promptFor(entry: unknown, questionId: string) {
  return parseJSON<{ prompt?: string }>(entry)?.prompt ?? QUESTIONS.find((q) => q.id === questionId)?.prompt ?? "";
}

export async function lookupPrompt(store: Store, day: string, questionId: string) {
  return promptFor(await store.hget(HISTORY_KEY, `${day}|${questionId}`), questionId);
}

/** Every indexed day/question (including today), after a one-time backfill. */
export async function listIndexedDays(store: Store, today: string) {
  if (!(await store.hget(HISTORY_KEY, BACKFILL_FLAG))) await backfill(store, today);
  const index = await store.hgetall(HISTORY_KEY);
  return Object.entries(index)
    .filter(([field]) => field !== BACKFILL_FLAG)
    .map(([field, v]) => {
      const [day, questionId] = field.split("|");
      return { day, questionId, prompt: promptFor(v, questionId) };
    })
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day) && !!d.questionId);
}

export type PastDay = {
  day: string;
  questionId: string;
  prompt: string;
  players: number;
  top: { category: string; points: number } | null;
};

/** Finished days (today excluded), newest first. */
export async function listPastDays(store: Store, today: string): Promise<PastDay[]> {
  const days = (await listIndexedDays(store, today))
    .filter((d) => d.day < today)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, MAX_LISTED);

  return Promise.all(
    days.map(async (d) => {
      const keys = gameKeys(d.day, d.questionId);
      const [players, counts] = await Promise.all([store.hlen(keys.subs), store.hgetall(keys.counts)]);
      const best = Object.entries(counts)
        .map(([category, n]) => ({ category, n: Number(n) }))
        .sort((a, b) => b.n - a.n || a.category.localeCompare(b.category))[0];
      return {
        ...d,
        players,
        top: best && players ? { category: best.category, points: Math.round((best.n / players) * 100) } : null,
      };
    })
  );
}
