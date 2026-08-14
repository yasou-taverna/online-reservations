const SHEET_NAME = "Reservations";
const RECEIPTS_FOLDER_ID = "1eEBcYikjcnHa4p2DI3r0jYjOb-marAPD";
const BOOKING_START_TIME = "16:00";
const BOOKING_END_TIME = "23:59";
const SATURDAY_BOOKING_START_TIME = "21:00";
const SATURDAY_BOOKING_END_TIME = "23:59";
const EVENING_MANUAL_RELEASE_TIME = "20:00";
const EARLY_RESERVATION_DURATION_MINUTES = 120;
const RELEASED_STATUSES = ["cancelled", "released", "completed", "no_show", "בוטל", "שוחרר", "הושלם"];
const LOCK_WAIT_MS = 10000;
const FULLY_BOOKED_MESSAGE = "היום אנחנו כבר בתפוסה מלאה נא נסה תאריך אחר";

const HEADERS = [
  "customerName",
  "phone",
  "date",
  "time",
  "guests",
  "tableId",
  "tableIds",
  "zone",
  "status",
  "reservationType",
  "depositAmount",
  "receiptUrl",
  "agree",
  "notes",
  "source",
  "createdAt",
  "updatedAt",
  "id"
];

const TABLES = [
  { id: 1, seats: 4, zone: "inside" },
  { id: 2, seats: 4, zone: "inside" },
  { id: 3, seats: 4, zone: "inside" },
  { id: 4, seats: 4, zone: "inside" },
  { id: 5, seats: 4, zone: "inside" },
  { id: 6, seats: 4, zone: "inside" },
  { id: 7, seats: 6, zone: "inside" },
  { id: 8, seats: 2, zone: "inside" },
  { id: 9, seats: 4, zone: "inside" },
  { id: 10, seats: 4, zone: "inside" },
  { id: 11, seats: 4, zone: "inside" },
  { id: 12, seats: 4, zone: "inside" },
  { id: 13, seats: 4, zone: "inside" },
  { id: 14, seats: 4, zone: "inside" },
  { id: 15, seats: 2, zone: "inside" },
  { id: 16, seats: 2, zone: "inside" },
  { id: 17, seats: 2, zone: "inside" },
  { id: 18, seats: 6, zone: "covered" },
  { id: 19, seats: 10, zone: "covered" },
  { id: 20, seats: 6, zone: "covered" },
  { id: 21, seats: 8, zone: "covered" },
  { id: 22, seats: 12, zone: "covered" },
  { id: 23, seats: 12, zone: "covered" },
  { id: 24, seats: 8, zone: "covered" },
  { id: 25, seats: 6, zone: "outside" },
  { id: 26, seats: 6, zone: "outside" },
  { id: 27, seats: 6, zone: "outside" },
  { id: 28, seats: 6, zone: "outside" },
  { id: 29, seats: 6, zone: "outside" },
  { id: 30, seats: 6, zone: "outside" },
  { id: 31, seats: 6, zone: "outside" },
  { id: 32, seats: 6, zone: "outside" },
  { id: 33, seats: 6, zone: "outside" },
  { id: 34, seats: 6, zone: "outside" }
];

function doGet(e) {
  e = e || { parameter: {} };
  const action = String(e.parameter.action || "");
  const callback = e.parameter.callback;
  const payload = handleActionSafely(action, e.parameter || {});
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
  e = e || { parameter: {}, postData: { contents: "{}" } };
  const body = parseBody(e);
  const action = String(e.parameter.action || body.action || "");
  const payload = handleActionSafely(action, body);

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleActionSafely(action, payload) {
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(LOCK_WAIT_MS);

  if (!gotLock) {
    return { ok: false, error: "המערכת עמוסה כרגע, נסה שוב בעוד כמה שניות." };
  }

  try {
    return handleAction(action, payload);
  } catch (error) {
    return {
      ok: false,
      error: `שגיאה בשרת: ${error && error.message ? error.message : error}`
    };
  } finally {
    lock.releaseLock();
  }
}

function handleAction(action, payload) {
  setupSheets();

  switch (action) {
    case "adminLogin":
    case "adminlogin":
      return handleAdminLogin(payload);
    case "getReservations":
    case "getreservations":
      return { ok: true, reservations: getReservations() };
    case "backfillTableIds":
    case "backfilltableids":
      return backfillTableIds();
    case "checkAvailability":
    case "checkavailability":
      return checkPublicAvailability(payload);
    case "createPublicReservation":
    case "createpublicreservation":
    case "addReservation":
    case "addreservation":
      if (String(action).toLowerCase().startsWith("createpublic") || payload.source === "public_site") {
        const closedReason = closedSlotReason(payload.date, payload.time);
        if (closedReason) return { ok: false, error: closedReason };
        const availability = checkPublicAvailability(payload);
        if (!availability.ok) return availability;
      }
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
          tableIds: normalizeTableIds(payload.tableIds || payload.tableId).join("+"),
          zone: payload.zone || ""
        })
      };
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}

function handleAdminLogin(payload) {
  const username = String((payload && payload.username) || "").trim();
  const password = String((payload && payload.password) || "");

  if (!username || !password) {
    return { ok: false, error: "נא להזין שם משתמש וסיסמה" };
  }

  const props = PropertiesService.getScriptProperties();
  const validUsername = props.getProperty("ADMIN_USERNAME");
  const validPassword = props.getProperty("ADMIN_PASSWORD");

  if (!validUsername || !validPassword) {
    return {
      ok: false,
      error: "פרטי ההתחברות לא הוגדרו. יש להריץ פעם אחת את setAdminCredentials מתוך עורך ה-Apps Script."
    };
  }

  if (username !== validUsername || password !== validPassword) {
    return { ok: false, error: "שם המשתמש או הסיסמה שגויים" };
  }

  return { ok: true, token: Utilities.getUuid(), user: username };
}

// הרצה חד-פעמית: לשנות את הערכים כאן, לבחור את הפונקציה הזו מהתפריט
// הנפתח למעלה בעורך ה-Apps Script וללחוץ Run, ולאשר הרשאות אם מבקש.
// אחרי ההרצה, המשתמש/סיסמה נשמרים ב-Script Properties ואפשר להתחבר.
function setAdminCredentials() {
  const username = "admin"; // <-- לשנות לשם משתמש רצוי
  const password = "changeMe123"; // <-- לשנות לסיסמה רצויה
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_USERNAME: username,
    ADMIN_PASSWORD: password
  });
  Logger.log("Admin credentials saved: " + username);
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

  if (lastRow < 2) {
    sheet.clear();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const oldRows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const hasNamedHeaders = existingHeaders.length > 0;
  const nextRows = oldRows.map((row) =>
    HEADERS.map((header, index) => {
      if (hasNamedHeaders) {
        const oldIndex = currentHeaders.indexOf(header);
        return oldIndex >= 0 ? row[oldIndex] : "";
      }
      return row[index] !== undefined ? row[index] : "";
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

function backfillTableIds() {
  setupSheets();
  const sheet = getSheet();
  const rows = getRowsWithIndex();
  let updated = 0;

  rows.forEach((item) => {
    const reservation = item.reservation;
    if (reservation.tableId || String(reservation.status || "") === "cancelled") return;

    const zone = reservation.zone || zoneForTime(reservation.time);
    const tableIds = findAvailableTableIds({
      id: reservation.id,
      date: reservation.date,
      time: reservation.time,
      guests: reservation.guests,
      zone
    });
    const tableId = tableIds[0] || "";
    const assignedZone = zone || tableZoneForIds(tableIds) || "";

    if (!tableId) return;

    const nextReservation = {
      ...reservation,
      tableId,
      tableIds: tableIds.join("+"),
      zone: assignedZone,
      status: "reserved",
      updatedAt: new Date().toISOString()
    };

    sheet
      .getRange(item.rowNumber, 1, 1, HEADERS.length)
      .setValues([HEADERS.map((key) => nextReservation[key] || "")]);
    updated += 1;
  });

  return { ok: true, updated };
}

function getRowsWithIndex() {
  return getReservations().map((reservation, index) => ({
    reservation,
    rowNumber: index + 2
  }));
}

function checkPublicAvailability(payload) {
  const closedReason = closedSlotReason(payload.date, payload.time);
  if (closedReason) return { ok: false, error: closedReason };

  const tableIds = findAvailableTableIds({
    id: payload.id || "",
    date: payload.date,
    time: payload.time,
    guests: payload.guests,
    zone: ""
  });

  return tableIds.length
    ? { ok: true, tableIds: tableIds.join("+") }
    : { ok: false, error: FULLY_BOOKED_MESSAGE };
}

function normalizeReservation(payload, action) {
  const now = new Date().toISOString();
  const id = String(payload.id || Utilities.getUuid());
  const normalizedAction = String(action).toLowerCase();
  const isPublicReservation = normalizedAction === "createpublicreservation" || payload.source === "public_site";
  const receiptUrl = payload.receipt ? saveReceipt(payload.receipt, id) : payload.receiptUrl || "";
  const zone = payload.zone || "";
  const assignedTableIds = normalizeTableIds(payload.tableIds || payload.tableId);
  const autoTableIds = (
    !assignedTableIds.length && isPublicReservation
      ? findAvailableTableIds({
          id,
          date: payload.date,
          time: payload.time,
          guests: payload.guests,
          zone: ""
        })
      : []
  );
  const tableIds = assignedTableIds.length ? assignedTableIds : autoTableIds;
  const assignedTableId = tableIds[0] || "";
  const assignedZone = isPublicReservation ? tableZoneForIds(tableIds) || "" : zone || tableZoneForIds(tableIds) || "";
  const hasAssignedTable = tableIds.length > 0;
  const status = isPublicReservation
    ? (hasAssignedTable ? "reserved" : "pending_public")
    : (payload.status || "reserved");

  return {
    id,
    customerName: String(payload.customerName || "").trim(),
    phone: String(payload.phone || "").trim(),
    date: normalizeDateValue(payload.date),
    time: normalizeTimeValue(payload.time),
    guests: Number(payload.guests) || "",
    tableId: assignedTableId || "",
    tableIds: tableIds.join("+"),
    status,
    notes: String(payload.notes || ""),
    createdAt: payload.createdAt || now,
    updatedAt: now,
    zone: assignedZone,
    reservationType: payload.reservationType || "private",
    depositAmount: Number(payload.depositAmount) || "",
    receiptUrl,
    agree: payload.agree === true || payload.agree === "true" ? "TRUE" : "",
    source: payload.source || (isPublicReservation ? "public_site" : "dashboard")
  };
}

function findAvailableTableId(reservation) {
  return findAvailableTableIds(reservation)[0] || "";
}

function findAvailableTableIds(reservation) {
  const guests = Number(reservation.guests) || 1;
  const zone = String(reservation.zone || "");
  const candidateTables = TABLES
    .filter((table) => !zone || table.zone === zone)
    .filter((table) => isTableAvailable(table.id, reservation));

  const singleTable = candidateTables
    .filter((table) => table.seats >= guests)
    .sort((a, b) => a.seats - b.seats || a.id - b.id)[0];

  if (singleTable) return [singleTable.id];

  const pair = findAvailableTablePair(candidateTables, guests);
  return pair ? pair.map((table) => table.id) : [];
}

function findAvailableTablePair(candidateTables, guests) {
  const pairs = [];

  candidateTables.forEach((first, firstIndex) => {
    candidateTables.slice(firstIndex + 1).forEach((second) => {
      if (first.zone !== second.zone) return;
      const totalSeats = first.seats + second.seats;
      if (totalSeats < guests) return;
      pairs.push([first, second]);
    });
  });

  pairs.sort((a, b) => {
    const seatsA = a[0].seats + a[1].seats;
    const seatsB = b[0].seats + b[1].seats;
    return seatsA - seatsB || Math.max(a[0].seats, a[1].seats) - Math.max(b[0].seats, b[1].seats) || a[0].id - b[0].id;
  });

  return pairs[0] || null;
}

function isTableAvailable(tableId, reservation) {
  const date = normalizeDateValue(reservation.date);
  const existing = getReservations();

  return !existing.some((item) =>
    String(item.id || "") !== String(reservation.id || "") &&
    normalizeDateValue(item.date) === date &&
    !isReleasedReservation(item) &&
    normalizeTableIds(item.tableIds || item.tableId).indexOf(Number(tableId)) >= 0 &&
    reservationTimesOverlap(reservation, item)
  );
}

function tableZoneForIds(tableIds) {
  const table = TABLES.find((item) => tableIds.indexOf(item.id) >= 0);
  return table ? table.zone : "";
}

function isReleasedReservation(reservation) {
  return RELEASED_STATUSES.indexOf(String(reservation.status || "").toLowerCase()) >= 0;
}

function reservationTimesOverlap(nextReservation, existingReservation) {
  const nextStart = timeToMinutes(nextReservation.time);
  const existingStart = timeToMinutes(existingReservation.time);
  if (nextStart === null || existingStart === null) return true;

  const nextEnd = reservationEndMinutes(nextReservation);
  const existingEnd = reservationEndMinutes(existingReservation);
  return nextStart < existingEnd && existingStart < nextEnd;
}

function reservationEndMinutes(reservation) {
  const start = timeToMinutes(reservation.time);
  if (start === null) return 24 * 60;
  return start < timeToMinutes(EVENING_MANUAL_RELEASE_TIME)
    ? start + EARLY_RESERVATION_DURATION_MINUTES
    : 24 * 60;
}

function timeToMinutes(value) {
  const time = normalizeTimeValue(value);
  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeTableIds(value) {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Boolean);
  }
  return String(value || "")
    .split(/[+,\s]+/)
    .map(Number)
    .filter(Boolean);
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

function normalizeTimeValue(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  const text = String(value);
  const isoTime = text.match(/T(\d{2}):(\d{2})/);
  if (isoTime) return `${isoTime[1]}:${isoTime[2]}`;
  const plainTime = text.match(/^\d{1,2}:\d{2}/);
  return plainTime ? plainTime[0].padStart(5, "0") : text;
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
  const reservation = HEADERS.reduce((reservation, key, index) => {
    reservation[key] = row[index];
    return reservation;
  }, {});
  reservation.date = normalizeDateValue(reservation.date);
  reservation.time = normalizeTimeValue(reservation.time);
  return reservation;
}

function parseBody(e) {
  try {
    return JSON.parse(e.postData.contents || "{}");
  } catch (error) {
    return {};
  }
}

function zoneForTime(time) {
  return "";
}

function closedSlotReason(dateValue, timeValue) {
  const date = normalizeDateValue(dateValue);
  const time = normalizeTimeValue(timeValue);
  if (!date || !time) return null;

  const day = new Date(`${date}T12:00:00`).getDay();
  if (day === 5) return "המסעדה סגורה בימי שישי.";

  if (day === 6) {
    if (time < SATURDAY_BOOKING_START_TIME) return "במוצאי שבת המסעדה נפתחת מהשעה 21:00.";
    if (time > SATURDAY_BOOKING_END_TIME) return "אפשר להזמין במוצאי שבת עד חצות.";
    return null;
  }

  if (time < BOOKING_START_TIME) return "אפשר להזמין שולחן החל מהשעה 16:00.";
  if (time > BOOKING_END_TIME) return "אפשר להזמין שולחן דרך האתר עד חצות.";
  return null;
}
