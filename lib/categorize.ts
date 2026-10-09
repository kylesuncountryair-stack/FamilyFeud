import type { Question } from "./questions";
import { groupKey, type GameKeys } from "./game";
import type { Store } from "./store";
import { callClaude, extractJSON } from "./claude";

/**
 * Grouping pipeline, per answer:
 *   1. Cache  — this exact (normalized) answer was already grouped today.
 *   2. Keywords from lib/questions.ts — free and instant.
 *   3. Claude — groups it into an existing bucket or creates a broad new one.
 *   4. Fallback — the answer becomes its own group (not cached, so it can be
 *      regrouped once the AI is available again).
 */

function singular(w: string) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(a|an|the|my|their|his|her|your|some|extra)\s+/, "")
    .split(" ")
    .map(singular)
    .join(" ");
}

export function titleCase(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function keywordMatch(norm: string, question: Question): string | null {
  let best: { group: string; len: number } | null = null;
  for (const [group, words] of Object.entries(question.groups ?? {})) {
    for (const w of [group, ...words]) {
      const kw = normalize(w);
      if (!kw) continue;
      const hit = norm === kw || ` ${norm} `.includes(` ${kw} `);
      if (hit && (!best || kw.length > best.len)) best = { group, len: kw.length };
    }
  }
  return best?.group ?? null;
}

export const GROUPING_RULES = `When two answers count as the SAME answer (a Family Feud host would accept them as one):
- Same thing in different words: synonyms, slang, typos, plurals. "restroom", "lav", "bathroom" -> "Bathroom"; "charger", "charging cord" -> "Phone charger".
- A brand or specific product of the thing: "Advil", "Tylenol" -> "Medication"; "Reader's Digest" -> "Magazine".
- Specific items when the everyday answer is the umbrella word itself. For "something passengers forget to pack", "pants", "socks", "underwear" -> "Clothes", because "clothes" is how people actually answer that question.

When answers are DIFFERENT answers (keep them apart):
- Different things that only share a theme, setting or purpose. For "something that makes a trip feel like a real vacation", "sun", "beach", "hotel", "pool", "no work" and "good food" are six different answers. Never fold them into a theme such as "Destination", "Relaxation", "Amenities", "Weather" or "Experience".
- If a host would ask "is that really the same thing?", it is not the same answer.
- When in doubt, keep answers separate. A wrong merge is worse than two small groups.

Group names: 1-3 words, sentence case, the plain everyday words people say (never a brand, never an abstract theme or category label like "Getting away" or "Lifestyle").
If an answer doesn't match any existing group, give it its own new group named after the answer itself. Never use a catch-all group such as "Other" or "Misc".`;

/**
 * Asks Claude to group answers. Claude returns each answer paired with its group, and we
 * match them back up by the answer's text, never by position, so one skipped or merged
 * item can't shift every later answer into the wrong group. Returns one group per input
 * answer, or null for any answer Claude didn't clearly assign (the caller then gives that
 * answer its own group).
 */
export async function aiGroup(prompt: string, answers: string[], groups: string[]): Promise<(string | null)[] | null> {
  const system = `You group free-form answers for a Family Feud style survey game.
${GROUPING_RULES}
- Put an answer in an existing group ONLY if it is the same answer as that group under these rules. Being related, or fitting the same theme, is not enough: create a new group instead.
- Respond with ONLY a JSON array with one object per answer, copying each answer exactly as given: [{"answer": "...", "group": "..."}]. No other text.`;

  const user = `Survey question: ${prompt}
Existing groups: ${groups.length ? JSON.stringify(groups) : "(none yet)"}
Answers: ${JSON.stringify(answers)}`;

  const res = await callClaude(system, user, 200 + answers.length * 40);
  if (!res.ok) return null;
  const parsed = extractJSON<unknown[]>(res.text, "[");
  if (!Array.isArray(parsed)) return null;

  const byAnswer = new Map<string, string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { answer, group } = item as { answer?: unknown; group?: unknown };
    if (typeof answer !== "string" || typeof group !== "string" || !group.trim()) continue;
    byAnswer.set(normalize(answer), group.trim().slice(0, 40));
  }
  return answers.map((a) => {
    const g = byAnswer.get(normalize(a));
    // A catch-all is never a real Feud answer: give the answer its own group instead
    if (!g || /^(other|misc|miscellaneous|none|n\/a)$/i.test(g)) return null;
    return g;
  });
}

export async function categorize(
  question: Question,
  raws: string[],
  store: Store,
  keys: GameKeys
): Promise<string[]> {
  const norms = raws.map(normalize);
  const [cache, pinned] = await Promise.all([store.hgetall(keys.map), store.hgetall(keys.pinned)]);
  const out: (string | null)[] = raws.map(() => null);
  const toCache: Record<string, string> = {};
  const pending: number[] = [];

  // Order: your manual fixes, then the keyword lists, then answers grouped earlier today, then Claude
  norms.forEach((n, i) => {
    const pin = pinned[n];
    if (typeof pin === "string") return void (out[i] = pin);
    const kw = keywordMatch(n, question);
    if (kw) {
      out[i] = kw;
      toCache[n] = kw;
      return;
    }
    const cachedGroup = cache[n];
    if (typeof cachedGroup === "string") return void (out[i] = cachedGroup);
    pending.push(i);
  });

  if (pending.length) {
    const existing = Object.keys(await store.hgetall(keys.counts));
    const known = [...new Set([...Object.keys(question.groups ?? {}), ...existing])];

    // Same word as an existing group, ignoring plurals/case ("Blankets" -> "Blanket"): no AI needed
    const knownByNorm = new Map(known.map((g) => [normalize(g), g]));
    for (let j = pending.length - 1; j >= 0; j--) {
      const i = pending[j];
      const match = knownByNorm.get(norms[i]);
      if (match) {
        out[i] = match;
        toCache[norms[i]] = match;
        pending.splice(j, 1);
      }
    }
  }

  if (pending.length) {
    const existing = Object.keys(await store.hgetall(keys.counts));
    const known = [...new Set([...Object.keys(question.groups ?? {}), ...existing])];
    const ai = await aiGroup(question.prompt, pending.map((i) => raws[i]), known);

    pending.forEach((i, j) => {
      const suggested = ai?.[j] ?? null;
      if (suggested) {
        // Reuse existing spelling if the AI returns a case variant
        const group = known.find((g) => g.toLowerCase() === suggested.toLowerCase()) ?? suggested;
        out[i] = group;
        toCache[norms[i]] = group;
      } else {
        out[i] = titleCase(raws[i]);
      }
    });
  }

  // Use the board's spelling for any group that differs only in capitalization ("Good Weather")
  const known = [...Object.keys(question.groups ?? {}), ...Object.keys(await store.hgetall(keys.counts))];
  const spelling = new Map<string, string>();
  for (const g of known) if (!spelling.has(groupKey(g))) spelling.set(groupKey(g), g);
  const final = (out as string[]).map((g) => spelling.get(groupKey(g)) ?? g);
  for (const [n, g] of Object.entries(toCache)) toCache[n] = spelling.get(groupKey(g)) ?? g;

  await store.hset(keys.map, toCache);
  return final;
}
