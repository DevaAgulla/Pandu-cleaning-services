'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');
const { getBusiness } = require('./business');

let cachedTransporter = null;

/**
 * Builds a Nodemailer transporter from the MAIL_* values in .env.
 * The `console` transport writes the message to stdout instead of sending it,
 * which lets the booking form be tested before real credentials exist.
 */
function buildTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const { transport, service, host, port, secure, user, pass, tlsRejectUnauthorized } = config.mail;

  if (transport === 'console') {
    cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
    return cachedTransporter;
  }

  const auth = user && pass ? { user, pass } : undefined;
  const tls = { rejectUnauthorized: tlsRejectUnauthorized };

  if (transport === 'service') {
    if (!service) throw new Error('MAIL_TRANSPORT=service requires MAIL_SERVICE to be set in .env');
    cachedTransporter = nodemailer.createTransport({ service, auth, tls });
    return cachedTransporter;
  }

  if (transport === 'smtp') {
    if (!host) throw new Error('MAIL_TRANSPORT=smtp requires MAIL_HOST to be set in .env');
    cachedTransporter = nodemailer.createTransport({ host, port, secure, auth, tls });
    return cachedTransporter;
  }

  throw new Error('Unknown MAIL_TRANSPORT "' + transport + '". Use one of: smtp, service, console.');
}

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Header values must never contain CR/LF, and the customer-supplied name ends up
 * in the Reply-To header, so strip line breaks before it gets there.
 */
const sanitizeHeader = (value) =>
  String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').trim();

const FIELD_LABELS = [
  ['name', 'Full Name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['service', 'Service Required'],
  ['propertyType', 'Property Type'],
  ['date', 'Preferred Date'],
  ['time', 'Preferred Time'],
  ['city', 'City / Area'],
  ['address', 'Address'],
  ['message', 'Additional Notes'],
];

function buildAdminHtml(booking, biz) {
  const rows = FIELD_LABELS.filter(([key]) => booking[key])
    .map(([key, label]) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e6eef0;color:#5b7480;font-size:13px;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #e6eef0;color:#08263a;font-size:14px;font-family:Arial,Helvetica,sans-serif;font-weight:600;">${escapeHtml(booking[key])}</td>
        </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f2f7f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(8,38,58,.10);">
    <tr>
      <td style="background:linear-gradient(135deg,#0E9F9B,#08263a);padding:28px 32px;">
        <p style="margin:0;color:#8ff0ea;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">New Booking Request</p>
        <h1 style="margin:6px 0 0;color:#ffffff;font-size:24px;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(biz.name)}</h1>
      </td>
    </tr>
    <tr><td style="padding:8px 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </td></tr>
    <tr>
      <td style="padding:20px 32px 28px;">
        <p style="margin:0;color:#5b7480;font-size:12px;font-family:Arial,Helvetica,sans-serif;">
          Received on ${escapeHtml(new Date().toLocaleString())} via the website booking form.
        </p>
      </td>
    </tr>
  </table>
</body></html>`;
}

function buildAdminText(booking, biz) {
  const lines = FIELD_LABELS.filter(([key]) => booking[key]).map(
    ([key, label]) => `${label}: ${booking[key]}`
  );
  return `New booking request - ${biz.name}\n\n${lines.join('\n')}\n\nReceived: ${new Date().toLocaleString()}`;
}

function buildCustomerHtml(booking, biz) {
  const telDigits = String(biz.phone).replace(/[^\d+]/g, '');
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f2f7f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(8,38,58,.10);">
    <tr>
      <td style="background:linear-gradient(135deg,#0E9F9B,#08263a);padding:30px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:23px;font-family:Arial,Helvetica,sans-serif;">Thank you, ${escapeHtml(booking.name)}!</h1>
        <p style="margin:8px 0 0;color:#b6f2ee;font-size:14px;font-family:Arial,Helvetica,sans-serif;">We have received your request.</p>
      </td>
    </tr>
    <tr><td style="padding:28px 32px;">
      <p style="margin:0 0 14px;color:#33505c;font-size:15px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
        Our team is reviewing your booking for
        <strong style="color:#08263a;">${escapeHtml(booking.service || 'cleaning service')}</strong>
        and will call you back shortly to confirm the slot and share a final quote.
      </p>
      <p style="margin:0 0 22px;color:#33505c;font-size:15px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
        Need us sooner? Call us directly at
        <a href="tel:${escapeHtml(telDigits)}" style="color:#0E9F9B;font-weight:700;text-decoration:none;">${escapeHtml(biz.phoneText)}</a>.
      </p>
      <p style="margin:0;color:#5b7480;font-size:13px;font-family:Arial,Helvetica,sans-serif;">
        Warm regards,<br><strong style="color:#08263a;">${escapeHtml(biz.name)}</strong>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/** Sends the admin notification and (optionally) the customer acknowledgement. */
async function sendBookingMail(booking) {
  const transporter = buildTransporter();
  const { from, fromName, cc, bcc, transport } = config.mail;

  // Recipient, subject prefix and the customer copy are editable in /admin;
  // the credentials behind them stay in .env.
  const biz = await getBusiness();
  const to = biz.mailTo;
  const subjectPrefix = biz.mailSubjectPrefix;
  const sendCustomerCopy = biz.mailSendCustomerCopy;

  if (transport !== 'console' && to.length === 0) {
    throw new Error('No recipient set - add one in /admin (Settings) or MAIL_TO in .env');
  }

  const fromAddress = from || config.mail.user;
  const sender = fromAddress ? { name: sanitizeHeader(fromName), address: fromAddress } : undefined;

  const adminMail = {
    from: sender,
    to: to.length ? to : ['console@localhost'],
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    replyTo: booking.email ? sanitizeHeader(booking.name + ' <' + booking.email + '>') : undefined,
    subject: `${subjectPrefix} ${sanitizeHeader(booking.service || 'Cleaning')} - ${sanitizeHeader(booking.name)}`,
    text: buildAdminText(booking, biz),
    html: buildAdminHtml(booking, biz),
  };

  const info = await transporter.sendMail(adminMail);

  if (transport === 'console') {
    console.log('\n--- MAIL_TRANSPORT=console : booking mail was NOT sent ---');
    console.log(info.message);
    console.log('--- configure MAIL_* in .env to send for real ---\n');
  }

  if (sendCustomerCopy && booking.email) {
    const customerMail = {
      from: sender,
      to: booking.email,
      subject: `We received your request - ${biz.name}`,
      text:
        `Hi ${booking.name},\n\nThank you for contacting ${biz.name}. ` +
        `We have received your request for ${booking.service || 'cleaning service'} ` +
        `and will call you shortly to confirm.\n\nCall us: ${biz.phoneText}\n\n- ${biz.name}`,
      html: buildCustomerHtml(booking, biz),
    };

    try {
      await transporter.sendMail(customerMail);
    } catch (error) {
      // The customer copy is a nicety - never fail the booking because of it.
      console.warn('Customer acknowledgement mail failed:', error.message);
    }
  }

  return info;
}

/** Verifies the mail credentials without sending anything. */
async function verifyTransport() {
  const transporter = buildTransporter();
  if (config.mail.transport === 'console') {
    return { ok: true, transport: 'console', message: 'Console transport - no mail is actually sent.' };
  }
  await transporter.verify();
  return { ok: true, transport: config.mail.transport, message: 'Mail server connection verified.' };
}

module.exports = { sendBookingMail, verifyTransport };
