# LinkForge Enterprise — System Design Document

## 1. Functional Requirements

### Core
- Shorten long URLs to compact codes (7 characters)
- Redirect short URLs to original destinations with minimal latency
- Support custom branded aliases
- Track detailed click analytics (geo, device, browser, referrer)
- Authenticate users with JWT (access + refresh tokens)
- Generate and serve QR codes for short URLs
- Enforce URL expiration

### Analytics
- Real-time click ingestion via message queue
- Per-URL breakdown: country, city, device, browser, OS, referrer
- Daily/weekly/monthly trend aggregation
- Dashboard with top-performing links

### Admin/SaaS
- Role-based access: GUEST, USER, PREMIUM, ADMIN
- Rate limiting per endpoint per user/IP
- Email notifications (verification, password reset, expiration)
- API key management (future)

---

## 2. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Redirect latency (p99) | < 20ms (cache hit) |
| Redirect latency (p99) | < 100ms (cache miss) |
| URL creation throughput | 1,000 req/s |
| Redirect throughput | 50,000 req/s |
| Availability | 99.9% |
| Short code collision resistance | 62⁷ ≈ 3.5 trillion unique codes |
| Analytics ingestion lag | < 1 second (async) |
| Data durability | PostgreSQL + daily backups |

---

## 3. Estimation

### URL Volume
- 100M URLs stored → ~800 bytes per row → ~80 GB
- Click volume: 10B clicks/year → ~200 bytes → ~2 TB/year

### Traffic
- Redirect QPS: 50,000
- Write QPS (create): 1,000
- Analytics events: 50,000 msg/s (via RabbitMQ)

---

## 4. Database Design

### Indexes
```sql
-- Hot-path lookup (redirect)
CREATE UNIQUE INDEX urls_short_code_idx ON urls(short_code);
CREATE UNIQUE INDEX urls_custom_alias_idx ON urls(custom_alias);

-- User URL management
CREATE INDEX urls_created_by_idx ON urls(created_by);
CREATE INDEX urls_created_at_idx ON urls(created_at DESC);
CREATE INDEX urls_expires_at_idx ON urls(expires_at) WHERE expires_at IS NOT NULL;

-- Analytics queries
CREATE INDEX clicks_url_id_idx ON clicks(url_id);
CREATE INDEX clicks_clicked_at_idx ON clicks(clicked_at DESC);
CREATE INDEX clicks_country_idx ON clicks(country);
```

### Connection Pooling
Prisma uses `@prisma/client` with a connection pool. For high-throughput environments, use PgBouncer in transaction pooling mode.

---

## 5. Caching Strategy

### Cache-Aside Pattern

```
Client Request
      │
      ▼
  Check Redis key: url:{shortCode}
      │
      ├── HIT → deserialise → check expiry → redirect
      │
      └── MISS → DB query → populate Redis (TTL 24h) → redirect
```

### Eviction Policy
Redis configured with `allkeys-lru` and `maxmemory 256mb`, ensuring hot links stay cached and cold links are evicted under memory pressure.

### Cache Invalidation
- **On update**: `DEL url:{shortCode}` then re-populate with new data
- **On delete**: `DEL url:{shortCode}`
- **On expiration**: Expiration worker DELs the key when marking URL expired

### Cache Warming
At startup and every 6 hours, the cache sync worker loads the top 100 most-clicked URLs into Redis, ensuring zero cold-start penalty for popular links.

---

## 6. Short Code Generation

### Strategy Comparison

| Strategy | Uniqueness | Predictability | Performance |
|---|---|---|---|
| Base62 | DB collision check | Not guessable | Very fast |
| NanoID | Cryptographically random | Not guessable | Fast |
| Hash | Deterministic (with salt) | Not guessable | Moderate |
| Custom | User-defined, validated | User-controlled | N/A |

### Collision Handling
All generated codes undergo a uniqueness check against the DB (`SELECT 1 WHERE short_code = $1`). On collision, regenerate up to 5 times before throwing an error (probability < 10⁻³² with Base62 7-char codes).

---

## 7. Analytics Pipeline

```
Redirect Service
      │
      │ (fire-and-forget, non-blocking)
      ▼
RabbitMQ Topic Exchange (url.clicked)
      │
      ▼
Analytics Worker (consumer × N)
      │
      ├── Geo-IP enrichment (geoip-lite in-memory DB)
      ├── UA parsing (ua-parser-js)
      └── DB INSERT into clicks table
```

**Why async?** The redirect response is sent immediately. Analytics processing happens in a separate worker process, so analytics failures never impact redirect latency.

---

## 8. Rate Limiting Design

### Sliding Window Algorithm

```
Key: rl:{endpoint}:{identifier}
     e.g. rl:auth:login:192.168.1.1

Algorithm:
  1. INCR key → count
  2. If count == 1: EXPIRE key {windowSeconds}
  3. If count > limit: return 429

Properties:
  - O(1) Redis operations
  - Fails open if Redis is unavailable
  - Per-user limiting when authenticated (by userId not IP)
```

---

## 9. Security Architecture

### JWT Flow
```
Login
  │
  ├── Issue: access_token (15 min, in response body + HttpOnly cookie)
  └── Issue: refresh_token (7 days, in HttpOnly cookie + DB hash)

Access Token Refresh
  │
  ├── Verify refresh_token signature
  ├── Compare hash against DB stored hash
  ├── Issue new access_token
  └── Rotate refresh_token (token rotation)

Logout
  └── Set refreshTokenHash = NULL in DB (invalidates all sessions)
```

### URL Validation
Before storing any destination URL:
1. Reject non-HTTP(S) schemes (`javascript:`, `data:`, `vbscript:`, `file:`)
2. Reject private/loopback IPs (`10.x`, `172.16–31.x`, `192.168.x`, `127.x`)
3. Reject localhost hostname
4. Validate URL is parseable

---

## 10. Scalability Strategy

### Horizontal Scaling
- Stateless Express app → deploy N instances behind load balancer
- Redis and RabbitMQ as shared external services
- Prisma with PgBouncer for DB connection pooling at scale

### Database Sharding (Future)
- Shard `clicks` table by `url_id` (hash partitioning)
- Keep `urls` and `users` on primary; analytics on read replicas

### Read Replicas
- Direct analytics aggregation queries to read replica
- Redirect lookup uses Redis cache first (reduces DB read load to near-zero for popular URLs)

### RabbitMQ Worker Scaling
- Run N analytics worker instances; RabbitMQ distributes messages round-robin
- `prefetch(10)` limits each worker to 10 in-flight messages (back-pressure)

---

## 11. High Availability Design

| Component | HA Strategy |
|---|---|
| App tier | Multiple EC2 instances + ALB |
| PostgreSQL | RDS Multi-AZ (synchronous standby) |
| Redis | ElastiCache cluster mode (read replicas + automatic failover) |
| RabbitMQ | Amazon MQ active/standby pair |
| DNS | Route 53 health checks |

---

## 12. Disaster Recovery

| Scenario | RTO | RPO | Strategy |
|---|---|---|---|
| App instance failure | < 1 min | 0 | ALB detects + routes to healthy |
| DB primary failure | < 2 min | < 60s | RDS Multi-AZ automatic failover |
| Redis failure | < 1 min | 0 | App falls back to DB (cache miss path) |
| RabbitMQ failure | < 5 min | events in-flight | Durable queues; workers reconnect |
| Full region failure | < 30 min | < 1 hour | S3 snapshot restore to secondary region |

---

## 13. Key Trade-offs & Design Decisions

| Decision | Choice | Alternative | Rationale |
|---|---|---|---|
| Monorepo vs polyrepo | Monorepo | Polyrepo | Simpler local dev, all services visible |
| ORM | Prisma | Raw SQL / Sequelize | Type-safe, migrations, excellent DX |
| Redirect status code | 302 | 301 | 301 is browser-cached (breaks analytics) |
| Analytics pipeline | Async (MQ) | Sync (in-request) | Redirect latency must be < 20ms |
| Cache eviction | allkeys-lru | volatile-lru | Ensures cache always frees memory |
| Short code length | 7 chars | 6 or 8 | 6 = only 56B unique; 8 = wastes space |
| QR storage | Local filesystem | S3 | Simplicity for development |
| JWT storage | HttpOnly cookie | localStorage | Cookie is XSS-resistant |

---

## 14. Monitoring Runbook

### Key Alerts to Configure

| Alert | Condition | Action |
|---|---|---|
| High error rate | HTTP 5xx > 1% | Check app logs, restart pods |
| Cache hit ratio low | hits/(hits+misses) < 80% | Increase Redis maxmemory |
| Queue depth high | RabbitMQ queue > 10,000 | Scale analytics workers |
| DB slow queries | p99 query > 500ms | Check for missing indexes |
| Rate limit spike | rateLimitHits > 100/min | Investigate IP, consider blocking |

### Grafana Dashboard Panels
1. Requests per second by route
2. HTTP latency histogram (p50/p95/p99)
3. Cache hit ratio gauge
4. RabbitMQ queue depth
5. Redirects per second
6. Active DB connections
7. Error rate by status code
