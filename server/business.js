'use strict';

const config = require('./config');
const store = require('./store');

/**
 * Business details, with database settings (editable in /admin) taking priority
 * over the .env defaults. Mail credentials are deliberately NOT included here -
 * secrets stay in .env and are never editable through the web.
 */
async function getBusiness() {
  let s = {};
  try {
    s = await store.getSettings();
  } catch (error) {
    console.warn('Could not read settings, falling back to .env:', error.message);
  }

  const pick = (key, fallback) => (s[key] !== undefined && s[key] !== '' ? s[key] : fallback);

  const phone = pick('phone', config.business.phone);
  const whatsapp = pick('whatsapp', config.business.whatsapp);

  const mailTo = String(pick('mail_to', (config.mail.to || []).join(', ')))
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    name: pick('business_name', config.business.name),
    tagline: pick('tagline', config.business.tagline),
    phone,
    phoneText: pick('phone_text', config.business.phoneText),
    whatsapp,
    email: pick('email', config.business.email),
    address: pick('address', config.business.address),
    hours: pick('hours', config.business.hours),

    telHref: `tel:${String(phone).replace(/[^\d+]/g, '')}`,
    whatsappHref: whatsapp ? `https://wa.me/${String(whatsapp).replace(/\D/g, '')}` : '',

    mailTo,
    mailSubjectPrefix: pick('mail_subject_prefix', config.mail.subjectPrefix),
    mailSendCustomerCopy: String(pick('mail_send_customer_copy',
      config.mail.sendCustomerCopy ? 'true' : 'false')).toLowerCase() === 'true',
  };
}

/** Only the fields that are safe to hand to the browser. */
async function publicConfig() {
  const b = await getBusiness();
  return {
    name: b.name,
    tagline: b.tagline,
    phone: b.phone,
    phoneText: b.phoneText,
    telHref: b.telHref,
    whatsapp: b.whatsapp,
    whatsappHref: b.whatsappHref,
    email: b.email,
    address: b.address,
    hours: b.hours,
  };
}

module.exports = { getBusiness, publicConfig };
