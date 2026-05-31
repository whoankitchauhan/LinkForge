'use strict';

const { prisma } = require('../../shared/prisma');
const { cacheGet, cacheSet } = require('../../shared/redis');
const { publish, EVENTS } = require('../../shared/rabbitmq');
const { AppError } = require('../../shared/middleware/errorHandler');
const { cacheHits, cacheMisses, redirectsTotal } = require('../../shared/metrics');
const logger = require('../../shared/logger');

const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 86400;

// ─── Bot User-Agent Patterns ──────────────────────────────────────────────────
const BOT_PATTERN =
  /bot|crawler|spider|slurp|googlebot|bingbot|yandex|baidu|duckduck|facebot|ia_archiver|semrush|ahrefs|mj12bot/i;

/**
 * Resolves a short code → original URL, handling cache and expiry.
 * Returns the original URL to redirect to.
 *
 * @param {string} shortCode
 * @param {object} requestMeta - IP, UA, referrer, etc.
 * @returns {Promise<string>} originalUrl
 */
async function resolve(shortCode, requestMeta) {
  const cacheKey = `url:${shortCode}`;

  // ── Step 1: Redis lookup ───────────────────────────────────────────────────
  const cached = await cacheGet(cacheKey);

  if (cached) {
    cacheHits.inc();
    logger.debug('Cache hit', { shortCode });

    const { originalUrl, status, expiresAt } = cached;

    if (status !== 'ACTIVE') throw new AppError('This link is inactive', 410);
    if (expiresAt && new Date(expiresAt) < new Date()) {
      throw new AppError('This link has expired', 410);
    }

    // Publish analytics event (fire-and-forget)
    _publishClickEvent(shortCode, originalUrl, requestMeta).catch(() => {});

    redirectsTotal.inc();
    return originalUrl;
  }

  // ── Step 2: Cache miss — query DB ─────────────────────────────────────────
  cacheMisses.inc();
  logger.debug('Cache miss', { shortCode });

  const url = await prisma.url.findFirst({
    where: {
      OR: [{ shortCode }, { customAlias: shortCode }],
      NOT: { status: 'DELETED' },
    },
    select: {
      id: true, originalUrl: true, status: true, expiresAt: true, shortCode: true,
    },
  });

  if (!url) throw new AppError('Short URL not found', 404);

  if (url.status !== 'ACTIVE') throw new AppError('This link is inactive', 410);
  if (url.expiresAt && new Date(url.expiresAt) < new Date()) {
    // Mark as expired in DB
    await prisma.url.update({ where: { id: url.id }, data: { status: 'EXPIRED' } });
    throw new AppError('This link has expired', 410);
  }

  // ── Step 3: Update cache ───────────────────────────────────────────────────
  await cacheSet(
    cacheKey,
    { originalUrl: url.originalUrl, status: url.status, expiresAt: url.expiresAt },
    CACHE_TTL
  );

  // ── Step 4: Increment click count & publish analytics ─────────────────────
  await prisma.url.update({
    where: { id: url.id },
    data: { clickCount: { increment: 1 } },
  });

  _publishClickEvent(url.shortCode, url.originalUrl, { ...requestMeta, urlId: url.id }).catch(() => {});

  redirectsTotal.inc();
  return url.originalUrl;
}

/**
 * Fire-and-forget: publish click event to RabbitMQ for async analytics processing.
 */
async function _publishClickEvent(shortCode, originalUrl, meta) {
  const isBot = BOT_PATTERN.test(meta.userAgent || '');
  if (isBot) {
    logger.debug('Bot detected — skipping analytics', { shortCode, ua: meta.userAgent });
    return;
  }

  await publish(EVENTS.URL_CLICKED, {
    shortCode,
    originalUrl,
    urlId: meta.urlId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    referrer: meta.referrer,
    isQrScan: meta.isQrScan || false,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { resolve };
