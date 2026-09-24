import { NextResponse } from "next/server";
import { gameKeys, getToday, type Submission } from "@/lib/game";
import { getSchedule, questionOn } from "@/lib/schedule";
import { mergeGroups } from "@/lib/consolidate";
import { getStore, parseJSON } from "@/lib/store";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const key = process.env.ADMIN_KEY?.trim();
  return !!key && req.headers.get("x-admin-key")?.trim() === key;
}

function resolveKeys(url: string) {
  const p = new URL(url).searchParams;
  const day = p.get("day");
  if (day) return gameKeys(day, p.get("questionId") ?? questionOn(day).id);
  const open = getSchedule().open[0];
  const today = getToday().day;
  return open ? gameKeys(open.day, open.question.id) : gameKeys(today, questionOn(today).id);
}

/** GET: every group with the raw answers that landed in it. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = resolveKeys(req.url);
  const subs = await getStore().hgetall(keys.subs);
  const groups: Record<string, string[]> = {};
  for (const v of Object.values(subs)) {
    const s = parseJSON<Submission>(v);
    s?.answers.forEach((a) => (groups[a.category] ??= []).push(a.raw));
  }
  return NextResponse.json({ players: Object.keys(subs).length, groups });
}

/** POST { from: "Shirts", to: "Clothes" } — merges one group into another. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const from = String(body?.from ?? "").trim();
  const to = String(body?.to ?? "").trim();
  if (!from || !to) return NextResponse.json({ error: "Send both 'from' and 'to'." }, { status: 400 });

  const moved = await mergeGroups(getStore(), resolveKeys(req.url), { [from]: to });
  return NextResponse.json({ ok: true, moved });
}
