// Общие помощники панели управления
import { api } from './api.js';

const $ = id => document.getElementById(id);
export const app = { reload() {} }; // admin.js подставляет сюда «обновить вкладку»

// h('div', { class: 'x', onclick: fn }, ...дети) — безопасное создание DOM без innerHTML
export function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k === 'vars') for (const [name, val] of Object.entries(v)) n.style.setProperty(name, val);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  n.append(...kids.flat().filter(x => x != null && x !== false));
  return n;
}
export const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
export const loader = (text = 'Загрузка…') => h('div', { class: 'loader' }, h('div', { class: 'spinner' }), h('span', {}, text));
export const skeletons = (n = 5) => Array.from({ length: n }, () => h('div', { class: 'row skeleton' }));

// Запрос к серверу с тонкой полоской прогресса сверху
let pending = 0;
export async function call(path, opts) {
  pending++;
  $('progress').classList.add('on');
  try { return await api(path, opts); }
  finally { if (--pending === 0) $('progress').classList.remove('on'); }
}

// Блок, который показывает индикатор загрузки, пока готовится содержимое
export function lazy(build) {
  const box = h('div', {}, loader());
  build().then(node => box.replaceChildren(node)).catch(e => { fail(e); box.replaceChildren(h('p', { class: 'empty' }, 'Не удалось загрузить данные')); });
  return box;
}

let toastTimer;
export function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  if (!t.matches(':popover-open')) t.showPopover?.();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidePopover?.(), 3500);
}
export function fail(e) {
  if (e?.status === 401) return location.reload(); // сессия закончилась — покажем вход
  console.error(e);
  toast(e?.message || 'Ошибка', true);
}

/* ---- Окно ---- */
export const closeDlg = () => $('dlg').close();
export function openDlg(title, ...body) {
  const dlg = $('dlg');
  const x = h('button', { class: 'close', type: 'button', 'aria-label': 'Закрыть', onclick: closeDlg });
  x.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'; // статичная иконка
  dlg.replaceChildren(x, h('h2', {}, title), ...body);
  if (!dlg.open) dlg.showModal();
  dlg.focus({ preventScroll: true });
}

export const confirmDlg = (text, okLabel = 'Удалить', extra = null) => new Promise(resolve => {
  const done = v => { resolve(v); closeDlg(); };
  $('dlg').addEventListener('close', () => resolve(false), { once: true });
  openDlg('Подтвердите действие', h('p', { class: 'muted' }, text), extra,
    h('div', { class: 'dlg-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Отмена'),
      h('button', { class: 'btn danger-solid', type: 'button', onclick: () => done(true) }, okLabel)));
});

export const avatar = u => (u.photo
  ? h('img', { class: 'avatar', src: u.photo, alt: '', referrerpolicy: 'no-referrer' })
  : h('span', { class: 'avatar' }, (u.name || '?').charAt(0).toUpperCase()));
