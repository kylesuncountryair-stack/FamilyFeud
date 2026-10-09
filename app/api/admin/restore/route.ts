import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { allPlayedDays } from "@/lib/adminDay";
import { consolidate } from "@/lib/consolidate";
import { gameKeys } from "@/lib/game";
import { restoreDayFromSheet } from "@/lib/restore";
import { questionOn } from "@/lib/schedule";
import { fetchSheetPlays } from "@/lib/sheets";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Restore days to the groups logged in the Google Sheet when each person played.
 *   Preview (changes nothing): /api/admin/restore?key=ADMIN_KEY&day=2026-10-05,2026-10-06
 *   Apply:                     ...&apply=1
 *   Apply, then merge obvious duplicates into existing groups: ...&apply=1&tidy=1
 * day can be one day, a comma-separated list, or "all".
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const dayParam = (p.get("day") ?? "").trim();
  const apply = p.get("apply") === "1";
  const tidy = p.get("tidy") === "1";
  if (!dayParam) {
    return NextResponse.json(
      { ok: false, problem: "Add &day=2026-10-05 (or several separated by commas, or all)." },
      { status: 400 }
    );
  }
  const days = dayParam === "all" ? await allPlayedDays() : dayParam.split(",").map((d) => d.trim());
  if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return NextResponse.json({ ok: false, problem: "Days must look like 2026-10-05." }, { status: 400 });
  }

  const sheet = await fetchSheetPlays();
  if (!sheet.ok) return NextResponse.json({ ok: false, problem: sheet.problem }, { status: 502 });

  const store = getStore();
  const out = [];
  for (const day of days) {
    const question = questionOn(day);
    const keys = gameKeys(day, question.id);
    const r = await restoreDayFromSheet(store, keys, sheet.rows.filter((x) => x.day === day), apply);
    let tidied: Record<string, string> | undefined;
    if (apply && tidy) tidied = (await consolidate(store, keys, question)).merges;
    out.push({ day, question: question.prompt, ...r, ...(tidied ? { tidiedAfterwards: tidied } : {}) });
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? "APPLIED" : "PREVIEW ONLY: nothing was changed. Add &apply=1 to the link to restore.",
    sheetRowsFound: sheet.rows.length,
    days: out,
  });
}
