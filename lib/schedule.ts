import { QUESTIONS, type Question } from "./questions";
import { getToday, questionForDay } from "./game";

/**
 * One-week event mode. Set GAME_START=YYYY-MM-DD (the Monday it begins):
 *   - Days 1-7 (Mon-Sun): one new question per day, QUESTIONS[0..6] in order.
 *   - Day 8 (the following Monday): catch-up day. No new question; players can
 *     answer the Saturday and Sunday questions they missed.
 *   - After that the game is over and shows final standings.
 * Without GAME_START the game runs one question a day, indefinitely.
 */

export type Status = "daily" | "before" | "live" | "catchup" | "over";
export type OpenGame = { day: string; question: Question; label: string };

export function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function weekdayOf(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function eventConfig() {
  const start = process.env.GAME_START?.trim();
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  return {
    start,
    end: shiftDay(start, 6), // Sunday
    catchUp: shiftDay(start, 7), // following Monday
    weekendDays: [shiftDay(start, 5), shiftDay(start, 6)], // Saturday, Sunday
  };
}

/** The question for a given day. In event mode, event days use QUESTIONS in order. */
export function questionOn(day: string): Question {
  const ev = eventConfig();
  if (ev && day >= ev.start && day <= ev.end) {
    const [y1, m1, d1] = ev.start.split("-").map(Number);
    const [y2, m2, d2] = day.split("-").map(Number);
    const index = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
    return QUESTIONS[index % QUESTIONS.length];
  }
  return questionForDay(day);
}

export function getSchedule() {
  const today = getToday().day;
  const ev = eventConfig();

  if (!ev) {
    return { today, status: "daily" as Status, event: null, open: [{ day: today, question: questionOn(today), label: "Today’s question" }] };
  }
  if (today < ev.start) return { today, status: "before" as Status, event: ev, open: [] as OpenGame[] };
  const label = (day: string) => (day === today ? "Today’s question" : `${weekdayOf(day)}’s question`);
  const eventDays = Array.from({ length: 7 }, (_, i) => shiftDay(ev.start, i));
  if (today <= ev.end) {
    // Today's question, plus any earlier day this week for players catching up
    const open = eventDays
      .filter((d) => d <= today)
      .sort((a, b) => (a === today ? -1 : b === today ? 1 : a.localeCompare(b)))
      .map((day) => ({ day, question: questionOn(day), label: label(day) }));
    return { today, status: "live" as Status, event: ev, open };
  }
  if (today === ev.catchUp) {
    // Catch-up day: every day of the week is open for anyone who missed it
    const open = eventDays.map((day) => ({ day, question: questionOn(day), label: label(day) }));
    return { today, status: "catchup" as Status, event: ev, open };
  }
  return { today, status: "over" as Status, event: ev, open: [] as OpenGame[] };
}

/** The open game matching day/questionId, or the first open game if none was named. */
export function findOpenGame(day?: string | null, questionId?: string | null) {
  const { open } = getSchedule();
  if (!day && !questionId) return open[0] ?? null;
  return open.find((g) => g.day === day && (!questionId || g.question.id === questionId)) ?? null;
}

/**
 * Whether a past board can be shown to a player:
 *  - "hidden": not a past event day (today's board, a future day, or a pre-event test day)
 *  - "locked": the day can still be caught up on and this player hasn't played it,
 *              so showing its answers would let them copy the top answers
 *  - "visible": safe to show
 */
export function boardAccess(day: string, hasPlayed: boolean): "hidden" | "locked" | "visible" {
  const s = getSchedule();
  if (day >= s.today) return "hidden";
  if (s.event && (day < s.event.start || day > s.event.end)) return "hidden";
  if (s.open.some((g) => g.day === day) && !hasPlayed) return "locked";
  return "visible";
}
