import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";
import { listPastDays } from "@/lib/history";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const days = await listPastDays(getStore(), getToday().day);
  return NextResponse.json({ days: days.filter((d) => d.players > 0) });
}
