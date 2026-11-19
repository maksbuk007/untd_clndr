export const pad = n => String(n).padStart(2, '0');
export const toKey = d => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = d => toKey(d).slice(0, 7);
export const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
export const isCalendarMonth = s => typeof s === 'string' && /^20[2-9]\d-(0[1-9]|1[0-2])$/.test(s);

const calendarDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Minsk', day: 'numeric', month: 'numeric', year: 'numeric',
});

export function calendarToday(now = new Date()) {
  return parseDate(calendarDate.format(now));
}

// Понимает «15.09.2026», «2026-09-15» и ISO-строки с временем
export function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return parseDate(`${m[3]}-${pad(+m[2])}-${pad(+m[1])}`);
  m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T.+)?$/);
  if (!m || !isRealDate(m[1]) || (s !== m[1] && !Number.isFinite(Date.parse(s)))) return null;
  const [y, month, day] = m[1].split('-').map(Number);
  const d = new Date(2000, 0, 1);
  d.setFullYear(y, month - 1, day);
  return d;
}

export function formatTime(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) return `${pad(+hm[1])}:${hm[2]}`;
  const d = new Date(s);
  return isNaN(d) ? s : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Границы видимой сетки месяца: с понедельника до воскресенья, целыми неделями
export function gridBounds(view) {
  const y = view.getFullYear(), m = view.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const count = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  return { start: new Date(y, m, 1 - offset), count };
}

// События по дням; многодневное событие попадает в каждый свой день
export function groupByDay(events, view) {
  const { start, count } = gridBounds(view);
  const firstKey = toKey(start);
  const lastKey = addDays(firstKey, count - 1);
  const map = new Map();
  for (const e of events) {
    const first = e.key < firstKey ? firstKey : e.key;
    const end = e.endKey || e.key;
    const last = end > lastKey ? lastKey : end;
    for (let key = first; key <= last; key = addDays(key, 1)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
  }
  return map;
}

/* ---- Арифметика над строками «ГГГГ-ММ-ДД» (UTC, без часовых поясов) ---- */
const toUTC = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(0).setUTCFullYear(y, m - 1, d);
};
const fromUTC = t => new Date(t).toISOString().slice(0, 10);
export const isRealDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;
export const addDays = (s, n) => fromUTC(toUTC(s) + n * 864e5);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);

export function addMonths(s, n) {
  const date = new Date(toUTC(s));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + n + 1, 0);
  date.setUTCDate(Math.min(day, date.getUTCDate()));
  return fromUTC(date.getTime());
}

export const MAX_REPEATS = 60;
// Даты повторения от first до until включительно (вернёт до MAX_REPEATS + 1 — чтобы заметить превышение)
export function repeatDates(first, every, until) {
  if (!isRealDate(first) || !isRealDate(until) || !every) return [];
  const out = [];
  for (let i = 0; i <= MAX_REPEATS; i++) {
    const d = every === 'month' ? addMonths(first, i) : addDays(first, i * (every === '2weeks' ? 14 : 7));
    if (d > until) break;
    out.push(d);
  }
  return out;
}
