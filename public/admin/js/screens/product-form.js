/**
 * "Nuova borsa" and "detail / edit" screen: ONE scrolling form.
 *   (a) Foto  (b) Modello  (c) Colore esterno  (d) Interno  (e) Prezzo  (f) Nota
 * plus, when editing, the status actions (venduta / rimetti in vendita / nascondi / elimina).
 *
 * The form state lives in a "draft" object owned by the app, so a new bag survives an
 * accidental "back" (photos already prepared are kept).
 */
import {
  h, icon, topbar, stickyBar, photoThumb, formatPrice, formatNumber, soldLine, labels,
  confirmSheet, toast, progress,
} from '../ui.js';
import { prepareImage } from '../images.js';
import { MAX_PHOTOS, NOTE_MAX, nextNumber, parsePrice } from '../store.js';

let keySeq = 0;
const newKey = () => `photo-${++keySeq}`;

/** Photos are prepared one at a time (resizing big phone photos needs a lot of memory). */
let photoQueue = Promise.resolve();

/**
 * Form model for a product (edit) or an empty one (new bag).
 * photos: [{ key, kind: 'existing', src, w, h }
 *        | { key, kind: 'new', status: 'processing'|'ready'|'error', file, result, previewUrl, error, ready }]
 */
export function createDraft(product) {
  return {
    productId: product ? product.id : null,
    photos: ((product && product.photos) || []).map((p) => ({ key: newKey(), kind: 'existing', src: p.src, w: p.w, h: p.h })),
    model: (product && product.model) || '',
    colour: (product && product.colour) || '',
    lining: (product && product.lining) || '',
    // 40 → "40", 42.5 → "42.50" (as people write prices in Switzerland)
    price: product && product.price ? (Number.isInteger(Number(product.price)) ? String(product.price) : Number(product.price).toFixed(2)) : '',
    note: (product && product.note) || '',
    priceEdited: Boolean(product), // editing: never change the price automatically
    onPhotosChange: null,
  };
}

/** True when a new-bag draft contains something worth keeping. */
export function draftHasContent(draft) {
  return Boolean(draft && (draft.photos.length || draft.model || draft.colour || draft.lining || draft.note));
}

/** Frees the memory of photos prepared but never saved. */
export function discardDraft(draft) {
  if (!draft) return;
  for (const p of draft.photos) if (p.kind === 'new' && p.previewUrl) URL.revokeObjectURL(p.previewUrl);
  draft.photos = [];
  draft.onPhotosChange = null;
}

function enqueuePhoto(draft, photo) {
  const job = photoQueue.then(async () => {
    if (photo.removed) return;
    try {
      photo.result = await prepareImage(photo.file);
      photo.previewUrl = URL.createObjectURL(photo.result.blobs[400]);
      photo.result.previewUrl = photo.previewUrl; // reused by the backend after saving
      photo.status = 'ready';
    } catch (err) {
      photo.status = 'error';
      photo.error = err.message || 'Foto non leggibile.';
    }
    photo.file = null; // release the original (can be 10+ MB)
    if (draft.onPhotosChange) draft.onPhotosChange();
  });
  photoQueue = job.catch(() => {});
  return job;
}

/**
 * @param {object} app      app API (state, backend, goBack, onSaved, handleError)
 * @param {{product?: object, draft: object}} opts  product = null for a new bag
 */
export function renderProductForm(app, { product = null, draft }) {
  const isNew = !product;
  const data = app.state.data;
  const L = labels(data);
  const models = data.models || [];
  const colours = (data.taxonomy && data.taxonomy.colours) || [];
  const linings = (data.taxonomy && data.taxonomy.linings) || [];
  const errors = {};

  /* ---------- helpers ---------- */

  const errorEl = (name) => h('p', { class: 'field-error', id: `err-${name}`, role: 'alert', hidden: true });
  const sections = {};
  const section = (name, title, hint, ...body) => {
    const err = errorEl(name);
    errors[name] = err;
    sections[name] = h(
      'section',
      { class: 'field', id: `field-${name}`, 'aria-describedby': `err-${name}` },
      h('h2', { class: 'field-title' }, title),
      hint ? h('p', { class: 'hint' }, hint) : null,
      ...body,
      err,
    );
    return sections[name];
  };
  const showError = (name, message) => {
    const el = errors[name];
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    sections[name].classList.toggle('has-error', Boolean(message));
  };

  /* ---------- (a) photos ---------- */

  const photoGrid = h('div', { class: 'photo-grid' });
  const photoCount = h('span', { class: 'field-count' });
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'in-camera', class: 'sr-only', tabindex: '-1' });
  const galInput = h('input', { type: 'file', accept: 'image/*', multiple: true, id: 'in-gallery', class: 'sr-only', tabindex: '-1' });
  const camBtn = h('label', { for: 'in-camera', class: 'btn btn-photo', role: 'button', tabindex: '0' }, icon('camera'), h('span', {}, 'Scatta foto'));
  const galBtn = h('label', { for: 'in-gallery', class: 'btn btn-photo', role: 'button', tabindex: '0' }, icon('gallery'), h('span', {}, 'Dalla galleria'));
  for (const btn of [camBtn, galBtn]) {
    // keyboard access for the label-buttons
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = MAX_PHOTOS - draft.photos.length;
    if (room <= 0) {
      toast(`Puoi caricare al massimo ${MAX_PHOTOS} foto.`);
      return;
    }
    if (files.length > room) toast(`Massimo ${MAX_PHOTOS} foto: ho aggiunto solo le prime ${room}.`);
    for (const file of files.slice(0, room)) {
      const photo = { key: newKey(), kind: 'new', status: 'processing', file };
      photo.ready = enqueuePhoto(draft, photo);
      draft.photos.push(photo);
    }
    showError('photos', '');
    renderPhotos();
  }
  for (const input of [camInput, galInput]) {
    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = ''; // allow choosing the same file again
    });
  }

  function removePhoto(photo) {
    photo.removed = true;
    if (photo.kind === 'new' && photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    draft.photos = draft.photos.filter((p) => p !== photo);
    renderPhotos();
  }

  function makeCover(photo) {
    draft.photos = [photo, ...draft.photos.filter((p) => p !== photo)];
    renderPhotos();
  }

  function photoTile(photo, index) {
    const n = index + 1;
    let media;
    if (photo.kind === 'existing') {
      media = photoThumb(app.backend, photo.src, { className: 'tile-img', alt: `Foto ${n}` });
    } else if (photo.status === 'ready') {
      media = h('div', { class: 'tile-img' }, h('img', { src: photo.previewUrl, alt: `Foto ${n}` }));
    } else if (photo.status === 'error') {
      media = h('div', { class: 'tile-img tile-error' }, h('span', {}, 'Foto non leggibile'));
    } else {
      media = h('div', { class: 'tile-img tile-processing' }, h('div', { class: 'spinner spinner-sm' }), h('span', {}, 'Preparo…'));
    }
    return h(
      'div',
      { class: `photo-tile${index === 0 ? ' is-cover' : ''}` },
      media,
      h('button', { type: 'button', class: 'tile-remove', 'aria-label': `Rimuovi foto ${n}`, onClick: () => removePhoto(photo) }, icon('close')),
      index === 0
        ? h('span', { class: 'tile-badge' }, icon('star'), 'Copertina')
        : h('button', { type: 'button', class: 'tile-cover', 'aria-label': `Usa la foto ${n} come copertina`, onClick: () => makeCover(photo) }, 'Copertina'),
    );
  }

  function renderPhotos() {
    photoGrid.replaceChildren(...draft.photos.map(photoTile));
    photoGrid.hidden = draft.photos.length === 0;
    photoCount.textContent = `${draft.photos.length}/${MAX_PHOTOS}`;
    const full = draft.photos.length >= MAX_PHOTOS;
    camBtn.classList.toggle('is-disabled', full);
    galBtn.classList.toggle('is-disabled', full);
    camInput.disabled = full;
    galInput.disabled = full;
  }
  draft.onPhotosChange = renderPhotos;

  const photosSection = section(
    'photos',
    h('span', {}, 'Foto ', photoCount),
    'Almeno 1 foto, al massimo 8. La prima è la copertina.',
    h('div', { class: 'photo-buttons' }, camBtn, galBtn),
    camInput,
    galInput,
    photoGrid,
  );

  /* ---------- (b) model, (c) colour, (d) lining: radio tiles and chips ---------- */

  const priceInput = h('input', {
    id: 'price', name: 'price', class: 'input price-input', inputmode: 'decimal', autocomplete: 'off',
    enterkeyhint: 'done', value: draft.price, placeholder: '0',
  });

  function onModel(id) {
    draft.model = id;
    showError('model', '');
    const m = models.find((x) => x.id === id);
    if (m && m.price && (!draft.priceEdited || !draft.price)) {
      draft.price = String(m.price);
      priceInput.value = draft.price;
      showError('price', '');
    }
  }

  const modelTiles = h(
    'div',
    { class: 'model-tiles', role: 'radiogroup', 'aria-label': 'Modello' },
    models.map((m) =>
      h(
        'label',
        { class: 'model-tile' },
        h('input', { type: 'radio', name: 'model', value: m.id, class: 'sr-only', checked: draft.model === m.id, onChange: () => onModel(m.id) }),
        h(
          'span',
          { class: 'tile-body' },
          h('span', { class: 'model-name' }, m.name),
          h('span', { class: 'model-type' }, (m.type && m.type.it) || ''),
          m.price ? h('span', { class: 'model-price' }, formatPrice(m.price)) : null,
        ),
      ),
    ),
  );

  const chips = (name, items, withSwatch) =>
    h(
      'div',
      { class: 'chips', role: 'radiogroup' },
      items.map((item) =>
        h(
          'label',
          { class: 'chip' },
          h('input', {
            type: 'radio', name, value: item.id, class: 'sr-only', checked: draft[name] === item.id,
            onChange: () => {
              draft[name] = item.id;
              showError(name, '');
            },
          }),
          h(
            'span',
            { class: 'chip-body' },
            withSwatch ? h('span', { class: 'swatch', style: { background: item.hex || 'transparent' } }) : null,
            item.it || item.id,
          ),
        ),
      ),
    );

  /* ---------- (e) price, (f) note ---------- */

  priceInput.addEventListener('input', () => {
    draft.price = priceInput.value;
    draft.priceEdited = true;
    if (parsePrice(draft.price) != null) showError('price', '');
  });
  priceInput.addEventListener('blur', () => {
    if (draft.price && parsePrice(draft.price) == null) showError('price', 'Prezzo non valido: scrivi per esempio 40 o 42.50.');
  });

  const noteCounter = h('span', { class: 'note-counter' });
  const noteInput = h('textarea', {
    id: 'note', name: 'note', class: 'input', rows: '3', maxlength: String(NOTE_MAX),
    placeholder: 'Es. manici in fettuccia color panna', value: draft.note,
  });
  const updateCounter = () => {
    noteCounter.textContent = `${draft.note.length}/${NOTE_MAX}`;
  };
  noteInput.addEventListener('input', () => {
    draft.note = noteInput.value.slice(0, NOTE_MAX);
    updateCounter();
  });
  updateCounter();

  /* ---------- validation ---------- */

  function validate() {
    const errs = {};
    if (!draft.photos.length) errs.photos = 'Aggiungi almeno una foto.';
    else if (draft.photos.some((p) => p.status === 'error')) errs.photos = 'Una foto non si può leggere: toccala sulla × per toglierla.';
    if (!draft.model) errs.model = 'Scegli il modello.';
    if (!draft.colour) errs.colour = 'Scegli il colore esterno.';
    if (!draft.lining) errs.lining = 'Scegli l’interno.';
    if (parsePrice(draft.price) == null) errs.price = 'Inserisci un prezzo valido, per esempio 40 o 42.50.';
    if (draft.note.length > NOTE_MAX) errs.note = `Massimo ${NOTE_MAX} caratteri.`;
    for (const name of Object.keys(errors)) showError(name, errs[name] || '');
    const first = ['photos', 'model', 'colour', 'lining', 'price', 'note'].find((n) => errs[n]);
    if (first) {
      sections[first].scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first === 'price') priceInput.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  /* ---------- change detection (edit) ---------- */

  function fieldValues() {
    return {
      model: draft.model,
      colour: draft.colour,
      lining: draft.lining,
      price: parsePrice(draft.price),
      note: draft.note.trim(),
    };
  }
  function photosChanged() {
    const before = (product && product.photos) || [];
    return draft.photos.length !== before.length || draft.photos.some((p, i) => p.kind === 'new' || p.src !== before[i].src);
  }
  function fieldsChanged() {
    if (!product) return true;
    const v = fieldValues();
    return (
      v.model !== product.model || v.colour !== product.colour || v.lining !== product.lining ||
      v.price !== Number(product.price) || v.note !== (product.note || '')
    );
  }
  const isDirty = () => fieldsChanged() || photosChanged();

  function photoList() {
    return draft.photos.map((p) => (p.kind === 'existing' ? { src: p.src, w: p.w, h: p.h } : { upload: p.result }));
  }

  /* ---------- saving ---------- */

  /** Waits until all photos are prepared, showing "Preparo le foto… 2/4". */
  async function photosReady() {
    const pending = draft.photos.filter((p) => p.kind === 'new');
    const count = () => pending.filter((p) => p.status !== 'processing').length;
    if (count() < pending.length) {
      progress.show(`Preparo le foto… ${count()}/${pending.length}`, count() / pending.length);
      for (const p of pending) {
        await p.ready;
        progress.show(`Preparo le foto… ${count()}/${pending.length}`, count() / pending.length);
      }
    }
    if (draft.photos.some((p) => p.status === 'error')) {
      progress.hide();
      validate();
      return false;
    }
    return true;
  }

  function onProgress(ev) {
    if (ev.phase === 'upload') progress.show(`Carico… ${ev.done}/${ev.total}`, ev.total ? ev.done / ev.total : null);
    else progress.show(isNew ? 'Metto in vendita…' : 'Salvo…', null);
  }

  async function runSave(change) {
    try {
      if (!(await photosReady())) return;
      if (change.photos) change.photos = photoList();
      progress.show('Salvo…', null);
      const result = await app.backend.save(change, onProgress);
      progress.hide();
      app.onSaved(result);
    } catch (err) {
      progress.hide();
      app.handleError(err);
    }
  }

  async function submit() {
    if (!validate()) return;
    if (isNew) {
      await runSave({
        type: 'create',
        action: 'create',
        proposedNumber: nextNumber(data.products),
        fields: fieldValues(),
        status: 'available',
        photos: [], // filled with the prepared photos in runSave
      });
      return;
    }
    if (!isDirty()) {
      toast('Nessuna modifica da salvare.');
      return;
    }
    await runSave({
      type: 'update',
      action: 'edit',
      id: product.id,
      fields: fieldValues(),
      photos: photosChanged() ? [] : undefined,
    });
  }

  /** Status buttons of the edit screen. Unsaved edits are saved in the same commit. */
  async function statusAction(action) {
    const n = formatNumber(product.number);
    const cfg = {
      sold: {
        status: 'sold', title: `Segnare ${n} come venduta?`,
        text: 'Sparirà dal sito e passerà nelle «Vendute». Usalo per le vendite di persona (es. al mercatino).',
        confirm: 'Sì, è venduta',
      },
      available: {
        status: 'available', title: `Rimettere in vendita ${n}?`,
        text: 'La borsa tornerà visibile e acquistabile sul sito tra circa 2 minuti.',
        confirm: 'Sì, rimetti in vendita',
      },
      hide: { status: 'hidden' },
      show: { status: 'available' },
    }[action];
    if (cfg.title) {
      const ok = await confirmSheet({ title: cfg.title, text: cfg.text, confirmLabel: cfg.confirm });
      if (!ok) return;
    }
    const dirty = isDirty();
    if (dirty && !validate()) return;
    await runSave({
      type: 'update',
      action,
      id: product.id,
      status: cfg.status,
      fields: dirty ? fieldValues() : undefined,
      photos: dirty && photosChanged() ? [] : undefined,
    });
  }

  async function deleteProduct() {
    const ok = await confirmSheet({
      title: `Eliminare ${formatNumber(product.number)}?`,
      text: 'La borsa e le sue foto verranno cancellate per sempre. Se è stata venduta, usa invece «Segna come venduta».',
      confirmLabel: 'Elimina per sempre',
      danger: true,
    });
    if (!ok) return;
    try {
      progress.show('Elimino…', null);
      const result = await app.backend.remove(product.id, onProgress);
      progress.hide();
      app.onSaved(result);
    } catch (err) {
      progress.hide();
      app.handleError(err);
    }
  }

  /* ---------- edit-only parts ---------- */

  function statusPanel() {
    const st = product.status;
    const text = st === 'sold' ? soldLine(product) : st === 'hidden' ? 'Nascosta: non visibile sul sito' : 'In vendita sul sito';
    const zahls = product.zahls;
    const payReady = zahls && ((zahls.shipping && zahls.shipping.link) || (zahls.pickup && zahls.pickup.link));
    const checkoutOn = Boolean(data.site && data.site.checkout && data.site.checkout.enabled === true);
    const payText = !checkoutOn
      ? 'Pagamenti online non ancora attivi: sul sito si ordina via e-mail.'
      : payReady
        ? 'Pagamento online attivo.'
        : 'Pagamento online: in preparazione (dopo la pubblicazione).';
    return h(
      'div',
      { class: `status-panel status-${st}` },
      h('p', { class: 'status-main' }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), text),
      st === 'available'
        ? h('p', { class: 'hint' }, payText)
        : null,
      product.sample ? h('p', { class: 'hint' }, 'Borsa di esempio: sostituiscila con una vera e poi eliminala.') : null,
    );
  }

  function actionsSection() {
    const st = product.status;
    const btn = (label, iconName, onClick, cls = 'btn-secondary') =>
      h('button', { type: 'button', class: `btn btn-block ${cls}`, onClick }, icon(iconName), label);
    return h(
      'section',
      { class: 'field actions' },
      h('h2', { class: 'field-title' }, 'Stato della borsa'),
      st !== 'sold' ? btn('Segna come venduta', 'tag', () => statusAction('sold')) : null,
      st === 'sold' ? btn('Rimetti in vendita', 'refresh', () => statusAction('available')) : null,
      st === 'available' ? btn('Nascondi', 'eyeOff', () => statusAction('hide')) : null,
      st === 'hidden' ? btn('Mostra sul sito', 'eye', () => statusAction('show')) : null,
      st === 'available'
        ? h('a', { class: 'btn btn-ghost btn-block', href: `../shop/${encodeURIComponent(product.id)}/`, target: '_blank', rel: 'noopener' },
            icon('external'), 'Vedi sul sito')
        : null,
      btn('Elimina', 'trash', deleteProduct, 'btn-danger-outline'),
    );
  }

  /* ---------- layout ---------- */

  const restoredNotice =
    isNew && draftHasContent(draft)
      ? h(
          'p',
          { class: 'notice' },
          'Stai continuando una borsa non ancora salvata. ',
          h('button', {
            type: 'button',
            class: 'link-btn link-inline',
            onClick: () => {
              app.discardNewDraft();
              app.rerender();
            },
          }, 'Ricomincia da capo'),
        )
      : null;

  const el = h(
    'div',
    { class: 'screen' },
    topbar({
      title: isNew ? 'Nuova borsa' : formatNumber(product.number),
      subtitle: isNew ? 'Inventario' : `${L.model(product.model)} · ${L.colour(product.colour)}`,
      onBack: () => app.goBack(),
      backLabel: 'Torna all’inventario',
    }),
    h(
      'main',
      { class: 'content form' },
      restoredNotice,
      isNew ? null : statusPanel(),
      photosSection,
      section('model', 'Modello', null, modelTiles),
      section('colour', 'Colore esterno', null, chips('colour', colours, true)),
      section('lining', 'Interno', 'Fodera da ombrello', chips('lining', linings, false)),
      section(
        'price',
        h('label', { for: 'price' }, 'Prezzo'),
        isNew ? 'Già compilato con il prezzo del modello: puoi cambiarlo.' : null,
        h('div', { class: 'price-row' }, h('span', { class: 'price-prefix' }, 'CHF'), priceInput),
      ),
      section(
        'note',
        h('label', { for: 'note' }, 'Nota ', h('small', {}, '(facoltativa)')),
        null,
        noteInput,
        noteCounter,
      ),
      isNew ? null : actionsSection(),
    ),
    stickyBar(
      h(
        'button',
        { type: 'button', class: 'btn btn-primary btn-block btn-xl', onClick: submit },
        icon('check'),
        isNew ? 'Metti in vendita' : 'Salva modifiche',
      ),
    ),
  );

  renderPhotos();

  return {
    el,
    name: isNew ? 'new' : 'edit',
    isDirty: () => (isNew ? draftHasContent(draft) : isDirty()),
    destroy() {
      if (draft.onPhotosChange === renderPhotos) draft.onPhotosChange = null;
    },
  };
}
