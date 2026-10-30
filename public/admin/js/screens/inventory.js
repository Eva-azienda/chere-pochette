/**
 * Inventory home: publish status, online-payments status, tabs In vendita / Vendute / Nascoste,
 * "Esporta CSV", list of bags, "Aggiorna vendite ora" and the sticky "+ Nuova borsa" button.
 */
import { h, icon, topbar, stickyBar, photoThumb, formatPrice, formatNumber, soldLine, labels, setChildren, toast } from '../ui.js';
import { inventoryCsv, csvFilename } from '../csv.js';

export const TABS = [
  { id: 'available', label: 'In vendita', empty: 'Nessuna borsa in vendita. Tocca «Nuova borsa» per aggiungerne una.' },
  { id: 'sold', label: 'Vendute', empty: 'Ancora nessuna borsa venduta.' },
  { id: 'hidden', label: 'Nascoste', empty: 'Nessuna borsa nascosta.' },
];

/** Groups and sorts the bags for the three tabs (same order on screen and in the CSV). */
export function groupProducts(products) {
  const groups = { available: [], sold: [], hidden: [] };
  for (const p of products) (groups[p.status] || groups.hidden).push(p);
  const byNumberDesc = (a, b) => (b.number || 0) - (a.number || 0);
  groups.available.sort(byNumberDesc);
  groups.hidden.sort(byNumberDesc);
  groups.sold.sort((a, b) => String(b.soldAt || '').localeCompare(String(a.soldAt || '')) || byNumberDesc(a, b));
  return groups;
}

const DEPLOY_TEXT = {
  online: 'Online ✓',
  running: 'Pubblicazione in corso…',
  // The run is red when publishing failed OR the Zahls sync needs a human (e.g. double payment).
  error: 'Problema nell’ultimo aggiornamento',
};

/**
 * Saves a text file on the phone / computer: Blob + <a download>
 * (iPhone: "Scarica" → app File; Android: cartella Download).
 */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke later: Safari reads the Blob only after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** "Pagamenti online: …" from src/data/site.json → checkout.enabled (read-only). */
function paymentsLine(site) {
  const on = Boolean(site && site.checkout && site.checkout.enabled === true);
  return h(
    'p',
    { class: `pay-status ${on ? 'pay-on' : 'pay-off'}` },
    h('span', { class: 'pay-dot', 'aria-hidden': 'true' }),
    // U+2011 (non-breaking hyphen): "e‑mail" never splits across two lines
    on ? 'Pagamenti online: attivi' : 'Pagamenti online: non ancora attivi – ordini via e\u2011mail',
  );
}

/**
 * @param {object} app  app API: state, backend, setTab, reload, logout, triggerSync
 * @returns {{el: HTMLElement, update: Function, onDeploy: Function}}
 */
export function renderInventory(app) {
  const { state } = app;
  const deployEl = h('div', { class: 'deploy', hidden: true });
  const payEl = h('div', { class: 'pay-area' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Stato delle borse' });
  const exportEl = h('div', { class: 'export-row', hidden: true });
  const listEl = h('div', { class: 'list-area' });

  /** "Esporta CSV": the current tab, or everything ("all"). */
  function exportCsv(scope) {
    if (!state.data) return;
    const groups = groupProducts(state.data.products);
    const products =
      scope === 'all'
        ? [...state.data.products].sort((a, b) => (a.number || 0) - (b.number || 0))
        : groups[scope] || [];
    const filename = csvFilename(scope);
    try {
      downloadText(filename, inventoryCsv(products, state.data));
      toast(`File pronto: ${filename}`);
    } catch (err) {
      toast(`Esportazione non riuscita: ${err.message}`, { type: 'error' });
    }
  }

  const refreshBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ricarica inventario', onClick: () => app.reload() }, icon('refresh'));
  const logoutBtn = h('button', { type: 'button', class: 'icon-btn icon-btn-label', 'aria-label': 'Esci', onClick: () => app.logout() }, icon('logout'), h('span', { 'aria-hidden': 'true' }, 'Esci'));

  const syncBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-block' }, icon('sync'), 'Aggiorna vendite ora');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    try {
      await app.triggerSync();
    } finally {
      syncBtn.disabled = false;
    }
  });

  const el = h(
    'div',
    { class: 'screen' },
    topbar({ title: 'Inventario', subtitle: 'Chère Pochette', actions: [refreshBtn, logoutBtn] }),
    h(
      'main',
      { class: 'content' },
      h('div', { class: 'status-lines' }, deployEl, payEl),
      tabsEl,
      exportEl,
      listEl,
      h(
        'section',
        { class: 'sync-box' },
        syncBtn,
        h('p', { class: 'hint' }, 'Le borse vendute online passano da sole in «Vendute» (controllo automatico). Usa questo pulsante per controllare subito.'),
      ),
    ),
    stickyBar(h('a', { class: 'btn btn-primary btn-block btn-xl', href: '#/nuova' }, icon('plus'), 'Nuova borsa')),
  );

  function renderTabs(groups) {
    setChildren(tabsEl, 
      ...TABS.map((tab) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'tab',
            'aria-selected': String(state.tab === tab.id),
            onClick: () => {
              app.setTab(tab.id);
              update();
            },
          },
          h('span', { class: 'tab-label' }, tab.label),
          h('span', { class: 'tab-count' }, String(groups[tab.id].length)),
        ),
      ),
    );
  }

  function card(p, L) {
    return h(
      'li',
      {},
      h(
        'a',
        { class: 'card product-card', href: `#/borsa/${encodeURIComponent(p.id)}` },
        photoThumb(app.backend, p.photos && p.photos[0] && p.photos[0].src, { className: 'thumb card-thumb' }),
        h(
          'div',
          { class: 'card-body' },
          // "N° 012 · Belle" on one line, the colour (with its swatch) below: no awkward wrapping
          h('p', { class: 'card-title' }, `${formatNumber(p.number)} · ${L.model(p.model)}`),
          h('p', { class: 'card-meta' },
            h('span', { class: 'swatch swatch-sm', 'aria-hidden': 'true', style: { background: L.colourHex(p.colour) } }),
            L.colour(p.colour)),
          p.status === 'sold' ? h('p', { class: 'card-meta' }, soldLine(p)) : null,
          h('p', { class: 'card-price' }, formatPrice(p.price)),
          p.sample ? h('span', { class: 'tag' }, 'Esempio') : null,
        ),
        icon('chevron', 'icon card-chevron'),
      ),
    );
  }

  function renderExport() {
    const tab = TABS.find((t) => t.id === state.tab) || TABS[0];
    setChildren(
      exportEl,
      icon('download', 'icon export-icon'),
      // Accessible names start with the visible text (WCAG 2.5.3: voice control "Esporta tutto" works).
      h('button', { type: 'button', class: 'export-btn', onClick: () => exportCsv(tab.id) }, `Esporta CSV «${tab.label}»`),
      h('span', { class: 'export-sep', 'aria-hidden': 'true' }, '·'),
      h('button', {
        type: 'button', class: 'export-btn', onClick: () => exportCsv('all'),
        'aria-label': 'Esporta tutto (CSV di tutto l’inventario)',
      }, 'Esporta tutto'),
    );
  }

  /** Re-renders tabs and list from app.state (called after every load). */
  function update() {
    if (!state.data) {
      tabsEl.hidden = true;
      exportEl.hidden = true;
      setChildren(payEl);
      if (state.loadError) {
        setChildren(listEl, 
          h('div', { class: 'card notice-error' },
            h('p', {}, h('strong', {}, 'Non riesco a caricare l’inventario. '), state.loadError.message || ''),
            h('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: () => app.reload() }, 'Riprova')),
        );
      } else {
        setChildren(listEl, h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('p', {}, 'Carico l’inventario…')));
      }
      return;
    }
    tabsEl.hidden = false;
    exportEl.hidden = false;
    setChildren(payEl, paymentsLine(state.data.site));
    renderExport();
    const L = labels(state.data);
    const groups = groupProducts(state.data.products);
    renderTabs(groups);
    const items = groups[state.tab] || [];
    const tab = TABS.find((t) => t.id === state.tab) || TABS[0];
    setChildren(listEl, 
      state.data.problems && state.data.problems.length
        ? h('p', { class: 'notice notice-warn' }, `Alcuni file non sono leggibili: ${state.data.problems.join('; ')}`)
        : null,
      items.length
        ? h('ul', { class: 'cards', role: 'tabpanel' }, items.map((p) => card(p, L)))
        : h('p', { class: 'empty', role: 'tabpanel' }, tab.empty),
    );
  }

  /** Shows the state of the last publish (hidden if unknown or not allowed). */
  function onDeploy(status) {
    if (!status || !DEPLOY_TEXT[status.state]) {
      deployEl.hidden = true;
      return;
    }
    deployEl.hidden = false;
    deployEl.className = `deploy deploy-${status.state}`;
    setChildren(deployEl, 
      h('span', { class: 'deploy-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'deploy-text' }, DEPLOY_TEXT[status.state]),
      status.state === 'error' && status.url
        ? h('a', { class: 'deploy-link', href: status.url, target: '_blank', rel: 'noopener' }, 'Dettagli')
        : null,
    );
  }

  update();
  onDeploy(state.deploy);
  return { el, update, onDeploy, name: 'inventory' };
}
