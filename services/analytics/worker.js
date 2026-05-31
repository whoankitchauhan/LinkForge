'use strict';

require('dotenv').config();

const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const { subscribe, connect, EVENTS } = require('../../shared/rabbitmq');
const { prisma } = require('../../shared/prisma');
const logger = require('../../shared/logger');

const QUEUE_NAME = process.env.RABBITMQ_QUEUE_ANALYTICS || 'analytics_queue';

// ─── Click Event Handler ──────────────────────────────────────────────────────

async function processClickEvent(payload) {
  const { urlId, shortCode, ipAddress, userAgent, referrer, isQrScan, timestamp } = payload;

  if (!urlId && !shortCode) {
    logger.warn('Analytics: received click event without urlId or shortCode', { payload });
    return;
  }

  // ── Geo-IP Enrichment ──────────────────────────────────────────────────────
  let country = null, city = null, region = null;
  if (ipAddress && !ipAddress.startsWith('127.') && !ipAddress.startsWith('::')) {
    const geo = geoip.lookup(ipAddress);
    if (geo) {
      country = geo.country || null;
      city = geo.city || null;
      region = geo.region || null;
    }
  }

  // ── UA Parsing ─────────────────────────────────────────────────────────────
  let browser = null, browserVersion = null, operatingSystem = null, deviceType = null;
  if (userAgent) {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    browser = result.browser.name || null;
    browserVersion = result.browser.version || null;
    operatingSystem = result.os.name || null;
    const device = result.device.type;
    deviceType = device || (userAgent.match(/mobile/i) ? 'mobile' : 'desktop');
  }

  // ── Resolve urlId if only shortCode provided ───────────────────────────────
  let resolvedUrlId = urlId;
  if (!resolvedUrlId && shortCode) {
    const url = await prisma.url.findFirst({
      where: { OR: [{ shortCode }, { customAlias: shortCode }] },
      select: { id: true },
    });
    resolvedUrlId = url?.id;
  }

  if (!resolvedUrlId) {
    logger.warn('Analytics: could not resolve urlId for click event', { shortCode });
    return;
  }

  // ── Store Click ────────────────────────────────────────────────────────────
  await prisma.click.create({
    data: {
      urlId: resolvedUrlId,
      ipAddress,
      country,
      city,
      region,
      browser,
      browserVersion,
      operatingSystem,
      deviceType,
      referrer: referrer || null,
      userAgent,
      isQrScan: isQrScan || false,
      clickedAt: timestamp ? new Date(timestamp) : new Date(),
    },
  });

  logger.debug('Analytics: click stored', { urlId: resolvedUrlId, country, deviceType });
}

// ─── Worker Entry Point ───────────────────────────────────────────────────────

async function startAnalyticsWorker() {
  logger.info('Analytics worker: starting...');

  await connect();

  await subscribe(QUEUE_NAME, `${EVENTS.URL_CLICKED}`, processClickEvent);

  logger.info('Analytics worker: ready and consuming', { queue: QUEUE_NAME });
}

startAnalyticsWorker().catch((err) => {
  logger.error('Analytics worker: fatal error', { error: err.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Analytics worker: shutting down');
  process.exit(0);
});
