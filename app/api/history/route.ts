import { NextResponse } from "next/server";
import { gameKeys, getToday, playerKey } from "@/lib/game";
import { boardAccess } from "@/lib/schedule";
import { listPastDays } from "@/lib/history";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Finished boards. Days a player can still catch up on stay locked until they've played them. */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email");
  const store = getStore();
  const days = (await listPastDays(store, getToday().day)).filter((d) => d.players > 0);

  const withAccess = await Promise.all(
    days.map(async (d) => {
      const played = email ? !!(await store.hget(gameKeys(d.day, d.questionId).subs, playerKey(email))) : false;
      return { ...d, access: boardAccess(d.day, played) };
    })
  );
  return NextResponse.json({
    days: withAccess
      .filter((d) => d.access !== "hidden")
      // never reveal a locked day's top answer
      .map((d) => (d.access === "locked" ? { ...d, top: null, locked: true } : { ...d, locked: false })),
  });
}
