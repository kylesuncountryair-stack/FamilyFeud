import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { dayFromRequest } from "@/lib/adminDay";
import { groupsWithAnswers } from "@/lib/consolidate";
import { moveAnswer } from "@/lib/rebuild";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Manually move an answer into a group (new or existing), e.g. pull "hotel" out of "Beach":
 *   /api/admin/move?key=ADMIN_KEY&day=2026-10-09&answer=hotel&to=Hotel
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const answer = (p.get("answer") ?? "").trim();
  const to = (p.get("to") ?? "").trim().slice(0, 40);
  if (!answer || !to) {
    return NextResponse.json({ ok: false, problem: "Add &answer=what+they+typed&to=Group+name" }, { status: 400 });
  }
  const t = dayFromRequest(req);
  if (!t) return NextResponse.json({ ok: false, problem: "day must look like 2026-10-09" }, { status: 400 });

  const store = getStore();
  const moved = await moveAnswer(store, t.keys, answer, to);
  const groups = await groupsWithAnswers(store, t.keys);
  return NextResponse.json({
    ok: true,
    day: t.day,
    moved,
    ...(moved === 0 ? { note: `No answers matching "${answer}" were found that day.` } : {}),
    groups: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].length - a[1].length)),
  });
}
