import { CATEGORIES, DEFAULT_COLOR } from './config.js';
import { parseDate } from './dates.js';

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---- Категории и цвета ---- */
const PALETTE = ['#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const DEFAULTS = { ...CATEGORIES };
const isHex = c => /^#[0-9a-f]{3,8}$/i.test(c);

function hashColor(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Категории из базы заменяют стандартные (если в базе пусто — остаются стандартные)
export function setCategories(list) {
  for (const k of Object.keys(CATEGORIES)) delete CATEGORIES[k];
  Object.assign(CATEGORIES, list.length ? Object.fromEntries(list.map(c => [c.id, { label: c.label, color: c.color }])) : DEFAULTS);
}

export const colorOf = c => (isHex(c) ? c : CATEGORIES[c]?.color ?? (c ? hashColor(c) : DEFAULT_COLOR));
export const groupOf = ev => (ev.color && !isHex(ev.color) ? ev.color : 'другое');
export const groupColor = g => (g === 'другое' ? DEFAULT_COLOR : colorOf(g));
export const groupLabel = g => CATEGORIES[g]?.label ?? capitalize(g);

/* ---- Событие: ответ сервера → удобный объект ---- */
export function toEvent(x) {
  const date = parseDate(x.date);
  if (!date) return null;
  return {
    id: x.id, key: x.date, endKey: x.endDate || x.date, date,
    title: x.title || 'Без названия', time: x.time || '', endTime: x.endTime || '',
    description: x.description || '', category: x.category || '',
    color: String(x.color || x.category || '').toLowerCase(),
    seriesId: x.seriesId || '', updatedByName: x.updatedByName || '',
  };
}

/* ---- Подписи ---- */
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// «19:00 – 21:00», «Весь день», «4 нояб. – 12 нояб.»
export function whenText(ev) {
  const t = ev.time ? (ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time) : 'Весь день';
  if (ev.endKey !== ev.key) return `${shortFmt.format(ev.date)} – ${shortFmt.format(parseDate(ev.endKey))}${ev.time ? `, ${t}` : ''}`;
  return t;
}
export const whenFull = ev => (ev.endKey !== ev.key ? whenText(ev) : `${shortFmt.format(ev.date)}, ${whenText(ev)}`);

// «Сегодня», «Завтра», «Через 6 дней»
export const relDay = date => capitalize(rtf.format(Math.round((startOfDay(date) - startOfDay(new Date())) / 864e5), 'day'));

// Текст со ссылками. Только через DOM, без innerHTML — безопасно.
export function linkify(text, parent) {
  text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g).forEach((part, i) => {
    if (i % 2) {
      const a = el('a', null, part);
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parent.append(a);
    } else {
      parent.append(part);
    }
  });
}
