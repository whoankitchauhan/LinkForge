'use strict';

require('dotenv').config();

const http = require('http');
const createApp = require('./app');
const logger = require('./shared/logger');
const { closeRedis } = require('./shared/redis');
const { close: closeMQ, connect: connectMQ } = require('./shared/rabbitmq');
const { disconnectPrisma } = require('./shared/prisma');

const PORT = parseInt(process.env.PORT) || 3000;

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    // Connect to message broker
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
