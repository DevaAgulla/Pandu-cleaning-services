'use strict';

const db = require('./db');

/* --------------------------------------------------------------------------
   Row <-> object mapping. The database uses snake_case; the renderer and the
   admin UI use camelCase, and `features` is stored as a JSON string.
   -------------------------------------------------------------------------- */

const parseJson = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

const toService = (row) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  tag: row.tag,
  icon: row.icon,
  image: row.image,
  imageAlt: row.image_alt,
  features: parseJson(row.features, []),
  priceLabel: row.price_label,
  priceValue: row.price_value,
  sortOrder: row.sort_order,
  isActive: row.is_active,
});

const toPlan = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  currency: row.currency,
  price: row.price,
  period: row.period,
  featured: row.featured,
  features: parseJson(row.features, []),
  ctaLabel: row.cta_label,
  ctaService: row.cta_service,
  sortOrder: row.sort_order,
  isActive: row.is_active,
});

const slugify = (value) =>
  String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'service';

/* ------------------------------- services -------------------------------- */

async function listServices({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await db.query(
    `SELECT * FROM services ${where} ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(toService);
}

async function getService(id) {
  const row = await db.one('SELECT * FROM services WHERE id = $1', [id]);
  return row ? toService(row) : null;
}

/** Ensures the slug is unique, appending -2, -3... when needed. */
async function uniqueSlug(base, ignoreId = null) {
  let slug = slugify(base);
  let n = 1;

  for (;;) {
    const row = ignoreId
      ? await db.one('SELECT id FROM services WHERE slug = $1 AND id <> $2', [slug, ignoreId])
      : await db.one('SELECT id FROM services WHERE slug = $1', [slug]);
    if (!row) return slug;
    n += 1;
    slug = slugify(base) + '-' + n;
  }
}

async function createService(data) {
  const slug = await uniqueSlug(data.slug || data.title);
  const next = await db.one('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM services');

  const row = await db.one(
    `INSERT INTO services
       (slug, title, description, tag, icon, image, image_alt, features, price_label, price_value, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      slug,
      data.title || '',
      data.description || '',
      data.tag || '',
      data.icon || 'i-sparkle',
      data.image || '',
      data.imageAlt || '',
      JSON.stringify(data.features || []),
      data.priceLabel || '',
      data.priceValue || '',
      Number(next.next) || 10,
      data.isActive !== false,
    ]
  );
  return toService(row);
}

async function updateService(id, data) {
  const existing = await getService(id);
  if (!existing) return null;

  const slug = data.slug || data.title
    ? await uniqueSlug(data.slug || data.title, id)
    : existing.slug;

  const row = await db.one(
    `UPDATE services SET
       slug = $2, title = $3, description = $4, tag = $5, icon = $6, image = $7,
       image_alt = $8, features = $9, price_label = $10, price_value = $11,
       is_active = $12, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      id,
      slug,
      data.title ?? existing.title,
      data.description ?? existing.description,
      data.tag ?? existing.tag,
      data.icon ?? existing.icon,
      data.image ?? existing.image,
      data.imageAlt ?? existing.imageAlt,
      JSON.stringify(data.features ?? existing.features),
      data.priceLabel ?? existing.priceLabel,
      data.priceValue ?? existing.priceValue,
      data.isActive ?? existing.isActive,
    ]
  );
  return toService(row);
}

async function deleteService(id) {
  const { rowCount } = await db.query('DELETE FROM services WHERE id = $1', [id]);
  return rowCount > 0;
}

/** Applies a new display order from an array of ids. */
async function reorderServices(ids) {
  await db.transaction(async (run) => {
    for (const [i, id] of ids.entries()) {
      await run('UPDATE services SET sort_order = $2, updated_at = NOW() WHERE id = $1',
        [Number(id), (i + 1) * 10]);
    }
  });
  return listServices();
}

/* --------------------------------- plans --------------------------------- */

async function listPlans({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await db.query(`SELECT * FROM plans ${where} ORDER BY sort_order ASC, id ASC`);
  return rows.map(toPlan);
}

async function getPlan(id) {
  const row = await db.one('SELECT * FROM plans WHERE id = $1', [id]);
  return row ? toPlan(row) : null;
}

async function createPlan(data) {
  const next = await db.one('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM plans');
  const row = await db.one(
    `INSERT INTO plans
       (name, description, currency, price, period, featured, features, cta_label, cta_service, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.name || '',
      data.description || '',
      data.currency || '₹',
      data.price || '',
      data.period || '/ visit',
      Boolean(data.featured),
      JSON.stringify(data.features || []),
      data.ctaLabel || 'Choose plan',
      data.ctaService || '',
      Number(next.next) || 10,
      data.isActive !== false,
    ]
  );
  if (row.featured) await clearOtherFeatured(row.id);
  return toPlan(row);
}

async function updatePlan(id, data) {
  const existing = await getPlan(id);
  if (!existing) return null;

  const row = await db.one(
    `UPDATE plans SET
       name = $2, description = $3, currency = $4, price = $5, period = $6,
       featured = $7, features = $8, cta_label = $9, cta_service = $10,
       is_active = $11, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      id,
      data.name ?? existing.name,
      data.description ?? existing.description,
      data.currency ?? existing.currency,
      data.price ?? existing.price,
      data.period ?? existing.period,
      data.featured ?? existing.featured,
      JSON.stringify(data.features ?? existing.features),
      data.ctaLabel ?? existing.ctaLabel,
      data.ctaService ?? existing.ctaService,
      data.isActive ?? existing.isActive,
    ]
  );
  if (row.featured) await clearOtherFeatured(id);
  return toPlan(row);
}

/** Only one plan may carry the "Most Popular" ribbon. */
async function clearOtherFeatured(keepId) {
  await db.query('UPDATE plans SET featured = FALSE WHERE id <> $1 AND featured = TRUE', [keepId]);
}

async function deletePlan(id) {
  const { rowCount } = await db.query('DELETE FROM plans WHERE id = $1', [id]);
  return rowCount > 0;
}

async function reorderPlans(ids) {
  await db.transaction(async (run) => {
    for (const [i, id] of ids.entries()) {
      await run('UPDATE plans SET sort_order = $2, updated_at = NOW() WHERE id = $1',
        [Number(id), (i + 1) * 10]);
    }
  });
  return listPlans();
}

/* ------------------------------- settings -------------------------------- */

async function getSettings() {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

async function updateSettings(values) {
  await db.transaction(async (run) => {
    for (const [key, value] of Object.entries(values)) {
      await run(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value == null ? '' : String(value)]
      );
    }
  });
  return getSettings();
}

/* ------------------------------- bookings -------------------------------- */

async function createBooking(data) {
  const row = await db.one(
    `INSERT INTO bookings
       (name, phone, email, service, property_type, preferred_date, preferred_time,
        city, address, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.name || '', data.phone || '', data.email || '', data.service || '',
      data.propertyType || '', data.date || '', data.time || '',
      data.city || '', data.address || '', data.message || '',
    ]
  );
  return row;
}

async function markBookingMail(id, sent, error = '') {
  await db.query('UPDATE bookings SET mail_sent = $2, mail_error = $3 WHERE id = $1',
    [id, Boolean(sent), String(error || '').slice(0, 500)]);
}

async function listBookings({ status = '', limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'WHERE status = $1'; }
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT * FROM bookings ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function countBookings(status = '') {
  const row = status
    ? await db.one('SELECT COUNT(*)::int AS count FROM bookings WHERE status = $1', [status])
    : await db.one('SELECT COUNT(*)::int AS count FROM bookings');
  return row ? row.count : 0;
}

async function updateBookingStatus(id, status) {
  const row = await db.one(
    'UPDATE bookings SET status = $2 WHERE id = $1 RETURNING *', [id, status]
  );
  return row;
}

async function deleteBooking(id) {
  const { rowCount } = await db.query('DELETE FROM bookings WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  listServices, getService, createService, updateService, deleteService, reorderServices,
  listPlans, getPlan, createPlan, updatePlan, deletePlan, reorderPlans,
  getSettings, updateSettings,
  createBooking, markBookingMail, listBookings, countBookings, updateBookingStatus, deleteBooking,
};
