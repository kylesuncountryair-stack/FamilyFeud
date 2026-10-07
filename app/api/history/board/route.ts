import { NextResponse } from "next/server";
import { buildResults, gameKeys, playerKey } from "@/lib/game";
import { boardAccess } from "@/lib/schedule";
import { lookupPrompt } from "@/lib/history";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A finished day's final board: /api/history/board?day=YYYY-MM-DD&questionId=...&email=... */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const day = p.get("day") ?? "";
  const questionId = p.get("questionId") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[a-z0-9-]{1,80}$/i.test(questionId)) {
    return NextResponse.json({ error: "Unknown board." }, { status: 400 });
  }
  const store = getStore();
  const email = p.get("email");
  const played = email ? !!(await store.hget(gameKeys(day, questionId).subs, playerKey(email))) : false;
  const access = boardAccess(day, played);
  if (access === "locked") {
    return NextResponse.json({ error: "Play this day first to see its board." }, { status: 403 });
  }
  if (access === "hidden") {
    return NextResponse.json({ error: "That board isn't finished yet." }, { status: 400 });
  }

  const [prompt, results] = await Promise.all([
    lookupPrompt(store, day, questionId),
    buildResults(store, gameKeys(day, questionId), p.get("email") ?? undefined),
  ]);
  return NextResponse.json({ day, questionId, prompt, ...results });
}
