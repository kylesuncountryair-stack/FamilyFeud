import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";
import { weeklyLeaderboard } from "@/lib/leaderboard";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** /api/leaderboard?email= — the event week (or the current week if GAME_START isn't set) */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const email = p.get("email") ?? undefined;
  const board = await weeklyLeaderboard(getStore(), getToday().day, 0, email);
  // Only first name + last initial ever leave the server, never emails
  return NextResponse.json({ ...board, leaders: board.leaders.slice(0, 50) });
}
