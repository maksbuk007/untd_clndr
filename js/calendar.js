import { el, eventColor } from './utils.js';
import { calendarToday, toKey, gridBounds } from './dates.js';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const MAX_PILLS = 3; // на телефоне CSS сам превращает события в точки

// all: true — в панели управления кликабельны и пустые дни (быстрое создание события)
export function renderGrid(root, view, byDay, onSelect, { all = false } = {}) {
  const m = view.getMonth();
  const { start, count } = gridBounds(view);
  const todayKey = toKey(calendarToday());
  const focused = root.contains(document.activeElement) ? document.activeElement.dataset.date : null;
  const cells = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = toKey(date);
    const events = byDay.get(key) ?? [];
    const cell = el('button', 'day');
    cell.type = 'button';
    cell.dataset.date = key;
    cell.disabled = !events.length && !all;
    if (date.getMonth() !== m) cell.classList.add('other');
    if (key === todayKey) {
      cell.classList.add('today');
      cell.setAttribute('aria-current', 'date');
    }
    if (!events.length) cell.classList.add('blank');
    if (all) cell.classList.add('addable');
    cell.setAttribute('aria-label', dayFmt.format(date) + (events.length ? `, событий: ${events.length}` : all ? ', добавить событие' : ''));
    const content = el('span', 'day-inner');
    content.append(el('span', 'day-num', date.getDate()));

    if (events.length) {
      const box = el('span', 'pills');
      for (const ev of events.slice(0, MAX_PILLS)) {
        const pill = el('span', 'pill');
        pill.style.setProperty('--c', eventColor(ev));
        if (ev.time && ev.key === key) pill.append(el('span', 'pill-time', ev.time));
        pill.append(el('span', 'pill-text', ev.title));
        box.append(pill);
      }
      if (events.length > MAX_PILLS) box.append(el('span', 'more', `+${events.length - MAX_PILLS}`));
      content.append(box);
    }
    cell.append(content);
    if (!cell.disabled) cell.addEventListener('click', () => onSelect(date, events));
    cells.push(cell);
  }
  root.replaceChildren(...cells);
  if (focused) cells.find(cell => cell.dataset.date === focused && !cell.disabled)?.focus({ preventScroll: true });
}
