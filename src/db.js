'use strict';
// MySQL access: connection pool, schema creation and one-time seeding.
// All settings come from environment variables (see .env.example).
const mysql = require('mysql2/promise');

const CATEGORIES = ['books', 'electronics', 'grocery', 'home', 'sports', 'toys'];

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sampledb',
};

// Optional TLS to the database (DB_SSL=true). Set DB_SSL_REJECT_UNAUTHORIZED=false
// only if the platform's database uses a self-signed certificate.
const ssl = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : undefined;

const pool = mysql.createPool({
  ...cfg,
  ssl,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  queueLimit: 0,
  connectTimeout: 10000,
  dateStrings: true,
});

const ping = () => pool.query('SELECT 1');

async function createDatabaseIfMissing() {
  // Works when the user may create databases; otherwise the database must already exist.
  let conn;
  try {
    conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, ssl, connectTimeout: 10000 });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database.replace(/`/g, '')}\``);
  } catch (e) {
    console.log(`[db] could not create database "${cfg.database}" (${e.code || e.message}); assuming it exists`);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100)  NOT NULL,
      category   VARCHAR(30)   NOT NULL,
      price      DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_created (created_at)
    )`);
}

// Seed only an empty table. A named lock stops two replicas seeding at the same time.
async function seed(rows) {
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('items_seed', 60) AS ok");
    if (lock.ok !== 1) throw new Error('could not get seed lock');
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM items');
    if (n > 0) return { seeded: 0, existing: Number(n) };
    const batch = 500;
    for (let start = 0; start < rows; start += batch) {
      const values = [];
      for (let i = start; i < Math.min(start + batch, rows); i++) {
        values.push([`Sample item ${i + 1}`, CATEGORIES[i % CATEGORIES.length], ((i * 37) % 9900 + 100) / 10]);
      }
      await conn.query('INSERT INTO items (name, category, price) VALUES ?', [values]);
    }
    return { seeded: rows, existing: 0 };
  } finally {
    await conn.query("SELECT RELEASE_LOCK('items_seed')").catch(() => {});
    conn.release();
  }
}

// Retries until the database is reachable (it may start after the app).
async function init({ seedRows, maxWaitMs = 120000 }) {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      await createDatabaseIfMissing();
      await createSchema();
      return await seed(seedRows);
    } catch (e) {
      if (Date.now() > deadline) throw e;
      const wait = Math.min(10000, 1000 * attempt);
      console.log(`[db] not ready (${e.code || e.message}), retry ${attempt} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

module.exports = { pool, ping, init, CATEGORIES, dbName: cfg.database };
