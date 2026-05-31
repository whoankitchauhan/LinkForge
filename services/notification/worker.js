'use strict';

require('dotenv').config();

const { connect, subscribe, EVENTS } = require('../../shared/rabbitmq');
const { prisma } = require('../../shared/prisma');
const mailer = require('./mailer');
const logger = require('../../shared/logger');

const QUEUE_NAME = process.env.RABBITMQ_QUEUE_NOTIFICATIONS || 'notifications_queue';

async function handleUserRegistered(payload) {
  const { email, username, verifyToken } = payload;
  logger.info('Notification: sending verification email', { email });
  await mailer.sendVerificationEmail(email, { username, token: verifyToken });
}

async function handlePasswordReset(payload) {
  const { email, token } = payload;
  logger.info('Notification: sending password reset email', { email });
  await mailer.sendPasswordResetEmail(email, { token });
}

async function handleUrlExpired(payload) {
  const { urlId } = payload;

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
}

async function startNotificationWorker() {
  logger.info('Notification worker: starting...');
  await connect();

  await subscribe(QUEUE_NAME, EVENTS.USER_REGISTERED, handleUserRegistered);
  await subscribe(QUEUE_NAME, EVENTS.USER_PASSWORD_RESET, handlePasswordReset);
  await subscribe(QUEUE_NAME, EVENTS.URL_EXPIRED, handleUrlExpired);

  logger.info('Notification worker: ready');
}

startNotificationWorker().catch((err) => {
  logger.error('Notification worker: fatal error', { error: err.message });
  process.exit(1);
});
