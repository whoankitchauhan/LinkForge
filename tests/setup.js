'use strict';
/**
 * Jest global setup — runs before any test module is loaded.
 * Ensures all required env vars exist so module-level code
 * (Redis, Prisma, Metrics) doesn't throw on import.
 */

// Minimal env defaults so modules don't crash on require()
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://linkforge:linkforge_secret@localhost:5432/linkforge_test';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3001';
process.env.BASE_DOMAIN = process.env.BASE_DOMAIN || 'linkforge.io';
process.env.PORT = process.env.PORT || '3001';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
process.env.SHORT_CODE_LENGTH = process.env.SHORT_CODE_LENGTH || '7';
process.env.CACHE_TTL = process.env.CACHE_TTL || '3600';
