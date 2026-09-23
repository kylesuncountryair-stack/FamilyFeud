/**
 * Sends one row per play to a Google Sheet via a Google Apps Script web app
 * (see google-apps-script/Code.gs). Never throws: if the sheet is down or not
 * configured, the game keeps working.
 */
export type PlayRow = {
  timestamp: string;
  day: string;
  email: string;
  firstName: string;
  question: string;
  answers: { raw: string; category: string }[];
};

export type SheetResult = { ok: boolean; problem?: string; status?: number; response?: string };

export async function logPlayToSheet(row: PlayRow): Promise<SheetResult> {
  const url = process.env.SHEETS_WEBHOOK_URL?.trim();
  if (!url) return fail("SHEETS_WEBHOOK_URL is not set in Vercel (or the app wasn't redeployed after adding it).");
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    return fail(`SHEETS_WEBHOOK_URL should look like https://script.google.com/macros/s/.../exec but is "${url}".`);
  }
  if (!process.env.SHEETS_WEBHOOK_SECRET) return fail("SHEETS_WEBHOOK_SECRET is not set in Vercel.");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET.trim(), ...row }),
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const response = text.slice(0, 300);

    let body: { ok?: boolean; error?: string } | null = null;
    try {
      body = JSON.parse(text);
    } catch {}

    if (body?.ok) return { ok: true, status: res.status };
    if (body?.error === "bad secret") {
      return fail("The secret doesn't match. SECRET in Code.gs and SHEETS_WEBHOOK_SECRET in Vercel must be identical.", res.status, response);
    }
    if (body?.error) return fail(`The Apps Script ran but hit an error: ${body.error}`, res.status, response);
    if (/accounts\.google\.com|ServiceLogin|<html/i.test(text)) {
      return fail(
        "Google returned a sign-in page instead of running the script. In Apps Script, set the deployment's 'Who has access' to 'Anyone' (your Google Workspace admin may need to allow this), then use the new /exec URL.",
        res.status,
        response
      );
    }
    return fail(`Unexpected response from Google (HTTP ${res.status}).`, res.status, response);
  } catch (err) {
    return fail(`Couldn't reach Google: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function fail(problem: string, status?: number, response?: string): SheetResult {
  console.error("[survey-says] Sheet logging failed:", problem, response ?? "");
  return { ok: false, problem, status, response };
}
