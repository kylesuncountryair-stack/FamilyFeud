import type { Question } from "./questions";
import { aiGroup, keywordMatch, normalize, titleCase } from "./categorize";
import { rebuildCounts, type GameKeys, type Submission } from "./game";
import { parseJSON, type Store } from "./store";

const CHUNK = 15;

/**
 * Regroups every answer for one day from scratch under the current rules, then
 * rewrites everyone's answers and recounts the board. Points for that day (and the
 * leaderboard) update automatically. Nothing is written if Claude can't be reached.
 */
export async function rebuildDay(store: Store, keys: GameKeys, question: Question) {
  const subs = await store.hgetall(keys.subs);
  const parsed = Object.entries(subs)
    .map(([who, v]) => [who, parseJSON<Submission>(v)] as const)
    .filter((e): e is readonly [string, Submission] => !!e[1]);

  // One representative wording per normalized answer
  const reps = new Map<string, string>();
  for (const [, s] of parsed) for (const a of s.answers) if (!reps.has(normalize(a.raw))) reps.set(normalize(a.raw), a.raw);

  const groupOf = new Map<string, string>();
  const pending: string[] = [];
  for (const [norm] of reps) {
    const kw = keywordMatch(norm, question);
    if (kw) groupOf.set(norm, kw);
    else pending.push(norm);
  }

  // Same word as a known group (plural/case) needs no AI
  const seedGroups = Object.keys(question.groups ?? {});
  for (let i = pending.length - 1; i >= 0; i--) {
    const match = seedGroups.find((g) => normalize(g) === pending[i]);
    if (match) {
      groupOf.set(pending[i], match);
      pending.splice(i, 1);
    }
  }

  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    const known = [...new Set([...seedGroups, ...groupOf.values()])];
    const ai = await aiGroup(question.prompt, chunk.map((n) => reps.get(n)!), known);
    if (!ai) {
      return { ok: false as const, problem: "Couldn't reach Claude, so nothing was changed. Try again in a minute." };
    }
    chunk.forEach((norm, j) => {
      const suggested = ai[j] ?? titleCase(reps.get(norm)!);
      const all = [...new Set([...seedGroups, ...groupOf.values()])];
      groupOf.set(norm, all.find((g) => g.toLowerCase() === suggested.toLowerCase()) ?? suggested);
    });
  }

  // Write: everyone's answers, the grouping cache, then the counts
  const updated: Record<string, string> = {};
  let changed = 0;
  for (const [who, s] of parsed) {
    s.answers = s.answers.map((a) => {
      const g = groupOf.get(normalize(a.raw)) ?? a.category;
      if (g !== a.category) changed++;
      return { ...a, category: g };
    });
    updated[who] = JSON.stringify(s);
  }
  await store.hset(keys.subs, updated);
  await store.del(keys.map);
  await store.hset(keys.map, Object.fromEntries(groupOf));
  await rebuildCounts(store, keys);
  return { ok: true as const, answersMoved: changed };
}

/** Manual fix: put every answer matching `answer` (ignoring case/plurals) into group `to`. */
export async function moveAnswer(store: Store, keys: GameKeys, answer: string, to: string) {
  const target = normalize(answer);
  const subs = await store.hgetall(keys.subs);
  const updated: Record<string, string> = {};
  let moved = 0;
  for (const [who, v] of Object.entries(subs)) {
    const s = parseJSON<Submission>(v);
    if (!s) continue;
    let touched = false;
    s.answers = s.answers.map((a) => {
      if (normalize(a.raw) !== target || a.category === to) return a;
      touched = true;
      moved++;
      return { ...a, category: to };
    });
    if (touched) updated[who] = JSON.stringify(s);
  }
  await store.hset(keys.subs, updated);
  await store.hset(keys.map, { [target]: to }); // future identical answers follow
  await rebuildCounts(store, keys);
  return moved;
}
