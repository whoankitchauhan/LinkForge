<div align="center">

# ⚡ LinkForge Enterprise

**Distributed URL Shortening, Analytics, QR Management & Traffic Intelligence Platform**

> A production-grade full-stack application with a real-time analytics dashboard, JWT auth, Redis caching, RabbitMQ messaging, QR code generation, and a beautiful dark SPA frontend — all running locally with just Node.js + PostgreSQL.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## 🖼️ Live Screenshots

> Real screenshots captured from the running application at `http://localhost:3000`

### 🏠 Landing Page — Hero & URL Shortener

![Landing Page](docs/screenshots/01-landing.png)

*The hero section with the live URL shortener widget, generation strategy selector, and stats.*

---

### ✂️ URL Shortening in Action

![URL Input](docs/screenshots/03-shorten-input.png)

*Typing a long URL — supports Base62, NanoID, Hash strategies, and custom aliases.*

---

### 🌟 Platform Features

![Features Section](docs/screenshots/02-features.png)

*Feature cards: Redis caching, real-time analytics, JWT security, QR codes, and more.*

---

### 🔐 Sign In

![Sign In](docs/screenshots/05-auth-login.png)

*Clean auth page with email + password login, token-based sessions.*

![Sign In Filled](docs/screenshots/06-auth-login-filled.png)

---

### 📝 Create Account

![Register](docs/screenshots/07-auth-register.png)

*Registration with username, email, password strength validation.*

---

### 💚 Health Check API — Live Server

![Health Endpoint](docs/screenshots/08-health-endpoint.png)

*`GET /health` — proof the server is running: status, uptime, version, environment.*

---

## 🏗️ Architecture Overview

```
                          ┌─────────────────────────────────┐
                          │        Client (SPA + API)        │
                          └────────────────┬────────────────┘
                                           │
                          ┌────────────────▼────────────────┐
                          │      Express.js API Gateway       │
                          │   ┌──────┐ ┌─────┐ ┌────────┐   │
                          │   │ Auth │ │ URL │ │Redirect│   │
                          │   └──┬───┘ └──┬──┘ └───┬────┘   │
                          └──────┼────────┼─────────┼───────┘
                                 │        │         │
              ┌──────────────────┼────────┼─────────┼───────────┐
              │                  │        │         │           │
              │    ┌─────────────▼──────────────┐  │           │
              │    │  Redis Cache (OPTIONAL)     │  │           │
              │    │  URL Lookup · Rate Limit    │  │           │
              │    └─────────────────────────────┘  │           │
              │                                      │           │
              │    ┌────────────────────────────┐    │           │
              │    │   PostgreSQL (via Prisma)   │◄───┘           │
              │    │  users · urls · clicks      │               │
              │    └────────────────────────────┘               │
              │                                                   │
              │    ┌─────────────────────────────┐               │
              │    │  RabbitMQ (OPTIONAL)         │               │
              │    │  URL_CLICKED · URL_EXPIRED   │               │
              │    └────────┬──────────┬──────────┘               │
              │             │          │                          │
              │    ┌────────▼──┐  ┌────▼─────────┐              │
              │    │ Analytics  │  │ Notification │              │
              │    │  Worker   │  │   Worker     │              │
              │    └───────────┘  └──────────────┘              │
              └───────────────────────────────────────────────────┘
```

> **Note:** Redis and RabbitMQ are **optional** — the app runs fully with only PostgreSQL, falling back to direct DB queries and in-process event handling.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4 |
| Auth | JWT (access + refresh tokens) + bcrypt |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Cache | Redis 7 via ioredis *(optional)* |
| Message Broker | RabbitMQ 3 via amqplib *(optional)* |
| QR Codes | qrcode (npm) |
| Geo-IP | geoip-lite |
| Email | Nodemailer *(optional, logs in dev)* |
| Monitoring | Prometheus prom-client |
| Logging | Winston (coloured dev / JSON prod) |
| Frontend | Vanilla HTML/CSS/JS SPA |
| Testing | Jest + Supertest |

---

## 🚀 Quick Start — Run Locally

### Prerequisites
- **Node.js 20+** → [nodejs.org](https://nodejs.org)
- **PostgreSQL** running locally (or any reachable Postgres instance)

> Redis and RabbitMQ are **NOT required** to run and use the app.

---

### 1. Clone & Install

```bash
git clone https://github.com/whoankitchauhan/LinkForge.git
cd LinkForge
npm install
```

---

### 2. Configure Environment

The `.env` file is already set up with sensible defaults. The only thing you **must** change is your PostgreSQL connection string:

```bash
# Open .env and set your database URL:
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/linkforge_db
```

Everything else (JWT secrets, Redis, RabbitMQ, SMTP) works out of the box with defaults or is skipped gracefully.

---

### 3. Set Up the Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to your database (creates all tables)
npx prisma db push
```

---

### 4. Start the Server

```bash
npm run dev
```

Open → **http://localhost:3000** 🎉

**What you'll see in the terminal:**
```
[info] In-process fallback handlers registered (no-MQ mode)
[warn] RabbitMQ: RABBITMQ_URL not set — running in direct (no-queue) mode
[info] LinkForge server started {"port":3000,"env":"development"}
[warn] Redis: not available — running without cache (DB-only mode)
```

The `warn` lines are **expected** — Redis and RabbitMQ are optional and the app degrades gracefully.

---

### Optional: Enable Redis (for caching)

If you have Redis installed locally:

```bash
# In .env, Redis settings are already defaulted to localhost:6379
# Just make sure Redis is running:
redis-server
```

---

### Optional: Enable RabbitMQ (for async event queues)

```bash
# In .env, uncomment:
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Then start RabbitMQ:
# Windows: rabbitmq-service start
# Or via Docker: docker run -d -p 5672:5672 rabbitmq:3
```

---

### Optional: Full Stack with Docker

```bash
docker compose up --build
```

This starts: App + PostgreSQL + Redis + RabbitMQ + Prometheus + Grafana

---

## 📡 API Reference

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | ✗ | Register new user |
| GET | `/api/auth/verify-email?token=` | ✗ | Verify email address |
| POST | `/api/auth/login` | ✗ | Login → access + refresh tokens |
| POST | `/api/auth/refresh` | ✗ | Rotate tokens |
| POST | `/api/auth/logout` | ✓ | Invalidate session |
| POST | `/api/auth/forgot-password` | ✗ | Send reset email |
| POST | `/api/auth/reset-password` | ✗ | Apply new password |
| GET | `/api/auth/me` | ✓ | Get current user profile |

### URL Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/url` | Optional | Create short URL |
| GET | `/api/url` | ✓ | List your URLs (paginated) |
| GET | `/api/url/search` | ✓ | Search/filter URLs |
| GET | `/api/url/:id` | ✓ | Get URL details |
| PUT | `/api/url/:id` | ✓ | Update URL metadata |
| DELETE | `/api/url/:id` | ✓ | Soft-delete URL |
| POST | `/api/url/:id/qr` | ✓ | Generate/refresh QR code |

### Analytics Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics/dashboard` | ✓ | Dashboard summary + click trend |
| GET | `/api/analytics/:urlId` | ✓ | Full analytics breakdown for a URL |
| GET | `/api/analytics/:urlId/clicks` | ✓ | Paginated click log |

### Redirect & Utility

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/:shortCode` | ✗ | Resolve and redirect (302) |
| GET | `/health` | ✗ | Health check JSON |
| GET | `/metrics` | ✗ | Prometheus metrics |

---

## 🔗 URL Generation Strategies

| Strategy | Example | Characteristics |
|---|---|---|
| **BASE62** | `xA92Ks7` | 62⁷ ≈ 3.5T unique codes, compact |
| **NanoID** | `kN3mP8q` | Cryptographically secure random |
| **Hash** | `d4f92b1` | SHA-256 of URL + timestamp + salt |
| **Custom** | `my-link` | User-defined branded alias |

---

## ⚡ Redirect Flow

```
GET /xA92Ks7
      │
      ▼
Redis Cache Lookup  ──── if Redis available ────►  O(1) lookup
      │
      ├── HIT  ──► Check status/expiry ──► 302 Redirect
      │           Click event → in-process or MQ handler
      │
      └── MISS ──► PostgreSQL Lookup
                    │
                    ├── Not Found ──► 404
                    ├── Inactive  ──► 410
                    ├── Expired   ──► 410 + mark EXPIRED in DB
                    └── Active    ──► Cache update (if Redis up)
                                      Click count increment
                                      302 Redirect
                                      Analytics event (direct or MQ)
```

---

## 📊 Analytics Pipeline

```
URL_CLICKED Event
        │
        ▼
If RabbitMQ available → MQ Queue → Analytics Worker
If RabbitMQ down     → In-process handler (direct)
        │
        ▼
processClickEvent()
        │
        ├── Geo-IP Enrichment  (geoip-lite)
        │     IP → Country / City / Region
        │
        ├── UA Parsing  (ua-parser-js)
        │     Browser / OS / Device Type
        │
        └── DB Insert → clicks table
              (urlId, country, city, browser, os, device, referrer, isQrScan)
```

**Tracked Dimensions:**
- Total clicks & unique visitors (by IP)
- Daily / weekly / monthly trends
- Country & city distribution
- Device type (desktop / mobile / tablet)
- Browser & OS breakdown
- Referrer sources
- QR scan vs direct click ratio

---

## 🔐 Security Architecture

| Threat | Mitigation |
|---|---|
| XSS | Helmet CSP headers + input sanitisation |
| SQL Injection | Prisma parameterised queries |
| Open Redirect | URL scheme validation (no `javascript:`, `data:`, private IPs) |
| CSRF | SameSite=strict cookies + CORS origin whitelist |
| Brute Force | Sliding-window rate limiting (10 req/min on login) |
| Bot Abuse | UA heuristic filtering in redirect pipeline |
| Password Exposure | bcrypt (10 rounds dev / 12 prod) + refresh token hashing |
| Token Theft | HttpOnly cookies + short-lived access tokens (15 min) |

---

## ⚡ Rate Limiting

Uses Redis sliding-window counter (falls back to in-memory when Redis is offline):

| Endpoint | Limit | Window |
|---|---|---|
| `POST /api/auth/login` | 10 requests | 1 minute |
| `POST /api/url` | 50 requests | 1 minute |
| `GET /:shortCode` | 200 requests | 1 minute |
| General API | 200 requests | 1 minute |

---

## 📦 Caching Strategy

```
Key:   url:{shortCode}
Value: { id, originalUrl, status, expiresAt }
TTL:   86400s (24 hours, configurable via CACHE_TTL)

Graceful Degradation:
  - If Redis unavailable → all cache operations are no-ops
  - Redirects still work via direct PostgreSQL lookups

Invalidation Events:
  - URL updated  → DELETE key
  - URL deleted  → DELETE key
  - URL expired  → DELETE key (expiration worker)
```

---

## 🔄 Event System

| Event Key | Publisher | Consumers |
|---|---|---|
| `url.created` | URL Service | *(logged)* |
| `url.clicked` | Redirect Service | Analytics handler |
| `url.updated` | URL Service | *(logged)* |
| `url.deleted` | URL Service | *(logged)* |
| `url.expired` | Expiration Worker | Notification handler |
| `user.registered` | Auth Service | Notification handler |
| `user.password_reset` | Auth Service | Notification handler |

> When RabbitMQ is running: events go through the topic exchange to dedicated workers.  
> When RabbitMQ is **not** running: events are dispatched **in-process** directly to the same handler functions — same behaviour, no queue.

---

## 📈 Prometheus Metrics

Available at `GET /metrics`:

| Metric | Type | Description |
|---|---|---|
| `linkforge_http_requests_total` | Counter | HTTP requests by method/route/status |
| `linkforge_http_request_duration_ms` | Histogram | Request latency |
| `linkforge_cache_hits_total` | Counter | Redis cache hits |
| `linkforge_cache_misses_total` | Counter | Redis cache misses |
| `linkforge_urls_created_total` | Counter | URLs created by strategy |
| `linkforge_redirects_total` | Counter | Successful redirects |
| `linkforge_rate_limit_hits_total` | Counter | Rate limit rejections |
| `linkforge_db_query_duration_ms` | Histogram | DB query latency |

---

## 📁 Project Structure

```
LinkForge/
├── services/
│   ├── auth/                   ← JWT auth, register, login, password reset
│   │   ├── controller.js
│   │   ├── routes.js
│   │   ├── service.js
│   │   └── validators.js
│   ├── url/                    ← CRUD, generators (Base62/NanoID/Hash), QR
│   │   ├── controller.js
│   │   ├── generators.js
│   │   ├── qr.js
│   │   ├── routes.js
│   │   ├── service.js
│   │   └── validators.js
│   ├── redirect/               ← Hot path: cache-first redirect
│   │   ├── controller.js
│   │   ├── routes.js
│   │   └── service.js
│   ├── analytics/              ← Aggregation queries + click processor
│   │   ├── clickProcessor.js   ← Shared: used by MQ worker & in-process
│   │   ├── controller.js
│   │   ├── routes.js
│   │   ├── service.js
│   │   └── worker.js
│   ├── notification/           ← Email sending
│   │   ├── mailer.js
│   │   ├── notificationProcessor.js  ← Shared: MQ worker & in-process
│   │   └── worker.js
│   └── workers/                ← Background jobs
│       ├── expirationWorker.js ← Marks expired URLs, fires notifications
│       └── cacheSyncWorker.js  ← Warms Redis with top URLs
├── shared/
│   ├── middleware/
│   │   ├── auth.js             ← JWT verify, RBAC, optional auth
│   │   ├── errorHandler.js     ← Centralised error + 404 handling
│   │   └── rateLimit.js        ← Redis sliding-window limiter
│   ├── redis.js                ← ioredis singleton (graceful if offline)
│   ├── rabbitmq.js             ← amqplib + in-process fallback
│   ├── prisma.js               ← Prisma client singleton
│   ├── logger.js               ← Winston (coloured dev / JSON prod)
│   └── metrics.js              ← prom-client registry
├── prisma/
│   ├── schema.prisma           ← Full DB schema with indexes
│   └── seed.js                 ← Sample data seeder
├── frontend/                   ← SPA (HTML/CSS/JS, no framework)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js
│       ├── auth.js
│       ├── dashboard.js
│       └── analytics.js
├── docs/
│   └── screenshots/            ← Real browser screenshots
├── scripts/
│   └── take-screenshots.js     ← Puppeteer screenshot automation
├── monitoring/                 ← Prometheus + Grafana configs
├── nginx/                      ← Reverse proxy config
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/
├── .env                        ← Environment variables (annotated)
├── app.js                      ← Express app factory
└── server.js                   ← Entry point + graceful shutdown
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires running DB)
npm run test:integration

# Full suite with coverage
npm run test:coverage
```

---

## 🐳 Docker (Optional)

```bash
# Start only infrastructure (DB + optional services)
docker compose up postgres redis rabbitmq -d

# Or run everything including the app
docker compose up --build
```

Services:
| Service | Port | Notes |
|---|---|---|
| App | 3000 | Node.js API + SPA |
| PostgreSQL | 5432 | Required |
| Redis | 6379 | Optional |
| RabbitMQ | 5672 / 15672 | Optional (15672 = management UI) |
| Prometheus | 9090 | Optional |
| Grafana | 3001 | Optional |

---

## 👤 Author

**Ankit Chauhan**
- GitHub: [@whoankitchauhan](https://github.com/whoankitchauhan)

---

## 📄 License

MIT © 2024 Ankit Chauhan
