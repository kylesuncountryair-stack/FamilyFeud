import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** Which questions are open right now (one normally; Saturday + Sunday on catch-up day). */
export async function GET() {
  const s = getSchedule();
  const open = s.open.map((g) => ({ day: g.day, questionId: g.question.id, prompt: g.question.prompt, label: g.label }));
  return NextResponse.json({
    status: s.status,
    today: s.today,
    event: s.event,
    open,
    // kept for older clients: the first open question
    ...(open[0] ?? {}),
  });
}
