'use strict';

const logger = require('../logger');

/**
 * Global error handler middleware.
 * Catches all errors thrown or passed to next(err) in route handlers.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Normalise error
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const isOperational = err.isOperational || false;

  // Log appropriately
  const logMeta = {
    statusCode,
    method: req.method,
    url: req.originalUrl,
    requestId: req.requestId,
    ip: req.ip,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  };

  if (statusCode >= 500) {
    logger.error(message, logMeta);
  } else {
    logger.warn(message, logMeta);
  }

  // Respond
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

// ─── Application Error Class ──────────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 404 Handler ─────────────────────────────────────────────────────────────
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

module.exports = { errorHandler, AppError, notFoundHandler };
