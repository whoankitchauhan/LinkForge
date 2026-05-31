'use strict';
/* ── LinkForge SPA — Core App ────────────────────────────────
   Routing, API client, toast notifications, shared state
   ──────────────────────────────────────────────────────────── */

// ── State ────────────────────────────────────────────────────
const state = {
  user: null,
  accessToken: null,
  currentPage: 'landing',
  currentUrlId: null,
};

// ── API Client ───────────────────────────────────────────────
const API_BASE = '/api';

async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && auth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${state.accessToken}`;
      const retry = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
      return retry.json();
    } else {
      logout();
      throw new Error('Session expired');
    }
  }

  return res.json();
}

async function tryRefreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success) {
      state.accessToken = data.data.accessToken;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Router ───────────────────────────────────────────────────
const pages = {
  landing: document.getElementById('page-landing'),
  auth: document.getElementById('page-auth'),
  dashboard: document.getElementById('page-dashboard'),
  analytics: document.getElementById('page-analytics'),
};

function showPage(name) {
  Object.entries(pages).forEach(([key, el]) => {
    if (el) el.classList.toggle('hidden', key !== name);
    if (el) el.classList.toggle('active', key === name);
  });
  state.currentPage = name;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ── Navbar ───────────────────────────────────────────────────
function updateNavbar() {
  const loggedIn = !!state.user;
  const userMenu = document.getElementById('user-menu');
  const authButtons = document.getElementById('btn-login');
  const regButton = document.getElementById('btn-register');
  const dashLink = document.getElementById('nav-dashboard-link');
  const analyticsLink = document.getElementById('nav-analytics-link');

  if (loggedIn) {
    userMenu?.classList.remove('hidden');
    authButtons?.classList.add('hidden');
    regButton?.classList.add('hidden');
    dashLink?.classList.remove('hidden');
    analyticsLink?.classList.remove('hidden');
    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    if (avatar) avatar.textContent = (state.user.username || 'U')[0].toUpperCase();
    if (name) name.textContent = state.user.username;
  } else {
    userMenu?.classList.add('hidden');
    authButtons?.classList.remove('hidden');
    regButton?.classList.remove('hidden');
    dashLink?.classList.add('hidden');
    analyticsLink?.classList.add('hidden');
  }
}

// ── Toast ────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

window.showToast = showToast;
window.apiFetch = apiFetch;
window.state = state;
window.showPage = showPage;
window.updateNavbar = updateNavbar;

// ── Navbar Scroll Effect ─────────────────────────────────────
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  navbar?.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ── Navbar Buttons ───────────────────────────────────────────
document.getElementById('btn-login')?.addEventListener('click', () => {
  window.showAuthSection?.('login');
  showPage('auth');
});
document.getElementById('btn-register')?.addEventListener('click', () => {
  window.showAuthSection?.('register');
  showPage('auth');
});
document.getElementById('btn-logout')?.addEventListener('click', logout);
document.getElementById('nav-logo-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showPage(state.user ? 'dashboard' : 'landing');
});
document.getElementById('nav-dashboard-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showPage('dashboard');
  window.loadDashboard?.();
});

// ── Logout ───────────────────────────────────────────────────
async function logout() {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
  state.user = null;
  state.accessToken = null;
  updateNavbar();
  showPage('landing');
  showToast('Logged out successfully', 'success');
}

window.logout = logout;

// ── Landing Page Shortener ────────────────────────────────────
const btnShorten = document.getElementById('btn-shorten');
btnShorten?.addEventListener('click', shortenUrl);
document.getElementById('url-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') shortenUrl();
});

async function shortenUrl() {
  const input = document.getElementById('url-input');
  const strategySelect = document.getElementById('strategy-select');
  const aliasInput = document.getElementById('custom-alias-input');
  const generateQr = document.getElementById('generate-qr')?.checked;
  const resultBox = document.getElementById('shortener-result');
  const errorBox = document.getElementById('shortener-error');
  const btnText = btnShorten.querySelector('.btn-text');

  const url = input?.value?.trim();
  if (!url) {
    input?.focus();
    return;
  }

  resultBox?.classList.add('hidden');
  errorBox?.classList.add('hidden');
  if (btnText) btnText.textContent = '⏳';
  btnShorten.disabled = true;

  try {
    const body = {
      originalUrl: url,
      slugType: strategySelect?.value || 'BASE62',
      generateQr,
    };
    const alias = aliasInput?.value?.trim();
    if (alias) { body.customAlias = alias; body.slugType = 'CUSTOM'; }

    const data = await apiFetch('/url', { method: 'POST', body, auth: !!state.accessToken });

    if (!data.success) throw new Error(data.error?.message || 'Failed to shorten URL');

    const { url: created } = data.data;
    const shortUrl = created.shortUrl || `${window.location.origin}/${created.shortCode}`;

    document.getElementById('result-url').href = shortUrl;
    document.getElementById('result-url').textContent = shortUrl;
    document.getElementById('result-meta').textContent =
      `Strategy: ${created.slugType} · Code: ${created.shortCode}`;

    if (created.qrCodeUrl) {
      const qrImg = document.getElementById('qr-image');
      const qrDl = document.getElementById('qr-download');
      const qrBox = document.getElementById('result-qr');
      qrImg.src = created.qrCodeUrl;
      qrDl.href = created.qrCodeUrl;
      qrDl.download = `qr-${created.shortCode}.png`;
      qrBox.classList.remove('hidden');
    }

    resultBox?.classList.remove('hidden');
    input.value = '';
    if (aliasInput) aliasInput.value = '';

    document.getElementById('btn-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(shortUrl).then(() => showToast('Copied!', 'success'));
    }, { once: true });
  } catch (err) {
    if (errorBox) { errorBox.textContent = err.message; errorBox.classList.remove('hidden'); }
  } finally {
    if (btnText) btnText.textContent = 'Shorten';
    btnShorten.disabled = false;
  }
}

// ── Session Persistence ──────────────────────────────────────
async function initSession() {
  try {
    const data = await apiFetch('/auth/me', { auth: true });
    if (data.success) {
      state.user = data.data.user;
      // Extract token from cookie if available
    }
  } catch {}
  updateNavbar();
}

// ── Boot ─────────────────────────────────────────────────────
initSession();
