'use strict';

require('dotenv').config();

const { prisma } = require('../../shared/prisma');
const { cacheSet } = require('../../shared/redis');
const logger = require('../../shared/logger');

const TOP_N = parseInt(process.env.CACHE_SYNC_TOP_N) || 100;
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 86400;

/**
 * Warms the Redis cache with the top N most-clicked active URLs.
 * Runs once on startup so cold-start cache misses are minimised.
 */
async function warmCache() {
  logger.info('Cache sync worker: warming cache', { topN: TOP_N });

  try {
    const topUrls = await prisma.url.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { clickCount: 'desc' },
      take: TOP_N,
      select: {
        shortCode: true,
        customAlias: true,
        originalUrl: true,
        status: true,
        expiresAt: true,
      },
    });

    let warmed = 0;
    for (const url of topUrls) {
      const payload = {
        originalUrl: url.originalUrl,
        status: url.status,
        expiresAt: url.expiresAt,
      };

      await cacheSet(`url:${url.shortCode}`, payload, CACHE_TTL);

      if (url.customAlias) {
        await cacheSet(`url:${url.customAlias}`, payload, CACHE_TTL);
      }

      warmed++;
    }

    logger.info('Cache sync worker: cache warmed', { warmed });
  } catch (err) {
    logger.error('Cache sync worker: error', { error: err.message });
  }
}

async function start() {
  await warmCache();
  // Could run periodically to refresh — e.g. every 6 hours
  setInterval(warmCache, 6 * 60 * 60 * 1000);
}

start().catch((err) => {
  logger.error('Cache sync worker: fatal startup error', { error: err.message });
  process.exit(1);
});
