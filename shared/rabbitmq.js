'use strict';

const logger = require('./logger');

// ─── Connection State ─────────────────────────────────────────────────────────
let connection = null;
let channel = null;
let mqAvailable = false;

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'linkforge_events';

// ─── Events ───────────────────────────────────────────────────────────────────
const EVENTS = {
  URL_CREATED: 'url.created',
  URL_UPDATED: 'url.updated',
  URL_DELETED: 'url.deleted',
  URL_CLICKED: 'url.clicked',
  URL_EXPIRED: 'url.expired',
  USER_REGISTERED: 'user.registered',
  USER_PASSWORD_RESET: 'user.password_reset',
};

// ─── In-process event handlers (fallback when RabbitMQ is unavailable) ────────
const inProcessHandlers = {};

/**
 * Register an in-process event handler used when RabbitMQ is not available.
 */
function registerInProcessHandler(routingKey, handler) {
  if (!inProcessHandlers[routingKey]) inProcessHandlers[routingKey] = [];
  inProcessHandlers[routingKey].push(handler);
}

// ─── Connect (optional — will not crash if unavailable) ───────────────────────
async function connect() {
  const url = process.env.RABBITMQ_URL;
  if (!url && process.env.NODE_ENV !== 'production') {
    logger.warn('RabbitMQ: RABBITMQ_URL not set — running in direct (no-queue) mode');
    mqAvailable = false;
    return;
  }

  try {
    const amqplib = require('amqplib');
    connection = await Promise.race([
      amqplib.connect(url || 'amqp://localhost'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);

    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    mqAvailable = true;

    logger.info('RabbitMQ: connected', { exchange: EXCHANGE });

    connection.on('error', (err) => {
      logger.warn('RabbitMQ: connection error — switching to direct mode', { error: err.message });
      mqAvailable = false;
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ: connection closed — running in direct mode');
      mqAvailable = false;
      // Attempt to reconnect after 10s
      setTimeout(() => connect().catch(() => {}), 10000);
    });
  } catch (err) {
    logger.warn('RabbitMQ: not available — running in direct (no-queue) mode', { error: err.message });
    mqAvailable = false;
    // Don't throw — let the app continue without MQ
  }
}

// ─── Publish ──────────────────────────────────────────────────────────────────
async function publish(routingKey, payload) {
  // If MQ is up, use it
  if (mqAvailable && channel) {
    try {
      const message = Buffer.from(JSON.stringify(payload));
      channel.publish(EXCHANGE, routingKey, message, {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      logger.warn('RabbitMQ: publish failed — falling back to direct processing', { error: err.message });
    }
  }

  // Fallback: dispatch to in-process handlers synchronously
  const handlers = inProcessHandlers[routingKey] || [];
  for (const handler of handlers) {
    try {
      await handler(payload, routingKey);
    } catch (err) {
      logger.error('In-process event handler failed', { routingKey, error: err.message });
    }
  }

  return true;
}

// ─── Subscribe ────────────────────────────────────────────────────────────────
async function subscribe(queueName, bindingPattern, handler, options = {}) {
  if (!mqAvailable || !channel) {
    // Register as in-process handler instead
    registerInProcessHandler(bindingPattern, handler);
    logger.info('RabbitMQ: registered in-process handler', { pattern: bindingPattern });
    return;
  }

  await channel.assertQueue(queueName, { durable: true, ...options });
  await channel.bindQueue(queueName, EXCHANGE, bindingPattern);
  await channel.prefetch(10);

  channel.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload, msg.fields.routingKey);
      channel.ack(msg);
    } catch (err) {
      logger.error('RabbitMQ: message processing failed', { error: err.message });
      channel.nack(msg, false, false);
    }
  });

  logger.info('RabbitMQ: subscribed', { queue: queueName, pattern: bindingPattern });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function close() {
  try {
    if (channel) await channel.close().catch(() => {});
    if (connection) await connection.close().catch(() => {});
    logger.info('RabbitMQ: connection closed gracefully');
  } catch (err) {
    logger.error('RabbitMQ: error during close', { error: err.message });
  }
  mqAvailable = false;
}

function isMqAvailable() {
  return mqAvailable;
}

module.exports = { connect, publish, subscribe, close, EVENTS, registerInProcessHandler, isMqAvailable };
