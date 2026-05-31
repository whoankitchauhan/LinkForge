'use strict';

require('dotenv').config();

const { prisma } = require('../../shared/prisma');
const { cacheDel } = require('../../shared/redis');
const { publish, EVENTS, connect } = require('../../shared/rabbitmq');
const logger = require('../../shared/logger');

const INTERVAL_MS = parseInt(process.env.EXPIRATION_WORKER_INTERVAL_MS) || 60000;

async function runExpirationScan() {
  const now = new Date();
  logger.debug('Expiration worker: scanning...', { timestamp: now.toISOString() });

  try {
    // Find all URLs that are ACTIVE but past their expiry
    const expired = await prisma.url.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
      select: { id: true, shortCode: true, originalUrl: true, createdBy: true },
    });

    if (expired.length === 0) return;

    logger.info('Expiration worker: expiring URLs', { count: expired.length });

    // Batch update status to EXPIRED
    await prisma.url.updateMany({
      where: { id: { in: expired.map((u) => u.id) } },
      data: { status: 'EXPIRED' },
    });

    // Invalidate cache and publish events
    for (const url of expired) {
      await cacheDel(`url:${url.shortCode}`);
      await publish(EVENTS.URL_EXPIRED, {
        urlId: url.id,
        shortCode: url.shortCode,
        originalUrl: url.originalUrl,
        userId: url.createdBy,
      });
    }

    logger.info('Expiration worker: done', { expired: expired.length });
  } catch (err) {
    logger.error('Expiration worker: error during scan', { error: err.message });
  }
}

async function start() {
  logger.info('Expiration worker: starting', { intervalMs: INTERVAL_MS });
  await connect();

  // Run immediately on start
  await runExpirationScan();

  // Then on interval
  setInterval(runExpirationScan, INTERVAL_MS);
}

start().catch((err) => {
  logger.error('Expiration worker: fatal startup error', { error: err.message });
  process.exit(1);
});
