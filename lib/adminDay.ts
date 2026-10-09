import { gameKeys, getToday } from "./game";
import { listIndexedDays } from "./history";
import { eventConfig, questionOn } from "./schedule";
import { getStore } from "./store";

/** ?day=YYYY-MM-DD, or today when omitted. */
export function dayFromRequest(req: Request) {
  const day = new URL(req.url).searchParams.get("day") || getToday().day;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const question = questionOn(day);
  return { day, question, keys: gameKeys(day, question.id) };
}

/** Every event day that has answers so far (or every indexed day without an event). */
export async function allPlayedDays() {
  const today = getToday().day;
  const ev = eventConfig();
  const days = (await listIndexedDays(getStore(), today))
    .filter((d) => d.day <= today && (!ev || (d.day >= ev.start && d.day <= ev.end)))
    .map((d) => d.day);
  return [...new Set(days)].sort();
}
