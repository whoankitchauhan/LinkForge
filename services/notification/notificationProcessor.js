'use strict';

/**
 * Notification Event Processor
 * -----------------------------
 * Handles notification events both as an in-process handler (no MQ)
 * and as a shared module for the MQ-based notification worker.
 */

const mailer = require('./mailer');
const { prisma } = require('../../shared/prisma');
const { EVENTS } = require('../../shared/rabbitmq');
const logger = require('../../shared/logger');

async function handleUserRegistered(payload) {
  const { email, username, verifyToken } = payload;
  logger.info('Notification: sending verification email', { email });
  try {
    await mailer.sendVerificationEmail(email, { username, token: verifyToken });
  } catch (err) {
    logger.error('Notification: verification email failed', { error: err.message });
  }
}

async function handlePasswordReset(payload) {
  const { email, token } = payload;
  logger.info('Notification: sending password reset email', { email });
  try {
    await mailer.sendPasswordResetEmail(email, { token });
  } catch (err) {
    logger.error('Notification: password reset email failed', { error: err.message });
  }
}

async function handleUrlExpired(payload) {
  const { urlId } = payload;
  try {
    const url = await prisma.url.findUnique({
      where: { id: urlId },
      include: { user: { select: { email: true } } },
    });
    if (!url?.user?.email) return;
    logger.info('Notification: sending link expiration email', { urlId, email: url.user.email });
    await mailer.sendLinkExpirationEmail(url.user.email, {
      shortCode: url.shortCode,
      originalUrl: url.originalUrl,
    });
  } catch (err) {
    logger.error('Notification: link expiration email failed', { error: err.message });
  }
}

/**
 * Single dispatch function — routes by event type.
 * Used as the in-process handler registered in server.js.
 */
async function processNotificationEvent(payload, routingKey) {
  switch (routingKey) {
    case EVENTS.USER_REGISTERED:
      await handleUserRegistered(payload);
      break;
    case EVENTS.USER_PASSWORD_RESET:
      await handlePasswordReset(payload);
      break;
    case EVENTS.URL_EXPIRED:
      await handleUrlExpired(payload);
      break;
    default:
      logger.warn('Notification: unknown event type', { routingKey });
  }
}

module.exports = {
  processNotificationEvent,
  handleUserRegistered,
  handlePasswordReset,
  handleUrlExpired,
};
