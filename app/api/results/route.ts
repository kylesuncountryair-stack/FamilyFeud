import { NextResponse } from "next/server";
import { buildResults, gameKeys } from "@/lib/game";
import { findOpenGame } from "@/lib/schedule";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Live board for an open question: /api/results?day=&questionId=&email= */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const game = findOpenGame(p.get("day"), p.get("questionId"));
  if (!game) return NextResponse.json({ error: "That question isn't open right now." }, { status: 404 });
  const results = await buildResults(getStore(), gameKeys(game.day, game.question.id), p.get("email") ?? undefined);
  return NextResponse.json({ day: game.day, questionId: game.question.id, ...results });
}
