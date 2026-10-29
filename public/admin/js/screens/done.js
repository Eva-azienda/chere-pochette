/** Success screen after a save: "Fatto! La borsa sarà online tra circa 2 minuti". */
import { h, icon, topbar, stickyBar, formatNumber } from '../ui.js';

const MESSAGES = {
  create: (n) => `La borsa ${n} sarà online tra circa 2 minuti.`,
  edit: (n, p) =>
    p.status === 'available' ? `Le modifiche a ${n} saranno online tra circa 2 minuti.` : `Le modifiche a ${n} sono salvate.`,
  sold: (n) => `${n} è ora tra le «Vendute» e sparirà dal sito tra circa 2 minuti.`,
  available: (n) => `${n} è di nuovo in vendita: sarà online tra circa 2 minuti.`,
  show: (n) => `${n} è di nuovo visibile: sarà online tra circa 2 minuti.`,
  hide: (n) => `${n} è nascosta e sparirà dal sito tra circa 2 minuti.`,
  delete: (n) => `${n} è stata eliminata e sparirà dal sito tra circa 2 minuti.`,
};

/**
 * @param {object} app  app API (goHome, newBag)
 * @param {{product: object, action: string}} result
 */
export function renderDone(app, { product, action }) {
  const n = formatNumber(product.number);
  const message = (MESSAGES[action] || MESSAGES.edit)(n, product);
  const live = action !== 'delete' && product.status === 'available';
  const el = h(
    'div',
    { class: 'screen' },
    topbar({ title: 'Fatto!', subtitle: 'Inventario' }),
    h(
      'main',
      { class: 'content done' },
      h('div', { class: 'done-check', 'aria-hidden': 'true' }, icon('check')),
      h('h2', { class: 'done-title' }, 'Fatto!'),
      h('p', { class: 'done-text' }, message),
      live
        ? h(
            'a',
            { class: 'btn btn-secondary btn-block', href: `../shop/${encodeURIComponent(product.id)}/`, target: '_blank', rel: 'noopener' },
            icon('external'),
            'Vedi la borsa sul sito',
          )
        : null,
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onClick: () => app.goHome() }, 'Torna all’inventario'),
    ),
    // replace (not push) the history entry, so "back" from the next success screen returns to the inventory
    stickyBar(h('button', { type: 'button', class: 'btn btn-primary btn-block btn-xl', onClick: () => app.newBag() }, icon('plus'), 'Aggiungi un’altra borsa')),
  );
  return { el, name: 'done' };
}
