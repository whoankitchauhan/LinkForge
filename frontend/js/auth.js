'use strict';
/* ── LinkForge SPA — Auth Module ──────────────────────────── */

// ── Section Switcher ─────────────────────────────────────────
function showAuthSection(section) {
  const loginSection = document.getElementById('auth-login');
  const regSection = document.getElementById('auth-register');
  loginSection?.classList.toggle('hidden', section !== 'login');
  regSection?.classList.toggle('hidden', section !== 'register');
}
window.showAuthSection = showAuthSection;

// ── Password Strength ─────────────────────────────────────────
function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

document.getElementById('reg-password')?.addEventListener('input', function () {
  const bar = document.getElementById('pw-strength');
  if (!bar) return;
  const score = getPasswordStrength(this.value);
  const pct = Math.min(100, (score / 6) * 100);
  const colors = ['#fc8181', '#fc8181', '#f6ad55', '#fbd38d', '#68d391', '#48bb78'];
  bar.style.setProperty('--strength', `${pct}%`);
  bar.style.setProperty('--strength-color', colors[score] || '#68d391');
});

// ── Toggle password visibility ────────────────────────────────
document.getElementById('btn-toggle-pw')?.addEventListener('click', function () {
  const input = document.getElementById('login-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  this.textContent = input.type === 'password' ? '👁' : '🙈';
});

// ── Link switchers ────────────────────────────────────────────
document.getElementById('link-to-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  showAuthSection('register');
});
document.getElementById('link-to-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  showAuthSection('login');
});

// ── Register ──────────────────────────────────────────────────
document.getElementById('form-register')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-do-register');
  const loader = document.getElementById('loader-register');
  const errEl = document.getElementById('auth-error-reg');

  errEl?.classList.add('hidden');
  if (btn) btn.disabled = true;
  loader?.classList.remove('hidden');

  try {
    const data = await window.apiFetch('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: document.getElementById('reg-email')?.value,
        username: document.getElementById('reg-username')?.value,
        password: document.getElementById('reg-password')?.value,
      },
    });

    if (!data.success) {
      const msg = data.error?.message || 'Registration failed';
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
      return;
    }

    window.showToast('Account created successfully! You can now log in.', 'success', 5000);
    showAuthSection('login');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) btn.disabled = false;
    loader?.classList.add('hidden');
  }
});

// ── Login ─────────────────────────────────────────────────────
document.getElementById('form-login')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-do-login');
  const loader = document.getElementById('loader-login');
  const errEl = document.getElementById('auth-error-login');

  errEl?.classList.add('hidden');
  if (btn) btn.disabled = true;
  loader?.classList.remove('hidden');

  try {
    const data = await window.apiFetch('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: document.getElementById('login-email')?.value,
        password: document.getElementById('login-password')?.value,
      },
    });

    if (!data.success) {
      const msg = data.error?.message || 'Login failed';
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
      return;
    }

    window.state.user = data.data.user;
    window.state.accessToken = data.data.accessToken;
    window.updateNavbar();
    window.showToast(`Welcome back, ${data.data.user.username}! 👋`, 'success');
    window.showPage('dashboard');
    window.loadDashboard?.();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) btn.disabled = false;
    loader?.classList.add('hidden');
  }
});

// ── Init ─────────────────────────────────────────────────────
showAuthSection('login');
