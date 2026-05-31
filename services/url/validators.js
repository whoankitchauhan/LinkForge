'use strict';

const { body, query, param } = require('express-validator');

// ─── URL validation helper ────────────────────────────────────────────────────
const BLOCKED_SCHEMES = /^(javascript:|data:|vbscript:|file:)/i;
const PRIVATE_IP_PATTERN =
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|localhost|0\.0\.0\.0|::1)/i;

function isValidUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }
    if (BLOCKED_SCHEMES.test(value)) {
      throw new Error('Potentially dangerous URL scheme');
    }
    const hostname = url.hostname;
    if (PRIVATE_IP_PATTERN.test(hostname)) {
      throw new Error('Private/local IP addresses are not allowed');
    }
    return true;
  } catch (err) {
    throw new Error(err.message || 'Invalid URL');
  }
}

// ─── Validators ───────────────────────────────────────────────────────────────

const createUrlValidators = [
  body('originalUrl')
    .trim()
    .notEmpty()
    .withMessage('URL is required')
    .custom(isValidUrl),
  body('customAlias')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Custom alias must be 3–50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Alias may only contain letters, numbers, hyphens and underscores'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must be at most 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be at most 500 characters'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Tags must be an array of at most 10 items'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Each tag must be 1–30 characters'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('expiresAt must be a valid ISO8601 date')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),
  body('slugType')
    .optional()
    .isIn(['BASE62', 'NANOID', 'HASH', 'CUSTOM'])
    .withMessage('slugType must be BASE62, NANOID, HASH, or CUSTOM'),
  body('generateQr')
    .optional()
    .isBoolean()
    .withMessage('generateQr must be a boolean'),
];

const updateUrlValidators = [
  param('id').isUUID().withMessage('Invalid URL ID'),
  body('title').optional().trim().isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('tags').optional().isArray({ max: 10 }),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('expiresAt must be a valid ISO8601 date'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE'])
    .withMessage('status must be ACTIVE or INACTIVE'),
];

const searchValidators = [
  query('q').optional().trim().isLength({ max: 200 }),
  query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'EXPIRED']),
  query('slugType').optional().isIn(['BASE62', 'NANOID', 'HASH', 'CUSTOM']),
  query('tag').optional().trim().isLength({ max: 30 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['createdAt', 'clickCount', 'expiresAt']),
  query('order').optional().isIn(['asc', 'desc']),
];

module.exports = { createUrlValidators, updateUrlValidators, searchValidators };
