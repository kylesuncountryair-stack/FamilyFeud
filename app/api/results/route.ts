import { NextResponse } from "next/server";
import { buildResults, gameKeys, getToday } from "@/lib/game";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? undefined;
  const { day, question } = getToday();
  const results = await buildResults(getStore(), gameKeys(day, question.id), name);
  return NextResponse.json({ day, questionId: question.id, ...results });
}
