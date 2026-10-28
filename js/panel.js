import { CATEGORIES } from './config.js';
import { el, colorOf, groupOf, groupColor, groupLabel } from './utils.js';
import { toKey } from './dates.js';

const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

// Категории, реально встречающиеся в данных: [{ key, label, color, count }]
export function filterGroups(events) {
  const counts = new Map();
  for (const e of events) counts.set(groupOf(e), (counts.get(groupOf(e)) ?? 0) + 1);
  const known = Object.keys(CATEGORIES);
  const rank = k => (k === 'другое' ? 1e6 : known.includes(k) ? known.indexOf(k) : 1e3);
  return [...counts].map(([key, count]) => ({ key, count, label: groupLabel(key), color: groupColor(key) }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, 'ru'));
}

// Подпись на кнопке «Фильтр»
export function updateFilterButton(btn, label, groups, hidden) {
  const active = groups.filter(g => !hidden.has(g.key)).length;
  const all = active === groups.length;
  label.textContent = all ? 'Фильтр: все' : `Фильтр: ${active} из ${groups.length}`;
  btn.classList.toggle('active', !all);
  btn.disabled = !groups.length;
}

// Список чекбоксов в окне фильтра
export function renderFilterList(root, groups, hidden, onToggle) {
  root.replaceChildren(...groups.map(g => {
    const row = el('label', 'opt');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !hidden.has(g.key);
    box.addEventListener('change', () => onToggle(g.key, box.checked));
    const dot = el('span', 'swatch');
    dot.style.setProperty('--c', g.color);
    row.append(box, dot, el('span', 'opt-name', g.label), el('span', 'opt-count', g.count));
    return row;
  }));
}

// Список ближайших событий
export function renderAgenda(root, events, onSelect) {
  const today = toKey(new Date());
  const items = events.filter(e => e.key >= today).slice(0, 6);
  if (!items.length) return root.replaceChildren(el('p', 'empty', 'Ближайших событий нет'));

  root.replaceChildren(...items.map(ev => {
    const item = el('button', 'agenda-item');
    item.type = 'button';
    item.style.setProperty('--c', colorOf(ev.color));
    item.append(
      el('span', 'agenda-when', shortFmt.format(ev.date) + (ev.time ? `, ${ev.time}` : '')),
      el('span', 'agenda-title', ev.title),
    );
    item.addEventListener('click', () => onSelect(ev));
    return item;
  }));
}
