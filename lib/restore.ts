import { normalize } from "./categorize";
import { rebuildCounts, type GameKeys, type Submission } from "./game";
import type { SheetPlay } from "./sheets";
import { parseJSON, type Store } from "./store";

/**
 * Puts a day's answers back in the groups they had when each person played, as logged
 * in the Google Sheet. With apply=false nothing is written; it only reports what would change.
 */
export async function restoreDayFromSheet(store: Store, keys: GameKeys, sheetRows: SheetPlay[], apply: boolean) {
  const byEmail = new Map<string, SheetPlay>();
  for (const r of sheetRows) byEmail.set(r.email, r); // one play per person per day

  const subs = await store.hgetall(keys.subs);
  const updated: Record<string, string> = {};
  const notInSheet: string[] = [];
  const changes: { player: string; answer: string; from: string; to: string }[] = [];
  const restored: Submission[] = [];

  for (const [who, v] of Object.entries(subs)) {
    const s = parseJSON<Submission>(v);
    if (!s) continue;
    const row = byEmail.get((s.email ?? who).toLowerCase());
    if (!row) {
      notInSheet.push(s.name);
      restored.push(s);
      continue;
    }
    s.answers = s.answers.map((a, i) => {
      // Match by what they typed (same slot first), never trust position alone
      const same = row.answers[i] && normalize(row.answers[i].raw) === normalize(a.raw) ? row.answers[i] : null;
      const logged = same ?? row.answers.find((x) => normalize(x.raw) === normalize(a.raw));
      const to = logged?.category?.trim();
      if (!to || to === a.category) return a;
      changes.push({ player: s.name, answer: a.raw, from: a.category, to });
      return { ...a, category: to };
    });
    restored.push(s);
    updated[who] = JSON.stringify(s);
  }

  // The board as it will look after the restore
  const groups: Record<string, string[]> = {};
  for (const s of restored)
    for (const a of s.answers) {
      const list = (groups[a.category] ??= []);
      if (!list.some((x) => x.toLowerCase() === a.raw.toLowerCase())) list.push(a.raw);
    }

  if (apply && changes.length) {
    await store.hset(keys.subs, updated);
    // Future identical answers follow the restored groups
    const map: Record<string, string> = {};
    for (const s of restored) for (const a of s.answers) map[normalize(a.raw)] = a.category;
    await store.del(keys.map);
    await store.hset(keys.map, map);
    await rebuildCounts(store, keys);
  }

  return {
    players: restored.length,
    answersChanged: changes.length,
    notInSheet,
    changes,
    groups: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].length - a[1].length)),
  };
}
