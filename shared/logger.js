'use strict';

const winston = require('winston');
const path = require('path');

const { combine, timestamp, json, errors, colorize, printf } = winston.format;

// ─── Log Directory ────────────────────────────────────────────────────────────
const LOG_DIR = path.join(process.cwd(), 'logs');

// ─── Custom Dev Format ────────────────────────────────────────────────────────
const devFormat = printf(({ level, message, timestamp, requestId, ...meta }) => {
  const rid = requestId ? ` [${requestId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp}${rid} [${level}] ${message}${metaStr}`;
});

// ─── Transports ───────────────────────────────────────────────────────────────
const transports = [];

if (process.env.NODE_ENV === 'production') {
  // JSON structured logs for production (stdout for Docker log driver)
  transports.push(
    new winston.transports.Console({
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    })
  );
} else {
  // Coloured human-readable logs for development
  transports.push(
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
    })
  );
}

// ─── Logger Instance ──────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transports,
  exitOnError: false,
});

// ─── Child Logger Factory (attach requestId, service name, etc.) ──────────────
logger.child = (meta) => logger.child(meta);

// ─── Stream for Morgan HTTP Logging ──────────────────────────────────────────
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
