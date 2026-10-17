// =============================================================================
// SESSION MANAGEMENT & SUPABASE HELPER (session.js)
// =============================================================================

const SUPABASE_URL = "https://ominfwrmptjxjdxqqdts.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_r6GduVnOGpx1Dt4J0v6ncg_M2VYKcZf";

// Initialize Supabase Client
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Session Keys
const SESSION_KEY = "pos_active_session";

/**
 * Get current active session from localStorage or sessionStorage
 * @returns {Object|null} Session data object or null
 */
function getSession() {
  const localData = localStorage.getItem(SESSION_KEY);
  if (localData) {
    try { return JSON.parse(localData); } catch (e) { localStorage.removeItem(SESSION_KEY); }
  }

  const sessionData = sessionStorage.getItem(SESSION_KEY);
  if (sessionData) {
    try { return JSON.parse(sessionData); } catch (e) { sessionStorage.removeItem(SESSION_KEY); }
  }

  return null;
}

/**
 * Get active branch_code for data scoping in sales, inventory, and audit
 * @returns {string|null} Current branch code (e.g., 'BR-101')
 */
function getBranchCode() {
  const session = getSession();
  return session ? session.branch_code : null;
}

/**
 * Save active employee session
 * @param {Object} sessionData Session metadata
 * @param {boolean} rememberMe If true, saves to localStorage; else sessionStorage
 */
function saveSession(sessionData, rememberMe = true) {
  // Clear any existing session first
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);

  const payload = JSON.stringify(sessionData);
  if (rememberMe) {
    localStorage.setItem(SESSION_KEY, payload);
  } else {
    sessionStorage.setItem(SESSION_KEY, payload);
  }
}

/**
 * Auto-login check on Login Page load
 * If session exists, automatically redirects to POS screen (pos.html)
 */
function checkAutoLogin() {
  const session = getSession();
  if (session && session.employee_id && session.branch_code) {
    console.log("Auto-login triggered for branch:", session.branch_code);
    window.location.href = "pos.html";
  }
}

/**
 * Protect routes: Requires authentication on pages like pos.html and register.html
 * @returns {Object} Active session
 */
function requireAuth() {
  const session = getSession();
  if (!session || !session.employee_id || !session.branch_code) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

/**
 * Logout employee: Clears session and redirects to login screen
 */
function logout() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}
