'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const config = require('./config');
const store = require('./store');
const auth = require('./auth');

const router = express.Router();
const VIEWS = path.join(__dirname, 'views');

const readView = (name) => fs.readFileSync(path.join(VIEWS, name + '.html'), 'utf8');

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';

/* ================================= LOGIN ================================== */

router.get('/login', (req, res) => {
  if (auth.isLoggedIn(req)) return res.redirect('/admin');

  // The login form needs a token too, so give this visitor a session now.
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');

  const problems = auth.checkConfig();
  const warning = problems.length
    ? `<div class="alert alert--warn">${problems.map(esc).join('<br>')}</div>`
    : '';

  const error = req.query.error
    ? `<div class="alert alert--err">${esc(String(req.query.error).slice(0, 200))}</div>`
    : '';

  res.type('html').send(
    readView('admin-login')
      .replace('<!--{{CSRF}}-->', esc(req.session.csrf))
      .replace('<!--{{WARNING}}-->', warning)
      .replace('<!--{{ERROR}}-->', error)
  );
});

router.post('/login', async (req, res) => {
  const ip = clientIp(req);

  const blockedMinutes = auth.loginBlocked(ip);
  if (blockedMinutes) {
    return res.redirect('/admin/login?error=' +
      encodeURIComponent(`Too many attempts. Try again in ${blockedMinutes} minute(s).`));
  }

  // CSRF on the login form guards against forced-login attacks.
  const sent = (req.body && req.body._csrf) || '';
  if (!req.session.csrf || sent !== req.session.csrf) {
    return res.redirect('/admin/login?error=' + encodeURIComponent('Session expired. Please try again.'));
  }

  const { username, password } = req.body || {};
  const ok = await auth.verifyCredentials(username, password);

  if (!ok) {
    auth.recordFailure(ip);
    console.warn(`Failed admin login from ${ip} at ${new Date().toISOString()}`);
    return res.redirect('/admin/login?error=' + encodeURIComponent('Incorrect username or password.'));
  }

  auth.clearFailures(ip);
  auth.startSession(req);
  return res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  auth.endSession(req);
  res.redirect('/admin/login');
});

/* =============================== DASHBOARD ================================ */

router.get('/', auth.requireAuth, (req, res) => {
  res.type('html').send(
    readView('admin-dashboard').replace('<!--{{CSRF}}-->', esc(req.session.csrf))
  );
});

/* ================================== API =================================== */

const api = express.Router();
api.use(auth.requireAuth, auth.requireCsrf);

const send = (res, promise) =>
  promise
    .then((data) => res.json({ ok: true, data }))
    .catch((error) => {
      console.error('Admin API error:', error);
      res.status(500).json({ ok: false, message: error.message });
    });

/* ------------------------------ overview --------------------------------- */

api.get('/state', async (req, res) => {
  try {
    const [services, plans, settings, total, fresh] = await Promise.all([
      store.listServices(),
      store.listPlans(),
      store.getSettings(),
      store.countBookings(),
      store.countBookings('new'),
    ]);

    res.json({
      ok: true,
      data: {
        services,
        plans,
        settings,
        stats: { bookings: total, newBookings: fresh },
        mail: {
          transport: config.mail.transport,
          user: config.mail.user ? config.mail.user.replace(/(.{2}).*(@.*)/, '$1***$2') : '',
          configured: config.mail.transport !== 'console',
        },
        user: req.session.user,
      },
    });
  } catch (error) {
    console.error('Admin state failed:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

/* ------------------------------- services -------------------------------- */

const parseFeatures = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '')
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
};

function serviceFromBody(body) {
  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    tag: String(body.tag || '').trim(),
    icon: String(body.icon || 'i-sparkle').trim(),
    image: String(body.image || '').trim(),
    imageAlt: String(body.imageAlt || '').trim(),
    features: parseFeatures(body.features),
    priceLabel: String(body.priceLabel || '').trim(),
    priceValue: String(body.priceValue || '').trim(),
    isActive: body.isActive !== false && body.isActive !== 'false',
  };
}

api.post('/services', (req, res) => {
  const data = serviceFromBody(req.body);
  if (!data.title) return res.status(400).json({ ok: false, message: 'Title is required.' });
  return send(res, store.createService(data));
});

api.put('/services/:id', (req, res) => {
  const data = serviceFromBody(req.body);
  if (!data.title) return res.status(400).json({ ok: false, message: 'Title is required.' });
  return send(res, store.updateService(Number(req.params.id), data));
});

api.delete('/services/:id', (req, res) => send(res, store.deleteService(Number(req.params.id))));

api.post('/services/reorder', (req, res) =>
  send(res, store.reorderServices(req.body.ids || [])));

/* --------------------------------- plans --------------------------------- */

function planFromBody(body) {
  let features = body.features;
  if (!Array.isArray(features)) {
    features = String(features || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // A leading "-" marks a feature that is NOT included in this plan.
        const excluded = line.startsWith('-');
        return { text: excluded ? line.slice(1).trim() : line, included: !excluded };
      });
  }

  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    currency: String(body.currency || '₹').trim(),
    price: String(body.price || '').trim(),
    period: String(body.period || '/ visit').trim(),
    featured: body.featured === true || body.featured === 'true',
    features,
    ctaLabel: String(body.ctaLabel || 'Choose plan').trim(),
    ctaService: String(body.ctaService || '').trim(),
    isActive: body.isActive !== false && body.isActive !== 'false',
  };
}

api.post('/plans', (req, res) => {
  const data = planFromBody(req.body);
  if (!data.name) return res.status(400).json({ ok: false, message: 'Plan name is required.' });
  return send(res, store.createPlan(data));
});

api.put('/plans/:id', (req, res) => {
  const data = planFromBody(req.body);
  if (!data.name) return res.status(400).json({ ok: false, message: 'Plan name is required.' });
  return send(res, store.updatePlan(Number(req.params.id), data));
});

api.delete('/plans/:id', (req, res) => send(res, store.deletePlan(Number(req.params.id))));

api.post('/plans/reorder', (req, res) => send(res, store.reorderPlans(req.body.ids || [])));

/* ------------------------------- settings -------------------------------- */

const ALLOWED_SETTINGS = new Set([
  'business_name', 'tagline', 'phone', 'phone_text', 'whatsapp',
  'email', 'address', 'hours',
  'mail_to', 'mail_subject_prefix', 'mail_send_customer_copy',
]);

api.post('/settings', (req, res) => {
  const values = {};
  for (const [key, value] of Object.entries(req.body || {})) {
    if (ALLOWED_SETTINGS.has(key)) values[key] = String(value == null ? '' : value).slice(0, 500);
  }
  if (!Object.keys(values).length) {
    return res.status(400).json({ ok: false, message: 'Nothing to save.' });
  }
  return send(res, store.updateSettings(values));
});

/* ------------------------------- bookings -------------------------------- */

api.get('/bookings', async (req, res) => {
  try {
    const status = String(req.query.status || '');
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const [rows, total] = await Promise.all([
      store.listBookings({ status, limit, offset }),
      store.countBookings(status),
    ]);
    res.json({ ok: true, data: { rows, total } });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

api.patch('/bookings/:id', (req, res) => {
  const status = String(req.body.status || '');
  if (!['new', 'contacted', 'done', 'spam'].includes(status)) {
    return res.status(400).json({ ok: false, message: 'Unknown status.' });
  }
  return send(res, store.updateBookingStatus(Number(req.params.id), status));
});

api.delete('/bookings/:id', (req, res) => send(res, store.deleteBooking(Number(req.params.id))));

router.use('/api', api);

module.exports = router;
