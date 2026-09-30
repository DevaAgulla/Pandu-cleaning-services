'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

const TEMPLATE_FILE = path.join(__dirname, '..', 'public', 'index.html');

let cachedTemplate = null;

const esc = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Cards stagger across each row of three. */
const delayFor = (index) => {
  const step = (index % 3) * 70;
  return step ? ` style="--delay:${step}ms"` : '';
};

function renderServices(services) {
  return services
    .map((service, i) => {
      const tag = service.tag
        ? `\n          <span class="service__tag">${esc(service.tag)}</span>`
        : '';
      const features = (service.features || [])
        .map((f) => `<li>${esc(f)}</li>`)
        .join('');
      const price = service.priceValue
        ? `<div class="service__price">${esc(service.priceLabel)} <b>${esc(service.priceValue)}</b></div>`
        : '<div class="service__price"></div>';

      return `      <article class="service reveal"${delayFor(i)}>
        <div class="service__media">
          <img loading="lazy" src="${esc(service.image)}" alt="${esc(service.imageAlt)}" width="700" height="438">${tag}
        </div>
        <div class="service__body">
          <span class="service__icon"><svg><use href="#${esc(service.icon)}"></use></svg></span>
          <h3>${esc(service.title)}</h3>
          <p>${esc(service.description)}</p>
          <ul class="service__list">${features}</ul>
          <div class="service__foot">
            ${price}
            <button class="service__book" type="button" data-service="${esc(service.title)}">Book this <svg><use href="#i-arrow-right"></use></svg></button>
          </div>
        </div>
      </article>`;
    })
    .join('\n\n');
}

function renderPlans(plans) {
  return plans
    .map((plan, i) => {
      const features = (plan.features || [])
        .map((f) => {
          const off = f.included === false ? ' class="is-off"' : '';
          return `          <li${off}><svg><use href="#i-check"></use></svg> ${esc(f.text)}</li>`;
        })
        .join('\n');

      const btnStyle = plan.featured ? 'btn--primary' : 'btn--ghost';
      const classes = plan.featured ? 'plan plan--featured reveal' : 'plan reveal';

      return `      <div class="${classes}"${delayFor(i)}>
        <h3>${esc(plan.name)}</h3>
        <p class="plan__desc">${esc(plan.description)}</p>
        <div class="plan__price"><sup>${esc(plan.currency)}</sup>${esc(plan.price)} <small>${esc(plan.period)}</small></div>
        <ul class="plan__features">
${features}
        </ul>
        <button class="btn ${btnStyle} btn--block" type="button" data-service="${esc(plan.ctaService)}">${esc(plan.ctaLabel)}</button>
      </div>`;
    })
    .join('\n\n');
}

/** Keeps the booking dropdown in step with the service list automatically. */
function renderServiceOptions(services) {
  const options = services
    .map((s) => `                <option>${esc(s.title)}</option>`)
    .join('\n');
  return `${options}\n                <option>Other / Not sure</option>`;
}

function loadTemplate() {
  if (config.env === 'production' && cachedTemplate) return cachedTemplate;
  const html = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  cachedTemplate = html;
  return html;
}

/** Builds the full home page from the template plus the database. */
async function renderIndex() {
  const [services, plans] = await Promise.all([
    store.listServices({ activeOnly: true }),
    store.listPlans({ activeOnly: true }),
  ]);
  const template = loadTemplate();

  return template
    .replace('<!--{{SERVICES}}-->', () => renderServices(services))
    .replace('<!--{{PRICING}}-->', () => renderPlans(plans))
    .replace('<!--{{SERVICE_OPTIONS}}-->', () => renderServiceOptions(services));
}

module.exports = { renderIndex, esc };
