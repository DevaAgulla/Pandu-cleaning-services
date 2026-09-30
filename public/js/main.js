/* =============================================================================
   Pandu Cleaning Services - front-end behaviour
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------------------------------------------------------------
     1. Business details from /api/config (phone number lives in .env)
     ------------------------------------------------------------------ */
  async function loadBusinessConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('config request failed');
      const { data } = await res.json();
      applyBusinessConfig(data);
    } catch (err) {
      // The page still works with the markup defaults if the API is unreachable.
      console.warn('Could not load business config:', err.message);
    }
  }

  function applyBusinessConfig(cfg) {
    if (!cfg) return;

    $$('[data-biz]').forEach((el) => {
      const value = cfg[el.dataset.biz];
      if (value) el.textContent = value;
    });

    // Every "Call now" control points at the number from .env.
    if (cfg.telHref) {
      $$('[data-tel]').forEach((el) => { el.href = cfg.telHref; });
    }

    if (cfg.email) {
      $$('[data-biz-mail]').forEach((el) => { el.href = 'mailto:' + cfg.email; });
    }

    $$('[data-whatsapp]').forEach((el) => {
      if (cfg.whatsappHref) {
        el.href = cfg.whatsappHref;
      } else {
        el.style.display = 'none';
      }
    });

    if (cfg.name) document.title = cfg.name + ' | Professional Home, Office & Deep Cleaning';
  }

  /* ---------------------------------------------------------------------
     2. Header: sticky state, mobile nav, active link highlighting
     ------------------------------------------------------------------ */
  function initHeader() {
    const header = $('#header');
    const toggle = $('#navToggle');
    const nav = $('#nav');
    const backdrop = $('#navBackdrop');
    const toTop = $('#toTop');

    const onScroll = () => {
      const y = window.scrollY;
      header.classList.toggle('is-stuck', y > 20);
      toTop.classList.toggle('is-visible', y > 600);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const closeNav = () => {
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    };

    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    backdrop.addEventListener('click', closeNav);
    $$('a', nav).forEach((link) => link.addEventListener('click', closeNav));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeNav();
    });

    toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Highlight the section currently in view.
    const links = $$('a[href^="#"]', nav).filter((a) => a.getAttribute('href').length > 1);
    const sections = links
      .map((a) => ({ link: a, el: document.getElementById(a.getAttribute('href').slice(1)) }))
      .filter((entry) => entry.el);

    if ('IntersectionObserver' in window && sections.length) {
      const spy = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((l) => l.classList.remove('is-active'));
            const match = sections.find((s) => s.el === entry.target);
            if (match) match.link.classList.add('is-active');
          });
        },
        { rootMargin: '-45% 0px -50% 0px' }
      );
      sections.forEach((s) => spy.observe(s.el));
    }
  }

  /* ---------------------------------------------------------------------
     3. Scroll reveal + animated counters
     ------------------------------------------------------------------ */
  function initReveal() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    items.forEach((el) => io.observe(el));
  }

  function initCounters() {
    const counters = $$('.counter');
    if (!counters.length) return;

    const run = (el) => {
      const target = Number(el.dataset.target) || 0;
      const duration = 1600;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased).toLocaleString('en-IN');
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      counters.forEach((el) => { el.textContent = Number(el.dataset.target).toLocaleString('en-IN'); });
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          run(entry.target);
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------------
     4. Decorative hero bubbles
     ------------------------------------------------------------------ */
  function initBubbles() {
    const host = $('#bubbles');
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const count = window.innerWidth < 720 ? 9 : 16;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const size = 10 + Math.random() * 38;
      const bubble = document.createElement('i');
      bubble.style.cssText =
        'left:' + Math.random() * 100 + '%;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'animation-duration:' + (14 + Math.random() * 16) + 's;' +
        'animation-delay:-' + Math.random() * 18 + 's;';
      frag.appendChild(bubble);
    }
    host.appendChild(frag);
  }

  /* ---------------------------------------------------------------------
     5. Testimonials slider
     ------------------------------------------------------------------ */
  function initSlider() {
    const track = $('#sliderTrack');
    const dotsHost = $('#sliderDots');
    if (!track || !dotsHost) return;

    const slides = $$('.slide', track);
    if (!slides.length) return;

    let index = 0;
    let timer = null;

    const dots = slides.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
      dot.addEventListener('click', () => { go(i); restart(); });
      dotsHost.appendChild(dot);
      return dot;
    });

    function go(next) {
      index = (next + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + index * 100 + '%)';
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    }

    function restart() {
      clearInterval(timer);
      timer = setInterval(() => go(index + 1), 6000);
    }

    $('#slideNext').addEventListener('click', () => { go(index + 1); restart(); });
    $('#slidePrev').addEventListener('click', () => { go(index - 1); restart(); });

    // Pause rotation while the pointer is over the slider.
    const slider = $('#slider');
    slider.addEventListener('mouseenter', () => clearInterval(timer));
    slider.addEventListener('mouseleave', restart);

    // Swipe support on touch devices.
    let startX = 0;
    slider.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', (e) => {
      const delta = e.changedTouches[0].clientX - startX;
      if (Math.abs(delta) > 50) { go(index + (delta < 0 ? 1 : -1)); restart(); }
    }, { passive: true });

    go(0);
    restart();
  }

  /* ---------------------------------------------------------------------
     6. FAQ accordion
     ------------------------------------------------------------------ */
  function initFaq() {
    const items = $$('.faq__item');

    items.forEach((item) => {
      const btn = $('.faq__q', item);
      const panel = $('.faq__a', item);

      btn.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');

        items.forEach((other) => {
          other.classList.remove('is-open');
          $('.faq__a', other).style.maxHeight = null;
          $('.faq__q', other).setAttribute('aria-expanded', 'false');
        });

        if (!isOpen) {
          item.classList.add('is-open');
          panel.style.maxHeight = panel.scrollHeight + 'px';
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // Keep an open panel correctly sized when the layout reflows.
    window.addEventListener('resize', () => {
      const open = $('.faq__item.is-open');
      if (open) $('.faq__a', open).style.maxHeight = $('.faq__a', open).scrollHeight + 'px';
    });
  }

  /* ---------------------------------------------------------------------
     7. "Book this service" buttons prefill the form
     ------------------------------------------------------------------ */
  function initServiceShortcuts() {
    const select = $('#service');

    $$('[data-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wanted = btn.dataset.service.trim();

        if (select) {
          const match = Array.from(select.options).find(
            (opt) => opt.text.trim().toLowerCase() === wanted.toLowerCase()
          );
          select.value = match ? match.value || match.text : '';
          select.dispatchEvent(new Event('change'));
        }

        document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Draw the eye to the prefilled field once scrolling settles.
        setTimeout(() => {
          if (!select) return;
          select.focus({ preventScroll: true });
        }, 700);
      });
    });
  }

  /* ---------------------------------------------------------------------
     8. Booking form: validation + submit
     ------------------------------------------------------------------ */
  function initBookingForm() {
    const form = $('#bookingForm');
    if (!form) return;

    const submitBtn = $('#submitBtn');
    const status = $('#formStatus');
    const statusText = $('#formStatusText');
    const statusIcon = $('use', status);

    const dateInput = $('#date');
    if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const PHONE_RE = /^\+?[\d\s\-()]{6,20}$/;

    const fieldOf = (input) => input.closest('.field');

    function setError(input, message) {
      const field = fieldOf(input);
      if (!field) return;
      const slot = $('.field__error', field);
      if (message) {
        field.classList.add('has-error');
        if (slot) slot.textContent = message;
        input.setAttribute('aria-invalid', 'true');
      } else {
        field.classList.remove('has-error');
        if (slot) slot.textContent = '';
        input.removeAttribute('aria-invalid');
      }
    }

    function validateField(input) {
      const value = input.value.trim();

      if (input.id === 'name') {
        if (value.length < 2) return 'Please enter your full name.';
      }
      if (input.id === 'phone') {
        if (!value) return 'Please enter a phone number.';
        if (!PHONE_RE.test(value)) return 'Please enter a valid phone number.';
      }
      if (input.id === 'email' && value) {
        if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
      }
      if (input.id === 'service') {
        if (!value) return 'Please choose the service you need.';
      }
      return '';
    }

    const validated = ['name', 'phone', 'email', 'service'].map((id) => $('#' + id)).filter(Boolean);

    validated.forEach((input) => {
      const revalidate = () => {
        if (fieldOf(input).classList.contains('has-error')) setError(input, validateField(input));
      };
      input.addEventListener('input', revalidate);
      input.addEventListener('change', revalidate);
      input.addEventListener('blur', () => setError(input, validateField(input)));
    });

    function showStatus(kind, message) {
      status.classList.remove('form-status--ok', 'form-status--err');
      status.classList.add('is-visible', kind === 'ok' ? 'form-status--ok' : 'form-status--err');
      statusText.textContent = message;
      if (statusIcon) statusIcon.setAttribute('href', kind === 'ok' ? '#i-check-circle' : '#i-alert');
      status.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function setLoading(on) {
      submitBtn.classList.toggle('is-loading', on);
      submitBtn.disabled = on;
      const label = $('.btn__label', submitBtn);
      const icon = $('.btn__icon', submitBtn);
      const spinner = $('.spinner', submitBtn);

      if (on) {
        label.textContent = 'Sending...';
        if (icon) icon.style.display = 'none';
        if (!spinner) {
          const s = document.createElement('span');
          s.className = 'spinner';
          submitBtn.appendChild(s);
        }
      } else {
        label.textContent = 'Send Request';
        if (icon) icon.style.display = '';
        if (spinner) spinner.remove();
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      let firstInvalid = null;
      validated.forEach((input) => {
        const message = validateField(input);
        setError(input, message);
        if (message && !firstInvalid) firstInvalid = input;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        showStatus('err', 'Please correct the highlighted fields and try again.');
        return;
      }

      const payload = Object.fromEntries(new FormData(form).entries());
      setLoading(true);
      status.classList.remove('is-visible');

      try {
        const res = await fetch('/api/booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json().catch(() => ({}));

        if (res.ok && result.ok) {
          showStatus('ok', result.message || 'Thank you! Your request has been received.');
          form.reset();
          validated.forEach((input) => setError(input, ''));
        } else {
          if (result.errors) {
            Object.entries(result.errors).forEach(([id, message]) => {
              const input = $('#' + id);
              if (input) setError(input, message);
            });
          }
          showStatus('err', result.message || 'Something went wrong. Please try again or call us.');
        }
      } catch (err) {
        showStatus('err', 'Network error. Please check your connection or call us directly.');
      } finally {
        setLoading(false);
      }
    });
  }

  /* ---------------------------------------------------------------------
     9. Hide the floating call button over the booking section
     ------------------------------------------------------------------ */
  function initFloatingCall() {
    const fab = $('.fab-call');
    const booking = $('#booking');
    if (!fab || !booking || !('IntersectionObserver' in window)) return;

    // The booking section has its own prominent Call button; showing the
    // floating one as well just stacks two identical controls.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => fab.classList.toggle('is-hidden', entry.isIntersecting)),
      { threshold: 0.12 }
    );
    io.observe(booking);
  }

  /* ---------------------------------------------------------------------
     10. Boot
     ------------------------------------------------------------------ */
  function init() {
    const yearEl = $('#year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    initHeader();
    initReveal();
    initCounters();
    initBubbles();
    initSlider();
    initFaq();
    initServiceShortcuts();
    initBookingForm();
    initFloatingCall();
    loadBusinessConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
