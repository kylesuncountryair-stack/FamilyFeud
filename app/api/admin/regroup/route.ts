import { NextResponse } from "next/server";
import { consolidate, groupsWithAnswers } from "@/lib/consolidate";
import { gameKeys, getToday } from "@/lib/game";
import { QUESTIONS } from "@/lib/questions";
import { getSchedule, questionOn } from "@/lib/schedule";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Tidies a board: Claude looks at every group at once and merges the ones that
 * mean the same thing. Open in a browser:
 *   /api/admin/regroup?key=YOUR_ADMIN_KEY           (every open question)
 *   /api/admin/regroup?key=YOUR_ADMIN_KEY&day=2026-09-26   (a specific day)
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = process.env.ADMIN_KEY?.trim();
  if (!key || (req.headers.get("x-admin-key") ?? params.get("key") ?? "").trim() !== key) {
    return NextResponse.json({ ok: false, problem: "Wrong or missing ?key= (use your ADMIN_KEY)." }, { status: 401 });
  }

  const day = params.get("day");
  const targets = day
    ? [{ day, question: QUESTIONS.find((q) => q.id === params.get("questionId")) ?? questionOn(day) }]
    : getSchedule().open.length
      ? getSchedule().open
      : [{ day: getToday().day, question: questionOn(getToday().day) }];

  const store = getStore();
  const boards = [];
  for (const t of targets) {
    const keys = gameKeys(t.day, t.question.id);
    const before = Object.keys(await groupsWithAnswers(store, keys));
    const result = await consolidate(store, keys, t.question);
    const after = await groupsWithAnswers(store, keys);
    boards.push({
      day: t.day,
      question: t.question.prompt,
      ok: !result.error,
      ...(result.error ? { problem: result.error } : {}),
      merged: result.merges,
      groupsBefore: before.length,
      groupsAfter: Object.keys(after).length,
      board: after,
    });
  }
  const ok = boards.every((b) => b.ok);
  return NextResponse.json(boards.length === 1 ? boards[0] : { ok, boards }, { status: ok ? 200 : 502 });
}
