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

export async function logPlayToSheet(row: PlayRow) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: process.env.SHEETS_WEBHOOK_SECRET ?? "", ...row }),
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok || text.includes('"ok":false')) {
      console.error("[survey-says] Sheet logging failed", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[survey-says] Sheet logging failed", err);
  }
}
