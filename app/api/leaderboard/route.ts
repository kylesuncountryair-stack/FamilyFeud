import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";
import { weeklyLeaderboard } from "@/lib/leaderboard";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** /api/leaderboard?week=0 (this week) or week=1 (last week), optional &email= to mark "you" */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const weeksBack = Math.min(Math.max(Number(p.get("week") ?? 0) || 0, 0), 12);
  const email = p.get("email") ?? undefined;
  const board = await weeklyLeaderboard(getStore(), getToday().day, weeksBack, email);
  // Only first name + last initial ever leave the server, never emails
  return NextResponse.json({ ...board, leaders: board.leaders.slice(0, 50) });
}
