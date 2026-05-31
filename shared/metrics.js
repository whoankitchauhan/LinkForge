'use strict';

const client = require('prom-client');
const logger = require('./logger');

// ─── Registry ────────────────────────────────────────────────────────────────
const register = new client.Registry();
register.setDefaultLabels({ app: 'linkforge' });

// Collect default Node.js metrics (CPU, memory, event loop lag)
client.collectDefaultMetrics({ register });

// ─── Custom Metrics ───────────────────────────────────────────────────────────

/** HTTP request counter */
const httpRequestsTotal = new client.Counter({
  name: 'linkforge_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/** HTTP request duration histogram */
const httpRequestDurationMs = new client.Histogram({
  name: 'linkforge_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

/** Redis cache hits counter */
const cacheHits = new client.Counter({
  name: 'linkforge_cache_hits_total',
  help: 'Total Redis cache hits for URL lookups',
  registers: [register],
});

/** Redis cache misses counter */
const cacheMisses = new client.Counter({
  name: 'linkforge_cache_misses_total',
  help: 'Total Redis cache misses for URL lookups',
  registers: [register],
});

/** URL shortening counter */
const urlsCreatedTotal = new client.Counter({
  name: 'linkforge_urls_created_total',
  help: 'Total number of short URLs created',
  labelNames: ['slug_type'],
  registers: [register],
});

/** Redirects counter */
const redirectsTotal = new client.Counter({
  name: 'linkforge_redirects_total',
  help: 'Total number of successful redirections',
  registers: [register],
});

/** RabbitMQ messages published counter */
const mqMessagesPublished = new client.Counter({
  name: 'linkforge_mq_messages_published_total',
  help: 'Total RabbitMQ messages published',
  labelNames: ['event'],
  registers: [register],
});

/** Rate limit hits counter */
const rateLimitHits = new client.Counter({
  name: 'linkforge_rate_limit_hits_total',
  help: 'Total number of rate limit rejections',
  labelNames: ['endpoint'],
  registers: [register],
});

/** Active DB connections gauge */
const dbQueryDurationMs = new client.Histogram({
  name: 'linkforge_db_query_duration_ms',
  help: 'Database query duration in milliseconds',
  labelNames: ['operation'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [register],
});

logger.info('Prometheus metrics registered');

module.exports = {
  register,
  httpRequestsTotal,
  httpRequestDurationMs,
  cacheHits,
  cacheMisses,
  urlsCreatedTotal,
  redirectsTotal,
  mqMessagesPublished,
  rateLimitHits,
  dbQueryDurationMs,
};
