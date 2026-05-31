'use strict';
/* ── LinkForge SPA — Analytics Module ──────────────────────
   Per-URL analytics with Chart.js visualisations
   ────────────────────────────────────────────────────────── */

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

const CHART_DEFAULTS = {
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
};

// ── Load Analytics ────────────────────────────────────────────
async function loadAnalytics(urlId) {
  const period = document.getElementById('analytics-period')?.value || 'month';

  try {
    const data = await window.apiFetch(`/analytics/${urlId}?period=${period}`);
    if (!data.success) throw new Error(data.error?.message);

    renderAnalyticsKpis(data.data);
    renderAnalyticsTrend(data.data);
    renderBreakdownCharts(data.data);
  } catch (err) {
    window.showToast(err.message || 'Failed to load analytics', 'error');
  }
}

window.loadAnalytics = loadAnalytics;

// ── KPIs ─────────────────────────────────────────────────────
function renderAnalyticsKpis(data) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('an-total-clicks', (data.summary?.totalClicks ?? 0).toLocaleString());
  set('an-unique', (data.summary?.uniqueVisitors ?? 0).toLocaleString());
  set('an-qr-clicks', (data.breakdown?.qrVsNormal?.qr ?? 0).toLocaleString());

  const topCountry = data.breakdown?.countries?.[0]?.country || '—';
  set('an-top-country', topCountry);

  // URL info
  const titleEl = document.getElementById('analytics-url-title');
  const shortEl = document.getElementById('analytics-url-short');
  if (titleEl) titleEl.textContent = data.url?.title || data.url?.shortCode || 'Analytics';
  if (shortEl) shortEl.textContent = data.url?.originalUrl || '';
}

// ── Trend ─────────────────────────────────────────────────────
function renderAnalyticsTrend(data) {
  destroyChart('chart-an-trend');
  const canvas = document.getElementById('chart-an-trend');
  if (!canvas) return;

  const daily = data.trend?.daily || [];
  const labels = daily.map((d) => {
    return new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  });

  chartInstances['chart-an-trend'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Clicks',
        data: daily.map((d) => d.count),
        borderColor: '#9f7aea',
        backgroundColor: 'rgba(159,122,234,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#9f7aea',
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#718096', font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#718096', font: { size: 11 } } },
      },
    },
  });
}

// ── Breakdown Charts ──────────────────────────────────────────
function renderBreakdownCharts(data) {
  const COLORS = [
    '#4299e1', '#9f7aea', '#4fd1c5', '#f6ad55', '#fc8181',
    '#68d391', '#63b3ed', '#b794f4', '#76e4f7', '#fbd38d',
  ];

  // Countries bar chart
  destroyChart('chart-countries');
  const ccCanvas = document.getElementById('chart-countries');
  if (ccCanvas) {
    const top10 = (data.breakdown?.countries || []).slice(0, 10);
    chartInstances['chart-countries'] = new Chart(ccCanvas, {
      type: 'bar',
      data: {
        labels: top10.map((c) => c.country || 'Unknown'),
        datasets: [{ data: top10.map((c) => c.count), backgroundColor: COLORS, borderRadius: 6 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        ...CHART_DEFAULTS,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#718096', font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { color: '#a0aec0', font: { size: 12 } } },
        },
      },
    });
  }

  // Devices doughnut
  destroyChart('chart-devices');
  const devCanvas = document.getElementById('chart-devices');
  if (devCanvas) {
    const devices = data.breakdown?.devices || [];
    chartInstances['chart-devices'] = new Chart(devCanvas, {
      type: 'doughnut',
      data: {
        labels: devices.map((d) => capitalize(d.device || 'unknown')),
        datasets: [{
          data: devices.map((d) => d.count),
          backgroundColor: COLORS,
          borderWidth: 2,
          borderColor: '#0e0e1c',
        }],
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: '#a0aec0', font: { size: 12 }, padding: 16 },
          },
          tooltip: CHART_DEFAULTS.plugins.tooltip,
        },
      },
    });
  }

  // Browsers doughnut
  destroyChart('chart-browsers');
  const bCanvas = document.getElementById('chart-browsers');
  if (bCanvas) {
    const browsers = (data.breakdown?.browsers || []).slice(0, 8);
    chartInstances['chart-browsers'] = new Chart(bCanvas, {
      type: 'doughnut',
      data: {
        labels: browsers.map((b) => b.browser || 'Unknown'),
        datasets: [{
          data: browsers.map((b) => b.count),
          backgroundColor: COLORS,
          borderWidth: 2,
          borderColor: '#0e0e1c',
        }],
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: '#a0aec0', font: { size: 12 }, padding: 16 },
          },
          tooltip: CHART_DEFAULTS.plugins.tooltip,
        },
      },
    });
  }
}

// ── Period Change ─────────────────────────────────────────────
document.getElementById('analytics-period')?.addEventListener('change', () => {
  if (window.state?.currentUrlId) loadAnalytics(window.state.currentUrlId);
});

// ── Back Button ───────────────────────────────────────────────
document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
  window.showPage('dashboard');
  window.loadDashboard?.();
});

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}
