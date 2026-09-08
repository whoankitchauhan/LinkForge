'use strict';

// No-op metrics — Prometheus removed for simplicity.
// All metric call sites (.inc(), .observe()) silently do nothing.

const noop = { inc: () => {}, observe: () => {}, set: () => {} };

module.exports = {
  register: { contentType: 'text/plain', metrics: async () => '' },
  httpRequestsTotal: noop,
  httpRequestDurationMs: noop,
  cacheHits: noop,
  cacheMisses: noop,
  urlsCreatedTotal: noop,
  redirectsTotal: noop,
  mqMessagesPublished: noop,
  rateLimitHits: noop,
  dbQueryDurationMs: noop,
};
