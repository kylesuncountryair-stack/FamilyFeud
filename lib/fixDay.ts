import type { Question } from "./questions";
import { keywordMatch, normalize } from "./categorize";
import { groupKey, rebuildCounts, type GameKeys, type Submission } from "./game";
import { parseJSON, type Store } from "./store";

/**
 * Repairs answers already on a day's board:
 *  1. your manual moves, then the keyword lists, are applied to every existing answer
 *  2. groups that differ only in capitalization ("Good Weather" / "Good weather") become one
 * With apply=false it only reports what would change.
 */
export async function fixDay(store: Store, keys: GameKeys, question: Question, apply: boolean) {
  const [subs, pinned, map] = await Promise.all([
    store.hgetall(keys.subs),
    store.hgetall(keys.pinned),
    store.hgetall(keys.map),
  ]);
  const parsed = Object.entries(subs)
    .map(([who, v]) => [who, parseJSON<Submission>(v)] as const)
    .filter((e): e is readonly [string, Submission] => !!e[1]);

  // Pass 1: manual moves and keyword lists
  const targetOf = (raw: string, current: string) => {
    const n = normalize(raw);
    const pin = pinned[n];
    if (typeof pin === "string") return pin;
    return keywordMatch(n, question) ?? current;
  };
  const next = parsed.map(([who, s]) => [who, s, s.answers.map((a) => targetOf(a.raw, a.category))] as const);

  // Pass 2: one spelling per group. The keyword list's spelling wins; otherwise the most-used one.
  const tally = new Map<string, Map<string, number>>();
  for (const [, , cats] of next)
    for (const c of cats) {
      const k = groupKey(c);
      const m = tally.get(k) ?? new Map<string, number>();
      m.set(c, (m.get(c) ?? 0) + 1);
      tally.set(k, m);
    }
  const spelling = new Map<string, string>();
  for (const g of Object.keys(question.groups ?? {})) spelling.set(groupKey(g), g);
  for (const [k, variants] of tally)
    if (!spelling.has(k)) spelling.set(k, [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  const canon = (c: string) => spelling.get(groupKey(c)) ?? c;

  const changes: { player: string; answer: string; from: string; to: string }[] = [];
  const updated: Record<string, string> = {};
  for (const [who, s, cats] of next) {
    let touched = false;
    s.answers = s.answers.map((a, i) => {
      const to = canon(cats[i]);
      if (to === a.category) return a;
      touched = true;
      changes.push({ player: s.name, answer: a.raw, from: a.category, to });
      return { ...a, category: to };
    });
    if (touched) updated[who] = JSON.stringify(s);
  }

  // Future players typing the same thing land in the same place
  const newMap: Record<string, string> = {};
  for (const [n, g] of Object.entries(map)) if (typeof g === "string") newMap[n] = canon(g);
  for (const [, s] of parsed) for (const a of s.answers) newMap[normalize(a.raw)] = a.category;

  if (apply) {
    if (Object.keys(updated).length) await store.hset(keys.subs, updated);
    await store.hset(keys.map, newMap);
    await rebuildCounts(store, keys);
  }

  const groups: Record<string, string[]> = {};
  for (const [, s] of parsed)
    for (const a of s.answers) {
      const list = (groups[a.category] ??= []);
      if (!list.some((x) => x.toLowerCase() === a.raw.toLowerCase())) list.push(a.raw);
    }
  return {
    answersChanged: changes.length,
    changes,
    groups: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].length - a[1].length)),
  };
}
