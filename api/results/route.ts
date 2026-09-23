import { NextResponse } from "next/server";
import { buildResults, gameKeys, getToday } from "@/lib/game";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email") ?? undefined;
  const { day, question } = getToday();
  const results = await buildResults(getStore(), gameKeys(day, question.id), email);
  return NextResponse.json({ day, questionId: question.id, ...results });
}
