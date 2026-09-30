'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const cookieSession = require('cookie-session');

const config = require('./config');
const { validateBooking } = require('./validate');
const { sendBookingMail, verifyTransport } = require('./mailer');
const { renderIndex } = require('./render');
const { publicConfig } = require('./business');
const { migrate } = require('./migrate');
const store = require('./store');
const auth = require('./auth');
const adminRouter = require('./admin');

const app = express();

app.disable('x-powered-by');

// Hosts like Render sit behind a proxy; this makes req.ip and secure cookies correct.
app.set('trust proxy', 1);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

app.use(
  cookieSession({
    name: 'pcs_admin',
    keys: [config.admin.sessionSecret || crypto.randomBytes(32).toString('hex')],
    maxAge: config.admin.sessionHours * 3600 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
  })
);

/* ------------------------------- public API ------------------------------- */

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many requests. Please try again in a few minutes.' },
});

// Business details for the browser. Editable in /admin, falls back to .env.
app.get('/api/config', async (req, res) => {
  try {
    res.json({ ok: true, data: await publicConfig() });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/mail-health', async (req, res) => {
  try {
    const result = await verifyTransport();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, transport: config.mail.transport, message: error.message });
  }
});

app.post('/api/booking', bookingLimiter, async (req, res) => {
  const { valid, errors, data, trapped } = validateBooking(req.body);

  if (!valid) {
    return res.status(400).json({ ok: false, message: 'Please check the highlighted fields.', errors });
  }

  // Silently accept bot submissions so they get no feedback to tune against.
  if (trapped) {
    return res.json({ ok: true, message: 'Thank you! Your request has been received.' });
  }

  // Store first, then email. That way an enquiry is never lost to a mail failure.
  let saved = null;
  try {
    saved = await store.createBooking(data);
  } catch (error) {
    console.error('Could not save booking:', error);
  }

  try {
    await sendBookingMail(data);
    if (saved) await store.markBookingMail(saved.id, true);

    return res.json({
      ok: true,
      message: 'Thank you! Your request has been received. Our team will call you shortly.',
    });
  } catch (error) {
    console.error('Booking mail failed:', error);
    if (saved) await store.markBookingMail(saved.id, false, error.message);

    // The enquiry is safely in the database, so confirm it to the customer.
    if (saved) {
      return res.json({
        ok: true,
        message: 'Thank you! Your request has been received. Our team will call you shortly.',
      });
    }

    const business = await publicConfig().catch(() => ({ phoneText: config.business.phoneText }));
    return res.status(502).json({
      ok: false,
      message: `Sorry, we could not send your request right now. Please call us at ${business.phoneText}.`,
    });
  }
});

/* --------------------------------- admin ---------------------------------- */

app.use('/admin', adminRouter);

/* --------------------------------- site ----------------------------------- */

// The home page is built from public/index.html + the database, so services and
// prices can be edited in /admin. Must come before express.static, which would
// otherwise serve the raw template.
app.get(['/', '/index.html'], async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache').type('html').send(await renderIndex());
  } catch (error) {
    next(error);
  }
});

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    extensions: ['html'],
    maxAge: config.env === 'production' ? '7d' : 0,
  })
);

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  res.status(500).type('text/plain').send('Server error: ' + error.message);
});

/* --------------------------------- boot ----------------------------------- */

async function start() {
  console.log('');
  console.log(`  ${config.business.name}`);

  await migrate();

  const problems = auth.checkConfig();
  if (problems.length) {
    console.log('');
    problems.forEach((p) => console.log('  WARNING: ' + p));
    console.log('  Fix with: npm run set-admin-password -- "your password"');
  }

  app.listen(config.port, () => {
    console.log(`  Running at   : http://localhost:${config.port}`);
    console.log(`  Admin panel  : http://localhost:${config.port}/admin`);
    console.log(`  Mail transport: ${config.mail.transport}`);
    if (config.mail.transport === 'console') {
      console.log('  NOTE: MAIL_TRANSPORT=console - booking mails are printed here, not sent.');
    }
    if (!config.db.url) {
      console.log('  NOTE: DATABASE_URL is empty - using the local PGlite file in .data/.');
      console.log('        Set DATABASE_URL to your Neon connection string before deploying.');
    }
    console.log('');
  });
}

start().catch((error) => {
  console.error('\n  Failed to start:', error.message, '\n');
  process.exit(1);
});
