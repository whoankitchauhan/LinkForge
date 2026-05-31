'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

// ─── Singleton ────────────────────────────────────────────────────────────────
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ─── Logging Events ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Prisma query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  });
}

prisma.$on('warn', (e) => logger.warn('Prisma warning', { message: e.message }));
prisma.$on('error', (e) => logger.error('Prisma error', { message: e.message }));

// ─── Graceful Disconnect ──────────────────────────────────────────────────────
async function disconnectPrisma() {
  await prisma.$disconnect();
  logger.info('Prisma: disconnected');
}

module.exports = { prisma, disconnectPrisma };
