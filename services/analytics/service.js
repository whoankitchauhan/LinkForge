'use strict';

const { prisma } = require('../../shared/prisma');
const { AppError } = require('../../shared/middleware/errorHandler');

// ─── Helper: date range ───────────────────────────────────────────────────────
function getDateRange(period) {
  const now = new Date();
  const from = new Date(now);
  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case 'week':
      from.setDate(now.getDate() - 7);
      break;
    case 'month':
      from.setDate(now.getDate() - 30);
      break;
    case 'year':
      from.setDate(now.getDate() - 365);
      break;
    default:
      from.setDate(now.getDate() - 30);
  }
  return { from, to: now };
}

// ─── URL Analytics ────────────────────────────────────────────────────────────
async function getUrlAnalytics(urlId, userId, period = 'month') {
  // Verify ownership
  const url = await prisma.url.findUnique({
    where: { id: urlId },
    select: { createdBy: true, shortCode: true, originalUrl: true, clickCount: true, title: true },
  });
  if (!url) throw new AppError('URL not found', 404);
  if (url.createdBy !== userId) throw new AppError('Access denied', 403);

  const { from, to } = getDateRange(period);
  const where = { urlId, clickedAt: { gte: from, lte: to } };

  const [
    totalClicks,
    uniqueIps,
    countryBreakdown,
    cityBreakdown,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    referrerBreakdown,
    dailyClicks,
    qrVsNormal,
  ] = await Promise.all([
    // Total clicks in period
    prisma.click.count({ where }),

    // Unique visitors (by IP)
    prisma.click.findMany({
      where,
      distinct: ['ipAddress'],
      select: { ipAddress: true },
    }),

    // Country distribution
    prisma.click.groupBy({
      by: ['country'],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 20,
    }),

    // City distribution
    prisma.click.groupBy({
      by: ['city'],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 15,
    }),

    // Device type distribution
    prisma.click.groupBy({
      by: ['deviceType'],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
    }),

    // Browser distribution
    prisma.click.groupBy({
      by: ['browser'],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 10,
    }),

    // OS distribution
    prisma.click.groupBy({
      by: ['operatingSystem'],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 10,
    }),

    // Referrer sources
    prisma.click.groupBy({
      by: ['referrer'],
      where: { ...where, referrer: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { _all: 'desc' } },
      take: 15,
    }),

    // Daily click trend (last period)
    prisma.$queryRaw`
      SELECT DATE(clicked_at AT TIME ZONE 'UTC') as date, COUNT(*) as count
      FROM clicks
      WHERE url_id = ${urlId}::uuid
        AND clicked_at >= ${from}
        AND clicked_at <= ${to}
      GROUP BY DATE(clicked_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `,

    // QR vs normal clicks
    prisma.click.groupBy({
      by: ['isQrScan'],
      where,
      _count: { _all: true },
    }),
  ]);

  return {
    url: {
      id: urlId,
      shortCode: url.shortCode,
      originalUrl: url.originalUrl,
      title: url.title,
      totalClicksAllTime: url.clickCount,
    },
    period,
    summary: {
      totalClicks,
      uniqueVisitors: uniqueIps.length,
    },
    breakdown: {
      countries: countryBreakdown.map((r) => ({ country: r.country || 'Unknown', count: r._count._all })),
      cities: cityBreakdown.map((r) => ({ city: r.city || 'Unknown', count: r._count._all })),
      devices: deviceBreakdown.map((r) => ({ device: r.deviceType || 'unknown', count: r._count._all })),
      browsers: browserBreakdown.map((r) => ({ browser: r.browser || 'Unknown', count: r._count._all })),
      operatingSystems: osBreakdown.map((r) => ({ os: r.operatingSystem || 'Unknown', count: r._count._all })),
      referrers: referrerBreakdown.map((r) => ({ referrer: r.referrer, count: r._count._all })),
      qrVsNormal: qrVsNormal.reduce(
        (acc, r) => {
          acc[r.isQrScan ? 'qr' : 'direct'] = r._count._all;
          return acc;
        },
        { qr: 0, direct: 0 }
      ),
    },
    trend: {
      daily: dailyClicks.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        count: Number(r.count),
      })),
    },
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function getDashboard(userId, period = 'month') {
  const { from, to } = getDateRange(period);

  const [
    urlCount,
    totalClicksResult,
    topUrls,
    recentClicks,
    clickTrend,
  ] = await Promise.all([
    // Total URLs owned by user
    prisma.url.count({ where: { createdBy: userId, NOT: { status: 'DELETED' } } }),

    // Total clicks across all user URLs in period
    prisma.click.aggregate({
      _sum: { _all: true },
      where: {
        url: { createdBy: userId },
        clickedAt: { gte: from, lte: to },
      },
    }),

    // Top performing URLs
    prisma.url.findMany({
      where: { createdBy: userId, NOT: { status: 'DELETED' } },
      orderBy: { clickCount: 'desc' },
      take: 10,
      select: {
        id: true, shortCode: true, originalUrl: true, title: true,
        clickCount: true, status: true, createdAt: true,
      },
    }),

    // Recent click activity
    prisma.click.findMany({
      where: { url: { createdBy: userId }, clickedAt: { gte: from, lte: to } },
      orderBy: { clickedAt: 'desc' },
      take: 10,
      select: {
        clickedAt: true, country: true, deviceType: true, browser: true,
        url: { select: { shortCode: true, title: true } },
      },
    }),

    // Click trend for dashboard chart
    prisma.$queryRaw`
      SELECT DATE(c.clicked_at AT TIME ZONE 'UTC') as date, COUNT(*) as count
      FROM clicks c
      INNER JOIN urls u ON c.url_id = u.id
      WHERE u.created_by = ${userId}::uuid
        AND c.clicked_at >= ${from}
        AND c.clicked_at <= ${to}
      GROUP BY DATE(c.clicked_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `,
  ]);

  return {
    period,
    summary: {
      totalUrls: urlCount,
      totalClicks: Number(totalClicksResult._count?._all || 0),
    },
    topUrls,
    recentActivity: recentClicks,
    trend: {
      daily: clickTrend.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        count: Number(r.count),
      })),
    },
  };
}

// ─── Paginated Clicks ─────────────────────────────────────────────────────────
async function getUrlClicks(urlId, userId, { page = 1, limit = 50 }) {
  const url = await prisma.url.findUnique({ where: { id: urlId }, select: { createdBy: true } });
  if (!url) throw new AppError('URL not found', 404);
  if (url.createdBy !== userId) throw new AppError('Access denied', 403);

  const skip = (page - 1) * limit;
  const [clicks, total] = await Promise.all([
    prisma.click.findMany({
      where: { urlId },
      skip,
      take: limit,
      orderBy: { clickedAt: 'desc' },
    }),
    prisma.click.count({ where: { urlId } }),
  ]);

  return {
    clicks,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

module.exports = { getUrlAnalytics, getDashboard, getUrlClicks };
