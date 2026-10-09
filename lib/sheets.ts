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

export type SheetResult = {
  ok: boolean;
  problem?: string;
  status?: number;
  response?: string;
  wroteTo?: { spreadsheet: string; url: string; tab: string; row: number };
};

/**
 * Apps Script answers a POST with a redirect. Browsers and fetch turn a
 * redirected POST into a GET, which is fine when Google redirects to its
 * result page (googleusercontent.com), but on some Google Workspace accounts
 * it first redirects to another /exec URL, and turning that into a GET runs
 * doGet instead of saving the row. So we follow redirects by hand.
 */
export async function postToAppsScript(url: string, payload: string) {
  let target = url;
  let method: "POST" | "GET" = "POST";
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(target, {
      method,
      headers: method === "POST" ? { "content-type": "application/json" } : undefined,
      body: method === "POST" ? payload : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      target = new URL(location, target).toString();
      // Google's result page is read with GET; another script URL still needs the POST
      method = /googleusercontent\.com/.test(target) ? "GET" : method;
      continue;
    }
    return { status: res.status, text: await res.text() };
  }
  throw new Error("Too many redirects from Google.");
}

export async function logPlayToSheet(row: PlayRow): Promise<SheetResult> {
  const url = process.env.SHEETS_WEBHOOK_URL?.trim();
  if (!url) return fail("SHEETS_WEBHOOK_URL is not set in Vercel (or the app wasn't redeployed after adding it).");
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    return fail(`SHEETS_WEBHOOK_URL should look like https://script.google.com/macros/s/.../exec but is "${url}".`);
  }
  if (!process.env.SHEETS_WEBHOOK_SECRET) return fail("SHEETS_WEBHOOK_SECRET is not set in Vercel.");

  try {
    const { status, text } = await postToAppsScript(
      url,
      JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET.trim(), ...row })
    );
    const response = text.slice(0, 300);

    let body: {
      ok?: boolean;
      logged?: boolean;
      get?: boolean;
      error?: string;
      spreadsheet?: string;
      url?: string;
      tab?: string;
      row?: number;
    } | null = null;
    try {
      body = JSON.parse(text);
    } catch {}

    if (body?.ok && body.logged) {
      return {
        ok: true,
        status,
        wroteTo: { spreadsheet: body.spreadsheet ?? "?", url: body.url ?? "", tab: body.tab ?? "?", row: body.row ?? 0 },
      };
    }
    // The script's "is it running?" check answered instead of saving the row
    if (body?.ok && (body.get || /logger is running/i.test(text))) {
      return fail(
        "Google ran the script's 'is it running?' check instead of saving the row. Send the exact format of your web app URL (script.google.com/macros/s/... or script.google.com/a/macros/...) so this can be fixed.",
        status,
        response
      );
    }
    // Older Code.gs versions answer a plain {"ok":true} without saying where the row went
    if (body?.ok) return { ok: true, status };
    if (body?.error === "bad secret") {
      return fail("The secret doesn't match. SECRET in Code.gs and SHEETS_WEBHOOK_SECRET in Vercel must be identical.", status, response);
    }
    if (body?.error) return fail(`The Apps Script ran but hit an error: ${body.error}`, status, response);
    if (/accounts\.google\.com|ServiceLogin|<html/i.test(text)) {
      return fail(
        "Google returned a sign-in page instead of running the script. In Apps Script, set the deployment's 'Who has access' to 'Anyone' (your Google Workspace admin may need to allow this), then use the new /exec URL.",
        status,
        response
      );
    }
    return fail(`Unexpected response from Google (HTTP ${status}).`, status, response);
  } catch (err) {
    return fail(`Couldn't reach Google: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function fail(problem: string, status?: number, response?: string): SheetResult {
  console.error("[survey-says] Sheet logging failed:", problem, response ?? "");
  return { ok: false, problem, status, response };
}

export type SheetPlay = { day: string; email: string; answers: { raw: string; category: string }[] };

/** "2026-10-05", or "10/5/2026" if the sheet shows dates US-style */
function toIsoDay(v: string) {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s;
}

/** Every play logged in the Google Sheet (needs the Code.gs version with the export action). */
export async function fetchSheetPlays(): Promise<{ ok: true; rows: SheetPlay[] } | { ok: false; problem: string }> {
  const url = process.env.SHEETS_WEBHOOK_URL?.trim();
  const secret = process.env.SHEETS_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return { ok: false, problem: "SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_SECRET aren't set in Vercel." };
  try {
    const { text } = await postToAppsScript(url, JSON.stringify({ secret, action: "export" }));
    let body: { ok?: boolean; export?: boolean; error?: string; rows?: SheetPlay[] } | null = null;
    try {
      body = JSON.parse(text);
    } catch {}
    if (body?.error === "bad secret") return { ok: false, problem: "The sheet password doesn't match SHEETS_WEBHOOK_SECRET." };
    if (!body?.export) {
      return {
        ok: false,
        problem:
          "The Google script doesn't support reading rows yet. Paste the latest Code.gs into Apps Script, keep your SECRET, then Deploy > Manage deployments > Edit > Version: New version > Deploy.",
      };
    }
    const rows = (body.rows ?? []).map((r) => ({
      day: toIsoDay(String(r.day ?? "")),
      email: String(r.email ?? "").trim().toLowerCase(),
      answers: (r.answers ?? []).map((a) => ({ raw: String(a.raw ?? ""), category: String(a.category ?? "").trim() })),
    }));
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, problem: `Couldn't read the sheet: ${err instanceof Error ? err.message : String(err)}` };
  }
}
