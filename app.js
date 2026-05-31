'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logger = require('./shared/logger');
const { errorHandler, notFoundHandler } = require('./shared/middleware/errorHandler');
const { apiLimiter } = require('./shared/middleware/rateLimit');
const { register: metricsRegister } = require('./shared/metrics');

// ─── Route Imports ────────────────────────────────────────────────────────────
const authRoutes = require('./services/auth/routes');
const urlRoutes = require('./services/url/routes');
const analyticsRoutes = require('./services/analytics/routes');
const redirectRoutes = require('./services/redirect/routes');

// ─── App Factory ──────────────────────────────────────────────────────────────
function createApp() {
  const app = express();

  // ─── Security Headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
          fontSrc: ["'self'", 'fonts.gstatic.com'],
          scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // ─── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for origin: ${origin}`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ─── Body Parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use(cookieParser());
  app.use(compression());

  // ─── Request ID ────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  // ─── HTTP Logging ──────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      morgan('combined', {
        stream: logger.stream,
        skip: (req) => req.url === '/health' || req.url === '/metrics',
      })
    );
  }

  // ─── Static Files ──────────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/frontend', express.static(path.join(__dirname, 'frontend')));

  // ─── Health Check ──────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('./package.json').version,
      environment: process.env.NODE_ENV,
    });
  });

  // ─── Prometheus Metrics ────────────────────────────────────────────────────
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', metricsRegister.contentType);
      res.end(await metricsRegister.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  // ─── API Routes ────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/url', apiLimiter, urlRoutes);
  app.use('/api/analytics', apiLimiter, analyticsRoutes);

  // ─── Redirect Route (must be last — catches /:shortCode) ──────────────────
  app.use('/', redirectRoutes);

  // ─── Frontend SPA Fallback ─────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  });

  // ─── Error Handling ────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
