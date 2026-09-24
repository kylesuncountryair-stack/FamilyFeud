import type { Question } from "./questions";
import type { GameKeys } from "./game";
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

function titleCase(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function keywordMatch(norm: string, question: Question): string | null {
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

export const GROUPING_RULES = `How a Family Feud host groups answers:
- Group by the underlying idea, at the level most people would name it. Specific items go in their broad category: "pants", "skirt", "underwear" -> "Clothes"; "face wash", "toothbrush" -> "Toiletries".
- Brand names go in their generic category: "Advil", "Tylenol", "ibuprofen" -> "Medication"; "Reader's Digest", "People" -> "Reading material".
- Near-synonyms are one group: "charger", "charging cord" -> "Phone charger"; "magazine", "book" -> "Reading material".
- Keep genuinely different ideas apart: "Passport" and "Clothes" are different; "Sunscreen" and "Toiletries" can stay separate if players name sunscreen specifically.
- Group names: 1-3 words, sentence case, generic (never a brand name).
- Fix obvious typos. Nonsense, jokes and non-answers go in "Other".`;

async function aiGroup(prompt: string, answers: string[], groups: string[]): Promise<string[] | null> {
  const system = `You group free-form answers for a Family Feud style survey game.
${GROUPING_RULES}
- Strongly prefer an existing group when it fits. Only create a new group when none does.
- Respond with ONLY a JSON array of strings, one group per answer, in the same order. No other text.`;

  const user = `Survey question: ${prompt}
Existing groups: ${groups.length ? JSON.stringify(groups) : "(none yet)"}
Answers: ${JSON.stringify(answers)}`;

  const res = await callClaude(system, user, 300);
  if (!res.ok) return null;
  const parsed = extractJSON<unknown[]>(res.text, "[");
  if (!Array.isArray(parsed) || parsed.length !== answers.length) return null;
  return parsed.map((g) => String(g).trim().slice(0, 40));
}

export async function categorize(
  question: Question,
  raws: string[],
  store: Store,
  keys: GameKeys
): Promise<string[]> {
  const norms = raws.map(normalize);
  const cache = await store.hgetall(keys.map);
  const out: (string | null)[] = raws.map(() => null);
  const toCache: Record<string, string> = {};
  const pending: number[] = [];

  norms.forEach((n, i) => {
    const cachedGroup = cache[n];
    if (typeof cachedGroup === "string") return void (out[i] = cachedGroup);
    const kw = keywordMatch(n, question);
    if (kw) {
      out[i] = kw;
      toCache[n] = kw;
      return;
    }
    pending.push(i);
  });

  if (pending.length) {
    const existing = Object.keys(await store.hgetall(keys.counts));
    const known = [...new Set([...Object.keys(question.groups ?? {}), ...existing])];
    const ai = await aiGroup(question.prompt, pending.map((i) => raws[i]), known);

    pending.forEach((i, j) => {
      const suggested = ai?.[j];
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

  await store.hset(keys.map, toCache);
  return out as string[];
}
