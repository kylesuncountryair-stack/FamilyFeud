import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET() {
  const { day, question } = getToday();
  return NextResponse.json({ day, questionId: question.id, prompt: question.prompt });
}
