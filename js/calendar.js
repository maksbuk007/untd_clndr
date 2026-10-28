import { el, colorOf } from './utils.js';
import { toKey } from './dates.js';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const MAX_PILLS = 3; // на телефоне CSS сам превращает события в точки

export function renderGrid(root, view, byDay, onSelect) {
  const y = view.getFullYear(), m = view.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // неделя с понедельника
  const total = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7; // целые недели
  const todayKey = toKey(new Date());
  const cells = [];

  for (let i = 0; i < total; i++) {
    const date = new Date(y, m, 1 - offset + i); // дни соседних месяцев получаются сами
    const key = toKey(date);
    const events = byDay.get(key) ?? [];
    const cell = el('button', 'day');
    cell.type = 'button';
    cell.disabled = !events.length;
    if (date.getMonth() !== m) cell.classList.add('other');
    if (key === todayKey) cell.classList.add('today');
    cell.setAttribute('aria-label', dayFmt.format(date) + (events.length ? `, событий: ${events.length}` : ''));
    cell.append(el('span', 'day-num', date.getDate()));

    if (events.length) {
      const box = el('span', 'pills');
      for (const ev of events) {
        const pill = el('span', 'pill');
        pill.style.setProperty('--c', colorOf(ev.color));
        pill.append(el('span', 'pill-text', ev.title));
        box.append(pill);
      }
      if (events.length > MAX_PILLS) box.append(el('span', 'more', `+${events.length - MAX_PILLS}`));
      cell.append(box);
      cell.addEventListener('click', () => onSelect(date, events));
    }
    cells.push(cell);
  }
  root.replaceChildren(...cells);
}
