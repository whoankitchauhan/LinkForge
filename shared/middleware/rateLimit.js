'use strict';

const rateLimit = require('express-rate-limit');

// Simple in-memory rate limiter using express-rate-limit
// No Redis needed — works perfectly for local/single-instance deployments

const authLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 10,                   // 10 login attempts per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a minute.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 200,                  // 200 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const createUrlLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many URLs created. Please wait.' },
});

module.exports = { authLimiter, apiLimiter, createUrlLimiter };
