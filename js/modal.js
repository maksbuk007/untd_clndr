import { el, colorOf, linkify, capitalize } from './utils.js';

const titleFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

function card(ev) {
  const item = el('article', 'ev');
  item.style.setProperty('--c', colorOf(ev.color));
  item.append(el('div', 'ev-time', ev.time || 'Весь день'), el('h3', 'ev-title', ev.title));
  if (ev.description) {
    const desc = el('p', 'ev-desc');
    linkify(ev.description, desc);
    item.append(desc);
  }
  return item;
}

// Общая настройка нативного <dialog>: кнопки закрытия и клик по затемнению
export function initDialog(dialog) {
  dialog.tabIndex = -1;
  dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return; // клики внутри содержимого не считаем
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
}

export function showDialog(dialog) {
  dialog.showModal();
  dialog.scrollTop = 0;
  dialog.focus({ preventScroll: true });
}

export function openDay(dialog, date, events) {
  const year = date.getFullYear() !== new Date().getFullYear() ? `, ${date.getFullYear()}` : '';
  dialog.querySelector('#modal-date').textContent = capitalize(titleFmt.format(date)) + year;
  dialog.querySelector('#modal-list').replaceChildren(...events.map(card));
  showDialog(dialog);
}
