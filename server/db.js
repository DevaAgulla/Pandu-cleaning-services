'use strict';

const path = require('path');
const config = require('./config');

/**
 * One query interface over two Postgres backends:
 *
 *   DATABASE_URL set    -> real Postgres (Neon, Render, Supabase, Railway...)
 *   DATABASE_URL absent -> PGlite, Postgres compiled to WASM, stored in .data/
 *
 * PGlite exists so the project runs with zero setup on a fresh machine. It is a
 * development convenience only - always set DATABASE_URL in production, because a
 * free host's filesystem is wiped on every deploy.
 */

let driver = null;
let client = null;
let ready = null;

async function connect() {
  if (ready) return ready;

  ready = (async () => {
    if (config.db.url) {
      const { Pool } = require('pg');
      client = new Pool({
        connectionString: config.db.url,
        // Verify the server certificate by default - Neon, Render and Supabase all
        // present valid public certificates. DATABASE_SSL_INSECURE=true relaxes this
        // for a host using a self-signed certificate; it weakens protection against
        // a man-in-the-middle, so only use it when the host actually requires it.
        ssl: config.db.ssl ? { rejectUnauthorized: !config.db.sslInsecure } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      });
      await client.query('SELECT 1');
      driver = 'postgres';
    } else {
      const { PGlite } = require('@electric-sql/pglite');
      const dir = path.join(__dirname, '..', '.data', 'pgdata');
      // PGlite does not create intermediate directories itself.
      require('fs').mkdirSync(dir, { recursive: true });
      client = new PGlite(dir);
      await client.query('SELECT 1');
      driver = 'pglite';
    }
    return { driver, client };
  })();

  return ready;
}

/** Runs a parameterised query. Always use $1, $2... - never string concatenation. */
async function query(text, params = []) {
  await connect();
  const result = await client.query(text, params);
  return { rows: result.rows || [], rowCount: result.rowCount ?? (result.rows || []).length };
}

/** First row, or null. */
async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows.length ? rows[0] : null;
}

/** Runs several statements inside a transaction (real Postgres only pools a client). */
async function transaction(run) {
  await connect();

  if (driver === 'postgres') {
    const conn = await client.connect();
    try {
      await conn.query('BEGIN');
      const result = await run((text, params = []) => conn.query(text, params));
      await conn.query('COMMIT');
      return result;
    } catch (error) {
      await conn.query('ROLLBACK');
      throw error;
    } finally {
      conn.release();
    }
  }

  await client.query('BEGIN');
  try {
    const result = await run((text, params = []) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

const getDriver = () => driver;

async function close() {
  if (!client) return;
  if (driver === 'postgres') await client.end();
  else await client.close();
  client = null;
  ready = null;
}

module.exports = { connect, query, one, transaction, getDriver, close };
