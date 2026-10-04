const AUTH_KEYS = Object.freeze({
  token: 'ecoloop_token',
  user: 'ecoloop_user',
  role: 'ecoloop_role'
});

let logoutInProgress = false;

// persistent=true  -> localStorage (survives browser restarts, 30d JWT).
// persistent=false -> sessionStorage only (tab-lifetime, 2h JWT).
// Called without the flag (session refresh paths), it re-saves into the
// store that already holds the token so a session-only login is never
// accidentally promoted to persistent storage.
function saveSession(token, user, persistent) {
  if (typeof persistent !== 'boolean') {
    persistent = Boolean(localStorage.getItem(AUTH_KEYS.token));
  }
  clearAuth();
  const store = persistent ? localStorage : sessionStorage;
  store.setItem(AUTH_KEYS.token, token);
  store.setItem(AUTH_KEYS.user, JSON.stringify(user));
  store.setItem(AUTH_KEYS.role, user.role || '');
  if (persistent) {
    sessionStorage.setItem(AUTH_KEYS.token, token);
    sessionStorage.setItem(AUTH_KEYS.user, JSON.stringify(user));
    sessionStorage.setItem(AUTH_KEYS.role, user.role || '');
  }
}

function getUser() {
  const raw = localStorage.getItem(AUTH_KEYS.user) || sessionStorage.getItem(AUTH_KEYS.user);
  return raw ? JSON.parse(raw) : null;
}

function getToken() {
  return localStorage.getItem(AUTH_KEYS.token) || sessionStorage.getItem(AUTH_KEYS.token);
}

function getCurrentUser() {
  return getUser();
}

function isAuthenticated() {
  return Boolean(getToken());
}

function clearAuth() {
  Object.values(AUTH_KEYS).forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function logout() {
  if (logoutInProgress) return;
  logoutInProgress = true;
  clearAuth();
  window.location.replace('/');
}

function redirectByRole(user) {
  if (user.role === 'admin') {
    // Admin Home is the authenticated admin view on / (stats + entry to
    // the Admin Dashboard), not admin.html itself.
    window.location.replace('/');
  } else if (user.role === 'collector') {
    window.location.replace('/collector.html');
  } else {
    window.location.replace('/');
  }
}

function loginPathForRole(expectedRole) {
  const roles = Array.isArray(expectedRole) ? expectedRole : [expectedRole];
  if (roles.includes('admin')) return '/admin-login.html';
  return '/login.html';
}

function redirectToLogin(expectedRole) {
  const path = loginPathForRole(expectedRole);
  if (window.location.pathname !== path) window.location.replace(path);
}

async function requireAuth(expectedRole, options = {}) {
  if (!getToken()) {
    clearAuth();
    redirectToLogin(expectedRole);
    return null;
  }

  try {
    const { user } = await API.me();
    saveSession(getToken(), user);
    const allowedRoles = Array.isArray(expectedRole) ? expectedRole : [expectedRole];
    const customerCompatible = allowedRoles.includes('resident') && ['resident', 'customer'].includes(user.role);
    if (expectedRole && !allowedRoles.includes(user.role) && !customerCompatible) {
      redirectByRole(user);
      return null;
    }
    return user;
  } catch (_err) {
    clearAuth();
    redirectToLogin(expectedRole);
    return null;
  }
}

function handleAuthFailure() {
  clearAuth();
  const path = window.location.pathname;
  if (path === '/admin.html') redirectToLogin('admin');
  else if (path === '/collector.html' || path === '/collector-pickups.html') redirectToLogin('collector');
  else if (['/dashboard.html', '/history.html', '/book-pickup.html', '/admin-collectors.html', '/admin-admins.html'].includes(path)) {
    if (path.startsWith('/admin-')) redirectToLogin('admin');
    else redirectToLogin('resident');
  }
}

// Public-page guard: an authenticated user must not stay on /, /index.html,
// /login.html, /register.html or /admin-login.html. Verifies the session
// with the server (never trusts local token presence alone) and sends the
// user to the logged-in landing page (/). 401/403 clears the stale session;
// network failures leave the local session untouched. Already-home pages
// stay put (no self-redirect loops). Redirects use replace().
async function redirectAuthenticatedUser() {
  const token = getToken();
  if (!token) return false;
  try {
    const { user } = await API.me();
    if (!user || !user.role) {
      clearAuth();
      return false;
    }
    const path = window.location.pathname;
    if (path === '/' || path === '/index.html') return true;
    window.location.replace('/');
    return true;
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) clearAuth();
    return false;
  }
}

let publicGuardInFlight = false;

async function runPublicGuard() {
  if (publicGuardInFlight) return;
  publicGuardInFlight = true;
  try {
    await redirectAuthenticatedUser();
  } finally {
    publicGuardInFlight = false;
  }
}

function guardPublicPage() {
  runPublicGuard();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) runPublicGuard();
  });
}

function installAuthGuard(expectedRole) {
  if (window.__ecoloopAuthGuard) return;
  window.__ecoloopAuthGuard = true;
  window.__ecoloopExpectedRole = expectedRole;
  window.addEventListener('pageshow', () => {
    requireAuth(expectedRole);
  });
  // Cross-tab logout: if another tab clears or replaces the session token,
  // revalidate this page instead of trusting stale rendered content.
  window.addEventListener('storage', (event) => {
    if (!event || event.key !== AUTH_KEYS.token) return;
    if (window.__ecoloopAuthGuard) {
      requireAuth(window.__ecoloopExpectedRole);
    }
  });
}

function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.className = `alert ${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
}

document.addEventListener('click', (event) => {
  const logoutControl = event.target.closest('[data-logout]');
  if (logoutControl) {
    event.preventDefault();
    logout();
  }
});
