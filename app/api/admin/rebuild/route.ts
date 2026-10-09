import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { allPlayedDays, dayFromRequest } from "@/lib/adminDay";
import { groupsWithAnswers } from "@/lib/consolidate";
import { gameKeys } from "@/lib/game";
import { rebuildDay } from "@/lib/rebuild";
import { questionOn } from "@/lib/schedule";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Regroup answers from scratch under the current grouping rules.
 *   /api/admin/rebuild?key=ADMIN_KEY&day=2026-10-09   one day
 *   /api/admin/rebuild?key=ADMIN_KEY&day=all          every day played so far
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });
  const dayParam = new URL(req.url).searchParams.get("day");
  let days: string[];
  if (dayParam === "all") days = await allPlayedDays();
  else {
    const t = dayFromRequest(req);
    if (!t) return NextResponse.json({ ok: false, problem: "day must look like 2026-10-09 or all" }, { status: 400 });
    days = [t.day];
  }

  const store = getStore();
  const results = [];
  for (const day of days) {
    const question = questionOn(day);
    const keys = gameKeys(day, question.id);
    const before = Object.keys(await groupsWithAnswers(store, keys)).length;
    const r = await rebuildDay(store, keys, question);
    const after = await groupsWithAnswers(store, keys);
    results.push({
      day,
      question: question.prompt,
      ...r,
      groupsBefore: before,
      groupsAfter: Object.keys(after).length,
      groups: Object.fromEntries(Object.entries(after).sort((a, b) => b[1].length - a[1].length)),
    });
  }
  const ok = results.every((r) => r.ok);
  return NextResponse.json(results.length === 1 ? results[0] : { ok, days: results }, { status: ok ? 200 : 502 });
}
