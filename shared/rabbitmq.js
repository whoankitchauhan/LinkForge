'use strict';

// No-op event bus — RabbitMQ removed for simplicity.
// Events are silently dropped (analytics/notifications handled directly).

const EVENTS = {
  URL_CREATED: 'url.created',
  URL_CLICKED: 'url.clicked',
  URL_UPDATED: 'url.updated',
  URL_DELETED: 'url.deleted',
  URL_EXPIRED: 'url.expired',
  USER_REGISTERED: 'user.registered',
  USER_PASSWORD_RESET: 'user.password_reset',
};

async function connect() { /* no-op */ }
async function publish(_routingKey, _payload) { return true; }
async function subscribe(_queue, _pattern, _handler) { /* no-op */ }
async function close() { /* no-op */ }

module.exports = { connect, publish, subscribe, close, EVENTS };
