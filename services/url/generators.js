'use strict';

const crypto = require('crypto');
const { customAlphabet } = require('nanoid');
const { prisma } = require('../../shared/prisma');

const SHORT_CODE_LENGTH = parseInt(process.env.SHORT_CODE_LENGTH) || 7;

// ─── Base62 Alphabet ──────────────────────────────────────────────────────────
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// ─── Strategy 1: Base62 Encoding ──────────────────────────────────────────────
/**
 * Encodes a number to Base62 string.
 * In production this would use a distributed ID (e.g., Snowflake).
 */
function encodeBase62(num) {
  if (num === 0) return BASE62_CHARS[0];
  let result = '';
  while (num > 0) {
    result = BASE62_CHARS[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

async function generateBase62() {
  // Use a large random integer as the source number
  const randomNum = parseInt(crypto.randomBytes(6).toString('hex'), 16);
  let code = encodeBase62(randomNum);
  // Pad/trim to exact length
  while (code.length < SHORT_CODE_LENGTH) {
    code = BASE62_CHARS[Math.floor(Math.random() * 62)] + code;
  }
  return code.slice(0, SHORT_CODE_LENGTH);
}

// ─── Strategy 2: NanoID ───────────────────────────────────────────────────────
const nanoIdGenerator = customAlphabet(BASE62_CHARS, SHORT_CODE_LENGTH);

async function generateNanoId() {
  return nanoIdGenerator();
}

// ─── Strategy 3: Hash-Based ───────────────────────────────────────────────────
/**
 * SHA-256 hash of (URL + timestamp), Base62-encoded and truncated.
 */
async function generateHash(originalUrl) {
  const input = `${originalUrl}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');

  // Convert hex to big integer, then encode as Base62
  let num = BigInt(`0x${hash.slice(0, 12)}`);
  let code = '';
  while (num > 0n) {
    code = BASE62_CHARS[Number(num % 62n)] + code;
    num = num / 62n;
  }

  return code.slice(0, SHORT_CODE_LENGTH).padStart(SHORT_CODE_LENGTH, '0');
}

// ─── Strategy 4: Custom Alias ─────────────────────────────────────────────────
/**
 * Validates and normalises a user-supplied alias.
 * Returns the alias if valid, throws otherwise.
 */
async function validateCustomAlias(alias) {
  if (!alias) throw new Error('Custom alias is required');

  const cleaned = alias.trim().toLowerCase();

  if (cleaned.length < 3 || cleaned.length > 50) {
    throw new Error('Custom alias must be 3–50 characters');
  }

  if (!/^[a-z0-9_-]+$/.test(cleaned)) {
    throw new Error('Custom alias may only contain lowercase letters, numbers, hyphens and underscores');
  }

  // Reserved words
  const reserved = [
    'api', 'admin', 'dashboard', 'auth', 'login', 'register',
    'health', 'metrics', 'static', 'assets', 'qr', 'docs',
    'frontend', 'app', 'help', 'support',
  ];
  if (reserved.includes(cleaned)) {
    throw new Error(`"${cleaned}" is a reserved alias`);
  }

  return cleaned;
}

// ─── Uniqueness Guarantee ─────────────────────────────────────────────────────
/**
 * Generates a unique short code using the given strategy.
 * Retries up to MAX_RETRIES times on collision.
 */
const MAX_RETRIES = 5;

async function generateUniqueCode(strategy, originalUrl = '') {
  for (let i = 0; i < MAX_RETRIES; i++) {
    let code;

    switch (strategy) {
      case 'BASE62':
        code = await generateBase62();
        break;
      case 'NANOID':
        code = await generateNanoId();
        break;
      case 'HASH':
        code = await generateHash(originalUrl);
        break;
      default:
        code = await generateBase62();
    }

    // Check uniqueness in DB
    const existing = await prisma.url.findFirst({
      where: { OR: [{ shortCode: code }, { customAlias: code }] },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error('Failed to generate unique short code. Please try again.');
}

module.exports = {
  generateBase62,
  generateNanoId,
  generateHash,
  validateCustomAlias,
  generateUniqueCode,
  encodeBase62,
};
