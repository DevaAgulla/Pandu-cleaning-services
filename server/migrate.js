'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');
const config = require('./config');

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SEED_FILE = path.join(__dirname, '..', 'content', 'site.json');

/** Splits the schema file into statements and runs them. */
async function createTables() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.query(statement);
  }
}

const slugify = (value) =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Business details that the admin can edit. Mail secrets are NOT stored here. */
function defaultSettings() {
  return {
    business_name: config.business.name,
    tagline: config.business.tagline,
    phone: config.business.phone,
    phone_text: config.business.phoneText,
    whatsapp: config.business.whatsapp,
    email: config.business.email,
    address: config.business.address,
    hours: config.business.hours,
    mail_to: (config.mail.to || []).join(', '),
    mail_subject_prefix: config.mail.subjectPrefix,
    mail_send_customer_copy: config.mail.sendCustomerCopy ? 'true' : 'false',
  };
}

/** Copies content/site.json into the database the first time only. */
async function seedFromJson() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM services');
  if (rows[0].count > 0) return { seeded: false, services: 0, plans: 0 };

  if (!fs.existsSync(SEED_FILE)) return { seeded: false, services: 0, plans: 0 };
  const content = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  let services = 0;
  for (const [i, s] of (content.services || []).entries()) {
    await db.query(
      `INSERT INTO services
         (slug, title, description, tag, icon, image, image_alt, features, price_label, price_value, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO NOTHING`,
      [
        s.id || slugify(s.title),
        s.title || '',
        s.description || '',
        s.tag || '',
        s.icon || 'i-sparkle',
        s.image || '',
        s.imageAlt || '',
        JSON.stringify(s.features || []),
        s.priceLabel || '',
        s.priceValue || '',
        (i + 1) * 10,
      ]
    );
    services += 1;
  }

  let plans = 0;
  for (const [i, p] of (content.plans || []).entries()) {
    await db.query(
      `INSERT INTO plans
         (name, description, currency, price, period, featured, features, cta_label, cta_service, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        p.name || '',
        p.description || '',
        p.currency || '₹',
        p.price || '',
        p.period || '',
        Boolean(p.featured),
        JSON.stringify(p.features || []),
        p.ctaLabel || 'Choose plan',
        p.ctaService || '',
        (i + 1) * 10,
      ]
    );
    plans += 1;
  }

  return { seeded: true, services, plans };
}

async function seedSettings() {
  const defaults = defaultSettings();
  let added = 0;

  for (const [key, value] of Object.entries(defaults)) {
    const { rowCount } = await db.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value == null ? '' : String(value)]
    );
    if (rowCount) added += 1;
  }
  return added;
}

/** Runs on every boot: creates tables, seeds content the first time. */
async function migrate({ quiet = false } = {}) {
  await db.connect();
  await createTables();
  const seed = await seedFromJson();
  const settings = await seedSettings();

  if (!quiet) {
    const where = db.getDriver() === 'pglite' ? 'local PGlite file (.data/)' : 'Postgres';
    console.log(`  Database     : ${where}`);
    if (seed.seeded) {
      console.log(`  Seeded       : ${seed.services} services, ${seed.plans} plans from content/site.json`);
    }
    if (settings) console.log(`  Settings     : ${settings} default values inserted`);
  }

  return { seed, settings };
}

module.exports = { migrate, createTables, seedFromJson, seedSettings };

// Allow `node server/migrate.js` to set the database up by hand.
if (require.main === module) {
  migrate()
    .then(() => db.close())
    .then(() => { console.log('Migration complete.'); process.exit(0); })
    .catch((error) => { console.error('Migration failed:', error); process.exit(1); });
}
