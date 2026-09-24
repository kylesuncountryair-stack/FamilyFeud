import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";
import { isFinished } from "@/lib/schedule";
import { listPastDays } from "@/lib/history";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const days = await listPastDays(getStore(), getToday().day);
  // Hide open boards (e.g. the weekend ones on catch-up day) and, in event mode, test days
  return NextResponse.json({ days: days.filter((d) => d.players > 0 && isFinished(d.day)) });
}
