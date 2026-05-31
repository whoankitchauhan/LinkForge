'use strict';

/**
 * Integration tests — fully self-contained via module mocks.
 * No real DB, Redis, or RabbitMQ required.
 */

// ── In-memory user store shared by the Prisma mock ───────────────────────────
const mockUsers = new Map();

// ── Infrastructure mocks (must be hoisted before any app require) ─────────────

jest.mock('../../shared/prisma', () => {
  return {
    prisma: {
      user: {
        findFirst: jest.fn(({ where }) => {
          const all = [...mockUsers.values()];
          if (where.OR) {
            for (const cond of where.OR) {
              if (cond.email) {
                const u = all.find((u) => u.email === cond.email);
                if (u) return Promise.resolve(u);
              }
              if (cond.username) {
                const u = all.find((u) => u.username === cond.username);
                if (u) return Promise.resolve(u);
              }
            }
            return Promise.resolve(null);
          }
          if (where.email) return Promise.resolve(all.find((u) => u.email === where.email) || null);
          if (where.id) return Promise.resolve(mockUsers.get(where.id) || null);
          return Promise.resolve(null);
        }),
        findUnique: jest.fn(({ where }) => {
          const all = [...mockUsers.values()];
          if (where.id) return Promise.resolve(mockUsers.get(where.id) || null);
          if (where.email) return Promise.resolve(all.find((u) => u.email === where.email) || null);
          return Promise.resolve(null);
        }),
        create: jest.fn(({ data, select }) => {
          const id = `uid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const now = new Date();
          const user = { id, ...data, createdAt: now, updatedAt: now };
          mockUsers.set(id, user);
          if (!select) return Promise.resolve(user);
          const result = {};
          Object.keys(select).forEach((k) => { if (user[k] !== undefined) result[k] = user[k]; });
          return Promise.resolve({ ...result, id });
        }),
        update: jest.fn(({ where, data }) => {
          const all = [...mockUsers.values()];
          const user =
            (where.id && mockUsers.get(where.id)) ||
            (where.email && all.find((u) => u.email === where.email));
          if (!user) return Promise.resolve(null);
          Object.assign(user, data, { updatedAt: new Date() });
          mockUsers.set(user.id, user);
          return Promise.resolve(user);
        }),
        count: jest.fn(() => Promise.resolve(mockUsers.size)),
      },
      $disconnect: jest.fn(),
      $on: jest.fn(),
    },
    disconnectPrisma: jest.fn(),
  };
});

jest.mock('../../shared/rabbitmq', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(true),
  subscribe: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  EVENTS: {
    USER_REGISTERED: 'user.registered',
    USER_PASSWORD_RESET: 'user.password_reset',
    URL_CREATED: 'url.created',
    URL_CLICKED: 'url.clicked',
    URL_UPDATED: 'url.updated',
    URL_DELETED: 'url.deleted',
    URL_EXPIRED: 'url.expired',
  },
}));

jest.mock('../../shared/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({ ping: jest.fn() }),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue('OK'),
  cacheDel: jest.fn().mockResolvedValue(1),
  cacheIncr: jest.fn().mockResolvedValue(1),  // never rate-limits
  cacheDelPattern: jest.fn().mockResolvedValue(0),
  closeRedis: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../shared/metrics', () => ({
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: jest.fn().mockResolvedValue(''),
  },
  httpRequestsTotal: { inc: jest.fn() },
  httpRequestDurationMs: { startTimer: jest.fn(() => jest.fn()), observe: jest.fn() },
  cacheHits: { inc: jest.fn() },
  cacheMisses: { inc: jest.fn() },
  urlsCreatedTotal: { inc: jest.fn() },
  redirectsTotal: { inc: jest.fn() },
  mqMessagesPublished: { inc: jest.fn() },
  rateLimitHits: { inc: jest.fn() },
  dbQueryDurationMs: { observe: jest.fn() },
}));

// ── App (required AFTER mocks are set up) ─────────────────────────────────────
const request = require('supertest');
const createApp = require('../../app');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  mockUsers.clear();
  jest.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => `${Date.now()}_${Math.floor(Math.random() * 99999)}`;

function makeUser() {
  return {
    email: `test_${uid()}@linkforge-ci.io`,
    username: `user_${uid()}`,
    password: 'SecurePass1',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 status:healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns 201', async () => {
    const user = makeUser();
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('returns 422 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...makeUser(), email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 for password without uppercase', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...makeUser(), password: 'alllowercase1' });
    expect(res.status).toBe(422);
  });

  it('returns 422 for too-short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...makeUser(), password: 'Ab1' });
    expect(res.status).toBe(422);
  });

  it('returns 422 for username with spaces', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...makeUser(), username: 'has space' });
    expect(res.status).toBe(422);
  });

  it('returns 409 for duplicate email', async () => {
    const user = makeUser();
    await request(app).post('/api/auth/register').send(user);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...user, username: `other_${uid()}` });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  let user;

  beforeEach(async () => {
    user = makeUser();
    await request(app).post('/api/auth/register').send(user);
  });

  it('returns 200 with tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPass99' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@nowhere.io', password: 'SomePass1' });
    expect(res.status).toBe(401);
  });

  it('returns 422 for missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/auth/me', () => {
  let token;
  let userEmail;

  beforeEach(async () => {
    const user = makeUser();
    userEmail = user.email;
    await request(app).post('/api/auth/register').send(user);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    token = login.body.data?.accessToken;
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.garbage');
    expect(res.status).toBe(401);
  });

  it('returns 200 with profile for valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(userEmail);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 200', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
