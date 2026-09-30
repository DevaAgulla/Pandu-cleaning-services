#!/usr/bin/env node
'use strict';

/**
 * Generates the bcrypt hash for an admin password and writes it into .env.
 *
 *   npm run set-admin-password -- "My New Password"
 *
 * The plain password is never written to disk - only the hash.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ENV_FILE = path.join(__dirname, '..', '.env');

function upsert(envText, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp('^' + key + '=.*$', 'm');
  if (re.test(envText)) return envText.replace(re, line);
  return envText.replace(/\s*$/, '\n') + line + '\n';
}

async function main() {
  const password = process.argv.slice(2).join(' ').trim();

  if (!password) {
    console.error('\nUsage: npm run set-admin-password -- "your new password"\n');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('\nPlease use at least 8 characters.\n');
    process.exit(1);
  }

  if (!fs.existsSync(ENV_FILE)) {
    console.error('\n.env not found. Copy .env.example to .env first.\n');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  let env = fs.readFileSync(ENV_FILE, 'utf8');
  env = upsert(env, 'ADMIN_PASSWORD_HASH', hash);

  // Give the session cookie a strong secret if it does not have one yet.
  if (!/^SESSION_SECRET=.+$/m.test(env)) {
    env = upsert(env, 'SESSION_SECRET', crypto.randomBytes(32).toString('hex'));
    console.log('  Generated a new SESSION_SECRET too.');
  }

  fs.writeFileSync(ENV_FILE, env);

  console.log('\n  Admin password updated in .env');
  console.log('  Hash: ' + hash.slice(0, 22) + '...');
  console.log('  Restart the server for it to take effect.\n');
}

main().catch((error) => { console.error(error); process.exit(1); });
