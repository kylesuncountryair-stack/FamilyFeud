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

  try {
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
    if (!result || typeof result !== "object") {
      return NextResponse.json(
        { ok: false, problem: "lib/sheets.ts in your repo is an older version. Replace it with the one from the latest zip." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      result.ok
        ? {
            ok: true,
            message: result.wroteTo
              ? `Saved to row ${result.wroteTo.row} of the "${result.wroteTo.tab}" tab in the spreadsheet "${result.wroteTo.spreadsheet}".`
              : "Test row sent. Check the Plays tab in your sheet.",
            openSheet: result.wroteTo?.url,
          }
        : result,
      { status: result.ok ? 200 : 502 }
    );
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const hint = /time ?zone/i.test(message)
      ? `GAME_TIMEZONE must be a name like America/Chicago or America/New_York (it is "${process.env.GAME_TIMEZONE}").`
      : undefined;
    return NextResponse.json({ ok: false, problem: "The test crashed.", error: message, hint }, { status: 500 });
  }
}
