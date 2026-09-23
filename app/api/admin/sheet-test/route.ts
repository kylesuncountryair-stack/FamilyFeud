import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";
import { logPlayToSheet } from "@/lib/sheets";

export const dynamic = "force-dynamic";

/**
 * Sends a test row to the Google Sheet and reports exactly what happened.
 * Open in a browser: /api/admin/sheet-test?key=YOUR_ADMIN_KEY
 */
export async function GET(req: Request) {
  const key = process.env.ADMIN_KEY;
  const given = req.headers.get("x-admin-key") ?? new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ ok: false, problem: "ADMIN_KEY is not set in Vercel." }, { status: 401 });
  if (given !== key) return NextResponse.json({ ok: false, problem: "Wrong or missing ?key=" }, { status: 401 });

  const { day, question } = getToday();
  const result = await logPlayToSheet({
    timestamp: new Date().toISOString(),
    day,
    email: "test.row@suncountry.com",
    firstName: "Test",
    question: `[TEST] ${question.prompt}`,
    answers: [
      { raw: "test 1", category: "Test" },
      { raw: "test 2", category: "Test" },
      { raw: "test 3", category: "Test" },
    ],
  });

  return NextResponse.json(
    result.ok ? { ok: true, message: "Test row sent. Check the Plays tab in your sheet." } : result,
    { status: result.ok ? 200 : 502 }
  );
}
