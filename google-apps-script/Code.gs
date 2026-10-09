/**
 * Survey Says -> Google Sheets logger
 *
 * Setup (about 5 minutes):
 *  1. Open your Google Sheet. Extensions > Apps Script. Paste this whole file in.
 *  2. Change SECRET below to a long random string. Use the same value for
 *     SHEETS_WEBHOOK_SECRET in Vercel.
 *  3. Deploy > New deployment > type "Web app".
 *       Execute as: Me
 *       Who has access: Anyone
 *     Click Deploy, authorize, and copy the Web app URL (ends in /exec).
 *  4. In Vercel set SHEETS_WEBHOOK_URL to that URL, then redeploy.
 *
 * If you edit this script later, use Deploy > Manage deployments > Edit >
 * Version: New version, so the URL stays the same.
 */

const SECRET = "change-me-to-a-long-random-string";
const SHEET_NAME = "Plays";
// Only needed if you created this script at script.google.com instead of from
// the sheet's Extensions menu. Paste the ID from the sheet's URL:
// docs.google.com/spreadsheets/d/THIS_PART/edit
const SPREADSHEET_ID = "";
const HEADERS = [
  "Timestamp", "Game day", "Email", "First name", "Question",
  "Answer 1", "Group 1", "Answer 2", "Group 2", "Answer 3", "Group 3",
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return json({ ok: false, error: "bad secret" });
    if (data.action === "export") return exportRows();

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const ss = SPREADSHEET_ID
        ? SpreadsheetApp.openById(SPREADSHEET_ID)
        : SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) throw new Error("No spreadsheet found. Open the script from the sheet's Extensions menu, or set SPREADSHEET_ID.");
      let sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
      }
      const a = data.answers || [];
      const cells = [0, 1, 2].flatMap((i) => [a[i] ? a[i].raw : "", a[i] ? a[i].category : ""]);
      sheet.appendRow([
        new Date(data.timestamp), data.day, data.email, data.firstName, data.question, ...cells,
      ]);
      // Report exactly where the row went, so the game can confirm it
      return json({
        ok: true,
        logged: true,
        spreadsheet: ss.getName(),
        url: ss.getUrl(),
        tab: sheet.getName(),
        row: sheet.getLastRow(),
      });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * Sends every logged play back to the game (used by the admin restore tool to put
 * answers back in the groups they had when each person played).
 */
function exportRows() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return json({ ok: true, export: true, rows: [] });
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length);
  const values = range.getValues();
  const shown = range.getDisplayValues();
  const tz = ss.getSpreadsheetTimeZone();
  const rows = values.map((v, r) => {
    // Sheets may have turned "2026-10-05" into a date; send it back as text
    const day = v[1] instanceof Date ? Utilities.formatDate(v[1], tz, "yyyy-MM-dd") : String(shown[r][1]).trim();
    const d = shown[r];
    return {
      day: day,
      email: String(d[2]).trim().toLowerCase(),
      answers: [
        { raw: d[5], category: d[6] },
        { raw: d[7], category: d[8] },
        { raw: d[9], category: d[10] },
      ],
    };
  });
  return json({ ok: true, export: true, rows: rows });
}

/** Open the /exec URL in a browser to check the deployment is reachable. */
function doGet() {
  return json({ ok: true, get: true, message: "Survey Says logger is running. Rows arrive via POST from the game." });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
