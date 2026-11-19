import { CATEGORIES, DEFAULT_COLOR } from './config.js';
import { calendarToday, daysBetween, parseDate, toKey } from './dates.js';

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
const isHex = c => /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c);

function hashColor(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Категории из базы заменяют стандартные (если в базе пусто — остаются стандартные)
export function setCategories(list) {
  for (const k of Object.keys(CATEGORIES)) delete CATEGORIES[k];
  for (const c of list) {
    if (typeof c?.id !== 'string' || typeof c.label !== 'string' || !c.label) continue;
    CATEGORIES[c.id.toLowerCase()] = { label: c.label, color: isHex(c.color) ? c.color : hashColor(c.id) };
  }
  if (!Object.keys(CATEGORIES).length) Object.assign(CATEGORIES, DEFAULTS);
}

export const colorOf = c => (isHex(c) ? c : CATEGORIES[c]?.color ?? (c ? hashColor(c) : DEFAULT_COLOR));
export const eventColor = ev => CATEGORIES[ev.category]?.color ?? colorOf(ev.color || ev.category);
export const groupOf = ev => ev.category || (ev.color && !isHex(ev.color) ? ev.color : 'другое');
export const groupColor = g => (g === 'другое' ? DEFAULT_COLOR : colorOf(g));
export const groupLabel = g => CATEGORIES[g]?.label ?? capitalize(g);

/* ---- Событие: ответ сервера → удобный объект ---- */
export function toEvent(x) {
  const date = parseDate(x?.date);
  if (!date) return null;
  const key = toKey(date);
  const endDate = parseDate(x.endDate);
  const category = String(x.category || '').toLowerCase();
  return {
    id: String(x.id || ''), key, endKey: endDate > date ? toKey(endDate) : key, date,
    title: String(x.title || 'Без названия'), time: String(x.time || ''), endTime: String(x.endTime || ''),
    description: String(x.description || ''), category,
    color: String(x.color || category).toLowerCase(),
    seriesId: String(x.seriesId || ''), updatedByName: String(x.updatedByName || ''),
  };
}

export const compareEvents = (a, b) => a.key.localeCompare(b.key) || a.time.localeCompare(b.time)
  || a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id);

/* ---- Подписи ---- */
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

// «19:00 – 21:00», «Весь день», «4 нояб. – 12 нояб.»
export function whenText(ev) {
  const t = ev.time ? (ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time) : 'Весь день';
  if (ev.endKey !== ev.key) return `${shortFmt.format(ev.date)} – ${shortFmt.format(parseDate(ev.endKey))}${ev.time ? `, ${t}` : ''}`;
  return t;
}
export const whenFull = ev => (ev.endKey !== ev.key ? whenText(ev) : `${shortFmt.format(ev.date)}, ${whenText(ev)}`);

// «Сегодня», «Завтра», «Через 6 дней»
export const relDay = (date, today = calendarToday()) => capitalize(rtf.format(daysBetween(toKey(today), toKey(date)), 'day'));

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
