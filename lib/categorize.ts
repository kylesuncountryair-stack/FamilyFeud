import type { Question } from "./questions";
import type { GameKeys } from "./game";
import type { Store } from "./store";

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

async function aiGroup(prompt: string, answers: string[], groups: string[]): Promise<string[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const system = `You group free-form answers for a Family Feud style survey game.
Rules:
- Put each answer in the group that captures the same idea, the way a Family Feud host would accept it. Group broadly: "pants", "shirts" and "underwear" are all "Clothes"; "phone charger" and "charging cord" are both "Phone charger".
- Strongly prefer an existing group. Only create a new group when no existing group fits.
- New group names: 1-3 words, sentence case, general enough for similar answers to join later.
- Fix obvious typos. Answers that are nonsense, jokes or not an answer go in "Other".
- Respond with ONLY a JSON array of strings, one group per answer, in the same order. No other text.`;

  const user = `Survey question: ${prompt}
Existing groups: ${groups.length ? JSON.stringify(groups) : "(none yet)"}
Answers: ${JSON.stringify(answers)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("[survey-says] Claude API error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    if (!Array.isArray(parsed) || parsed.length !== answers.length) return null;
    return parsed.map((g) => String(g).trim().slice(0, 40));
  } catch (err) {
    console.error("[survey-says] Grouping failed", err);
    return null;
  }
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
