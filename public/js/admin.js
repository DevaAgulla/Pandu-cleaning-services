/* =============================================================================
   Pandu Cleaning Services - admin panel
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const CSRF = ($('meta[name="csrf-token"]') || {}).content || '';

  const ICONS = [
    'i-home', 'i-sparkle', 'i-waves', 'i-building', 'i-bed', 'i-sofa', 'i-layers',
    'i-kitchen', 'i-bath', 'i-window', 'i-hardhat', 'i-truck', 'i-spray',
    'i-droplet', 'i-zap', 'i-leaf', 'i-shield', 'i-users', 'i-award', 'i-clock',
  ];

  let state = { services: [], plans: [], settings: {}, mail: {} };

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ------------------------------ plumbing ------------------------------ */

  function toast(message, isError) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('is-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  async function api(url, options = {}) {
    const res = await fetch('/admin/api' + url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF,
        ...(options.headers || {}),
      },
    });

    if (res.status === 401) {
      toast('Session expired — signing you in again…', true);
      setTimeout(() => { window.location.href = '/admin/login'; }, 1200);
      throw new Error('Not signed in');
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(body.message || 'Request failed (' + res.status + ')');
    return body.data;
  }

  /* -------------------------------- tabs -------------------------------- */

  function initTabs() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach((t) => t.classList.remove('is-active'));
        $$('.panel').forEach((p) => p.classList.remove('is-active'));
        tab.classList.add('is-active');
        $('#panel-' + tab.dataset.tab).classList.add('is-active');
        if (tab.dataset.tab === 'bookings') loadBookings();
        history.replaceState(null, '', '#' + tab.dataset.tab);
      });
    });

    const hash = (location.hash || '').slice(1);
    const target = $$('.tab').find((t) => t.dataset.tab === hash);
    if (target) target.click();
  }

  /* -------------------------------- modal ------------------------------- */

  let onSave = null;

  function openModal(title, bodyHtml, handler) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    onSave = handler;
    $('#modal').hidden = false;
    const first = $('#modalBody input, #modalBody textarea, #modalBody select');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function closeModal() {
    $('#modal').hidden = true;
    $('#modalBody').innerHTML = '';
    onSave = null;
  }

  function initModal() {
    $$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
    });

    $('#modalSave').addEventListener('click', async () => {
      if (!onSave) return;
      const btn = $('#modalSave');
      btn.disabled = true;
      try {
        await onSave();
        closeModal();
      } catch (error) {
        toast(error.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  const val = (id) => {
    const el = $('#' + id);
    if (!el) return '';
    return el.type === 'checkbox' ? el.checked : el.value.trim();
  };

  /* ------------------------------ services ------------------------------ */

  function serviceForm(s = {}) {
    const iconOptions = ICONS
      .map((i) => `<option value="${i}"${s.icon === i ? ' selected' : ''}>${i}</option>`)
      .join('');

    return `
      <div class="field">
        <label for="f-title">Service name *</label>
        <input class="input" id="f-title" type="text" value="${esc(s.title || '')}" placeholder="e.g. Balcony Cleaning">
      </div>
      <div class="field">
        <label for="f-description">Description</label>
        <textarea class="input" id="f-description" placeholder="One or two lines shown on the card">${esc(s.description || '')}</textarea>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="f-priceLabel">Price label</label>
          <input class="input" id="f-priceLabel" type="text" value="${esc(s.priceLabel || 'Starting at')}" placeholder="Starting at">
        </div>
        <div class="field">
          <label for="f-priceValue">Price <small>(free text)</small></label>
          <input class="input" id="f-priceValue" type="text" value="${esc(s.priceValue || '')}" placeholder="₹1,499">
        </div>
        <div class="field">
          <label for="f-tag">Badge <small>(blank to hide)</small></label>
          <input class="input" id="f-tag" type="text" value="${esc(s.tag || '')}" placeholder="Most Booked">
        </div>
        <div class="field">
          <label for="f-icon">Icon</label>
          <select class="input" id="f-icon">${iconOptions}</select>
        </div>
      </div>
      <div class="field">
        <label for="f-features">Feature chips <small>(one per line)</small></label>
        <textarea class="input" id="f-features" placeholder="Dusting&#10;Mopping">${esc((s.features || []).join('\n'))}</textarea>
      </div>
      <div class="field">
        <label for="f-image">Image path</label>
        <input class="input" id="f-image" type="text" value="${esc(s.image || '')}" placeholder="/images/service-house-cleaning.jpg">
      </div>
      <div class="field">
        <label for="f-imageAlt">Image description <small>(for screen readers)</small></label>
        <input class="input" id="f-imageAlt" type="text" value="${esc(s.imageAlt || '')}">
      </div>
      <label class="checkbox">
        <input type="checkbox" id="f-isActive" ${s.isActive === false ? '' : 'checked'}>
        Show this service on the website
      </label>`;
  }

  function collectService() {
    return {
      title: val('f-title'),
      description: val('f-description'),
      tag: val('f-tag'),
      icon: val('f-icon'),
      image: val('f-image'),
      imageAlt: val('f-imageAlt'),
      features: val('f-features').split('\n').map((x) => x.trim()).filter(Boolean),
      priceLabel: val('f-priceLabel'),
      priceValue: val('f-priceValue'),
      isActive: val('f-isActive'),
    };
  }

  /** Up/down controls - drag-and-drop does not work on touch screens. */
  function orderControls(id, index, total) {
    return `
        <div class="row__order">
          <button class="icon-btn icon-btn--xs" data-move="up" data-id="${id}"
                  ${index === 0 ? 'disabled' : ''} aria-label="Move up" title="Move up">&#9650;</button>
          <button class="icon-btn icon-btn--xs" data-move="down" data-id="${id}"
                  ${index === total - 1 ? 'disabled' : ''} aria-label="Move down" title="Move down">&#9660;</button>
        </div>`;
  }

  function bindMove(host, kind) {
    $$('[data-move]', host).forEach((btn) =>
      btn.addEventListener('click', () => moveRow(kind, Number(btn.dataset.id), btn.dataset.move === 'up' ? -1 : 1)));
  }

  async function moveRow(kind, id, direction) {
    const list = kind === 'services' ? state.services : state.plans;
    const from = list.findIndex((x) => x.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;

    const ids = list.map((x) => x.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];

    try {
      const rows = await api('/' + kind + '/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
      if (kind === 'services') { state.services = rows; renderServices(); }
      else { state.plans = rows; renderPlans(); }
      toast('Order updated');
    } catch (error) {
      toast(error.message, true);
    }
  }

  function renderServices() {
    const host = $('#serviceList');

    if (!state.services.length) {
      host.innerHTML = '<div class="empty">No services yet. Add your first one.</div>';
      return;
    }

    const total = state.services.length;
    host.innerHTML = state.services
      .map(
        (s, i) => `
      <div class="row ${s.isActive ? '' : 'row--inactive'}" draggable="true" data-id="${s.id}">
        ${orderControls(s.id, i, total)}
        <img class="row__thumb" src="${esc(s.image)}" alt="" loading="lazy">
        <div class="row__main">
          <div class="row__title">${esc(s.title)}
            ${s.tag ? `<span class="badge">${esc(s.tag)}</span>` : ''}
            ${s.isActive ? '' : '<span class="badge badge--off">Hidden</span>'}
          </div>
          <div class="row__sub">${esc(s.description)}</div>
        </div>
        <div class="row__price">${esc(s.priceValue)}</div>
        <div class="row__actions">
          <button class="btn btn--ghost btn--sm" data-edit="${s.id}">Edit</button>
          <button class="btn btn--danger btn--sm" data-del="${s.id}">Delete</button>
        </div>
      </div>`
      )
      .join('');

    $$('[data-edit]', host).forEach((btn) =>
      btn.addEventListener('click', () => editService(Number(btn.dataset.edit))));
    $$('[data-del]', host).forEach((btn) =>
      btn.addEventListener('click', () => removeService(Number(btn.dataset.del))));
    bindMove(host, 'services');

    enableDragReorder(host, async (ids) => {
      state.services = await api('/services/reorder', {
        method: 'POST', body: JSON.stringify({ ids }),
      });
      renderServices();
      toast('Order saved');
    });
  }

  function editService(id) {
    const service = state.services.find((s) => s.id === id);
    if (!service) return;

    openModal('Edit service', serviceForm(service), async () => {
      const data = collectService();
      if (!data.title) throw new Error('Service name is required.');
      await api('/services/' + id, { method: 'PUT', body: JSON.stringify(data) });
      await refresh();
      toast('Service updated');
    });
  }

  function addService() {
    openModal('Add service', serviceForm({ priceLabel: 'Starting at', isActive: true }), async () => {
      const data = collectService();
      if (!data.title) throw new Error('Service name is required.');
      await api('/services', { method: 'POST', body: JSON.stringify(data) });
      await refresh();
      toast('Service added');
    });
  }

  async function removeService(id) {
    const service = state.services.find((s) => s.id === id);
    if (!service) return;
    if (!window.confirm(`Delete "${service.title}"? This cannot be undone.`)) return;

    try {
      await api('/services/' + id, { method: 'DELETE' });
      await refresh();
      toast('Service deleted');
    } catch (error) {
      toast(error.message, true);
    }
  }

  /* -------------------------------- plans ------------------------------- */

  function planForm(p = {}) {
    const featureText = (p.features || [])
      .map((f) => (f.included === false ? '-' + f.text : f.text))
      .join('\n');

    const serviceOptions = ['<option value="">— none —</option>']
      .concat(state.services.map((s) =>
        `<option value="${esc(s.title)}"${p.ctaService === s.title ? ' selected' : ''}>${esc(s.title)}</option>`))
      .join('');

    return `
      <div class="field">
        <label for="f-name">Plan name *</label>
        <input class="input" id="f-name" type="text" value="${esc(p.name || '')}" placeholder="e.g. Deep Clean">
      </div>
      <div class="field">
        <label for="f-description">Short description</label>
        <input class="input" id="f-description" type="text" value="${esc(p.description || '')}">
      </div>
      <div class="grid2">
        <div class="field">
          <label for="f-currency">Currency</label>
          <input class="input" id="f-currency" type="text" value="${esc(p.currency || '₹')}">
        </div>
        <div class="field">
          <label for="f-price">Price</label>
          <input class="input" id="f-price" type="text" value="${esc(p.price || '')}" placeholder="3,999">
        </div>
        <div class="field">
          <label for="f-period">Period</label>
          <input class="input" id="f-period" type="text" value="${esc(p.period || '/ visit')}">
        </div>
        <div class="field">
          <label for="f-ctaService">Button books which service?</label>
          <select class="input" id="f-ctaService">${serviceOptions}</select>
        </div>
      </div>
      <div class="field">
        <label for="f-ctaLabel">Button text</label>
        <input class="input" id="f-ctaLabel" type="text" value="${esc(p.ctaLabel || 'Choose plan')}">
      </div>
      <div class="field">
        <label for="f-features">Features <small>(one per line — start a line with "-" to show it greyed out)</small></label>
        <textarea class="input" id="f-features" style="min-height:130px">${esc(featureText)}</textarea>
      </div>
      <label class="checkbox" style="margin-bottom:10px">
        <input type="checkbox" id="f-featured" ${p.featured ? 'checked' : ''}>
        Highlight as "Most Popular" <small style="color:var(--muted)">(only one plan)</small>
      </label>
      <label class="checkbox">
        <input type="checkbox" id="f-isActive" ${p.isActive === false ? '' : 'checked'}>
        Show this plan on the website
      </label>`;
  }

  function collectPlan() {
    return {
      name: val('f-name'),
      description: val('f-description'),
      currency: val('f-currency'),
      price: val('f-price'),
      period: val('f-period'),
      featured: val('f-featured'),
      ctaLabel: val('f-ctaLabel'),
      ctaService: val('f-ctaService'),
      features: val('f-features').split('\n').map((l) => l.trim()).filter(Boolean)
        .map((line) => line.startsWith('-')
          ? { text: line.slice(1).trim(), included: false }
          : { text: line, included: true }),
      isActive: val('f-isActive'),
    };
  }

  function renderPlans() {
    const host = $('#planList');

    if (!state.plans.length) {
      host.innerHTML = '<div class="empty">No pricing plans yet.</div>';
      return;
    }

    const totalPlans = state.plans.length;
    host.innerHTML = state.plans
      .map(
        (p, i) => `
      <div class="row ${p.isActive ? '' : 'row--inactive'}" draggable="true" data-id="${p.id}">
        ${orderControls(p.id, i, totalPlans)}
        <div class="row__main">
          <div class="row__title">${esc(p.name)}
            ${p.featured ? '<span class="badge badge--star">Most Popular</span>' : ''}
            ${p.isActive ? '' : '<span class="badge badge--off">Hidden</span>'}
          </div>
          <div class="row__sub">${esc(p.description)} · ${(p.features || []).length} features</div>
        </div>
        <div class="row__price">${esc(p.currency)}${esc(p.price)} <small style="font-weight:500;color:var(--muted)">${esc(p.period)}</small></div>
        <div class="row__actions">
          <button class="btn btn--ghost btn--sm" data-edit="${p.id}">Edit</button>
          <button class="btn btn--danger btn--sm" data-del="${p.id}">Delete</button>
        </div>
      </div>`
      )
      .join('');

    $$('[data-edit]', host).forEach((btn) =>
      btn.addEventListener('click', () => editPlan(Number(btn.dataset.edit))));
    $$('[data-del]', host).forEach((btn) =>
      btn.addEventListener('click', () => removePlan(Number(btn.dataset.del))));
    bindMove(host, 'plans');

    enableDragReorder(host, async (ids) => {
      state.plans = await api('/plans/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
      renderPlans();
      toast('Order saved');
    });
  }

  function editPlan(id) {
    const plan = state.plans.find((p) => p.id === id);
    if (!plan) return;

    openModal('Edit plan', planForm(plan), async () => {
      const data = collectPlan();
      if (!data.name) throw new Error('Plan name is required.');
      await api('/plans/' + id, { method: 'PUT', body: JSON.stringify(data) });
      await refresh();
      toast('Plan updated');
    });
  }

  function addPlan() {
    openModal('Add plan', planForm({ currency: '₹', period: '/ visit', isActive: true }), async () => {
      const data = collectPlan();
      if (!data.name) throw new Error('Plan name is required.');
      await api('/plans', { method: 'POST', body: JSON.stringify(data) });
      await refresh();
      toast('Plan added');
    });
  }

  async function removePlan(id) {
    const plan = state.plans.find((p) => p.id === id);
    if (!plan) return;
    if (!window.confirm(`Delete the "${plan.name}" plan?`)) return;

    try {
      await api('/plans/' + id, { method: 'DELETE' });
      await refresh();
      toast('Plan deleted');
    } catch (error) {
      toast(error.message, true);
    }
  }

  /* ---------------------------- drag to reorder -------------------------- */

  function enableDragReorder(host, onDrop) {
    let dragged = null;

    $$('.row', host).forEach((row) => {
      row.addEventListener('dragstart', () => {
        dragged = row;
        row.classList.add('dragging');
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        $$('.row', host).forEach((r) => r.classList.remove('drop-target'));
        dragged = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragged && row !== dragged) row.classList.add('drop-target');
      });

      row.addEventListener('dragleave', () => row.classList.remove('drop-target'));

      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        row.classList.remove('drop-target');
        if (!dragged || row === dragged) return;

        const rows = $$('.row', host);
        const from = rows.indexOf(dragged);
        const to = rows.indexOf(row);
        if (from < to) row.after(dragged); else row.before(dragged);

        const ids = $$('.row', host).map((r) => Number(r.dataset.id));
        try {
          await onDrop(ids);
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  /* ------------------------------- bookings ----------------------------- */

  const STATUS_BADGE = {
    new: 'badge--new', contacted: 'badge--star', done: 'badge--done', spam: 'badge--off',
  };

  async function loadBookings() {
    const host = $('#bookingList');
    host.innerHTML = '<div class="loading">Loading…</div>';

    try {
      const status = $('#bookingFilter').value;
      const { rows } = await api('/bookings?limit=100&status=' + encodeURIComponent(status));

      if (!rows.length) {
        host.innerHTML = '<div class="empty">No booking requests yet.</div>';
        return;
      }

      host.innerHTML = rows.map(renderBooking).join('');

      $$('[data-status]', host).forEach((sel) =>
        sel.addEventListener('change', async () => {
          try {
            await api('/bookings/' + sel.dataset.status, {
              method: 'PATCH', body: JSON.stringify({ status: sel.value }),
            });
            toast('Status updated');
            refresh();
            loadBookings();
          } catch (error) {
            toast(error.message, true);
          }
        }));

      $$('[data-delb]', host).forEach((btn) =>
        btn.addEventListener('click', async () => {
          if (!window.confirm('Delete this booking permanently?')) return;
          try {
            await api('/bookings/' + btn.dataset.delb, { method: 'DELETE' });
            toast('Booking deleted');
            refresh();
            loadBookings();
          } catch (error) {
            toast(error.message, true);
          }
        }));
    } catch (error) {
      host.innerHTML = '<div class="empty">Could not load bookings: ' + esc(error.message) + '</div>';
    }
  }

  function renderBooking(b) {
    const when = new Date(b.created_at).toLocaleString();
    const cell = (label, value) =>
      value ? `<div class="booking__cell"><small>${label}</small><span>${esc(value)}</span></div>` : '';

    const statuses = ['new', 'contacted', 'done', 'spam']
      .map((s) => `<option value="${s}"${b.status === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`)
      .join('');

    return `
      <div class="row row--stack">
        <div class="row__top">
          <div class="row__main">
            <div class="row__title">${esc(b.name)}
              <span class="badge ${STATUS_BADGE[b.status] || ''}">${esc(b.status)}</span>
              ${b.mail_sent ? '' : '<span class="badge badge--off" title="' + esc(b.mail_error || 'Email was not sent') + '">no email</span>'}
            </div>
            <div class="row__sub">${esc(b.service || 'No service selected')} · ${esc(when)}</div>
          </div>
          <div class="row__actions">
            <a class="btn btn--ghost btn--sm" href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ''))}">Call</a>
            ${b.email ? `<a class="btn btn--ghost btn--sm" href="mailto:${esc(b.email)}">Email</a>` : ''}
            <select class="input input--auto" data-status="${b.id}" style="padding:7px 10px;font-size:.8rem">${statuses}</select>
            <button class="btn btn--danger btn--sm" data-delb="${b.id}">Delete</button>
          </div>
        </div>
        <div class="booking__grid">
          ${cell('Phone', b.phone)}
          ${cell('Email', b.email)}
          ${cell('Property', b.property_type)}
          ${cell('Preferred date', b.preferred_date)}
          ${cell('Preferred time', b.preferred_time)}
          ${cell('City', b.city)}
          ${cell('Address', b.address)}
        </div>
        ${b.message ? `<div class="booking__msg">${esc(b.message)}</div>` : ''}
      </div>`;
  }

  /* ------------------------------- settings ----------------------------- */

  function fillSettings() {
    Object.entries(state.settings).forEach(([key, value]) => {
      const el = $('#s-' + key);
      if (el) el.value = value;
    });

    const note = $('#mailNote');
    if (state.mail.configured) {
      note.innerHTML = `Emails are sent through <b>${esc(state.mail.transport)}</b>` +
        (state.mail.user ? ` as <b>${esc(state.mail.user)}</b>` : '') +
        '. The mail password lives in the .env file and cannot be changed here.';
    } else {
      note.innerHTML = '<b>Email sending is off.</b> MAIL_TRANSPORT is set to "console", so ' +
        'bookings are saved and printed to the server log but not emailed. ' +
        'Set the MAIL_* values in .env to start sending.';
    }
  }

  function initSettings() {
    $('#settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#settingsForm button[type="submit"]');
      btn.disabled = true;

      const values = {};
      $$('#settingsForm .input').forEach((el) => {
        if (el.name) values[el.name] = el.value.trim();
      });

      try {
        state.settings = await api('/settings', { method: 'POST', body: JSON.stringify(values) });
        toast('Settings saved');
      } catch (error) {
        toast(error.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* --------------------------------- boot -------------------------------- */

  async function refresh() {
    const data = await api('/state');
    state = data;
    renderServices();
    renderPlans();
    fillSettings();

    const pill = $('#bookingCount');
    if (data.stats.newBookings > 0) {
      pill.textContent = data.stats.newBookings;
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  }

  async function init() {
    initTabs();
    initModal();
    initSettings();
    $('#addService').addEventListener('click', addService);
    $('#addPlan').addEventListener('click', addPlan);
    $('#bookingFilter').addEventListener('change', loadBookings);

    try {
      await refresh();
    } catch (error) {
      toast('Could not load data: ' + error.message, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
