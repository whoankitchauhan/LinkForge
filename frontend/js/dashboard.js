'use strict';
/* ── LinkForge SPA — Dashboard Module ───────────────────────
   URL management table, KPIs, trend chart
   ────────────────────────────────────────────────────────── */

let trendChart = null;
let currentPage = 1;
const PAGE_SIZE = 15;
let searchTimeout = null;

// ── Load Dashboard ───────────────────────────────────────────
async function loadDashboard() {
  const period = document.getElementById('dashboard-period')?.value || 'month';

  try {
    const data = await window.apiFetch(`/analytics/dashboard?period=${period}`);
    if (data.success) renderDashboardKpis(data.data);
  } catch (err) {
    console.error('Dashboard load error:', err);
  }

  loadUrlTable(1);
}

window.loadDashboard = loadDashboard;

// ── KPIs ─────────────────────────────────────────────────────
function renderDashboardKpis(data) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('kpi-total-urls', (data.summary?.totalUrls ?? 0).toLocaleString());
  set('kpi-total-clicks', (data.summary?.totalClicks ?? 0).toLocaleString());

  // Top device from recent activity
  const deviceCounts = {};
  (data.recentActivity || []).forEach((c) => {
    const d = c.deviceType || 'unknown';
    deviceCounts[d] = (deviceCounts[d] || 0) + 1;
  });
  const topDevice = Object.entries(deviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  set('kpi-top-device', capitalize(topDevice));

  const countryCounts = {};
  (data.recentActivity || []).forEach((c) => {
    if (c.country) countryCounts[c.country] = (countryCounts[c.country] || 0) + 1;
  });
  const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  set('kpi-top-country', topCountry);

  // Trend chart
  renderTrendChart('chart-trend', data.trend?.daily || []);
}

// ── Trend Chart ───────────────────────────────────────────────
function renderTrendChart(canvasId, dailyData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = dailyData.map((d) => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  });
  const counts = dailyData.map((d) => d.count);

  if (trendChart) { trendChart.destroy(); trendChart = null; }

  trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Clicks',
        data: counts,
        borderColor: '#4299e1',
        backgroundColor: 'rgba(66,153,225,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#4299e1',
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#14142a',
          borderColor: 'rgba(99,179,237,0.25)',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#a0aec0',
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#718096', font: { family: 'Inter', size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#718096', font: { family: 'Inter', size: 11 } },
        },
      },
    },
  });
}

// ── URL Table ─────────────────────────────────────────────────
async function loadUrlTable(page = 1) {
  const tbody = document.getElementById('url-table-body');
  const q = document.getElementById('url-search')?.value?.trim() || '';
  currentPage = page;

  if (tbody) tbody.innerHTML = '<tr class="table-loading"><td colspan="6"><div class="loading-spinner"></div></td></tr>';

  try {
    const params = new URLSearchParams({ page, limit: PAGE_SIZE, sort: 'createdAt', order: 'desc' });
    if (q) params.set('q', q);

    const endpoint = q ? `/url/search?${params}` : `/url?${params}`;
    const data = await window.apiFetch(endpoint);

    if (!data.success) throw new Error(data.error?.message);

    const { urls, pagination } = data.data;
    renderUrlTable(urls);
    renderPagination(pagination);
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#fc8181;padding:40px">${err.message}</td></tr>`;
  }
}

function renderUrlTable(urls) {
  const tbody = document.getElementById('url-table-body');
  if (!tbody) return;

  if (!urls?.length) {
    tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;color:#718096;padding:60px">
        <div style="font-size:36px;margin-bottom:12px">🔗</div>
        <div>No links yet. Create your first short URL!</div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = urls.map((url) => {
    const shortUrl = url.shortUrl || `${window.location.origin}/${url.shortCode}`;
    const status = url.status?.toLowerCase() || 'active';
    const statusLabel = { active: '● Active', inactive: '○ Inactive', expired: '⚠ Expired' }[status] || status;
    const created = new Date(url.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <tr>
        <td>
          <a href="${shortUrl}" target="_blank" rel="noopener" class="short-code-link">${url.shortCode}</a>
          ${url.customAlias ? `<span style="font-size:11px;color:#718096;margin-left:4px">(${url.customAlias})</span>` : ''}
        </td>
        <td>
          <div class="original-url" title="${url.originalUrl}">${url.originalUrl}</div>
        </td>
        <td><span class="click-count">${(url.clickCount || 0).toLocaleString()}</span></td>
        <td><span class="status-badge status-${status}">${statusLabel}</span></td>
        <td style="color:#718096;font-size:13px">${created}</td>
        <td>
          <div class="table-actions">
            <button class="btn-action" onclick="window.viewAnalytics('${url.id}')" title="Analytics">📊</button>
            <button class="btn-action" onclick="navigator.clipboard.writeText('${shortUrl}').then(()=>showToast('Copied!','success'))" title="Copy">📋</button>
            ${url.qrCodeUrl ? `<button class="btn-action" onclick="window.showQr('${url.qrCodeUrl}')" title="QR Code">📱</button>` : ''}
            <button class="btn-action btn-action-delete" onclick="window.deleteUrl('${url.id}')" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderPagination(pagination) {
  const container = document.getElementById('url-pagination');
  if (!container || !pagination) return;

  const { page, totalPages } = pagination;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const prevBtn = `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="loadUrlTable(${page - 1})">← Prev</button>`;
  const nextBtn = `<button class="page-btn" ${page >= totalPages ? 'disabled' : ''} onclick="loadUrlTable(${page + 1})">Next →</button>`;
  const info = `<span style="font-size:13px;color:#718096">Page ${page} of ${totalPages}</span>`;

  container.innerHTML = `${prevBtn} ${info} ${nextBtn}`;
}

// ── Actions ───────────────────────────────────────────────────
window.viewAnalytics = (urlId) => {
  window.state.currentUrlId = urlId;
  window.showPage('analytics');
  window.loadAnalytics?.(urlId);
};

window.deleteUrl = async (urlId) => {
  if (!confirm('Delete this URL? This cannot be undone.')) return;
  try {
    const data = await window.apiFetch(`/url/${urlId}`, { method: 'DELETE' });
    if (data.success) {
      window.showToast('URL deleted', 'success');
      loadUrlTable(currentPage);
    } else {
      throw new Error(data.error?.message);
    }
  } catch (err) {
    window.showToast(err.message || 'Delete failed', 'error');
  }
};

window.showQr = (qrUrl) => {
  window.open(qrUrl, '_blank');
};

// ── Search ────────────────────────────────────────────────────
document.getElementById('url-search')?.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadUrlTable(1), 400);
});

// ── Period Change ─────────────────────────────────────────────
document.getElementById('dashboard-period')?.addEventListener('change', loadDashboard);

// ── New URL Modal ──────────────────────────────────────────────
document.getElementById('btn-new-url')?.addEventListener('click', () => {
  document.getElementById('modal-overlay')?.classList.remove('hidden');
});
document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function closeModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
  document.getElementById('form-create-url')?.reset();
  document.getElementById('modal-error')?.classList.add('hidden');
}

document.getElementById('form-create-url')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-create-url-submit');
  const errEl = document.getElementById('modal-error');
  errEl?.classList.add('hidden');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    const tagsRaw = document.getElementById('m-tags')?.value || '';
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    const expiresAt = document.getElementById('m-expires')?.value || null;
    const customAlias = document.getElementById('m-custom-alias')?.value?.trim() || null;
    const slugType = customAlias ? 'CUSTOM' : (document.getElementById('m-slug-type')?.value || 'BASE62');

    const body = {
      originalUrl: document.getElementById('m-original-url')?.value,
      title: document.getElementById('m-title')?.value || undefined,
      tags,
      slugType,
      generateQr: document.getElementById('m-generate-qr')?.checked,
      ...(customAlias && { customAlias }),
      ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
    };

    const data = await window.apiFetch('/url', { method: 'POST', body });
    if (!data.success) throw new Error(data.error?.message || 'Failed to create URL');

    window.showToast('URL created successfully!', 'success');
    closeModal();
    loadUrlTable(1);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Link'; }
  }
});

// ── Helper ────────────────────────────────────────────────────
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

window.loadUrlTable = loadUrlTable;
