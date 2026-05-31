'use strict';

const { cacheIncr } = require('../redis');
const { AppError } = require('./errorHandler');
const { rateLimitHits } = require('../metrics');
const logger = require('../logger');

/**
 * Redis sliding-window rate limiter middleware factory.
 *
 * @param {object} options
 * @param {number} options.windowMs  - Window duration in ms
 * @param {number} options.max       - Max requests per window
 * @param {string} options.keyPrefix - Key prefix (identifies the endpoint)
 * @param {string} options.message   - Error message when limited
 */
function rateLimiter({ windowMs = 60000, max = 100, keyPrefix = 'rl', message } = {}) {
  const windowSec = Math.ceil(windowMs / 1000);
  const errorMessage = message || `Too many requests. Limit is ${max} per ${windowSec}s.`;

  return async (req, res, next) => {
    // Key: prefix:IP (or prefix:userId if authenticated)
    const identifier = req.user?.id || req.ip;
    const key = `${keyPrefix}:${identifier}`;

    try {
      const count = await cacheIncr(key, windowSec);

      // Set headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      res.setHeader('X-RateLimit-Window', windowSec);

      if (count > max) {
        rateLimitHits.inc({ endpoint: keyPrefix });
        logger.warn('Rate limit exceeded', { key, count, max });
        return next(new AppError(errorMessage, 429));
      }

      next();
    } catch (err) {
      // If Redis is down, fail open (log and continue)
      logger.error('Rate limiter error — failing open', { error: err.message });
      next();
    }
  };
}

// ─── Pre-configured Limiters ──────────────────────────────────────────────────

const authLimiter = rateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_LOGIN) || 10,
  keyPrefix: 'rl:auth:login',
  message: 'Too many login attempts. Please wait before trying again.',
});

const createUrlLimiter = rateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_URL_CREATE) || 50,
  keyPrefix: 'rl:url:create',
});

const redirectLimiter = rateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_REDIRECT) || 200,
  keyPrefix: 'rl:redirect',
});

const apiLimiter = rateLimiter({
  windowMs: 60000,
  max: 200,
  keyPrefix: 'rl:api:general',
});

module.exports = { rateLimiter, authLimiter, createUrlLimiter, redirectLimiter, apiLimiter };
