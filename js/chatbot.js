/* ===========================================================
   chatbot.js — בוט שאלות נפוצות לטברנה יאסו רודוס
   דורש שיטענו לפניו את faq-data.js:

   <script src="faq-data.js"></script>
   <script src="chatbot.js"></script>
   =========================================================== */

(function () {

  const FAQ = (typeof YTB_FAQ !== "undefined") ? YTB_FAQ : [];
  const FALLBACK_ANSWER =
    "לא הצלחתי למצוא תשובה מדויקת לשאלה הזו 🙂 אפשר לנסח אחרת, או ליצור קשר ישירות דרך עמוד 'צור קשר'.";

  if (FAQ.length === 0) {
    console.warn("chatbot.js: לא נמצא מאגר שאלות (YTB_FAQ). ודא ש-faq-data.js נטען לפני chatbot.js");
  }

  /* ---------- עיצוב ---------- */
  const style = document.createElement("style");
  style.textContent = `
    #ytb-chat-btn {
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg,#0069a8,#003b66);
      color: #fff;
      border: none;
      font-size: 26px;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0,30,55,.35);
      z-index: 999;
    }
    #ytb-chat-window {
      position: fixed;
      bottom: 90px;
      left: 20px;
      width: 420px;
      max-width: calc(100vw - 40px);
      height: 480px;
      max-height: 72vh;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 10px 35px rgba(0,0,0,.25);
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      direction: rtl;
      z-index: 999;
    }
    #ytb-chat-window.open { display: flex; }
    #ytb-chat-header {
      background: linear-gradient(to bottom,#0069a8,#003b66);
      color: #fff;
      padding: 14px 16px;
      font-size: 16px;
      font-weight: bold;
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
    }
    #ytb-chat-close {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      cursor: pointer;
      font-size: 20px;
    }
    #ytb-chat-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      background: #f7f7f7;
    }
    .ytb-msg { margin-bottom: 10px; display: flex; align-items: flex-end; gap: 6px; }
    .ytb-msg.bot { justify-content: flex-start; flex-direction: row-reverse; }
    .ytb-msg.user { justify-content: flex-end; }
    .ytb-avatar {
      width: 26px;
      height: 26px;
      min-width: 26px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #fff;
      border: 1px solid #cfe2f3;
      object-fit: contain;
      display: block;
    }
    .ytb-bubble {
      max-width: 80%;
      padding: 9px 12px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.5;
    }
    .ytb-msg.bot .ytb-bubble { background: #eaf3fb; color: #222; border-bottom-left-radius: 4px; }
    .ytb-msg.user .ytb-bubble { background: #0069a8; color: #fff; border-bottom-right-radius: 4px; }

    /* שורת כפתורי הצעה - נגללת אופקית, לא תופסת גובה */
    #ytb-quick {
      display: flex;
      flex-wrap: nowrap;
      overflow-x: auto;
      gap: 6px;
      padding: 8px 10px;
      background: #fff;
      border-top: 1px solid #eee;
      flex-shrink: 0;
      max-height: 40px;
    }
    #ytb-quick::-webkit-scrollbar { height: 4px; }
    .ytb-chip {
      background: #eaf3fb;
      color: #003b66;
      border: 1px solid #cfe2f3;
      border-radius: 20px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    #ytb-chat-input-row {
      display: flex;
      border-top: 1px solid #eee;
      padding: 8px;
      gap: 6px;
      flex-shrink: 0;
    }
    #ytb-chat-input {
      flex: 1;
      border: 1px solid #ddd;
      border-radius: 20px;
      padding: 8px 14px;
      font-size: 14px;
      outline: none;
    }
    #ytb-chat-send {
      background: #0069a8;
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 38px;
      height: 38px;
      font-size: 16px;
      cursor: pointer;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);

  /* ---------- בניית ה-HTML ---------- */
  const btn = document.createElement("button");
  btn.id = "ytb-chat-btn";
  btn.setAttribute("aria-label", "פתח צ׳אט שאלות נפוצות");
  btn.textContent = "💬";
  document.body.appendChild(btn);

  const win = document.createElement("div");
  win.id = "ytb-chat-window";
  win.innerHTML = `
    <div id="ytb-chat-header">
      <span id="ytb-chat-close">×</span>
      <span>שאלות נפוצות – יאסו רודוס</span>
    </div>
    <div id="ytb-chat-body"></div>
    <div id="ytb-quick"></div>
    <div id="ytb-chat-input-row">
      <input id="ytb-chat-input" type="text" placeholder="הקלד שאלה...">
      <button id="ytb-chat-send">➤</button>
    </div>
  `;
  document.body.appendChild(win);

  const body = win.querySelector("#ytb-chat-body");
  const quick = win.querySelector("#ytb-quick");
  const input = win.querySelector("#ytb-chat-input");

  /* ---------- לוגיקה ---------- */

  // הופך כתובת URL בטקסט לקישור לחיץ שנפתח בכרטיסייה חדשה
  function linkify(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const urlRegex = /((https?:\/\/[^\s]+))/g;
    return escaped.replace(urlRegex, url =>
      `<a href="${url}" target="_blank" rel="noopener" style="color:#0069a8;text-decoration:underline;">קישור לעמוד</a>`
    );
  }

  function addMessage(text, from) {
    const row = document.createElement("div");
    row.className = "ytb-msg " + from;

    if (from === "bot") {
      const avatar = document.createElement("img");
      avatar.className = "ytb-avatar";
      avatar.src = "images/bot-icon.png";
      avatar.alt = "בוט";
      row.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "ytb-bubble";
    if (from === "bot") {
      // תשובות הבוט מגיעות מ-faq-data.js (קובץ שאתה שולט בו) - בטוח להפוך קישורים ל-HTML
      bubble.innerHTML = linkify(text);
    } else {
      // מה שהמשתמש מקליד נשאר תמיד טקסט רגיל, לביטחון
      bubble.textContent = text;
    }
    row.appendChild(bubble);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function findAnswer(text) {
    const clean = text.trim().toLowerCase();
    let best = null;
    let bestScore = 0;
    FAQ.forEach(item => {
      let score = 0;
      item.keywords.forEach(k => {
        if (clean.includes(k)) score++;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    return best ? best.answer : FALLBACK_ANSWER;
  }

  function handleSend(text) {
    if (!text.trim()) return;
    addMessage(text, "user");
    input.value = "";
    setTimeout(() => {
      addMessage(findAnswer(text), "bot");
    }, 300);
  }

  // כפתורי הצעה מהירים — רק פריטים עם quick:true
  // (כדי שרשימת שאלות ארוכה לא תמלא את המסך, כל השאר נגישים בהקלדה חופשית)
  FAQ.filter(item => item.quick).forEach(item => {
    const chip = document.createElement("button");
    chip.className = "ytb-chip";
    chip.textContent = item.question;
    chip.onclick = () => handleSend(item.question);
    quick.appendChild(chip);
  });

  win.querySelector("#ytb-chat-send").onclick = () => handleSend(input.value);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSend(input.value);
  });

  btn.onclick = () => {
    win.classList.toggle("open");
    if (win.classList.contains("open") && body.children.length === 0) {
      addMessage("שלום! 👋 איך אפשר לעזור? אפשר ללחוץ על אחת השאלות למטה, לגלול ימינה/שמאלה לעוד הצעות, או להקליד שאלה חופשית.", "bot");
    }
  };
  win.querySelector("#ytb-chat-close").onclick = () => win.classList.remove("open");

})();
 










