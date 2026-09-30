'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');

/**
 * Admin authentication.
 *
 * The password is never stored anywhere in plain text - only a bcrypt hash, held
 * in ADMIN_PASSWORD_HASH in .env. Generate one with:
 *
 *   npm run set-admin-password -- "your new password"
 */

/** Warns loudly if the deployment is missing its secrets. */
function checkConfig() {
  const problems = [];
  if (!config.admin.passwordHash) {
    problems.push('ADMIN_PASSWORD_HASH is not set - the admin panel is locked.');
  }
  if (!config.admin.sessionSecret || config.admin.sessionSecret.length < 16) {
    problems.push('SESSION_SECRET is missing or too short - set a long random value.');
  }
  return problems;
}

/** Timing-safe string compare, so the username cannot be probed by response time. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function verifyCredentials(username, password) {
  if (!config.admin.passwordHash) return false;

  const userOk = safeEqual(username || '', config.admin.username);
  // Always run bcrypt, even on a bad username, so both paths cost the same.
  const passOk = await bcrypt.compare(String(password || ''), config.admin.passwordHash);
  return userOk && passOk;
}

/* ------------------------------ login throttle ---------------------------- */

const attempts = new Map(); // ip -> { count, firstAt, blockedUntil }
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const BLOCK_MS = 15 * 60 * 1000;

function loginBlocked(ip) {
  const record = attempts.get(ip);
  if (!record) return 0;
  if (record.blockedUntil && record.blockedUntil > Date.now()) {
    return Math.ceil((record.blockedUntil - Date.now()) / 60000);
  }
  return 0;
}

function recordFailure(ip) {
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, firstAt: now };

  if (now - record.firstAt > WINDOW_MS) {
    record.count = 0;
    record.firstAt = now;
  }
  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_MS;
    record.count = 0;
    record.firstAt = now;
  }
  attempts.set(ip, record);
}

const clearFailures = (ip) => attempts.delete(ip);

/* --------------------------------- session -------------------------------- */

function startSession(req) {
  req.session.admin = true;
  req.session.user = config.admin.username;
  req.session.at = Date.now();
  req.session.csrf = crypto.randomBytes(24).toString('hex');
}

const endSession = (req) => { req.session = null; };

function isLoggedIn(req) {
  if (!req.session || !req.session.admin) return false;
  const maxAge = config.admin.sessionHours * 3600 * 1000;
  if (!req.session.at || Date.now() - req.session.at > maxAge) return false;
  return true;
}

/** req.path is relative inside a mounted router, so match on the full URL. */
const isApiRequest = (req) => (req.originalUrl || '').startsWith('/admin/api');

/** Gate for admin pages - redirects to the login screen. */
function requireAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  if (isApiRequest(req)) {
    return res.status(401).json({ ok: false, message: 'Not signed in.' });
  }
  return res.redirect('/admin/login');
}

/**
 * CSRF check for state-changing admin requests. The session cookie is SameSite=Lax,
 * which already blocks cross-site form posts; this token is the second layer.
 */
function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = req.get('x-csrf-token') || (req.body && req.body._csrf) || '';
  const expected = req.session && req.session.csrf;

  if (!expected || !sent || !safeEqual(sent, expected)) {
    if (isApiRequest(req)) {
      return res.status(403).json({ ok: false, message: 'Session expired. Reload the page.' });
    }
    return res.status(403).send('Session expired. Go back and reload the page.');
  }
  return next();
}

const hashPassword = (plain) => bcrypt.hash(String(plain), 12);

module.exports = {
  checkConfig, verifyCredentials, startSession, endSession, isLoggedIn,
  requireAuth, requireCsrf, hashPassword, loginBlocked, recordFailure, clearFailures,
};
