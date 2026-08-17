const SPREADSHEET_ID = "1w9nbyQOXoUEnOsOPQ0tejhet3xlhdMRRyZY58UT6XWA";
const SHEET_NAME = "Reservations";
const ARCHIVE_SHEET_PREFIX = "Archive ";

const REQUIRED_HEADERS = [
  "id",
  "customerName",
  "phone",
  "date",
  "time",
  "guests",
  "tableId",
  "tableIds",
  "status",
  "createdAt",
  "updatedAt",
  "zone",
  "reservationType",
  "depositAmount",
  "receiptUrl",
  "agree",
  "source",
  "notes"
];

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback;
  let json;

  try {
    const action = String((e && e.parameter && e.parameter.action) || "");
    json = JSON.stringify(handleAction(action, (e && e.parameter) || {}));
  } catch (error) {
    json = JSON.stringify({ ok: false, error: error.message || String(error) });
  }

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let payload;

  try {
    const body = parseBody(e);
    const action = String((e && e.parameter && e.parameter.action) || body.action || "");
    payload = handleAction(action, body);
  } catch (error) {
    payload = { ok: false, error: error.message || String(error) };
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, payload) {
  switch (String(action || "").toLowerCase()) {
    case "getreservations":
      return { ok: true, reservations: getReservations() };
    case "previewarchive":
      return previewArchive(payload);
    case "archiveoldreservations":
      return archiveOldReservations(payload);
    case "getarchivesummary":
      return getArchiveSummary();
    case "setupmonthlyarchive":
      return setupMonthlyArchiveTrigger();
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

function monthlyArchiveReservations() {
  return archiveOldReservations({});
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getMainSheet() {
  const spreadsheet = getSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function getReservations() {
  const sheet = getMainSheet();
  const headers = getHeaderRow(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues()
    .filter((row) => row.some(Boolean))
    .map((row) => rowToReservation(row, headers));
}

function previewArchive(payload) {
  const sheet = getMainSheet();
  const headers = getHeaderRow(sheet);
  const cutoffDate = getArchiveCutoffDate(payload && payload.cutoffDate);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { ok: true, cutoffDate, archived: 0, kept: 0, archiveSheets: [] };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const archiveSheets = {};
  let archived = 0;
  let kept = 0;

  values.forEach((row) => {
    const reservation = rowToReservation(row, headers);
    const reservationDate = normalizeDateValue(reservation.date);

    if (reservationDate && reservationDate < cutoffDate) {
      archiveSheets[ARCHIVE_SHEET_PREFIX + reservationDate.slice(0, 7)] = true;
      archived += 1;
    } else {
      kept += 1;
    }
  });

  return {
    ok: true,
    cutoffDate,
    archived,
    kept,
    archiveSheets: Object.keys(archiveSheets).sort()
  };
}

function archiveOldReservations(payload) {
  const sheet = getMainSheet();
  const headers = getHeaderRow(sheet);
  const cutoffDate = getArchiveCutoffDate(payload && payload.cutoffDate);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { ok: true, cutoffDate, archived: 0, kept: 0, archiveSheets: [] };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const archiveByMonth = {};
  const rowsToDelete = [];
  let kept = 0;

  values.forEach((row, index) => {
    const reservation = rowToReservation(row, headers);
    const reservationDate = normalizeDateValue(reservation.date);

    if (reservationDate && reservationDate < cutoffDate) {
      const sheetName = ARCHIVE_SHEET_PREFIX + reservationDate.slice(0, 7);
      if (!archiveByMonth[sheetName]) archiveByMonth[sheetName] = [];
      archiveByMonth[sheetName].push(row);
      rowsToDelete.push(index + 2);
    } else {
      kept += 1;
    }
  });

  Object.keys(archiveByMonth).forEach((sheetName) => {
    appendArchiveRows(sheetName, headers, archiveByMonth[sheetName]);
  });

  rowsToDelete
    .sort((a, b) => b - a)
    .forEach((rowNumber) => sheet.deleteRow(rowNumber));

  return {
    ok: true,
    cutoffDate,
    archived: rowsToDelete.length,
    kept,
    archiveSheets: Object.keys(archiveByMonth).sort()
  };
}

function getArchiveSummary() {
  const spreadsheet = getSpreadsheet();
  const mainSheet = getMainSheet();
  getHeaderRow(mainSheet);
  const activeCount = Math.max(mainSheet.getLastRow() - 1, 0);
  const archiveSheets = spreadsheet
    .getSheets()
    .filter((sheet) => sheet.getName().indexOf(ARCHIVE_SHEET_PREFIX) === 0)
    .map((sheet) => ({
      name: sheet.getName(),
      rows: Math.max(sheet.getLastRow() - 1, 0)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    activeCount,
    totalArchived: archiveSheets.reduce((sum, sheet) => sum + sheet.rows, 0),
    archiveSheets,
    nextCutoffDate: getArchiveCutoffDate()
  };
}

function setupMonthlyArchiveTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "monthlyArchiveReservations")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("monthlyArchiveReservations")
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();

  return { ok: true, message: "Monthly archive trigger created" };
}

function appendArchiveRows(sheetName, headers, rows) {
  if (!rows.length) return;

  const spreadsheet = getSpreadsheet();
  let archiveSheet = spreadsheet.getSheetByName(sheetName);

  if (!archiveSheet) {
    archiveSheet = spreadsheet.insertSheet(sheetName);
    archiveSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    archiveSheet.setFrozenRows(1);
  }

  const existingIds = getArchiveIds(archiveSheet, headers);
  const idIndex = headers.indexOf("id");
  const uniqueRows = rows.filter((row) => {
    const id = String(row[idIndex] || "");
    return !id || !existingIds[id];
  });

  if (!uniqueRows.length) return;

  archiveSheet
    .getRange(archiveSheet.getLastRow() + 1, 1, uniqueRows.length, headers.length)
    .setValues(uniqueRows);
}

function getArchiveIds(sheet, headers) {
  const lastRow = sheet.getLastRow();
  const idIndex = headers.indexOf("id") + 1;
  const ids = {};

  if (lastRow < 2 || idIndex < 1) return ids;

  sheet
    .getRange(2, idIndex, lastRow - 1, 1)
    .getValues()
    .flat()
    .forEach((id) => {
      if (id) ids[String(id)] = true;
    });

  return ids;
}

function getArchiveCutoffDate(value) {
  if (value) {
    const normalized = normalizeDateValue(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }

  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM") + "-01";
}

function rowToReservation(row, headers) {
  return headers.reduce((reservation, key, index) => {
    reservation[key] = row[index];
    return reservation;
  }, {});
}

function normalizeDateValue(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function parseBody(e) {
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return {};
  }
}

function getHeaderRow(sheet) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length))
    .getValues()[0]
    .map((header) => String(header || "").trim())
    .filter(Boolean);
  const missingHeaders = ["date", "id"].filter((header) => currentHeaders.indexOf(header) === -1);

  if (missingHeaders.length) {
    throw new Error(`Missing required header(s): ${missingHeaders.join(", ")}. No changes were made.`);
  }

  return currentHeaders;
}
