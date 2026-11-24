'use strict';
// Nimbuz POC sample API: a small, realistic web workload.
//   - /health  : process is up (no database), for the platform health check
//   - /ready   : database reachable
//   - /api/... : reads, writes, an aggregate query and a CPU-bound endpoint
//   - /        : a simple web page
const express = require('express');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { pool, ping, init, CATEGORIES } = require('./db');

// Version from package.json, shown in /health, /api/info and the X-App-Version
// header, so it's visible which release is live (deploy / rollback tests).
const { version: APP_VERSION } = require('../package.json');
const PORT = Number(process.env.PORT) || 8080;
const SEED_ROWS = Math.max(0, Number(process.env.SEED_ROWS) || 5000);
const INSTANCE = os.hostname(); // differs per replica: shows load balancing
const STARTED_AT = new Date().toISOString();

let dbReady = false;
const stats = { requests: 0, errors: 0, totalMs: 0, windowRequests: 0, windowMs: 0 };

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '10kb' }));

// Timing + instance header on every response.
app.use((req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.set('X-Instance', INSTANCE);
  res.set('X-App-Version', APP_VERSION);
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    stats.requests++; stats.totalMs += ms; stats.windowRequests++; stats.windowMs += ms;
    if (res.statusCode >= 500) stats.errors++;
  });
  next();
});

const requireDb = (req, res, next) => (dbReady ? next() : res.status(503).json({ error: 'database not ready' }));
const toInt = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION, instance: INSTANCE, uptimeSec: Math.round(process.uptime()) });
});

app.get('/ready', async (req, res) => {
  try {
    await ping();
    res.json({ status: 'ready', db: dbReady });
  } catch {
    res.status(503).json({ status: 'db-unavailable' });
  }
});

app.get('/api/info', (req, res) => {
  res.json({
    version: APP_VERSION,
    instance: INSTANCE,
    startedAt: STARTED_AT,
    node: process.version,
    dbReady,
    requests: stats.requests,
    errors5xx: stats.errors,
    avgMs: stats.requests ? +(stats.totalMs / stats.requests).toFixed(2) : 0,
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
  });
});

// List with paging and optional category filter.
app.get('/api/items', requireDb, async (req, res, next) => {
  try {
    const limit = toInt(req.query.limit, 20, 1, 100);
    const page = toInt(req.query.page, 1, 1, 100000);
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
    const where = category ? 'WHERE category = ?' : '';
    const args = category ? [category] : [];
    const [rows] = await pool.query(
      `SELECT id, name, category, price, created_at FROM items ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, limit, (page - 1) * limit],
    );
    res.json({ page, limit, count: rows.length, items: rows });
  } catch (e) { next(e); }
});

app.get('/api/items/:id', requireDb, async (req, res, next) => {
  try {
    const id = toInt(req.params.id, 0, 0, 4294967295);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const [rows] = await pool.query('SELECT id, name, category, price, created_at FROM items WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.post('/api/items', requireDb, async (req, res, next) => {
  try {
    const { name, category, price } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.length > 100) return res.status(400).json({ error: 'name: 1-100 characters' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: `category: one of ${CATEGORIES.join(', ')}` });
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0 || p > 100000) return res.status(400).json({ error: 'price: 0-100000' });
    const [r] = await pool.query('INSERT INTO items (name, category, price) VALUES (?, ?, ?)', [name.trim(), category, p]);
    res.status(201).json({ id: r.insertId });
  } catch (e) { next(e); }
});

// Aggregate query (GROUP BY over the whole table).
app.get('/api/stats', requireDb, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT category, COUNT(*) AS items, ROUND(AVG(price), 2) AS avgPrice FROM items GROUP BY category ORDER BY category',
    );
    res.json({ categories: rows });
  } catch (e) { next(e); }
});

// CPU-bound work: n rounds of SHA-256 (bounded so it can't be abused).
app.get('/api/compute', (req, res) => {
  const n = toInt(req.query.n, 2000, 1, 20000);
  const t0 = process.hrtime.bigint();
  let h = 'nimbuz';
  for (let i = 0; i < n; i++) h = crypto.createHash('sha256').update(h).digest('hex');
  res.json({ rounds: n, hash: h.slice(0, 16), ms: +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2) });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

app.use((req, res) => res.status(404).json({ error: 'not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
  console.error(`[error] ${req.method} ${req.path}: ${err.code || ''} ${err.message}`);
  res.status(500).json({ error: 'internal error' });
});

const server = app.listen(PORT, () => {
  console.log(`[app] v${APP_VERSION} listening on :${PORT} (instance ${INSTANCE}, node ${process.version})`);
});
server.keepAliveTimeout = 65000; // longer than typical load balancer idle timeouts
server.headersTimeout = 66000;

// Connect to the database in the background, so /health answers immediately.
init({ seedRows: SEED_ROWS })
  .then((r) => { dbReady = true; console.log(`[db] ready: seeded ${r.seeded}, existing ${r.existing}`); })
  .catch((e) => console.error(`[db] giving up: ${e.code || e.message}`));

// One summary line per minute instead of a log line per request.
setInterval(() => {
  if (!stats.windowRequests) return;
  console.log(`[stats] last 60s: ${stats.windowRequests} req, avg ${(stats.windowMs / stats.windowRequests).toFixed(1)} ms, total 5xx ${stats.errors}`);
  stats.windowRequests = 0; stats.windowMs = 0;
}, 60000).unref();

// Graceful shutdown: stop accepting, finish in-flight requests, close the pool.
const shutdown = (sig) => {
  console.log(`[app] ${sig} received, shutting down`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
