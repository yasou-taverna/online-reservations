# Yasou Taverna Reservations

מערכת הזמנות למסעדה כשרה ברודוס:

- `index.html` - דשבורד הניהול של המסעדה, כ-SPA אחד.
- `booking.html` - דף הזמנות ללקוחות, כולל HTML/CSS/JS בקובץ אחד.
- `apps-script/Code.gs` - קוד שרת להדבקה ב-Google Apps Script.

עמודת `notes` נשמרת אחרונה בטבלה כדי לא להפריע לעבודה השוטפת, והיא תתמלא רק אם מוסיפים הערה מהדשבורד.

המבנה המומלץ ל-GitHub Pages:

```text
/
├── index.html
├── booking.html
├── assets/images/icon.ico
├── README.md
└── apps-script/
    └── Code.gs
```

## חיבור Google Sheets

1. פותחים Google Sheet חדש.
2. נכנסים ל-Extensions ואז Apps Script.
3. מדביקים את התוכן של `apps-script/Code.gs`.
4. מריצים פעם אחת את `setupSheets` ומאשרים הרשאות.
5. עושים Deploy כ-Web app.
6. מגדירים:
   - Execute as: Me
   - Who has access: Anyone
7. מעתיקים את כתובת ה-Web app אל:
   - `SHEETS_URL` בתוך `index.html`
   - `window.YASOU_CONFIG.appsScriptUrl` בתוך `booking.html`

## קבלות תשלום

אם רוצים לשמור צילום קבלה ב-Google Drive:

1. יוצרים תיקייה בדרייב.
2. מעתיקים את מזהה התיקייה מהכתובת.
3. מדביקים אותו בתוך `RECEIPTS_FOLDER_ID` בקובץ `apps-script/Code.gs`.

אם משאירים את `RECEIPTS_FOLDER_ID` ריק, ההזמנה תישמר בשיט בלי קישור לקבלה.

