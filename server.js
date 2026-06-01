'use strict';

require('dotenv').config();

const http = require('http');
const createApp = require('./app');
const logger = require('./shared/logger');
const { closeRedis } = require('./shared/redis');
const { close: closeMQ, connect: connectMQ, registerInProcessHandler, EVENTS } = require('./shared/rabbitmq');
const { disconnectPrisma } = require('./shared/prisma');

const PORT = parseInt(process.env.PORT) || 3000;

// ─── Register in-process fallback handlers ────────────────────────────────────
// These run when RabbitMQ is not available, keeping analytics & notifications
// working via direct DB writes / direct function calls.

function registerFallbackHandlers() {
  // Analytics: process click events directly in-process
  const { processClickEvent } = require('./services/analytics/clickProcessor');
  registerInProcessHandler(EVENTS.URL_CLICKED, processClickEvent);

  // Notifications: send emails directly in-process
  const { processNotificationEvent } = require('./services/notification/notificationProcessor');
  registerInProcessHandler(EVENTS.USER_REGISTERED, processNotificationEvent);
  registerInProcessHandler(EVENTS.USER_PASSWORD_RESET, processNotificationEvent);
  registerInProcessHandler(EVENTS.URL_EXPIRED, processNotificationEvent);

  logger.info('In-process fallback handlers registered (no-MQ mode)');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    // Register fallback handlers first (used when MQ not available)
    registerFallbackHandlers();

    // Try to connect to RabbitMQ — won't crash if unavailable
    await connectMQ();

    const app = createApp();
    const server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(`LinkForge server started`, {
        port: PORT,
        env: process.env.NODE_ENV,
        pid: process.pid,
        url: `http://localhost:${PORT}`,
      });
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);

      server.close(async () => {
        try {
          await closeRedis();
          await closeMQ();
          await disconnectPrisma();
          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          logger.error('Error during shutdown', { error: err.message });
          process.exit(1);
        }
      });

      // Force exit after 30s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason: String(reason) });
      process.exit(1);
    });

    return server;
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

boot();
