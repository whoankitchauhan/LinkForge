'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

let client = null;
let redisAvailable = false;

/**
 * Attempts to connect to Redis. If it fails, caching is silently disabled.
 * Returns the client if connected, or null if unavailable.
 */
function getRedisClient() {
  if (client) return client;

  try {
    client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null, // don't retry — just fail gracefully
    });

    client.on('ready', () => {
      redisAvailable = true;
      logger.info('Redis: connected and ready');
    });

    client.on('error', (err) => {
      if (redisAvailable) {
        logger.warn('Redis: connection error — caching disabled', { error: err.message });
      }
      redisAvailable = false;
    });

    client.on('close', () => {
      redisAvailable = false;
    });

    // Attempt connection
    client.connect().catch(() => {
      logger.warn('Redis: not available — running without cache (DB-only mode)');
      redisAvailable = false;
    });
  } catch (err) {
    logger.warn('Redis: failed to initialise — running without cache', { error: err.message });
    client = null;
    redisAvailable = false;
  }

  return client;
}

// ─── Cache Helpers (all no-op silently if Redis is down) ─────────────────────

async function cacheGet(key) {
  if (!redisAvailable || !client) return null;
  try {
    const val = await client.get(key);
    if (!val) return null;
    try { return JSON.parse(val); } catch { return val; }
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds = null) {
  if (!redisAvailable || !client) return;
  try {
    const serialised = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      return client.setex(key, ttlSeconds, serialised);
    }
    return client.set(key, serialised);
  } catch {
    // silently ignore
  }
}

async function cacheDel(key) {
  if (!redisAvailable || !client) return;
  try { return client.del(key); } catch { /* ignore */ }
}

async function cacheDelPattern(pattern) {
  if (!redisAvailable || !client) return 0;
  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    return client.del(...keys);
  } catch { return 0; }
}

async function cacheIncr(key, ttlSeconds) {
  if (!redisAvailable || !client) return 1;
  try {
    const val = await client.incr(key);
    if (val === 1) await client.expire(key, ttlSeconds);
    return val;
  } catch { return 1; }
}

async function closeRedis() {
  if (client) {
    try {
      await client.quit();
    } catch { /* ignore */ }
    client = null;
    redisAvailable = false;
    logger.info('Redis: connection closed');
  }
}

// Initialise on module load
getRedisClient();

module.exports = {
  getRedisClient,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  cacheIncr,
  closeRedis,
};
