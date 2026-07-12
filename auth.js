// חשוב: כתובת זהה לזו שמוגדרת ב-SHEETS_URL בתוך index.html
// וב-appsScriptUrl בתוך booking.html - כולן חייבות להצביע לאותו Web app.
const API_URL =
  'https://script.google.com/macros/s/AKfycbzWGqTeUrCj32kuvpAdwLkWnalFXSD19avA7n9wauLGhTHJdTRN7ErPsYi7DZs8mIrl/exec';

const TOKEN_KEY = 'yasouAdminToken';
const USER_KEY = 'yasouAdminUser';

/* ===========================
   Login Page
   =========================== */

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

if (sessionStorage.getItem(TOKEN_KEY)) {
  window.location.replace('index.html');
}

loginBtn?.addEventListener('click', login);

passwordInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    login();
  }
});

usernameInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    passwordInput?.focus();
  }
});

async function login() {
  const username = usernameInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  clearError();

  if (!username || !password) {
    showError('נא להזין שם משתמש וסיסמה');
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'adminLogin',
        username,
        password
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.ok || !result.token) {
      throw new Error(
        result.error || 'שם המשתמש או הסיסמה אינם נכונים'
      );
    }

    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(
      USER_KEY,
      result.user || username
    );

    window.location.replace('index.html');

  } catch (error) {
    console.error('Login error:', error);

    showError(
      error.message === 'Failed to fetch'
        ? 'לא ניתן להתחבר לשרת'
        : error.message || 'אירעה שגיאה בהתחברות'
    );
  } finally {
    setLoading(false);
  }
}

/* ===========================
   UI Helpers
   =========================== */

function setLoading(isLoading) {
  if (!loginBtn) return;

  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading
    ? 'מתחבר...'
    : 'כניסה';
}

function showError(message) {
  if (!loginError) return;
  loginError.textContent = message;
}

function clearError() {
  if (!loginError) return;
  loginError.textContent = '';
}
