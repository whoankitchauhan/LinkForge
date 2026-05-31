'use strict';

const redirectService = require('./service');
const logger = require('../../shared/logger');

async function redirect(req, res, next) {
  try {
    const { shortCode } = req.params;

    // Extract request metadata
    const meta = {
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'] || req.headers['referrer'] || null,
      isQrScan: req.query.qr === '1' || req.query.source === 'qr',
    };

    const originalUrl = await redirectService.resolve(shortCode, meta);

    logger.info('Redirect', { shortCode, destination: originalUrl, ip: meta.ip });

    // 302 temporary redirect (preserves analytics accuracy)
    res.redirect(302, originalUrl);
  } catch (err) {
    // For 404 and 410 on the redirect route, render a nice error page
    if (err.statusCode === 404 || err.statusCode === 410) {
      return res.status(err.statusCode).json({
        success: false,
        error: { message: err.message },
      });
    }
    next(err);
  }
}

module.exports = { redirect };
