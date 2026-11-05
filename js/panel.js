import { CATEGORIES } from './config.js';
import { el, colorOf, groupOf, groupColor, groupLabel, whenFull, relDay } from './utils.js';

const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

// Все категории из базы + те, что встретились в загруженных событиях
export function filterGroups(events) {
  const known = Object.keys(CATEGORIES);
  const keys = new Set([...known, ...events.map(groupOf)]);
  const rank = k => (k === 'другое' ? 1e6 : known.includes(k) ? known.indexOf(k) : 1e3);
  return [...keys].map(key => ({ key, label: groupLabel(key), color: groupColor(key) }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, 'ru'));
}

export function updateFilterButton(btn, label, groups, hidden) {
  const active = groups.filter(g => !hidden.has(g.key)).length;
  const all = active === groups.length;
  label.textContent = all ? 'Фильтр: все' : `Фильтр: ${active} из ${groups.length}`;
  btn.classList.toggle('active', !all);
  btn.disabled = !groups.length;
}

export function renderFilterList(root, groups, hidden, onToggle) {
  root.replaceChildren(...groups.map(g => {
    const row = el('label', 'opt');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !hidden.has(g.key);
    box.addEventListener('change', () => onToggle(g.key, box.checked));
    const dot = el('span', 'swatch');
    dot.style.setProperty('--c', g.color);
    row.append(box, dot, el('span', 'opt-name', g.label));
    return row;
  }));
}

// Крупная карточка ближайшего события
export function renderNext(root, ev, onSelect) {
  if (!ev) return root.replaceChildren(el('p', 'empty', 'Ближайших событий нет'));
  const card = el('button', 'next-card');
  card.type = 'button';
  card.style.setProperty('--c', colorOf(ev.color));
  card.append(el('span', 'next-label', `Ближайшее · ${relDay(ev.date)}`), el('span', 'next-title', ev.title), el('span', 'next-when', whenFull(ev)));
  card.addEventListener('click', () => onSelect(ev));
  root.replaceChildren(card);
}

// Список следующих событий с «календарным листком»
export function renderAgenda(root, events, onSelect) {
  root.replaceChildren(...events.map(ev => {
    const item = el('button', 'agenda-item');
    item.type = 'button';
    item.style.setProperty('--c', colorOf(ev.color));
    const badge = el('span', 'agenda-badge');
    badge.append(el('b', null, ev.date.getDate()), el('i', null, monthShort.format(ev.date).replace('.', '')));
    const body = el('span', 'agenda-body');
    body.append(el('span', 'agenda-title', ev.title), el('span', 'agenda-when', whenFull(ev)));
    item.append(badge, body);
    item.addEventListener('click', () => onSelect(ev));
    return item;
  }));
}
