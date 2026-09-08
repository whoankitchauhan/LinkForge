'use strict';

// No-op cache — Redis is removed for simplicity.
// When Redis is needed in the future, swap this file out.

async function cacheGet(_key) { return null; }
async function cacheSet(_key, _value, _ttl) { /* no-op */ }
async function cacheDel(_key) { /* no-op */ }
async function cacheDelPattern(_pattern) { /* no-op */ }
async function cacheIncr(_key, _ttl) { return 1; }
async function closeRedis() { /* no-op */ }

module.exports = { cacheGet, cacheSet, cacheDel, cacheDelPattern, cacheIncr, closeRedis };
