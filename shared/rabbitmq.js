'use strict';

const amqplib = require('amqplib');
const logger = require('./logger');

// ─── Connection State ─────────────────────────────────────────────────────────
let connection = null;
let channel = null;

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

// ─── Connect ──────────────────────────────────────────────────────────────────
async function connect() {
  try {
    connection = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    channel = await connection.createChannel();

    // Topic exchange — routes events by routing key pattern
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    logger.info('RabbitMQ: connected and exchange asserted', { exchange: EXCHANGE });

    connection.on('error', (err) => {
      logger.error('RabbitMQ connection error', { error: err.message });
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ: connection closed — attempting reconnect in 5s');
      setTimeout(connect, 5000);
    });

    return channel;
  } catch (err) {
    logger.error('RabbitMQ: failed to connect', { error: err.message });
    logger.warn('RabbitMQ: retrying in 5s...');
    setTimeout(connect, 5000);
  }
}

// ─── Publish ──────────────────────────────────────────────────────────────────
async function publish(routingKey, payload) {
  if (!channel) {
    logger.warn('RabbitMQ: channel not ready, dropping event', { routingKey });
    return false;
  }
  try {
    const message = Buffer.from(JSON.stringify(payload));
    channel.publish(EXCHANGE, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });
    logger.debug('RabbitMQ: event published', { routingKey, payload });
    return true;
  } catch (err) {
    logger.error('RabbitMQ: publish failed', { error: err.message, routingKey });
    return false;
  }
}

// ─── Subscribe ────────────────────────────────────────────────────────────────
async function subscribe(queueName, bindingPattern, handler, options = {}) {
  if (!channel) {
    throw new Error('RabbitMQ channel not ready. Call connect() first.');
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
      // Nack without requeue for poison pill messages
      channel.nack(msg, false, false);
    }
  });

  logger.info('RabbitMQ: subscribed', { queue: queueName, pattern: bindingPattern });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function close() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    logger.info('RabbitMQ: connection closed gracefully');
  } catch (err) {
    logger.error('RabbitMQ: error during close', { error: err.message });
  }
}

module.exports = { connect, publish, subscribe, close, EVENTS };
