'use strict';

const express = require('express');
const router = express.Router();

const ctrl = require('./controller');
const { authenticate, optionalAuthenticate } = require('../../shared/middleware/auth');
const { createUrlLimiter } = require('../../shared/middleware/rateLimit');
const { createUrlValidators, updateUrlValidators, searchValidators } = require('./validators');

// POST   /api/url           - Create short URL (public/authenticated)
router.post('/', optionalAuthenticate, createUrlLimiter, createUrlValidators, ctrl.createUrl);

// GET    /api/url           - List user's URLs
router.get('/', authenticate, ctrl.listUrls);

// GET    /api/url/search    - Search URLs  (must be before /:id)
router.get('/search', authenticate, searchValidators, ctrl.searchUrls);

// GET    /api/url/:id       - Get single URL
router.get('/:id', authenticate, ctrl.getUrl);

// PUT    /api/url/:id       - Update URL
router.put('/:id', authenticate, updateUrlValidators, ctrl.updateUrl);

// DELETE /api/url/:id       - Delete URL
router.delete('/:id', authenticate, ctrl.deleteUrl);

// POST   /api/url/:id/qr   - Generate / refresh QR code
router.post('/:id/qr', authenticate, ctrl.generateQr);

module.exports = router;
