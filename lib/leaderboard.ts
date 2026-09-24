import { gameKeys, playerKey, rankBoard, scoreSubmission, type Submission } from "./game";
import { listIndexedDays } from "./history";
import { displayName } from "./identity";
import { eventConfig } from "./schedule";
import { parseJSON, type Store } from "./store";

function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Monday-to-Sunday week containing `day`, shifted by `weeksBack`. */
export function weekRange(day: string, weeksBack = 0) {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const start = shiftDay(day, -((dow + 6) % 7) - 7 * weeksBack);
  return { start, end: shiftDay(start, 6) };
}

export type Leader = { rank: number; name: string; total: number; days: number; isMe: boolean };

/**
 * Weekly totals, always computed from the latest board for each day, so a player's
 * points for a day are the same whether they played early or late.
 */
export async function weeklyLeaderboard(store: Store, today: string, weeksBack: number, forEmail?: string) {
  const ev = eventConfig();
  const week = ev ? { start: ev.start, end: ev.end } : weekRange(today, weeksBack);
  const days = (await listIndexedDays(store, today)).filter((d) => d.day >= week.start && d.day <= week.end);

  const totals = new Map<string, { email: string; total: number; days: Set<string> }>();
  await Promise.all(
    days.map(async (d) => {
      const keys = gameKeys(d.day, d.questionId);
      const [counts, subs] = await Promise.all([store.hgetall(keys.counts), store.hgetall(keys.subs)]);
      const players = Object.keys(subs).length;
      const { onBoard } = rankBoard(counts, players);
      for (const [who, v] of Object.entries(subs)) {
        const sub = parseJSON<Submission>(v);
        if (!sub) continue;
        const email = sub.email ?? who;
        const t = totals.get(who) ?? { email, total: 0, days: new Set<string>() };
        t.total += scoreSubmission(sub, onBoard);
        t.days.add(d.day);
        totals.set(who, t);
      }
    })
  );

  const me = forEmail ? playerKey(forEmail) : null;
  const sorted = [...totals.entries()].sort(
    ([, a], [, b]) => b.total - a.total || displayName(a.email).localeCompare(displayName(b.email))
  );

  // Ties share a rank (1, 2, 2, 4)
  let lastTotal = -1;
  let lastRank = 0;
  const leaders: Leader[] = sorted.map(([who, t], i) => {
    const rank = t.total === lastTotal ? lastRank : i + 1;
    lastTotal = t.total;
    lastRank = rank;
    return { rank, name: displayName(t.email), total: t.total, days: t.days.size, isMe: who === me };
  });

  return {
    event: !!ev,
    week,
    daysInWeek: days.length,
    leaders,
    me: leaders.find((l) => l.isMe) ?? null,
  };
}
