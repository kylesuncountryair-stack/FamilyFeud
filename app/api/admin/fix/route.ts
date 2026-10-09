import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { allPlayedDays } from "@/lib/adminDay";
import { fixDay } from "@/lib/fixDay";
import { gameKeys, getToday } from "@/lib/game";
import { questionOn } from "@/lib/schedule";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Repair answers already on the board (keyword lists + capitalization twins).
 *   Preview: /api/admin/fix?key=ADMIN_KEY                (today)
 *            /api/admin/fix?key=ADMIN_KEY&day=all        (every day so far)
 *   Apply:   add &apply=1
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const dayParam = (p.get("day") ?? "").trim() || getToday().day;
  const apply = p.get("apply") === "1";
  const days = dayParam === "all" ? await allPlayedDays() : dayParam.split(",").map((d) => d.trim());
  if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return NextResponse.json({ ok: false, problem: "day must look like 2026-10-09, or all" }, { status: 400 });
  }
  const store = getStore();
  const out = [];
  for (const day of days) {
    const question = questionOn(day);
    out.push({ day, question: question.prompt, ...(await fixDay(store, gameKeys(day, question.id), question, apply)) });
  }
  return NextResponse.json({
    ok: true,
    mode: apply ? "APPLIED" : "PREVIEW ONLY: nothing was changed. Add &apply=1 to the link to fix.",
    days: out,
  });
}
