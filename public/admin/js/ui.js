/**
 * UI building blocks: element helper, icons, formatting, bottom sheets, toasts, progress.
 * All text is created with textContent (never innerHTML), so data from the repository
 * cannot inject HTML.
 */

/* ---------- DOM ---------- */

/**
 * Creates an element. props: class, text, value, checked, dataset, style (object),
 * onClick/onInput/… (listeners), any other key → attribute (true → empty attribute).
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' || key === 'checked') continue; // set after children (see below)
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  if (props && props.value != null) el.value = props.value;
  if (props && props.checked) el.checked = true;
  return el;
}

/** Appends children, skipping null/false and flattening arrays. */
export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Replaces the content of `el` (null/false children are skipped, unlike replaceChildren). */
export function setChildren(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

/* ---------- icons (inline SVG, stroke = currentColor) ---------- */

const ICONS = {
  camera: '<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10.5H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  gallery: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15"/>',
  logout: '<path d="M14 4.5h5v15h-5M10 8l-4 4 4 4M6 12h10"/>',
  external: '<path d="M13.5 4.5h6v6M19.5 4.5l-8.5 8.5M17.5 13.5v6h-13v-13h6"/>',
  star: '<path d="M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16M10 6a9.6 9.6 0 0 1 2-.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.3M6.6 7.6A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6"/>',
  tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.5"/>',
  bag: '<path d="M5.5 9h13l-1.2 11h-10.6z"/><path d="M8.5 9a3.5 3.5 0 0 1 7 0"/>',
  download: '<path d="M12 4.5v10.5M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  sync: '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9"/>',
};

export function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // Static, trusted markup defined above (not user data).
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

/* ---------- formatting ---------- */

/** 40 → "CHF 40.–", 42.5 → "CHF 42.50" (Swiss style). */
export function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'CHF –';
  return Number.isInteger(n) ? `CHF ${n}.–` : `CHF ${n.toFixed(2)}`;
}

/** 12 → "N° 012" */
export function formatNumber(number) {
  return `N° ${String(number || 0).padStart(3, '0')}`;
}

/** ISO → "29.10.2026" */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const SOLD_CHANNELS = {
  'online-shipping': 'online, spedizione',
  'online-pickup': 'online, ritiro',
  manual: 'di persona',
};

/** "Venduta il 29.10.2026 · online, spedizione" */
export function soldLine(product) {
  const parts = [product.soldAt ? `Venduta il ${formatDate(product.soldAt)}` : 'Venduta'];
  if (product.soldChannel) parts.push(SOLD_CHANNELS[product.soldChannel] || product.soldChannel);
  return parts.join(' · ');
}

/** Lookup helpers on the loaded data (models.json, taxonomy.json). */
export function labels(data) {
  const models = (data && data.models) || [];
  const colours = (data && data.taxonomy && data.taxonomy.colours) || [];
  const linings = (data && data.taxonomy && data.taxonomy.linings) || [];
  const find = (list, id) => list.find((x) => x.id === id);
  return {
    model: (id) => (find(models, id) || {}).name || id || '–',
    colour: (id) => (find(colours, id) || {}).it || id || '–',
    colourHex: (id) => (find(colours, id) || {}).hex || 'transparent',
    lining: (id) => (find(linings, id) || {}).it || id || '–',
    /** "N° 012 · Belle · Bordeaux" */
    title(p) {
      return [formatNumber(p.number), this.model(p.model), this.colour(p.colour)].join(' · ');
    },
  };
}

/* ---------- photo thumbnails ---------- */

/**
 * <div class="thumb"> with the photo `src` from the backend (raw URL, or the authenticated
 * API for private repositories, then an empty placeholder).
 */
export function photoThumb(backend, src, { className = 'thumb', alt = '' } = {}) {
  const wrap = h('div', { class: `${className} is-loading` });
  const showEmpty = () => {
    wrap.classList.remove('is-loading');
    wrap.classList.add('is-empty');
    wrap.replaceChildren(icon('bag'));
  };
  if (!src || !backend) {
    showEmpty();
    return wrap;
  }
  const { url, fallback } = backend.thumb(src);
  const img = h('img', { alt, decoding: 'async', loading: 'lazy', draggable: 'false' });
  let usedFallback = false;
  const tryFallback = async () => {
    if (usedFallback || !fallback) return showEmpty();
    usedFallback = true;
    const other = await fallback();
    if (other) img.src = other;
    else showEmpty();
  };
  img.addEventListener('load', () => wrap.classList.remove('is-loading'));
  img.addEventListener('error', tryFallback);
  wrap.append(img);
  if (url) {
    img.src = url;
  } else if (typeof IntersectionObserver === 'function') {
    // Download through the API only when the photo is about to scroll into view.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        tryFallback();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(wrap);
  } else {
    tryFallback();
  }
  return wrap;
}

/* ---------- bottom sheets (instead of window.confirm / alert) ---------- */

let sheetSeq = 0;

function openSheet({ title, text, buttons }) {
  return new Promise((resolve) => {
    const id = `sheet-title-${++sheetSeq}`;
    const previousFocus = document.activeElement;
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 220);
      if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    const buttonEls = buttons.map((b) =>
      h('button', { type: 'button', class: `btn btn-block ${b.className}`, onClick: () => close(b.value) }, b.label),
    );
    const overlay = h(
      'div',
      { class: 'sheet-overlay', onClick: (e) => e.target === overlay && close(false) },
      h(
        'div',
        { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
        h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
        h('h2', { class: 'sheet-title', id }, title),
        text ? h('p', { class: 'sheet-text' }, text) : null,
        h('div', { class: 'sheet-actions' }, buttonEls),
      ),
    );
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    buttonEls[0].focus({ preventScroll: true });
  });
}

/** In-page confirmation. Resolves true / false. */
export function confirmSheet({ title, text, confirmLabel, cancelLabel = 'Annulla', danger = false }) {
  return openSheet({
    title,
    text,
    buttons: [
      { label: confirmLabel, value: true, className: danger ? 'btn-danger' : 'btn-primary' },
      { label: cancelLabel, value: false, className: 'btn-ghost' },
    ],
  });
}

/** In-page message with a single OK button. */
export function alertSheet({ title, text, okLabel = 'Ho capito' }) {
  return openSheet({ title, text, buttons: [{ label: okLabel, value: true, className: 'btn-primary' }] });
}

/* ---------- toast ---------- */

export function toast(message, { type = 'info', duration = 3800 } = {}) {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast toast-${type}` }, message);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('is-open'));
  setTimeout(() => {
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

/* ---------- blocking progress overlay ("Carico… 3/9") ---------- */

let progressEl = null;

export const progress = {
  /** @param {string} text  @param {number|null} [fraction] 0..1, null = indeterminate */
  show(text, fraction = null) {
    if (!progressEl) {
      progressEl = h(
        'div',
        { class: 'progress-overlay', role: 'alertdialog', 'aria-modal': 'true', 'aria-live': 'assertive' },
        h(
          'div',
          { class: 'progress-box' },
          h('div', { class: 'spinner', 'aria-hidden': 'true' }),
          h('p', { class: 'progress-text' }),
          h('div', { class: 'progress-bar' }, h('span')),
          h('p', { class: 'progress-hint' }, 'Non chiudere questa pagina.'),
        ),
      );
      document.body.append(progressEl);
    }
    progressEl.querySelector('.progress-text').textContent = text;
    const bar = progressEl.querySelector('.progress-bar');
    bar.hidden = fraction == null;
    if (fraction != null) bar.firstChild.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  },
  hide() {
    if (progressEl) progressEl.remove();
    progressEl = null;
  },
};

/* ---------- common layout pieces ---------- */

/** Top bar: optional back button, title, optional action buttons. */
export function topbar({ title, subtitle, onBack, backLabel = 'Indietro', actions = [] }) {
  return h(
    'header',
    { class: 'topbar' },
    onBack
      ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': backLabel, onClick: onBack }, icon('back'))
      : null,
    h(
      'div',
      { class: 'topbar-titles' },
      subtitle ? h('p', { class: 'topbar-sub' }, subtitle) : null,
      h('h1', { class: 'topbar-title' }, title),
    ),
    actions,
  );
}

/** Fixed bottom bar for the main action (reachable with the thumb). */
export function stickyBar(...children) {
  return h('div', { class: 'sticky-bar' }, h('div', { class: 'sticky-inner' }, children));
}
