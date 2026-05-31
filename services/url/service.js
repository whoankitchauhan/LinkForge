'use strict';

const { prisma } = require('../../shared/prisma');
const { cacheSet, cacheDel } = require('../../shared/redis');
const { publish, EVENTS } = require('../../shared/rabbitmq');
const { AppError } = require('../../shared/middleware/errorHandler');
const { generateUniqueCode, validateCustomAlias } = require('./generators');
const { generateQrCode, deleteQrCode } = require('./qr');
const { urlsCreatedTotal } = require('../../shared/metrics');
const logger = require('../../shared/logger');

const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 86400;
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'linkforge.io';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Create URL ───────────────────────────────────────────────────────────────
async function createUrl(data, userId = null) {
  const {
    originalUrl,
    customAlias,
    title,
    description,
    tags = [],
    expiresAt,
    slugType = process.env.DEFAULT_SLUG_TYPE || 'BASE62',
    generateQr = false,
  } = data;

  let shortCode;

  if (slugType === 'CUSTOM' || customAlias) {
    shortCode = await validateCustomAlias(customAlias);

    // Check alias uniqueness
    const existing = await prisma.url.findFirst({
      where: { OR: [{ shortCode }, { customAlias: shortCode }] },
      select: { id: true },
    });
    if (existing) throw new AppError('This custom alias is already taken', 409);
  } else {
    shortCode = await generateUniqueCode(slugType, originalUrl);
  }

  // Build full short URL
  const shortUrl = `${APP_URL}/${shortCode}`;

  // Generate QR code if requested
  let qrCodeUrl = null;
  if (generateQr) {
    qrCodeUrl = await generateQrCode(shortCode, shortUrl);
  }

  const url = await prisma.url.create({
    data: {
      originalUrl,
      shortCode,
      customAlias: slugType === 'CUSTOM' ? shortCode : null,
      slugType,
      domain: BASE_DOMAIN,
      title,
      description,
      tags,
      qrCodeUrl,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: userId,
    },
  });

  // Cache the mapping
  await cacheSet(`url:${shortCode}`, { originalUrl, status: 'ACTIVE', expiresAt }, CACHE_TTL);

  // Publish event
  await publish(EVENTS.URL_CREATED, { urlId: url.id, shortCode, originalUrl, userId });

  // Track metric
  urlsCreatedTotal.inc({ slug_type: slugType });

  logger.info('URL created', { urlId: url.id, shortCode, userId });
  return { ...url, shortUrl };
}

// ─── List URLs ────────────────────────────────────────────────────────────────
async function listUrls(userId, { page = 1, limit = 20, status, sort = 'createdAt', order = 'desc' }) {
  const skip = (page - 1) * limit;

  const where = { createdBy: userId };
  if (status) where.status = status;

  const [urls, total] = await Promise.all([
    prisma.url.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      select: {
        id: true, originalUrl: true, shortCode: true, customAlias: true,
        slugType: true, title: true, description: true, tags: true,
        qrCodeUrl: true, expiresAt: true, status: true, clickCount: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.url.count({ where }),
  ]);

  return {
    urls: urls.map((u) => ({ ...u, shortUrl: `${APP_URL}/${u.shortCode}` })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

// ─── Get URL by ID ────────────────────────────────────────────────────────────
async function getUrlById(id, userId) {
  const url = await prisma.url.findUnique({
    where: { id },
    select: {
      id: true, originalUrl: true, shortCode: true, customAlias: true,
      slugType: true, domain: true, title: true, description: true, tags: true,
      qrCodeUrl: true, expiresAt: true, status: true, clickCount: true,
      createdBy: true, createdAt: true, updatedAt: true,
    },
  });

  if (!url) throw new AppError('URL not found', 404);

  // Users can only access their own URLs (admin bypassed at route level)
  if (userId && url.createdBy !== userId) {
    throw new AppError('Access denied', 403);
  }

  return { ...url, shortUrl: `${APP_URL}/${url.shortCode}` };
}

// ─── Update URL ───────────────────────────────────────────────────────────────
async function updateUrl(id, userId, updates) {
  const existing = await prisma.url.findUnique({ where: { id }, select: { createdBy: true, shortCode: true } });

  if (!existing) throw new AppError('URL not found', 404);
  if (existing.createdBy !== userId) throw new AppError('Access denied', 403);

  const { title, description, tags, expiresAt, status } = updates;

  const updated = await prisma.url.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(tags !== undefined && { tags }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(status !== undefined && { status }),
    },
  });

  // Invalidate cache
  await cacheDel(`url:${existing.shortCode}`);

  // If reactivating, re-cache
  if (status === 'ACTIVE' || !status) {
    await cacheSet(
      `url:${existing.shortCode}`,
      { originalUrl: updated.originalUrl, status: updated.status, expiresAt: updated.expiresAt },
      CACHE_TTL
    );
  }

  await publish(EVENTS.URL_UPDATED, { urlId: id, shortCode: existing.shortCode, userId });
  logger.info('URL updated', { urlId: id, userId });

  return { ...updated, shortUrl: `${APP_URL}/${updated.shortCode}` };
}

// ─── Delete URL ───────────────────────────────────────────────────────────────
async function deleteUrl(id, userId) {
  const existing = await prisma.url.findUnique({
    where: { id },
    select: { createdBy: true, shortCode: true, qrCodeUrl: true },
  });

  if (!existing) throw new AppError('URL not found', 404);
  if (existing.createdBy !== userId) throw new AppError('Access denied', 403);

  await prisma.url.update({ where: { id }, data: { status: 'DELETED' } });

  // Cleanup
  await cacheDel(`url:${existing.shortCode}`);
  if (existing.qrCodeUrl) await deleteQrCode(existing.shortCode);

  await publish(EVENTS.URL_DELETED, { urlId: id, shortCode: existing.shortCode, userId });
  logger.info('URL deleted', { urlId: id, userId });
}

// ─── Search URLs ──────────────────────────────────────────────────────────────
async function searchUrls(userId, { q, status, slugType, tag, page = 1, limit = 20, sort = 'createdAt', order = 'desc' }) {
  const skip = (page - 1) * limit;

  const where = {
    createdBy: userId,
    NOT: { status: 'DELETED' },
    ...(status && { status }),
    ...(slugType && { slugType }),
    ...(tag && { tags: { has: tag } }),
    ...(q && {
      OR: [
        { originalUrl: { contains: q, mode: 'insensitive' } },
        { shortCode: { contains: q, mode: 'insensitive' } },
        { customAlias: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const [urls, total] = await Promise.all([
    prisma.url.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
    }),
    prisma.url.count({ where }),
  ]);

  return {
    urls: urls.map((u) => ({ ...u, shortUrl: `${APP_URL}/${u.shortCode}` })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Generate / Refresh QR ────────────────────────────────────────────────────
async function generateQrForUrl(id, userId) {
  const url = await prisma.url.findUnique({ where: { id }, select: { createdBy: true, shortCode: true } });

  if (!url) throw new AppError('URL not found', 404);
  if (url.createdBy !== userId) throw new AppError('Access denied', 403);

  const shortUrl = `${APP_URL}/${url.shortCode}`;
  const qrCodeUrl = await generateQrCode(url.shortCode, shortUrl);

  await prisma.url.update({ where: { id }, data: { qrCodeUrl } });

  return qrCodeUrl;
}

module.exports = { createUrl, listUrls, getUrlById, updateUrl, deleteUrl, searchUrls, generateQrForUrl };
