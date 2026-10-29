/**
 * Chère Pochette — admin (inventory manager used on the phone).
 * Entry point: session, routing, data loading, publish status.
 *
 * How it works (for whoever maintains it):
 *  - There is no server. The "database" is the GitHub repository of the website:
 *    src/data/products/<id>.json + photos in public/media/products/<id>/.
 *    The admin reads and writes those files through the GitHub API with a token.
 *  - Every save is one commit on the branch. The push starts .github/workflows/deploy.yml,
 *    which creates the Zahls payment links, moves paid bags to "sold" and publishes the
 *    site (about 2 minutes).
 *  - Login: ONE admin, e-mail + password. auth.json (created by `npm run admin:setup`) holds
 *    the token encrypted with a key derived from both (crypto.js). After login the session
 *    { owner, repo, branch, token } stays in localStorage until "Esci".
 *  - Routes (in the #hash, so they work under any base path):
 *      #/  inventory · #/nuova  new bag · #/borsa/<id>  detail/edit · #/fatto  success
 *  - Files: github.js (API + commits), store.js (data rules), store-github.js (backend),
 *    images.js (photo resizing), csv.js (CSV export), ui.js (DOM helpers),
 *    screens/*.js (one file per screen).
 */
import { decryptAuth, isAuthConfig, normalizeEmail } from './crypto.js';
import { GitHubBackend } from './store-github.js';
import { h, toast, alertSheet, topbar } from './ui.js';
import { renderLogin, renderNotConfigured, renderAdvanced, renderMessage } from './screens/login.js';
import { renderInventory, TABS } from './screens/inventory.js';
import { renderProductForm, createDraft, discardDraft, draftHasContent } from './screens/product-form.js';
import { renderDone } from './screens/done.js';

const SESSION_KEY = 'cp-admin-session';
const EMAIL_KEY = 'cp-admin-email'; // last e-mail used on this device (pre-filled on the login)
const TAB_KEY = 'cp-admin-tab';
const BLOB_CACHE_PREFIX = 'cp-admin:blob:';

/** Placeholders for "Accesso avanzato" when auth.json is missing (same as src/data/site.json). */
const DEFAULT_REPO = { owner: 'Eva-azienda', repo: 'chere-pochette', branch: 'main' };

const root = document.getElementById('app');

const state = {
  backend: null, // GitHubBackend once logged in
  authConfig: null, // parsed auth.json
  data: null, // { models, taxonomy, site, products, problems }
  loading: null, // Promise while loading
  loadError: null,
  loadedAt: 0,
  tab: readTab(),
  newDraft: null, // "Nuova borsa" form kept in memory (survives an accidental back)
  lastResult: null, // { product, action } for the success screen
  deploy: null, // last publish status
  deployDisabled: false, // the token cannot read Actions → stop asking
  publishingSince: 0, // timestamp of our last save / sync request
};

let currentView = null;
let deployTimer = null;

/* ---------- small storage helpers (private mode can make storage throw) ---------- */

function readTab() {
  try {
    const t = sessionStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === t) ? t : 'available';
  } catch {
    return 'available';
  }
}

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s && s.owner && s.repo && s.token ? s : null;
  } catch {
    return null;
  }
}

function readEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function writeEmail(email) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore: only a convenience */
  }
}

/**
 * Removes leftovers of older admin versions (keys "cp-admin-…" this version does not use),
 * so they cannot fill the browser storage the session and the cache need.
 */
function cleanStorage() {
  try {
    const keep = new Set([SESSION_KEY, EMAIL_KEY]);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cp-admin-') && !keep.has(key)) localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    toast('Questo browser non può ricordare l’accesso: dovrai rifarlo alla prossima apertura.');
  }
}

function clearSession({ clearCache = false } = {}) {
  try {
    localStorage.removeItem(SESSION_KEY);
    if (clearCache) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(BLOB_CACHE_PREFIX)) localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

/* ---------- view mounting ---------- */

function mount(view, { keepScroll = false } = {}) {
  if (currentView && currentView.destroy) currentView.destroy();
  currentView = view;
  root.replaceChildren(view.el);
  if (!keepScroll) window.scrollTo(0, 0);
}

function loadingView(text = 'Un momento…') {
  return {
    el: h('div', { class: 'screen' }, h('main', { class: 'content' },
      h('div', { class: 'loading loading-full' }, h('div', { class: 'spinner' }), h('p', {}, text)))),
    name: 'loading',
  };
}

function errorView(title, text, actionLabel, onAction) {
  return {
    el: h(
      'div',
      { class: 'screen' },
      topbar({ title, onBack: goBack, backLabel: 'Torna all’inventario' }),
      h('main', { class: 'content' },
        h('div', { class: 'card notice-error' }, h('p', {}, text),
          h('button', { type: 'button', class: 'btn btn-secondary btn-block', onClick: onAction }, actionLabel))),
    ),
    name: 'error',
  };
}

/* ---------- history: is there an admin page to go back to? ---------- */

let navIndex = 0;
let replacing = false;

function trackHistory() {
  const st = history.state;
  if (st && typeof st.cpIndex === 'number') navIndex = st.cpIndex;
  else {
    if (!replacing) navIndex += 1;
    history.replaceState({ cpIndex: navIndex }, '');
  }
  replacing = false;
}

function replaceHash(hash) {
  if (location.hash === hash) return route(); // same hash: no hashchange event would fire
  replacing = true;
  location.replace(hash);
}

function goBack() {
  if (navIndex > 0) history.back();
  else replaceHash('#/');
}

/* ---------- routing ---------- */

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { page: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : '' };
}

/** Renders `render()` once the data is loaded (shows a spinner or an error meanwhile). */
function withData(render) {
  if (state.data) return render();
  if (state.loadError && !state.loading) {
    return mount(errorView('Inventario', state.loadError.message || 'Caricamento non riuscito.', 'Riprova', () => {
      loadData().then(route);
    }));
  }
  mount(loadingView('Carico l’inventario…'));
  const hash = location.hash;
  loadData().then(() => {
    if (location.hash === hash && state.backend) route();
  });
}

let lastRoutedHash = null;

function route() {
  if (!state.backend) return; // login screens are not routed
  lastRoutedHash = location.hash;
  const { page, arg } = currentRoute();

  if (page === 'fatto') {
    if (state.lastResult) return mount(renderDone(app, state.lastResult));
    return replaceHash('#/');
  }
  if (page === 'nuova') {
    return withData(() => {
      if (!state.newDraft) state.newDraft = createDraft(null);
      mount(renderProductForm(app, { draft: state.newDraft }));
    });
  }
  if (page === 'borsa' && arg) {
    return withData(() => {
      const product = state.data.products.find((p) => p.id === arg);
      if (!product) {
        return mount(errorView('Borsa non trovata', `Non trovo la borsa «${arg}»: forse è stata eliminata.`, 'Torna all’inventario', goHome));
      }
      mount(renderProductForm(app, { product, draft: createDraft(product) }));
    });
  }
  mount(renderInventory(app));
  if (!state.data && !state.loading) loadData();
}

/* ---------- data ---------- */

function isAuthError(err) {
  return Boolean(err && err.kind === 'auth');
}

/** Loads models, taxonomy and products from the backend. Safe to call repeatedly. */
function loadData({ manual = false } = {}) {
  if (state.loading) return state.loading;
  const backend = state.backend;
  if (!backend) return Promise.resolve();
  state.loadError = null;
  state.loading = backend
    .load()
    .then(
      (data) => {
        if (backend !== state.backend) return;
        state.data = data;
        state.loadedAt = Date.now();
        if (manual) toast('Inventario aggiornato.');
      },
      (err) => {
        if (backend !== state.backend) return;
        if (isAuthError(err)) return expire();
        state.loadError = err;
        if (state.data) toast(`Aggiornamento non riuscito: ${err.message}`, { type: 'error' });
      },
    )
    .finally(() => {
      state.loading = null;
      if (backend === state.backend && currentView && currentView.update) currentView.update();
    });
  if (currentView && currentView.update) currentView.update();
  return state.loading;
}

/* ---------- publish status (GitHub Actions) ---------- */

async function pollDeploy() {
  clearTimeout(deployTimer);
  const backend = state.backend;
  if (!backend || state.deployDisabled) return;
  let status = null;
  try {
    status = await backend.deployStatus();
  } catch (err) {
    if (backend !== state.backend) return;
    if (isAuthError(err)) return expire();
    // 403/404: the token cannot read Actions or there is no workflow yet → hide quietly.
    if (err.kind === 'forbidden' || err.kind === 'notfound') state.deployDisabled = true;
    status = null;
  }
  if (backend !== state.backend) return;

  // Right after a save, GitHub needs a few seconds to create the new run: until it shows up,
  // the latest run is the previous one, so keep showing "in corso".
  if (state.publishingSince && status) {
    const created = Date.parse(status.createdAt || '') || 0;
    const waited = Date.now() - state.publishingSince;
    if (created < state.publishingSince - 30000 && waited < 90000) status = { ...status, state: 'running' };
    else if (status.state !== 'running') state.publishingSince = 0;
  }

  const wasRunning = state.deploy && state.deploy.state === 'running';
  state.deploy = status;
  // A finished run may have moved paid bags to "sold": reload the inventory.
  if (wasRunning && status && status.state !== 'running') loadData();
  if (currentView && currentView.onDeploy) currentView.onDeploy(status);

  if (document.visibilityState === 'visible' && !state.deployDisabled) {
    deployTimer = setTimeout(pollDeploy, status && status.state === 'running' ? 10000 : 60000);
  }
}

function markPublishing() {
  state.publishingSince = Date.now();
  if (state.deploy) state.deploy = { ...state.deploy, state: 'running' };
  clearTimeout(deployTimer);
  deployTimer = setTimeout(pollDeploy, 6000);
}

async function triggerSync() {
  const backend = state.backend;
  try {
    await backend.triggerSync();
    toast('Controllo vendite avviato: l’inventario si aggiorna da solo tra circa 2 minuti.');
    markPublishing();
    if (currentView && currentView.onDeploy) currentView.onDeploy(state.deploy);
  } catch (err) {
    if (isAuthError(err)) return expire();
    const text =
      err.kind === 'forbidden'
        ? 'Il token non può avviare il controllo (manca il permesso «Actions: lettura e scrittura»). Le vendite vengono comunque controllate automaticamente.'
        : err.kind === 'notfound'
          ? 'Il flusso di pubblicazione (deploy.yml) non è ancora attivo su GitHub.'
          : err.kind === 'conflict'
            ? 'Il flusso di pubblicazione non permette l’avvio manuale (manca «workflow_dispatch»).'
            : err.message;
    alertSheet({ title: 'Controllo non avviato', text });
  }
}

/* ---------- saving (called by the form) ---------- */

function onSaved({ product, action }) {
  if (state.data) {
    const list = state.data.products;
    const i = list.findIndex((p) => p.id === product.id);
    if (action === 'delete') {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) list[i] = product;
    else list.push(product);
  }
  if (action === 'create' && state.newDraft) {
    // Do not revoke the photo previews: they are shown until GitHub serves the real files.
    state.newDraft.onPhotosChange = null;
    state.newDraft = null;
  }
  if (action !== 'delete' && action !== 'edit') setTab(product.status === 'hidden' ? 'hidden' : product.status);
  state.lastResult = { product, action };
  markPublishing();
  replaceHash('#/fatto'); // "back" will not return to the submitted form
}

function friendlyMessage(err) {
  if (err && err.kind === 'forbidden') {
    return 'Il token di accesso non può scrivere nel repository. Chi gestisce il sito deve controllare i permessi del token (Contents: lettura e scrittura).';
  }
  return (err && err.message) || 'Errore sconosciuto.';
}

function handleError(err) {
  if (isAuthError(err)) return expire();
  alertSheet({ title: 'Non è stato possibile salvare', text: friendlyMessage(err) });
}

/* ---------- login / logout ---------- */

async function fetchAuthConfig() {
  let res;
  try {
    res = await fetch('./auth.json', { cache: 'no-store' });
  } catch {
    throw new Error('Connessione assente: controlla la rete e riprova.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Non riesco a leggere la configurazione (errore ${res.status}).`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // A dev server or host may answer a missing file with an HTML page and status 200.
    return text.trim().startsWith('<') ? null : { invalid: 'Il file auth.json è danneggiato.' };
  }
  if (isAuthConfig(json)) return json;
  if (json && json.v === 1) {
    return { invalid: 'Il file auth.json è di una versione precedente (password del team): va rigenerato.' };
  }
  return { invalid: 'Il file auth.json non è valido.' };
}

async function showLogin(message = '') {
  mount(loadingView());
  let config;
  try {
    config = await fetchAuthConfig();
  } catch (err) {
    return mount(renderMessage({ title: 'Connessione assente', text: err.message, actionLabel: 'Riprova', onAction: () => showLogin(message) }));
  }
  if (!config || config.invalid) {
    state.authConfig = null;
    return mount(renderNotConfigured(app, { error: (config && config.invalid) || '' }));
  }
  state.authConfig = config;
  mount(renderLogin(app, { message, email: readEmail() }));
}

function showAdvanced() {
  const c = state.authConfig;
  mount(renderAdvanced(app, { defaults: c ? { owner: c.owner, repo: c.repo, branch: c.branch } : DEFAULT_REPO, canGoBack: true }));
}

/** Checks that the session works; returns a ready backend. Throws with a friendly message. */
async function verify(session) {
  const backend = new GitHubBackend(session);
  try {
    await backend.verify();
  } catch (err) {
    if (err.kind === 'auth') {
      throw new Error(
        session.via === 'password'
          ? 'La chiave di accesso a GitHub è scaduta o è stata revocata. Chi gestisce il sito deve rigenerarla (npm run admin:setup).'
          : 'Token non valido o scaduto.',
      );
    }
    if (err.kind === 'notfound') {
      throw new Error(`Repository ${session.owner}/${session.repo} non trovato, oppure il token non ha accesso.`);
    }
    throw err;
  }
  return backend;
}

/**
 * Chrome (Android) shows "Save password?" reliably only when asked through the Credential
 * Management API; Safari (iPhone) offers it by itself after the <form> submit.
 */
function offerToSavePassword(email, password) {
  try {
    if (typeof window.PasswordCredential !== 'function' || !navigator.credentials) return;
    const credential = new window.PasswordCredential({ id: email, password, name: 'Chère Pochette – inventario' });
    navigator.credentials.store(credential).catch(() => {});
  } catch {
    /* not supported: the browser's own heuristics still apply */
  }
}

async function loginWithPassword(email, password) {
  if (!state.authConfig) throw new Error('Configurazione mancante: ricarica la pagina.');
  // Throws WrongCredentialsError ("E-mail o password non corretti") for any wrong e-mail or password.
  const opened = await decryptAuth(state.authConfig, email, password);
  const session = { owner: opened.owner, repo: opened.repo, branch: opened.branch, token: opened.token, via: 'password' };
  const backend = await verify(session);
  writeSession(session);
  writeEmail(normalizeEmail(email));
  offerToSavePassword(email.trim(), password);
  start(backend);
}

async function loginAdvanced(fields) {
  const session = { owner: fields.owner, repo: fields.repo, branch: fields.branch || 'main', token: fields.token, via: 'advanced' };
  const backend = await verify(session);
  writeSession(session);
  start(backend);
}

function start(backend) {
  state.backend = backend;
  state.deployDisabled = false;
  route();
  if (!state.data) loadData();
  pollDeploy();
}

function resetState() {
  clearTimeout(deployTimer);
  if (state.backend && state.backend.dispose) state.backend.dispose();
  state.backend = null;
  state.data = null;
  state.loading = null;
  state.loadError = null;
  state.deploy = null;
  state.lastResult = null;
  state.publishingSince = 0;
}

/** Token expired / revoked: back to the login, keeping the unsaved new bag in memory. */
function expire() {
  clearSession();
  resetState();
  showLogin(
    'Accesso scaduto: accedi di nuovo con e-mail e password.' +
      (draftHasContent(state.newDraft) ? ' La borsa che stavi inserendo non è persa.' : ''),
  );
}

/** "Esci" button. */
function logout() {
  clearSession({ clearCache: true });
  resetState();
  discardDraft(state.newDraft);
  state.newDraft = null;
  history.replaceState({ cpIndex: 0 }, '', location.pathname + location.search);
  navIndex = 0;
  showLogin();
}

/* ---------- misc actions used by the screens ---------- */

function setTab(tab) {
  state.tab = tab;
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

function goHome() {
  if (navIndex > 0 && currentRoute().page === 'fatto') history.back();
  else replaceHash('#/');
}

/** API passed to the screens. */
const app = {
  state,
  get backend() {
    return state.backend;
  },
  loginWithPassword,
  loginAdvanced,
  showLogin: () => showLogin(),
  showAdvanced,
  logout,
  reload: () => loadData({ manual: true }),
  setTab,
  triggerSync,
  goBack,
  goHome,
  newBag: () => replaceHash('#/nuova'),
  rerender: () => route(),
  onSaved,
  handleError,
  discardNewDraft() {
    discardDraft(state.newDraft);
    state.newDraft = null;
  },
};

/* ---------- boot ---------- */

function boot() {
  // Never run inside a frame of another site (it could trick taps on "Elimina" etc.).
  // GitHub Pages cannot send the X-Frame-Options header, so this check does it.
  if (window.top !== window.self) {
    root.textContent = 'Apri l’inventario direttamente, non dentro un’altra pagina.';
    return;
  }
  cleanStorage();
  if (!history.state || typeof history.state.cpIndex !== 'number') history.replaceState({ cpIndex: 0 }, '');
  navIndex = history.state.cpIndex;

  window.addEventListener('hashchange', () => {
    trackHistory();
    route();
  });
  // Back/forward between two entries with the same #hash fires no "hashchange": route anyway.
  window.addEventListener('popstate', () => {
    if (location.hash === lastRoutedHash) {
      trackHistory();
      route();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.backend) return;
    // Back to the app after a while: refresh (sales may have happened meanwhile).
    if (Date.now() - state.loadedAt > 60000 && (!currentView || currentView.name === 'inventory')) loadData();
    pollDeploy();
  });
  window.addEventListener('beforeunload', (e) => {
    if (currentView && currentView.isDirty && currentView.isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  const session = readSession();
  if (session) start(new GitHubBackend(session));
  else showLogin();
}

boot();
