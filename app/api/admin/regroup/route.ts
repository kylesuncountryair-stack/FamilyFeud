import { NextResponse } from "next/server";
import { consolidate, groupsWithAnswers } from "@/lib/consolidate";
import { gameKeys, getToday } from "@/lib/game";
import { QUESTIONS } from "@/lib/questions";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Tidies today's board: Claude looks at every group at once and merges the
 * ones that mean the same thing. Open in a browser:
 *   /api/admin/regroup?key=YOUR_ADMIN_KEY
 * Add &day=2026-09-24&questionId=forget-to-pack to fix another day.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = process.env.ADMIN_KEY?.trim();
  if (!key || (req.headers.get("x-admin-key") ?? params.get("key") ?? "").trim() !== key) {
    return NextResponse.json({ ok: false, problem: "Wrong or missing ?key= (use your ADMIN_KEY)." }, { status: 401 });
  }

  const today = getToday();
  const day = params.get("day") ?? today.day;
  const question = QUESTIONS.find((q) => q.id === params.get("questionId")) ?? today.question;
  const store = getStore();
  const keys = gameKeys(day, question.id);

  const before = Object.keys(await groupsWithAnswers(store, keys));
  const result = await consolidate(store, keys, question);
  const after = await groupsWithAnswers(store, keys);

  return NextResponse.json(
    {
      ok: !result.error,
      question: question.prompt,
      day,
      ...(result.error ? { problem: result.error } : {}),
      merged: result.merges,
      groupsBefore: before.length,
      groupsAfter: Object.keys(after).length,
      board: after,
    },
    { status: result.error ? 502 : 200 }
  );
}
