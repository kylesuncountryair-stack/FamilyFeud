import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { dayFromRequest } from "@/lib/adminDay";
import { groupsWithAnswers } from "@/lib/consolidate";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** View a day's groups and the answers in each: /api/admin/groups?key=ADMIN_KEY&day=2026-10-09 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });
  const t = dayFromRequest(req);
  if (!t) return NextResponse.json({ ok: false, problem: "day must look like 2026-10-09" }, { status: 400 });
  const groups = await groupsWithAnswers(getStore(), t.keys);
  const sorted = Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].length - a[1].length));
  return NextResponse.json({ day: t.day, question: t.question.prompt, groups: sorted });
}
