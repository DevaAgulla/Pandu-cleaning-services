# Pandu Cleaning Services

A responsive, animated marketing website for a cleaning services business, with a
booking form, click-to-call buttons, and an admin panel at **/admin** for managing
services, prices, contact details and enquiries.

## Stack

| Layer    | Choice                                              |
|----------|-----------------------------------------------------|
| Server   | Node.js + Express                                    |
| Database | Postgres (embedded PGlite locally, zero setup)       |
| Admin    | Session auth with bcrypt, at `/admin`                |
| Mail     | Nodemailer (SMTP / named service / console)          |
| Frontend | Plain HTML, CSS and JavaScript — no build step       |
| Images   | Local files in `public/images/` (no external CDN)    |
| Fonts    | Self-hosted woff2 in `public/fonts/`                 |

The site makes **no external requests at all** — no CDN, no Google Fonts, no
trackers. It renders identically with the network disconnected.

## Quick start

```bash
npm install
npm start
```

Then open <http://localhost:3000> — and the admin panel at
<http://localhost:3000/admin>.

No database setup is needed to run locally: with `DATABASE_URL` empty the app uses an
embedded Postgres file in `.data/` and creates the tables on first boot. That very
first start takes ~20 seconds while the embedded engine initialises and seeds itself;
later starts are quick, and a real `DATABASE_URL` starts fast every time.

Use `npm run dev` to restart automatically on file changes.

Set your admin password before first sign-in:

```bash
npm run set-admin-password -- "your password"
```

Out of the box `MAIL_TRANSPORT=console`, so submitting the booking form prints the
email to the terminal instead of sending it. Everything is testable before you have
real credentials.

## Configuration (`.env`)

Copy `.env.example` to `.env` and edit the values. `.env` is git-ignored.

### Phone number

```env
CONTACT_PHONE=919191          # used to build the tel: link
CONTACT_PHONE_TEXT=919191     # what is displayed on screen
CONTACT_WHATSAPP=919191       # WhatsApp button (blank hides the button)
```

Every "Call Now" button on the page — the header, the hero, the call band and the
floating mobile button — reads this value at runtime from `/api/config`. Replace the
mock `919191` with the real number and restart; no HTML needs to change.

On a phone, tapping those buttons opens the dialler with the number prefilled.

### Email

`MAIL_TRANSPORT` selects how mail is sent:

| Value     | Behaviour                                                        |
|-----------|------------------------------------------------------------------|
| `console` | Prints the message to the terminal. Nothing is sent. (default)   |
| `service` | A provider Nodemailer knows — set `MAIL_SERVICE=gmail` etc.      |
| `smtp`    | Any SMTP server — set `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`.   |

Example for Gmail:

```env
MAIL_TRANSPORT=service
MAIL_SERVICE=gmail
MAIL_USER=your-sender@gmail.com
MAIL_PASS=your-16-char-app-password
MAIL_FROM=your-sender@gmail.com
MAIL_TO=bookings@yourdomain.com
```

Gmail requires an **App Password** (with 2-Step Verification enabled), not your normal
account password.

Example for a generic SMTP host:

```env
MAIL_TRANSPORT=smtp
MAIL_HOST=smtp.yourhost.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=no-reply@yourdomain.com
MAIL_PASS=your-password
MAIL_TO=bookings@yourdomain.com
```

Other mail options: `MAIL_CC`, `MAIL_BCC`, `MAIL_SUBJECT_PREFIX`, and
`MAIL_SEND_CUSTOMER_COPY` (sends the customer a branded acknowledgement when they
supply an email address).

### Checking your mail settings

```bash
curl http://localhost:3000/api/mail-health
```

This connects and authenticates without sending anything, so you get a clear error
message if the credentials or host are wrong.

## Admin panel

Go to **/admin** and sign in. Everything below is editable without touching code.

| Tab | What you can do |
|---|---|
| **Services** | Add, edit, delete, hide and drag-to-reorder every service card |
| **Pricing** | Same for the three pricing plans |
| **Bookings** | Every enquiry, with one-tap call/email and a status (new → contacted → done) |
| **Settings** | Phone number, WhatsApp, email, address, hours, and where booking emails go |

Changes appear on the live site immediately — the public page is rendered from the
database on every request.

**Two things the panel deliberately cannot change**, because they are secrets and do
not belong in a web form:

- the **mail password** (`MAIL_PASS`) — set it in `.env` / your host's dashboard
- the **admin password** — change it with the command below

### Changing the admin password

```bash
npm run set-admin-password -- "your new password"
```

This writes a **bcrypt hash** to `.env` as `ADMIN_PASSWORD_HASH`. The password itself
is never stored anywhere. Restart the server afterwards. To change the username, edit
`ADMIN_USERNAME`.

On a host like Render, run the command locally and paste the resulting hash into the
dashboard's environment variables.

### How the admin is protected

- Password stored only as a bcrypt hash (cost 12)
- Signed, `httpOnly`, `SameSite=Lax` session cookie; `Secure` in production
- CSRF token on every state-changing request, including the login form
- Login throttling — 6 failed attempts locks that IP out for 15 minutes
- Failed attempts are logged with IP and timestamp
- Admin pages send `noindex, nofollow`

## The database

Services, plans, settings and bookings live in Postgres.

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
```

**If `DATABASE_URL` is empty**, the app falls back to an embedded
[PGlite](https://pglite.dev) database in `.data/` — real Postgres compiled to WASM.
That means `npm start` works on a fresh machine with zero setup. It is a development
convenience only: **always set `DATABASE_URL` in production**, because free hosts wipe
the filesystem on every deploy.

Tables are created automatically on boot. The first run seeds services and plans from
`content/site.json`, which is kept purely as that initial seed — after the first boot
the database is the source of truth and editing the JSON has no effect.

Run migrations by hand with `npm run migrate`.

## Deploying free (Render + Neon)

**1. Create the database.** Sign up at [neon.tech](https://neon.tech), create a
project, and copy the connection string (it looks like
`postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require`).

**2. Generate your admin password hash** locally:

```bash
npm run set-admin-password -- "a strong password"
```

Copy the `ADMIN_PASSWORD_HASH` value out of `.env`.

**3. Push this project to GitHub.** `.env` and `.data/` are git-ignored, so no
secrets or local data are committed.

**4. Create the Render service.** New → Web Service → connect the repo.
Build command `npm install`, start command `npm start`. A `render.yaml` blueprint is
included if you prefer New → Blueprint.

**5. Set the environment variables** in Render's dashboard:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | your Neon connection string |
| `SESSION_SECRET` | a long random string |
| `ADMIN_USERNAME` | your admin username |
| `ADMIN_PASSWORD_HASH` | the hash from step 2 |
| `MAIL_TRANSPORT` | `service` |
| `MAIL_SERVICE` | `gmail` |
| `MAIL_USER` / `MAIL_PASS` | sender address + app password |
| `MAIL_FROM` / `MAIL_TO` | from address + where bookings are sent |

`PORT` is provided by Render automatically.

**6. Deploy**, then open `https://your-app.onrender.com/admin` and sign in.

### Worth knowing about the free tier

Render's free web services **sleep after ~15 minutes of inactivity**, so the first
visitor after a quiet spell waits roughly 50 seconds for the app to wake. That is fine
while you are building, but for a real business site paying ~$7/month removes it. Neon's
free database does not sleep in the same way.

## Project layout

```
content/
  site.json      Initial seed data only (the database takes over after first boot)
server/
  index.js       Express app, routes, static hosting
  config.js      Reads .env
  db.js          Postgres connection (real Postgres, or embedded PGlite locally)
  schema.sql     Table definitions
  migrate.js     Creates tables + seeds on boot
  store.js       All database queries
  business.js    Merges DB settings over .env defaults
  render.js      Builds the services / pricing / dropdown HTML
  auth.js        Admin login, sessions, CSRF, login throttling
  admin.js       /admin routes + JSON API
  set-password.js  npm run set-admin-password
  mailer.js      Nodemailer transport + HTML email templates
  validate.js    Server-side validation and sanitising
  views/         Admin login + dashboard HTML
public/
  index.html     Page template ({{SERVICES}} etc. filled in by the server)
  404.html       Not-found page
  css/styles.css, css/admin.css, css/fonts.css
  js/main.js     Nav, reveal animations, counters, slider, FAQ, form
  js/admin.js    Admin panel
  images/        All photography, served locally
  fonts/         Inter + Plus Jakarta Sans woff2 files
render.yaml      Render deployment blueprint
```

## API

Public:

| Method | Route               | Purpose                                            |
|--------|---------------------|----------------------------------------------------|
| GET    | `/api/config`       | Business details for the browser (phone, email...) |
| GET    | `/api/mail-health`  | Verifies the mail transport connects               |
| POST   | `/api/booking`      | Validates, saves and emails a booking              |

Admin (all require a signed-in session and a CSRF token):

| Method | Route                          | Purpose                     |
|--------|--------------------------------|-----------------------------|
| GET    | `/admin`                       | Dashboard                   |
| GET/POST | `/admin/login`               | Sign in                     |
| POST   | `/admin/logout`                | Sign out                    |
| GET    | `/admin/api/state`             | Services, plans, settings   |
| POST/PUT/DELETE | `/admin/api/services[/:id]` | Manage services      |
| POST/PUT/DELETE | `/admin/api/plans[/:id]`    | Manage plans         |
| POST   | `/admin/api/settings`          | Save business settings      |
| GET/PATCH/DELETE | `/admin/api/bookings[/:id]` | Manage enquiries    |

## Sections on the page

Hero · trust counters · 15 services · why-us · 4-step process · gallery ·
testimonial slider · pricing · FAQ · booking form · call-now band · footer.

## Notes

- **Images** are stored locally in `public/images/` (26 files, ~1.6 MB total), so the
  site has no third-party CDN dependency and works fully offline. Filenames describe
  their use (`service-water-tank-cleaning.jpg`, `gallery-living-room.jpg`, …) — to
  swap in your own photography, replace the file and keep the name. Source photos are
  from Unsplash, which permits commercial use without attribution.
- **Fonts** are self-hosted in `public/fonts/` (4 files, ~180 KB). Inter and Plus
  Jakarta Sans are both *variable* fonts, so one file per family covers every weight
  the design uses — the `@font-face` rules in `public/css/fonts.css` declare weight
  ranges (`400 700` and `600 800`) rather than one file per weight. Latin and
  Latin-Extended are split by `unicode-range`, so `latin-ext` is only fetched if a
  page actually renders one of those characters. Both are SIL Open Font License 1.1.
- **Form protection**: a hidden honeypot field plus rate limiting (8 submissions per
  IP per 15 minutes) on `/api/booking`.
- **Accessibility**: skip link, keyboard-focusable controls, `aria-expanded` on the
  nav and FAQ, and all animations disabled under `prefers-reduced-motion`.
- **Prices and copy** are placeholders — services, plans and contact details are
  editable in /admin; the remaining copy (hero, about, process, testimonials, FAQ)
  is in `public/index.html`.
- **Bookings are stored in the database** and emailed. If the mail server fails the
  enquiry is still saved, flagged "no email" in the admin panel, and the customer
  still gets a confirmation — so a lead is never lost.
