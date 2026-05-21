# univ-sentinel

Auto-hooking logging SDK for Node.js, React, Angular, and Python.  
One command patches your app — no manual imports needed.

---

## Quick start

### 1. Start the relay server + ClickHouse

Clone this repo and run:

```bash
cp .env.example .env   # fill in your ClickHouse creds
npx tsx server.ts
```

Check it's alive:
```bash
curl http://localhost:4318/sentinel/health
```

---

### 2. Patch your app

Run this **from your project root**:

```bash
npx --yes github:Mrithika2005/univ-sentinel-logs-v2
```

That's it. The CLI will:

| What it finds | What it patches |
|---|---|
| `main.py` | Full Python agent — patches `logging`, `requests`, `sqlalchemy`, `psycopg2`, `neo4j`, `redis` |
| `index.ts` / `server.ts` / `app.ts` | Full Node agent — patches `http`, `pg`, `mongoose`, `redis`, `kafka`, `amqplib` |
| `App.tsx` / `App.jsx` | Full Browser agent — patches `fetch`, `XHR`, web vitals, errors |
| `app.component.ts` / `app.module.ts` | Full Browser agent for Angular |

---

### 3. Env vars (optional)

Set these in your app's `.env` to configure:

```env
SENTINEL_SERVICE=my-app
CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_DATABASE=sentinel
CLICKHOUSE_TABLE=logs
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
SENTINEL_DEBUG=false
LOG_LEVEL=INFO
SENTINEL_CERT_HOSTS=api.example.com,mysite.com
```

---

## Manual usage (without the CLI)

### Node.js

```ts
import { initSentinel } from 'univ-sentinel/node';

await initSentinel({
  serviceName: 'my-service',
  clickhouseHost: 'http://localhost:8123',
});
```

### Browser / React

```ts
import { initBrowserSentinel } from 'univ-sentinel/browser';

initBrowserSentinel({
  serviceName: 'my-frontend',
  relayUrl: 'http://localhost:4318/sentinel/ingest',
});
```

### Python

```python
from sentinel_sdk.python.agent import init_sentinel

sentinel = init_sentinel(
    'my-service',
    clickhouse_host='http://localhost:8123',
)
```

---

## What gets logged automatically

**Node.js**
- All inbound HTTP requests + responses
- Outbound HTTP calls
- PostgreSQL queries (slow query detection)
- MongoDB / Mongoose queries
- Redis commands
- Kafka / RabbitMQ / BullMQ events
- Process vitals every 30s (CPU, memory, disk, network)
- TLS cert expiry checks
- Uncaught exceptions + unhandled rejections

**Browser**
- All `fetch` and `XHR` calls
- Page navigation (SPA-aware)
- Web vitals (LCP, FCP, CLS, FID, TTFB, INP)
- JS errors + unhandled rejections
- Click, scroll depth, form submit/abandon
- Low FPS detection

**Python**
- All `logging` module output
- `requests` / `httpx` calls
- SQLAlchemy queries
- psycopg2 queries
- Neo4j queries
- Redis commands
- Celery tasks
- RabbitMQ / Kafka events
- Process vitals
- TLS cert expiry checks

---

## Concurrent users

Yes — fully safe. Each user's browser runs the agent independently.  
The Node/Python agents batch logs and flush every 2 seconds with disk-buffer fallback if ClickHouse is unreachable.
