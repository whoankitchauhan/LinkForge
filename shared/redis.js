'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

let client;

/**
 * Returns the singleton Redis client.
 * Creates the connection on first call.
 */
function getRedisClient() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    lazyConnect: false,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  client.on('connect', () => logger.info('Redis: connection established'));
  client.on('ready', () => logger.info('Redis: client ready'));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('close', () => logger.warn('Redis: connection closed'));
  client.on('reconnecting', () => logger.info('Redis: reconnecting...'));

  return client;
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

/**
 * Get a value from Redis and parse JSON.
 */
async function cacheGet(key) {
  const redis = getRedisClient();
  const val = await redis.get(key);
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

/**
 * Set a JSON value in Redis with optional TTL (seconds).
 */
async function cacheSet(key, value, ttlSeconds = null) {
  const redis = getRedisClient();
  const serialised = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttlSeconds) {
    return redis.setex(key, ttlSeconds, serialised);
  }
  return redis.set(key, serialised);
}

/**
 * Delete a key from Redis.
 */
async function cacheDel(key) {
  return getRedisClient().del(key);
}

/**
 * Delete all keys matching a pattern (use sparingly).
 */
async function cacheDelPattern(pattern) {
  const redis = getRedisClient();
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

/**
 * Increment and set TTL atomically (sliding window rate limit helper).
 */
async function cacheIncr(key, ttlSeconds) {
  const redis = getRedisClient();
  const val = await redis.incr(key);
  if (val === 1) {
    await redis.expire(key, ttlSeconds);
  }
  return val;
}

/**
 * Close the Redis connection (for graceful shutdown).
 */
async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis: connection closed gracefully');
  }
}

module.exports = {
  getRedisClient,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  cacheIncr,
  closeRedis,
};
