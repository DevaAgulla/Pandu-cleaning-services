-- Pandu Cleaning Services - database schema.
-- Safe to run repeatedly: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS services (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'i-sparkle',
  image       TEXT NOT NULL DEFAULT '',
  image_alt   TEXT NOT NULL DEFAULT '',
  features    TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  price_label TEXT NOT NULL DEFAULT '',
  price_value TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  currency    TEXT NOT NULL DEFAULT '₹',
  price       TEXT NOT NULL DEFAULT '',
  period      TEXT NOT NULL DEFAULT '',
  featured    BOOLEAN NOT NULL DEFAULT FALSE,
  features    TEXT NOT NULL DEFAULT '[]',   -- JSON array of {text, included}
  cta_label   TEXT NOT NULL DEFAULT 'Choose plan',
  cta_service TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Editable business details. Secrets (mail password) stay in .env, never here.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  service       TEXT NOT NULL DEFAULT '',
  property_type TEXT NOT NULL DEFAULT '',
  preferred_date TEXT NOT NULL DEFAULT '',
  preferred_time TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  message       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new',   -- new | contacted | done | spam
  mail_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  mail_error    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS services_order_idx ON services (sort_order, id);
CREATE INDEX IF NOT EXISTS plans_order_idx ON plans (sort_order, id);
