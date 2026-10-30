/**
 * Screens shown before login: e-mail + password login (one admin), "not configured yet",
 * developer access (paste a token) and a generic message screen (e.g. no connection).
 */
import { h, icon } from '../ui.js';

/** Brand logo with a text fallback if the image is missing. */
function brand(subtitle) {
  const logo = h('img', {
    class: 'login-logo',
    src: '../brand/logo-bordeaux.png',
    alt: 'Chère Pochette',
    width: '800',
    height: '420',
  });
  const fallback = h('p', { class: 'login-wordmark', hidden: true }, 'Chère Pochette');
  logo.addEventListener('error', () => {
    logo.remove();
    fallback.hidden = false;
  });
  return h('div', { class: 'login-brand' }, logo, fallback, subtitle ? h('p', { class: 'login-sub' }, subtitle) : null);
}

/** Makes a submit button show a busy label while `task` runs. */
async function busy(button, label, task) {
  const original = button.textContent;
  button.disabled = true;
  button.classList.add('is-busy');
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.textContent = original;
  }
}

/**
 * E-mail + password login. A real <form> with autocomplete="username" / "current-password",
 * so the phone's password manager (iCloud Keychain, Google) offers to save and fill it.
 * @param {object} app   app API (loginWithPassword)
 * @param {{message?: string, email?: string}} opts  email = last e-mail used on this device
 */
export function renderLogin(app, { message = '', email = '' } = {}) {
  const error = h('p', { class: 'field-error', id: 'login-error', role: 'alert', hidden: true });
  const emailInput = h('input', {
    id: 'email',
    name: 'email',
    type: 'email',
    autocomplete: 'username',
    inputmode: 'email',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'next',
    required: true,
    class: 'input',
    value: email,
  });
  const pwInput = h('input', {
    id: 'password',
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    required: true,
    class: 'input',
  });
  const toggle = h('button', { type: 'button', class: 'pw-toggle', 'aria-label': 'Mostra password', 'aria-controls': 'password' }, icon('eye'));
  toggle.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    toggle.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
    toggle.setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
    pwInput.focus();
  });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Entra');

  // method="post": even if a script failed, the password would never end up in the address bar.
  const form = h(
    'form',
    { class: 'card login-form', method: 'post', novalidate: true, 'aria-describedby': 'login-error' },
    h('div', { class: 'field-row' },
      h('label', { for: 'email', class: 'label' }, 'E-mail'),
      emailInput),
    h('div', { class: 'field-row' },
      h('label', { for: 'password', class: 'label' }, 'Password'),
      h('div', { class: 'pw-row' }, pwInput, toggle)),
    error,
    submit,
  );
  const showError = (text, field) => {
    error.textContent = text;
    error.hidden = false;
    if (field) field.focus();
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const mail = emailInput.value.trim();
    if (!mail) return showError('Inserisci l’e-mail.', emailInput);
    if (!pwInput.value) return showError('Inserisci la password.', pwInput);
    try {
      await busy(submit, 'Verifico…', () => app.loginWithPassword(mail, pwInput.value));
    } catch (err) {
      showError(err.message || 'Accesso non riuscito.');
      if (err.code === 'BAD_CREDENTIALS') pwInput.select();
    }
  });

  const el = h(
    'main',
    { class: 'screen screen-login' },
    brand('Inventario borse'),
    message ? h('p', { class: 'notice notice-warn', role: 'alert' }, message) : null,
    form,
  );
  setTimeout(() => (email ? pwInput : emailInput).focus(), 50);
  return { el };
}

/** auth.json missing (or from an old version): say exactly what to run. */
export function renderNotConfigured(app, { error = '' } = {}) {
  const el = h(
    'main',
    { class: 'screen screen-login' },
    brand('Inventario borse'),
    h(
      'div',
      { class: 'card' },
      h('h1', { class: 'card-title-lg' }, 'Admin non ancora configurato'),
      h('p', {}, 'Manca il file di accesso ', h('code', {}, 'public/admin/auth.json'),
        '. Si crea una volta sola, sul computer:'),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Apri il Terminale nella cartella del sito.'),
        h('li', {}, 'Esegui ', h('code', {}, 'npm run admin:setup'), ' e inserisci e-mail, password e token GitHub.'),
        // U+2011 (non-breaking hyphen): "e‑mail" never splits across two lines
        h('li', {}, 'Ricarica questa pagina e accedi con e\u2011mail e password.'),
      ),
      h('p', { class: 'hint' }, 'Per usarlo anche dal telefono, pubblica il file creato (commit e push di ',
        h('code', {}, 'public/admin/auth.json'), ').'),
      error ? h('p', { class: 'field-error' }, error) : null,
    ),
    h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => location.reload() }, icon('refresh'), 'Ricarica'),
    h('button', { type: 'button', class: 'link-btn', onClick: () => app.showAdvanced() }, 'Accesso avanzato (token GitHub)'),
  );
  return { el };
}

/** Developer access: paste owner, repo, branch and a fine-grained token. */
export function renderAdvanced(app, { defaults = {}, canGoBack = true } = {}) {
  const field = (id, label, attrs = {}, hint = '') =>
    h(
      'div',
      { class: 'field-row' },
      h('label', { for: id, class: 'label' }, label),
      h('input', {
        id, name: id, class: 'input', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', ...attrs,
      }),
      hint ? h('p', { class: 'hint' }, hint) : null,
    );
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Collega');
  const form = h(
    'form',
    { class: 'card login-form', method: 'post', novalidate: true },
    h('h1', { class: 'card-title-lg' }, 'Accesso avanzato'),
    h('p', { class: 'hint' }, 'Per chi gestisce il sito: collega direttamente il repository GitHub con un token.'),
    field('owner', 'Proprietario (utente o organizzazione)', { value: defaults.owner || '' }),
    field('repo', 'Repository', { value: defaults.repo || '' }),
    field('branch', 'Branch', { value: defaults.branch || 'main' }),
    field(
      'token',
      'Token GitHub',
      { type: 'password', autocomplete: 'off' },
      'Token «fine-grained» solo per questo repository, con permessi Contents (lettura e scrittura), Actions (lettura e scrittura) e Metadata (lettura).',
    ),
    error,
    submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const value = (name) => form.elements[name].value.trim();
    let owner = value('owner');
    let repo = value('repo');
    // Accept "owner/repo" or a full GitHub URL pasted in the first field.
    const m = /(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(owner);
    if (m && !repo) [owner, repo] = [m[1], m[2]];
    const session = { owner, repo, branch: value('branch') || 'main', token: value('token') };
    if (!session.owner || !session.repo || !session.token) {
      error.textContent = 'Compila proprietario, repository e token.';
      error.hidden = false;
      return;
    }
    try {
      await busy(submit, 'Verifico…', () => app.loginAdvanced(session));
    } catch (err) {
      error.textContent = err.message || 'Accesso non riuscito.';
      error.hidden = false;
    }
  });
  const el = h(
    'main',
    { class: 'screen screen-login' },
    brand(),
    form,
    canGoBack ? h('button', { type: 'button', class: 'link-btn', onClick: () => app.showLogin() }, 'Indietro') : null,
  );
  return { el };
}

/** Generic full-screen message with one action (e.g. no connection → "Riprova"). */
export function renderMessage({ title, text, actionLabel, onAction }) {
  const el = h(
    'main',
    { class: 'screen screen-login' },
    brand(),
    h('div', { class: 'card' }, h('h1', { class: 'card-title-lg' }, title), text ? h('p', {}, text) : null),
    actionLabel ? h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: onAction }, actionLabel) : null,
  );
  return { el };
}
