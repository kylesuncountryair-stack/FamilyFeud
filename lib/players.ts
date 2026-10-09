import { allPlayedDays } from "./adminDay";
import { gameKeys, playerKey, rebuildCounts, type Submission } from "./game";
import { displayName, normalizeEmail } from "./identity";
import { questionOn } from "./schedule";
import { parseJSON, type Store } from "./store";

/** Emails that have been removed and can't play again. */
export const BLOCKED_KEY = "feud:blocked";

export async function isBlocked(store: Store, email: string) {
  return !!(await store.hget(BLOCKED_KEY, playerKey(email)));
}

/** Everyone who has played this week whose email or name contains `query`. */
export async function findPlayers(store: Store, query: string) {
  const q = query.trim().toLowerCase();
  const found = new Map<string, { email: string; leaderboardName: string; days: string[] }>();
  for (const day of await allPlayedDays()) {
    const subs = await store.hgetall(gameKeys(day, questionOn(day).id).subs);
    for (const [who, v] of Object.entries(subs)) {
      const s = parseJSON<Submission>(v);
      const email = (s?.email ?? who).toLowerCase();
      if (q && !email.includes(q) && !(s?.name ?? "").toLowerCase().includes(q)) continue;
      const f = found.get(email) ?? { email, leaderboardName: displayName(email), days: [] };
      f.days.push(day);
      found.set(email, f);
    }
  }
  return [...found.values()].sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Removes a player's answers from every day this week, recounts those days (so
 * everyone else's points are recalculated as if they never played), and blocks the
 * email from playing again. With apply=false it only reports what would happen.
 */
export async function removePlayer(store: Store, emailInput: string, apply: boolean, block = true) {
  const email = normalizeEmail(emailInput);
  const who = playerKey(email);
  const removed: { day: string; answers: string[] }[] = [];
  for (const day of await allPlayedDays()) {
    const keys = gameKeys(day, questionOn(day).id);
    const s = parseJSON<Submission>(await store.hget(keys.subs, who));
    if (!s) continue;
    removed.push({ day, answers: s.answers.map((a) => a.raw) });
    if (apply) {
      await store.hdel(keys.subs, who);
      await rebuildCounts(store, keys);
    }
  }
  if (apply && block) {
    await store.hset(BLOCKED_KEY, { [who]: JSON.stringify({ email, at: Date.now() }) });
  }
  return { email, leaderboardName: displayName(email), daysRemoved: removed };
}

export async function unblock(store: Store, emailInput: string) {
  await store.hdel(BLOCKED_KEY, playerKey(emailInput));
}
