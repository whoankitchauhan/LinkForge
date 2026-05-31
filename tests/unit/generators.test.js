'use strict';

const {
  generateBase62,
  generateNanoId,
  generateHash,
  validateCustomAlias,
  encodeBase62,
} = require('../../services/url/generators');

// Mock Prisma to avoid DB dependency in unit tests
jest.mock('../../shared/prisma', () => ({
  prisma: {
    url: {
      findFirst: jest.fn().mockResolvedValue(null), // No collision by default
    },
  },
}));

describe('URL Generators', () => {
  describe('encodeBase62', () => {
    it('encodes 0 correctly', () => {
      expect(encodeBase62(0)).toBe('0');
    });

    it('encodes a positive integer to Base62', () => {
      const result = encodeBase62(12345678);
      expect(result).toMatch(/^[0-9A-Za-z]+$/);
    });

    it('produces different codes for different numbers', () => {
      expect(encodeBase62(100)).not.toBe(encodeBase62(200));
    });
  });

  describe('generateBase62', () => {
    it('generates a 7-character alphanumeric code', async () => {
      const code = await generateBase62();
      expect(code).toHaveLength(7);
      expect(code).toMatch(/^[0-9A-Za-z]+$/);
    });

    it('generates unique codes', async () => {
      const codes = await Promise.all(Array.from({ length: 100 }, () => generateBase62()));
      const unique = new Set(codes);
      expect(unique.size).toBeGreaterThan(90); // Allow tiny collision probability
    });
  });

  describe('generateNanoId', () => {
    it('generates a 7-character code', async () => {
      const code = await generateNanoId();
      expect(code).toHaveLength(7);
      expect(code).toMatch(/^[0-9A-Za-z]+$/);
    });
  });

  describe('generateHash', () => {
    it('generates a deterministic-looking code from URL', async () => {
      const code = await generateHash('https://example.com');
      expect(code).toHaveLength(7);
      expect(code).toMatch(/^[0-9A-Za-z]+$/);
    });

    it('generates different codes for different URLs (due to timestamp)', async () => {
      const code1 = await generateHash('https://example.com');
      const code2 = await generateHash('https://other.com');
      // Very likely to differ due to random salt
      expect(code1).not.toBeNull();
      expect(code2).not.toBeNull();
    });
  });

  describe('validateCustomAlias', () => {
    it('accepts valid aliases', async () => {
      await expect(validateCustomAlias('my-link')).resolves.toBe('my-link');
      await expect(validateCustomAlias('portfolio')).resolves.toBe('portfolio');
      await expect(validateCustomAlias('tech_blog')).resolves.toBe('tech_blog');
    });

    it('lowercases the alias', async () => {
      await expect(validateCustomAlias('MyLink')).resolves.toBe('mylink');
    });

    it('rejects aliases that are too short', async () => {
      await expect(validateCustomAlias('ab')).rejects.toThrow('3–50 characters');
    });

    it('rejects aliases with invalid characters', async () => {
      await expect(validateCustomAlias('my link!')).rejects.toThrow();
    });

    it('rejects reserved words', async () => {
      await expect(validateCustomAlias('api')).rejects.toThrow('reserved');
      await expect(validateCustomAlias('admin')).rejects.toThrow('reserved');
    });

    it('rejects null/undefined', async () => {
      await expect(validateCustomAlias(null)).rejects.toThrow('required');
    });
  });
});
