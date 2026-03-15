# Production hardening notes

## What was changed
- Webhook-first boot flow (`USE_WEBHOOK=true`) with polling fallback for local development.
- Postgres-backed distributed session and distributed rate-limit middleware (multi-instance safe).
- Postgres-based idempotency (`processed_updates` + `processed_actions`) to avoid duplicate Telegram retries and duplicate callback actions.
- Runtime settings moved from local JSON to Postgres table (`runtime_settings`) with in-memory cache.
- Added SQL hardening scripts with indexes and unique guard for single active IN_PROGRESS application.
- Added k6 webhook load-test script.
- Added DB cleanup script for dedupe/session/rate-limit tables.

## Apply DB scripts
```bash
psql "$DATABASE_URL" -f sql/001_hardening.sql
```

(Optional cleanup cron)
```bash
psql "$DATABASE_URL" -f sql/002_cleanup.sql
```

## Run
```bash
npm install
npm run build
npm start
```

## Load test
```bash
k6 run load-test/webhook.k6.js -e BASE_URL=http://localhost:4000 -e WEBHOOK_PATH=/telegram/webhook
```
