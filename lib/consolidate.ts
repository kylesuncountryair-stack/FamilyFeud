import type { Question } from "./questions";
import { rebuildCounts, type GameKeys, type Submission } from "./game";
import { parseJSON, type Store } from "./store";
import { callClaude, extractJSON } from "./claude";
import { GROUPING_RULES } from "./categorize";

/**
 * Moves every answer in each `from` group into its `to` group, points the
 * grouping cache at the new names, and recounts the board.
 */
export async function mergeGroups(store: Store, keys: GameKeys, mapping: Record<string, string>) {
  const resolve = (g: string) => {
    let cur = g;
    for (let i = 0; i < 10 && mapping[cur] && mapping[cur] !== cur; i++) cur = mapping[cur];
    return cur;
  };

  const subs = await store.hgetall(keys.subs);
  const updatedSubs: Record<string, string> = {};
  let moved = 0;
  for (const [who, v] of Object.entries(subs)) {
    const s = parseJSON<Submission>(v);
    if (!s) continue;
    let changed = false;
    s.answers = s.answers.map((a) => {
      const to = resolve(a.category);
      if (to === a.category) return a;
      changed = true;
      moved++;
      return { ...a, category: to };
    });
    if (changed) updatedSubs[who] = JSON.stringify(s);
  }
  await store.hset(keys.subs, updatedSubs);

  const map = await store.hgetall(keys.map);
  const updatedMap: Record<string, string> = {};
  for (const [norm, g] of Object.entries(map)) {
    if (typeof g !== "string") continue;
    const to = resolve(g);
    if (to !== g) updatedMap[norm] = to;
  }
  await store.hset(keys.map, updatedMap);

  await rebuildCounts(store, keys);
  return moved;
}

/** Every group on the board with the distinct raw answers in it. */
export async function groupsWithAnswers(store: Store, keys: GameKeys) {
  const subs = await store.hgetall(keys.subs);
  const groups: Record<string, string[]> = {};
  for (const v of Object.values(subs)) {
    const s = parseJSON<Submission>(v);
    s?.answers.forEach((a) => {
      const list = (groups[a.category] ??= []);
      if (!list.some((x) => x.toLowerCase() === a.raw.toLowerCase())) list.push(a.raw);
    });
  }
  return groups;
}

export type ConsolidateResult = {
  merges: Record<string, string>;
  moved: number;
  error?: string;
};

/**
 * Asks Claude to look at the whole board at once and merge groups that are
 * the same idea (e.g. "Advil" into "Medication", "Magazine" and "Readers
 * digest" into "Reading material"). Safe to run any time.
 */
export async function consolidate(store: Store, keys: GameKeys, question: Question): Promise<ConsolidateResult> {
  const groups = await groupsWithAnswers(store, keys);
  const names = Object.keys(groups);
  if (names.length < 2) return { merges: {}, moved: 0 };

  const listing = names
    .map((g) => `- ${JSON.stringify(g)}: ${groups[g].slice(0, 8).map((a) => JSON.stringify(a)).join(", ")}`)
    .join("\n");

  const system = `You tidy up the answer board for a Family Feud style survey game.
You get the current groups, each with the raw answers players typed. Merge groups that a Family Feud host would count as the same answer.
${GROUPING_RULES}
- You may merge into an existing group, or merge several groups into one new, better name (e.g. "Magazine" + "Readers digest" -> "Reading material").
- Leave groups that are already distinct and well named alone.
- Respond with ONLY a JSON object mapping each group that should change to its new group name, e.g. {"Advil": "Medication", "Skirt": "Clothes"}. Respond {} if nothing should change.`;

  const user = `Survey question: ${question.prompt}
Current groups and the answers in them:
${listing}`;

  const res = await callClaude(system, user, 600);
  if (!res.ok) return { merges: {}, moved: 0, error: res.error };

  const raw = extractJSON<Record<string, unknown>>(res.text, "{");
  if (!raw || typeof raw !== "object") return { merges: {}, moved: 0, error: "Claude's reply wasn't readable." };

  // Only accept renames of real groups, into sensible names; reuse existing spelling when it matches
  const merges: Record<string, string> = {};
  for (const [from, toRaw] of Object.entries(raw)) {
    if (!names.includes(from)) continue;
    const to = String(toRaw ?? "").trim().slice(0, 40);
    if (!to) continue;
    const canonical = names.find((n) => n.toLowerCase() === to.toLowerCase()) ?? to;
    if (canonical !== from) merges[from] = canonical;
  }
  if (!Object.keys(merges).length) return { merges, moved: 0 };

  const moved = await mergeGroups(store, keys, merges);
  return { merges, moved };
}
