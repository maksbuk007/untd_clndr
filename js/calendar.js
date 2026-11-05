import { el, colorOf } from './utils.js';
import { toKey, gridBounds } from './dates.js';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const MAX_PILLS = 3; // на телефоне CSS сам превращает события в точки

// all: true — в панели управления кликабельны и пустые дни (быстрое создание события)
export function renderGrid(root, view, byDay, onSelect, { all = false } = {}) {
  const m = view.getMonth();
  const { start, count } = gridBounds(view);
  const todayKey = toKey(new Date());
  const cells = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = toKey(date);
    const events = byDay.get(key) ?? [];
    const cell = el('button', 'day');
    cell.type = 'button';
    cell.disabled = !events.length && !all;
    if (date.getMonth() !== m) cell.classList.add('other');
    if (key === todayKey) cell.classList.add('today');
    if (!events.length) cell.classList.add('blank');
    if (all) cell.classList.add('addable');
    cell.setAttribute('aria-label', dayFmt.format(date) + (events.length ? `, событий: ${events.length}` : all ? ', добавить событие' : ''));
    cell.append(el('span', 'day-num', date.getDate()));

    if (events.length) {
      const box = el('span', 'pills');
      for (const ev of events) {
        const pill = el('span', 'pill');
        pill.style.setProperty('--c', colorOf(ev.color));
        if (ev.time && ev.key === key) pill.append(el('span', 'pill-time', ev.time));
        pill.append(el('span', 'pill-text', ev.title));
        box.append(pill);
      }
      if (events.length > MAX_PILLS) box.append(el('span', 'more', `+${events.length - MAX_PILLS}`));
      cell.append(box);
    }
    if (!cell.disabled) cell.addEventListener('click', () => onSelect(date, events));
    cells.push(cell);
  }
  root.replaceChildren(...cells);
}
