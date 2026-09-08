'use strict';

require('dotenv').config();

const http = require('http');
const createApp = require('./app');
const logger = require('./shared/logger');
const { disconnectPrisma } = require('./shared/prisma');

const PORT = parseInt(process.env.PORT) || 3000;

async function boot() {
  try {
    const app = createApp();
    const server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(`LinkForge running at http://localhost:${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down`);
      server.close(async () => {
        await disconnectPrisma();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason: String(reason) });
      process.exit(1);
    });

  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

boot();
