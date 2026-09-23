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
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Open the /exec URL in a browser to check the deployment is reachable. */
function doGet() {
  return json({ ok: true, message: "Survey Says logger is running. Rows arrive via POST from the game." });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
