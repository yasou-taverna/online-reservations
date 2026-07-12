const SHEET_NAME = "Reservations";
const RECEIPTS_FOLDER_ID = "";

const HEADERS = [
  "id",
  "customerName",
  "phone",
  "date",
  "time",
  "guests",
  "tableId",
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
  const action = String(e.parameter.action || "");
  const callback = e.parameter.callback;
  const payload = handleAction(action, e.parameter || {});
  const json = JSON.stringify(payload);

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
  const action = String(e.parameter.action || "");
  const body = parseBody(e);
  const payload = handleAction(action, body);

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, payload) {
  setupSheets();

  switch (action) {
    case "getReservations":
      return { ok: true, reservations: getReservations() };
    case "createPublicReservation":
    case "addReservation":
      return { ok: true, reservation: upsertReservation(normalizeReservation(payload, action)) };
    case "cancelReservation":
      return { ok: true, reservation: updateReservation(payload.id, { status: "cancelled" }) };
    case "updatereservationstatus":
    case "updateReservationStatus":
      return {
        ok: true,
        reservation: updateReservation(payload.id, {
          status: payload.status || "reserved",
          tableId: payload.tableId || "",
          zone: payload.zone || ""
        })
      };
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

function setupSheets() {
  const sheet = getSheet();
  const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADERS.length)).getValues()[0];
  const hasHeaders = HEADERS.every((header, index) => currentHeaders[index] === header);

  if (!hasHeaders) {
    migrateHeaders(sheet, currentHeaders);
  }
}

function migrateHeaders(sheet, currentHeaders) {
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const existingHeaders = currentHeaders.filter(Boolean);

  if (lastRow < 2 || existingHeaders.length === 0) {
    sheet.clear();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const oldRows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const nextRows = oldRows.map((row) =>
    HEADERS.map((header) => {
      const oldIndex = currentHeaders.indexOf(header);
      return oldIndex >= 0 ? row[oldIndex] : "";
    })
  );

  sheet.clear();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (nextRows.length) {
    sheet.getRange(2, 1, nextRows.length, HEADERS.length).setValues(nextRows);
  }
  sheet.setFrozenRows(1);
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function getReservations() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .filter((row) => row.some(Boolean))
    .map(rowToReservation);
}

function upsertReservation(reservation) {
  const sheet = getSheet();
  const rows = getRowsWithIndex();
  const existing = rows.find((item) => item.reservation.id === reservation.id);
  const rowValues = HEADERS.map((key) => reservation[key] || "");

  if (existing) {
    sheet.getRange(existing.rowNumber, 1, 1, HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return reservation;
}

function updateReservation(id, patch) {
  const sheet = getSheet();
  const rows = getRowsWithIndex();
  const existing = rows.find((item) => item.reservation.id === String(id));
  if (!existing) return null;

  const reservation = {
    ...existing.reservation,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  sheet
    .getRange(existing.rowNumber, 1, 1, HEADERS.length)
    .setValues([HEADERS.map((key) => reservation[key] || "")]);

  return reservation;
}

function getRowsWithIndex() {
  return getReservations().map((reservation, index) => ({
    reservation,
    rowNumber: index + 2
  }));
}

function normalizeReservation(payload, action) {
  const now = new Date().toISOString();
  const receiptUrl = payload.receipt ? saveReceipt(payload.receipt, payload.id) : payload.receiptUrl || "";

  return {
    id: String(payload.id || Utilities.getUuid()),
    customerName: String(payload.customerName || "").trim(),
    phone: String(payload.phone || "").trim(),
    date: String(payload.date || ""),
    time: String(payload.time || ""),
    guests: Number(payload.guests) || "",
    tableId: payload.tableId || "",
    status: payload.status || (action === "createPublicReservation" ? "pending_public" : "reserved"),
    notes: String(payload.notes || ""),
    createdAt: payload.createdAt || now,
    updatedAt: now,
    zone: payload.zone || zoneForTime(payload.time),
    reservationType: payload.reservationType || "private",
    depositAmount: Number(payload.depositAmount) || "",
    receiptUrl,
    agree: payload.agree === true || payload.agree === "true" ? "TRUE" : "",
    source: payload.source || (action === "createPublicReservation" ? "public_site" : "dashboard")
  };
}

function saveReceipt(receipt, reservationId) {
  if (!RECEIPTS_FOLDER_ID || !receipt.dataUrl) return "";

  const folder = DriveApp.getFolderById(RECEIPTS_FOLDER_ID);
  const parts = String(receipt.dataUrl).split(",");
  const meta = parts[0] || "";
  const data = parts[1] || "";
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : receipt.mimeType || "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const blob = Utilities.newBlob(
    Utilities.base64Decode(data),
    mimeType,
    `${reservationId || Utilities.getUuid()}-receipt.${extension}`
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function rowToReservation(row) {
  return HEADERS.reduce((reservation, key, index) => {
    reservation[key] = row[index];
    return reservation;
  }, {});
}

function parseBody(e) {
  try {
    return JSON.parse(e.postData.contents || "{}");
  } catch (error) {
    return {};
  }
}

function zoneForTime(time) {
  if (["20:00", "20:05", "20:10"].includes(String(time))) return "covered";
  if (["20:30", "20:35"].includes(String(time))) return "inside";
  return "outside";
}
