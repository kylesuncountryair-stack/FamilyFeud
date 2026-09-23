import { NextResponse } from "next/server";
import { getToday } from "@/lib/game";
import { logPlayToSheet } from "@/lib/sheets";

export const dynamic = "force-dynamic";

/**
 * Sends a test row to the Google Sheet and reports exactly what happened.
 * Open in a browser: /api/admin/sheet-test?key=YOUR_ADMIN_KEY
 */
export async function GET(req: Request) {
  // Accept either ADMIN_KEY or SHEETS_WEBHOOK_SECRET, so the sheet can be tested on its own
  const keys = [process.env.ADMIN_KEY, process.env.SHEETS_WEBHOOK_SECRET].map((k) => k?.trim()).filter(Boolean);
  const given = (req.headers.get("x-admin-key") ?? new URL(req.url).searchParams.get("key") ?? "").trim();
  if (!keys.length) {
    return NextResponse.json(
      { ok: false, problem: "Neither ADMIN_KEY nor SHEETS_WEBHOOK_SECRET is visible to this deployment. Open /api/env-check." },
      { status: 401 }
    );
  }
  if (!keys.includes(given)) {
    return NextResponse.json({ ok: false, problem: "Wrong or missing ?key= (use ADMIN_KEY or SHEETS_WEBHOOK_SECRET)." }, { status: 401 });
  }

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
