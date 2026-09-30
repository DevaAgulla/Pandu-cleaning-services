'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

const list = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',

  business: {
    name: process.env.BUSINESS_NAME || 'Pandu Cleaning Services',
    tagline: process.env.BUSINESS_TAGLINE || 'Spotless Spaces, Every Single Time',
    phone: process.env.CONTACT_PHONE || '919191',
    phoneText: process.env.CONTACT_PHONE_TEXT || process.env.CONTACT_PHONE || '919191',
    whatsapp: process.env.CONTACT_WHATSAPP || '',
    email: process.env.CONTACT_EMAIL || '',
    address: process.env.CONTACT_ADDRESS || '',
    hours: process.env.BUSINESS_HOURS || '',
  },

  db: {
    // Empty locally -> the app falls back to an embedded PGlite database.
    url: (process.env.DATABASE_URL || '').trim(),
    ssl: bool(process.env.DATABASE_SSL, true),
    // Only for hosts with self-signed certificates - see server/db.js.
    sslInsecure: bool(process.env.DATABASE_SSL_INSECURE, false),
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin1234',
    // bcrypt hash of the admin password - never the password itself.
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    sessionHours: Number(process.env.ADMIN_SESSION_HOURS) || 8,
  },

  mail: {
    transport: (process.env.MAIL_TRANSPORT || 'console').trim().toLowerCase(),
    service: process.env.MAIL_SERVICE || '',
    host: process.env.MAIL_HOST || '',
    port: Number(process.env.MAIL_PORT) || 587,
    secure: bool(process.env.MAIL_SECURE, false),
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    fromName: process.env.MAIL_FROM_NAME || process.env.BUSINESS_NAME || 'Website',
    from: process.env.MAIL_FROM || process.env.MAIL_USER || '',
    to: list(process.env.MAIL_TO),
    cc: list(process.env.MAIL_CC),
    bcc: list(process.env.MAIL_BCC),
    subjectPrefix: process.env.MAIL_SUBJECT_PREFIX || '[New Booking Request]',
    sendCustomerCopy: bool(process.env.MAIL_SEND_CUSTOMER_COPY, true),
    tlsRejectUnauthorized: bool(process.env.MAIL_TLS_REJECT_UNAUTHORIZED, true),
  },
};

/** Details that are safe to hand to the browser. */
config.publicConfig = () => ({
  name: config.business.name,
  tagline: config.business.tagline,
  phone: config.business.phone,
  phoneText: config.business.phoneText,
  telHref: `tel:${String(config.business.phone).replace(/[^\d+]/g, '')}`,
  whatsapp: config.business.whatsapp,
  whatsappHref: config.business.whatsapp
    ? `https://wa.me/${String(config.business.whatsapp).replace(/\D/g, '')}`
    : '',
  email: config.business.email,
  address: config.business.address,
  hours: config.business.hours,
});

module.exports = config;
