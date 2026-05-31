'use strict';

const request = require('supertest');
const createApp = require('../../app');

// ── Infrastructure mocks (must come before any app import) ───────────────────
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
  cacheIncr: jest.fn().mockResolvedValue(1), // Never rate-limit in tests
  cacheDelPattern: jest.fn().mockResolvedValue(0),
  closeRedis: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../shared/metrics', () => ({
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: jest.fn().mockResolvedValue('# mock metrics\n'),
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

// ── App instance (created once for whole suite) ───────────────────────────────
let app;

beforeAll(() => {
  app = createApp();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const uniqueSuffix = () => `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

describe('Auth API — Integration', () => {
  let testUser;
  let accessToken;

  beforeEach(() => {
    testUser = {
      email: `test_${uniqueSuffix()}@linkforge-test.io`,
      username: `tester_${uniqueSuffix()}`,
      password: 'SecurePass1',
    };
  });

  // ── Registration ────────────────────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('registers a new user and returns 201', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('rejects duplicate email with 409', async () => {
      // Register once
      await request(app).post('/api/auth/register').send(testUser);

      // Try again with same email
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, username: `other_${uniqueSuffix()}` });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects duplicate username with 409', async () => {
      await request(app).post('/api/auth/register').send(testUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: `other_${uniqueSuffix()}@linkforge-test.io` });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid email with 422', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'not-an-email' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('rejects too-short password with 422', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, password: '123' });

      expect(res.status).toBe(422);
    });

    it('rejects password without uppercase with 422', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, password: 'alllowercase1' });

      expect(res.status).toBe(422);
    });

    it('rejects username with invalid chars with 422', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, username: 'invalid user!' });

      expect(res.status).toBe(422);
    });
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Ensure user exists
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('logs in and returns access + refresh tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testUser.email);

      accessToken = res.body.data.accessToken;
    });

    it('rejects wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'WrongPass99' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects non-existent email with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'SomePass1' });

      expect(res.status).toBe(401);
    });

    it('rejects missing password with 422', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email });

      expect(res.status).toBe(422);
    });
  });

  // ── Protected Routes ────────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    let token;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      token = login.body.data?.accessToken;
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('returns 401 with malformed token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer this.is.not.valid');

      expect(res.status).toBe(401);
    });
  });

  // ── Health Check ─────────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 with health info', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });
});
