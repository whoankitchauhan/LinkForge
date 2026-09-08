'use strict';

const express = require('express');
const router = express.Router();

const { redirect } = require('./controller');
const { apiLimiter } = require('../../shared/middleware/rateLimit');

// GET /:shortCode  — The hot path: resolve and redirect
// Short codes: alphanumeric, hyphens, underscores, 3–50 chars
router.get(
  '/:shortCode([a-zA-Z0-9_-]{3,50})',
  apiLimiter,
  redirect
);

module.exports = router;
