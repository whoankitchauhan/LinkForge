'use strict';

const express = require('express');
const router = express.Router();

const ctrl = require('./controller');
const { authenticate } = require('../../shared/middleware/auth');

// GET /api/analytics/dashboard
router.get('/dashboard', authenticate, ctrl.getDashboard);

// GET /api/analytics/:urlId
router.get('/:urlId', authenticate, ctrl.getUrlAnalytics);

// GET /api/analytics/:urlId/clicks
router.get('/:urlId/clicks', authenticate, ctrl.getUrlClicks);

module.exports = router;
